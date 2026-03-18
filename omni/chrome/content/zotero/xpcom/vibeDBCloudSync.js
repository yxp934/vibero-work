/*
	***** BEGIN LICENSE BLOCK *****
    
	Copyright © 2024 VibeZotero
    
	This file is part of VibeZotero.
    
	VibeZotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
    
	***** END LICENSE BLOCK *****
*/

"use strict";

/**
 * VibeDB 云同步模块
 * 负责将本地 VibeDB（SQLite）数据同步到 Supabase（PostgreSQL）
 * 
 * 同步策略：
 * 1. 首次全量同步：将本地所有数据上传到云端
 * 2. 增量同步：基于 updated_at 字段，只同步有变化的数据
 * 3. 本地优先：发生冲突时，本地数据优先
 * 4. 自动后台同步：定期自动执行
 * 
 * 架构说明：
 * - 本地使用 INTEGER 作为主键，云端使用 UUID
 * - 通过 id_mapping 表跟踪本地 ID 和云端 UUID 的对应关系
 * - 通过 item_id 作为唯一标识符来匹配 papers
 */

Zotero.VibeDBCloudSync = new function () {

  // 同步配置
  const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 分钟（仅用于兜底检查，防止事件遗漏）
  const DEBOUNCE_DELAY_MS = 3 * 1000; // 3 秒（数据变化后的防抖延迟）
  const TABLES_TO_SYNC = ['papers', 'ai_chats', 'flash_cards', 'summary_cards'];

  // 同步状态
  let _syncTimer = null; // 兜底检查定时器（10分钟）
  let _debounceTimer = null; // 防抖定时器（3秒）
  let _isSyncing = false;
  let _lastSyncTime = null;
  let _hasPendingChanges = false; // 是否有待同步的更改

  /**
   * 初始化云同步模块
   */
  this.init = async function () {
    // console.log('[VibeDBCloudSync] 初始化云同步模块...');

    try {
      // 恢复上次同步时间
      const lastSync = Zotero.Prefs.get('sync.vibedb.lastSyncTime');
      if (lastSync) {
        _lastSyncTime = new Date(lastSync);
        // console.log(`[VibeDBCloudSync] 上次同步时间: ${_lastSyncTime.toLocaleString()}`);
      }

      // console.log('[VibeDBCloudSync] ✅ 云同步模块初始化完成');
    } catch (e) {
      console.error('[VibeDBCloudSync] ❌ 初始化失败:', e);
    }
  };

  /**
   * 获取当前用户的 access_token（自动刷新过期 token）
   */
  this._getAccessToken = async function () {
    let session = Zotero.VibeDBSync._supabaseSession;

    // 如果内存中没有，从 Prefs 加载
    if (!session || !session.access_token) {
      session = Zotero.VibeDBSync._loadSessionFromPrefs();
      if (session) {
        Zotero.VibeDBSync._supabaseSession = session;
      }
    }

    if (!session || !session.access_token) {
      // console.log('[VibeDBCloudSync] ⚠️ Session 不存在');
      return null;
    }

    // 检查 token 是否即将过期（提前 5 分钟刷新）
    const expiresAt = session.expires_at || 0;
    const now = Math.floor(Date.now() / 1000);
    const shouldRefresh = expiresAt - now < 300; // 5 分钟内过期

    if (shouldRefresh && session.refresh_token) {
      // console.log(`[VibeDBCloudSync] Token 即将过期（剩余 ${Math.floor((expiresAt - now) / 60)} 分钟），自动刷新...`);
      try {
        const newSession = await this._refreshToken(session.refresh_token);
        if (newSession && newSession.access_token) {
          // 更新 session
          Zotero.VibeDBSync._supabaseSession = newSession;
          Zotero.VibeDBSync.saveSupabaseSession(newSession);
          // console.log('[VibeDBCloudSync] ✅ Token 刷新成功');
          return newSession.access_token;
        } else {
          console.error('[VibeDBCloudSync] ❌ Token 刷新返回无效 session');
        }
      } catch (e) {
        console.error('[VibeDBCloudSync] ❌ Token 刷新失败:', e.message);

        // 如果刷新失败，检查是否因为 refresh_token 也过期了
        if (e.message && (e.message.includes('401') || e.message.includes('Invalid Refresh Token'))) {
          console.error('[VibeDBCloudSync] ⚠️ Refresh token 已失效，需要重新登录');
          // 清除用户会话
          Zotero.VibeDBSync.clearUser();
          // 停止自动同步
          this.stopAutoSync();
          return null;
        }

        // 其他错误（网络问题等），检查 token 是否已完全过期
        if (expiresAt > 0 && now >= expiresAt) {
          console.error('[VibeDBCloudSync] ⚠️ Token 已过期且刷新失败，需要重新登录');
          Zotero.VibeDBSync.clearUser();
          this.stopAutoSync();
          return null;
        }

        // Token 还未完全过期，继续使用（可能是临时网络问题）
        console.warn('[VibeDBCloudSync] ⚠️ Token 刷新失败但尚未完全过期，继续使用旧 token');
      }
    }

    // 最后检查：如果 token 已完全过期，拒绝返回
    if (expiresAt > 0 && now >= expiresAt) {
      console.error('[VibeDBCloudSync] ⚠️ Token 已过期且无法刷新');
      Zotero.VibeDBSync.clearUser();
      this.stopAutoSync();
      return null;
    }

    return session.access_token;
  };

  /**
   * 刷新 access_token
   */
  this._refreshToken = async function (refreshToken) {
    // console.log('[VibeDBCloudSync] 使用 refresh_token 刷新 access_token');

    if (!refreshToken || refreshToken.trim() === '') {
      throw new Error('Refresh token 为空');
    }

    try {
      // 动态获取配置
      const config = Zotero.VibeDBSync.getSupabaseConfig();
      const SUPABASE_URL = config.url;
      const SUPABASE_ANON_KEY = config.anonKey;

      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: refreshToken
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // 详细的错误处理
        const errorMsg = data.error_description || data.msg || data.error || '未知错误';
        console.error('[VibeDBCloudSync] 刷新 token 失败:', response.status, errorMsg);

        // 401 通常表示 refresh_token 已过期或无效
        if (response.status === 401) {
          throw new Error(`Invalid Refresh Token: ${errorMsg}`);
        }

        throw new Error(`刷新 token 失败 (${response.status}): ${errorMsg}`);
      }

      // 验证返回数据
      if (!data.access_token || !data.refresh_token) {
        console.error('[VibeDBCloudSync] 刷新返回的数据不完整:', data);
        throw new Error('刷新返回的 session 数据不完整');
      }

      // console.log('[VibeDBCloudSync] ✅ Token 刷新成功，新 token 过期时间:', new Date(data.expires_at * 1000).toLocaleString());

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        expires_in: data.expires_in,
        token_type: data.token_type,
        user: data.user
      };
    } catch (e) {
      console.error('[VibeDBCloudSync] 刷新 token 异常:', e.message);
      throw e;
    }
  };

  /**
   * 获取当前用户 ID
   */
  this._getUserId = function () {
    const user = Zotero.VibeDBSync.getCurrentUser();
    return user ? user.id : null;
  };

  /**
   * 发起 Supabase REST API 请求
   */
  this._supabaseRequest = async function (endpoint, method = 'GET', body = null, options = {}) {
    // Cloud Sync Disabled check removed to restore functionality
    const token = await this._getAccessToken();
    if (!token) {
      // console.log('[VibeDBCloudSync] 未登录，跳过云同步请求');
      return null;
    }

    // 动态获取配置
    const config = Zotero.VibeDBSync.getSupabaseConfig();
    const SUPABASE_URL = config.url;
    const SUPABASE_ANON_KEY = config.anonKey;

    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    };

    const requestBodyConfig = {
      method,
      headers
    };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      requestBodyConfig.body = JSON.stringify(body);
    }

    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    // console.log(`[VibeDBCloudSync] ${method} ${url}`);

    try {
      const response = await fetch(url, requestBodyConfig);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[VibeDBCloudSync] API 错误: ${response.status}`, errorText);
        throw new Error(`Supabase API 错误: ${response.status} - ${errorText}`);
      }

      // 检查是否有内容返回
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
    } catch (e) {
      console.error(`[VibeDBCloudSync] 请求失败: ${url}`, e);
      throw e;
    }

    return null;
  };

  /**
   * 标记数据已变更（供 VibeDB 在数据变化时调用）
   * 这是事件驱动同步的核心，数据变化时会触发防抖同步
   * 
   * 调用时机：
   * - Papers.save() 保存论文数据后
   * - AIChats.save() 保存对话后
   * - FlashCards.save() 保存闪卡后
   */
  this.markDataChanged = function () {
    // Cloud Sync Disabled check removed
    if (!Zotero.VibeDBSync.isLoggedIn()) {
      return; // 未登录不处理
    }

    _hasPendingChanges = true;

    // 防抖：延迟 3 秒后同步（避免频繁同步）
    // 如果在 3 秒内再次调用，会重置计时器
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
    }

    _debounceTimer = setTimeout(async () => {
      if (_hasPendingChanges) {
        // console.log('[VibeDBCloudSync] 🔄 数据变化触发同步（防抖 3 秒后）');
        await this.syncAll();
        _hasPendingChanges = false;
      }
    }, DEBOUNCE_DELAY_MS);
  };

  /**
   * 启动自动同步（事件驱动 + 兜底检查）
   * 
   * 同步策略：
   * 1. 事件驱动（主要）：数据变化时触发 markDataChanged() → 防抖 3 秒后同步
   * 2. 兜底检查（保险）：每 10 分钟检查一次是否有遗漏的更改
   * 
   * 为什么需要兜底检查？
   * - 防止应用崩溃时防抖定时器未执行
   * - 防止某些代码路径绕过事件触发
   * - 作为最后的安全网，确保数据最终会同步
   */
  this.startAutoSync = function () {
    // Cloud Sync Disabled check removed
    if (_syncTimer) {
      // console.log('[VibeDBCloudSync] 自动同步已在运行');
      return;
    }

    // 启动前先验证登录状态
    if (!Zotero.VibeDBSync.isLoggedIn()) {
      // console.log('[VibeDBCloudSync] ⚠️ 用户未登录，无法启动自动同步');
      return;
    }

    // console.log('[VibeDBCloudSync] 启动事件驱动同步');
    // console.log(`  - 主要策略：数据变化后 ${DEBOUNCE_DELAY_MS / 1000} 秒自动同步`);
    // console.log(`  - 兜底检查：每 ${SYNC_INTERVAL_MS / 1000 / 60} 分钟检查一次（仅在有变化时同步）`);

    _syncTimer = setInterval(async () => {
      // 每次执行前都检查登录状态
      if (!Zotero.VibeDBSync.isLoggedIn()) {
        // console.log('[VibeDBCloudSync] ⚠️ 用户未登录或 token 已过期，停止自动同步');
        this.stopAutoSync();
        return;
      }

      try {
        // 兜底检查：仅在有待同步的更改时才同步
        if (_hasPendingChanges) {
          // console.log('[VibeDBCloudSync] 🔄 兜底检查：检测到待同步更改，执行同步');
          await this.syncAll();
          _hasPendingChanges = false;
        } else {


          // 没有待同步的更改，跳过
          // console.log(`[VibeDBCloudSync] ⏸️ 兜底检查：无待同步更改，跳过`);
        }} catch (e) {console.error('[VibeDBCloudSync] 自动同步失败:', e);
      }
    }, SYNC_INTERVAL_MS);

    // console.log('[VibeDBCloudSync] ✅ 事件驱动同步已启动');
  };

  /**
   * 停止自动同步
   */
  this.stopAutoSync = function () {
    if (_syncTimer) {
      clearInterval(_syncTimer);
      _syncTimer = null;
      // console.log('[VibeDBCloudSync] ✅ 自动同步已停止');
    }

    // 清除防抖定时器
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }

    // 重置状态
    _hasPendingChanges = false;
  };

  /**
   * 执行全量/增量同步
   * @param {boolean} fullSync - 是否强制全量同步
   */
  this.syncAll = async function (fullSync = false) {
    if (_isSyncing) {
      // console.log('[VibeDBCloudSync] 同步正在进行中，跳过');
      return { success: false, message: '同步正在进行中' };
    }

    if (!Zotero.VibeDBSync.isLoggedIn()) {
      // console.log('[VibeDBCloudSync] 用户未登录');
      return { success: false, message: '用户未登录' };
    }

    _isSyncing = true;
    const startTime = Date.now();

    // 从 Prefs 恢复 _lastSyncTime（这样不会因为重新登录而重置）
    if (!_lastSyncTime) {
      const savedTime = Zotero.Prefs.get('sync.vibedb.lastSyncTime');
      if (savedTime) {
        _lastSyncTime = new Date(savedTime);
        // console.log(`[VibeDBCloudSync] 从 Prefs 恢复上次同步时间: ${_lastSyncTime.toLocaleString()}`);
      }
    }

    // console.log(`[VibeDBCloudSync] 开始${fullSync ? '全量' : '增量'}同步...`);

    try {
      const userId = this._getUserId();
      if (!userId) {
        throw new Error('无法获取用户 ID');
      }

      // 判断是首次同步还是增量同步
      const isFirstSync = !_lastSyncTime || fullSync;

      let totalUploaded = 0;
      let totalSkipped = 0;

      // 同步 papers 表（最重要）
      const papersResult = await this._syncPapers(userId, isFirstSync);
      totalUploaded += papersResult.uploaded;
      totalSkipped += papersResult.skipped;

      // // 同步 AI Chat (Disabled as per user request)
      // const aiChatsResult = await this._syncAiChats(userId, isFirstSync);
      // totalUploaded += aiChatsResult.uploaded;
      // totalSkipped += aiChatsResult.skipped;

      // // 同步 Flash Cards (Disabled as per user request)
      // const flashCardsResult = await this._syncFlashCards(userId, isFirstSync);
      // totalUploaded += flashCardsResult.uploaded;
      // totalSkipped += flashCardsResult.skipped;

      // 更新最后同步时间
      _lastSyncTime = new Date();
      Zotero.Prefs.set('sync.vibedb.lastSyncTime', _lastSyncTime.toISOString());

      const duration = (Date.now() - startTime) / 1000;
      // console.log(`[VibeDBCloudSync] ✅ 同步完成！上传: ${totalUploaded}, 跳过: ${totalSkipped}, 耗时: ${duration.toFixed(2)}s`);

      return {
        success: true,
        uploaded: totalUploaded,
        skipped: totalSkipped,
        duration
      };
    } catch (e) {
      console.error('[VibeDBCloudSync] ❌ 同步失败:', e);
      return { success: false, message: e.message };
    } finally {
      _isSyncing = false;
    }
  };

  /**
   * 同步 papers 表
   */
  this._syncPapers = async function (userId, isFirstSync) {
    // console.log('[VibeDBCloudSync] 同步 papers 表...');

    let uploaded = 0;
    let skipped = 0;

    try {
      // 获取本地所有 papers
      const conn = Zotero.VibeDB.getConnection();
      let sql;
      let params = [];

      if (isFirstSync) {
        // 全量同步：获取所有 papers
        sql = 'SELECT * FROM papers';
      } else {
        // 增量同步：只获取上次同步后更新的
        const lastSyncTimestamp = Math.floor(_lastSyncTime.getTime() / 1000);
        sql = 'SELECT * FROM papers WHERE updated_at > ?';
        params = [lastSyncTimestamp];
      }

      const localPapers = await conn.queryAsync(sql, params);
      // console.log(`[VibeDBCloudSync] 本地待同步 papers: ${localPapers.length} 条`);

      for (const paper of localPapers) {
        try {
          // 检查云端是否已存在该 paper（通过 item_id 匹配）
          const existingPapers = await this._supabaseRequest(
            `papers?user_id=eq.${userId}&item_id=eq.${paper.item_id}`,
            'GET'
          );

          const paperData = {
            user_id: userId,
            item_id: paper.item_id,
            result_dir: paper.result_dir,
            markdown_content: paper.markdown_content,
            article_summary: paper.article_summary,
            outline: paper.outline ? JSON.parse(paper.outline) : null,
            block_mapping: paper.block_mapping ? JSON.parse(paper.block_mapping) : null,
            github_url: paper.github_url,
            updated_at: new Date(paper.updated_at * 1000).toISOString()
          };

          if (existingPapers && existingPapers.length > 0) {
            // 更新已存在的记录
            const cloudPaper = existingPapers[0];
            const cloudUpdatedAt = new Date(cloudPaper.updated_at).getTime() / 1000;

            // 本地优先：如果本地更新时间更晚，则上传
            if (paper.updated_at >= cloudUpdatedAt) {
              await this._supabaseRequest(
                `papers?paper_id=eq.${cloudPaper.paper_id}`,
                'PATCH',
                paperData
              );
              // console.log(`[VibeDBCloudSync] 更新 paper: item_id=${paper.item_id}`);
              uploaded++;
            } else {
              // console.log(`[VibeDBCloudSync] 跳过 paper（云端更新）: item_id=${paper.item_id}`);
              skipped++;
            }

            // 保存 ID 映射
            await this._saveIdMapping(userId, 'papers', paper.paper_id, cloudPaper.paper_id, paper.item_id);
          } else {
            // 创建新记录
            const result = await this._supabaseRequest(
              'papers',
              'POST',
              paperData
            );

            if (result && result.length > 0) {
              const newPaperId = result[0].paper_id;
              await this._saveIdMapping(userId, 'papers', paper.paper_id, newPaperId, paper.item_id);
              // console.log(`[VibeDBCloudSync] 创建 paper: item_id=${paper.item_id}, cloud_id=${newPaperId}`);
              uploaded++;
            }
          }
        } catch (e) {
          console.error(`[VibeDBCloudSync] 同步 paper 失败: item_id=${paper.item_id}`, e);
        }
      }

      // console.log(`[VibeDBCloudSync] papers 同步完成: 上传 ${uploaded}, 跳过 ${skipped}`);
    } catch (e) {
      console.error('[VibeDBCloudSync] papers 同步异常:', e);
    }

    return { uploaded, skipped };
  };

  /**
   * 同步 AI Chat 表
   */
  this._syncAiChats = async function (userId, isFirstSync) {
    // console.log('[VibeDBCloudSync] 同步 ai_chats 表...');

    let uploaded = 0;
    let skipped = 0;

    try {
      const conn = Zotero.VibeDB.getConnection();
      let sql;
      let params = [];

      if (isFirstSync) {
        sql = 'SELECT ac.*, p.item_id FROM ai_chats ac JOIN papers p ON ac.paper_id = p.paper_id';
      } else {
        const lastSyncTimestamp = Math.floor(_lastSyncTime.getTime() / 1000);
        sql = 'SELECT ac.*, p.item_id FROM ai_chats ac JOIN papers p ON ac.paper_id = p.paper_id WHERE ac.updated_at > ?';
        params = [lastSyncTimestamp];
      }

      const localChats = await conn.queryAsync(sql, params);
      // console.log(`[VibeDBCloudSync] 本地待同步 ai_chats: ${localChats.length} 条`);

      for (const chat of localChats) {
        try {
          // 获取云端 paper_id
          const cloudPaperId = await this._getCloudPaperId(userId, chat.item_id);
          if (!cloudPaperId) {
            // console.log(`[VibeDBCloudSync] 跳过 ai_chat: 找不到对应的云端 paper`);
            skipped++;
            continue;
          }

          // 检查云端是否已存在
          const existingChats = await this._supabaseRequest(
            `ai_chats?paper_id=eq.${cloudPaperId}`,
            'GET'
          );

          const chatData = {
            paper_id: cloudPaperId,
            messages: chat.messages ? JSON.parse(chat.messages) : [],
            updated_at: new Date(chat.updated_at * 1000).toISOString()
          };

          if (existingChats && existingChats.length > 0) {
            // 更新
            const cloudChat = existingChats[0];
            await this._supabaseRequest(
              `ai_chats?aichat_id=eq.${cloudChat.aichat_id}`,
              'PATCH',
              chatData
            );
            uploaded++;
          } else {
            // 创建
            await this._supabaseRequest('ai_chats', 'POST', chatData);
            uploaded++;
          }
        } catch (e) {
          console.error(`[VibeDBCloudSync] 同步 ai_chat 失败:`, e);
        }
      }

      // console.log(`[VibeDBCloudSync] ai_chats 同步完成: 上传 ${uploaded}, 跳过 ${skipped}`);
    } catch (e) {
      console.error('[VibeDBCloudSync] ai_chats 同步异常:', e);
    }

    return { uploaded, skipped };
  };

  /**
   * 同步 Flash Cards 表
   */
  this._syncFlashCards = async function (userId, isFirstSync) {
    // console.log('[VibeDBCloudSync] 同步 flash_cards 表...');

    let uploaded = 0;
    let skipped = 0;

    try {
      const conn = Zotero.VibeDB.getConnection();
      let sql;
      let params = [];

      if (isFirstSync) {
        sql = 'SELECT fc.*, p.item_id FROM flash_cards fc JOIN papers p ON fc.paper_id = p.paper_id';
      } else {
        const lastSyncTimestamp = Math.floor(_lastSyncTime.getTime() / 1000);
        sql = 'SELECT fc.*, p.item_id FROM flash_cards fc JOIN papers p ON fc.paper_id = p.paper_id WHERE fc.updated_at > ?';
        params = [lastSyncTimestamp];
      }

      const localCards = await conn.queryAsync(sql, params);
      // console.log(`[VibeDBCloudSync] 本地待同步 flash_cards: ${localCards.length} 条`);

      for (const card of localCards) {
        try {
          // 获取云端 paper_id
          const cloudPaperId = await this._getCloudPaperId(userId, card.item_id);
          if (!cloudPaperId) {
            skipped++;
            continue;
          }

          // 检查是否已存在（通过映射表）
          const mapping = await this._getIdMapping(userId, 'flash_cards', card.flashcard_id);

          const cardData = {
            paper_id: cloudPaperId,
            page_idx: card.page_idx,
            messages: card.messages ? JSON.parse(card.messages) : [],
            position_rects: card.position_rects ? JSON.parse(card.position_rects) : [],
            updated_at: new Date(card.updated_at * 1000).toISOString()
          };

          if (mapping) {
            // 更新
            await this._supabaseRequest(
              `flash_cards?flashcard_id=eq.${mapping.cloud_id}`,
              'PATCH',
              cardData
            );
            uploaded++;
          } else {
            // 创建
            const result = await this._supabaseRequest('flash_cards', 'POST', cardData);
            if (result && result.length > 0) {
              await this._saveIdMapping(userId, 'flash_cards', card.flashcard_id, result[0].flashcard_id);
              uploaded++;
            }
          }
        } catch (e) {
          console.error(`[VibeDBCloudSync] 同步 flash_card 失败:`, e);
        }
      }

      // console.log(`[VibeDBCloudSync] flash_cards 同步完成: 上传 ${uploaded}, 跳过 ${skipped}`);
    } catch (e) {
      console.error('[VibeDBCloudSync] flash_cards 同步异常:', e);
    }

    return { uploaded, skipped };
  };

  /**
   * 保存 ID 映射（使用 upsert 避免重复）
   */
  this._saveIdMapping = async function (userId, tableName, localId, cloudId, itemId = null) {
    try {
      const mappingData = {
        user_id: userId,
        table_name: tableName,
        local_id: localId,
        cloud_id: cloudId,
        item_id: itemId
      };

      // 动态获取配置
      const config = Zotero.VibeDBSync.getSupabaseConfig();
      const SUPABASE_URL = config.url;
      const SUPABASE_ANON_KEY = config.anonKey;

      // 使用 Supabase 的 upsert 策略（遇到唯一约束冲突时忽略）
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/id_mapping`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${await this._getAccessToken()}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=ignore-duplicates' // 冲突时忽略，无需更新
          },
          body: JSON.stringify(mappingData)
        }
      );

      // 201 (创建) 或 409 (冲突，已忽略) 都是成功
      if (response.status === 201 || response.status === 409) {
        // console.log(`[VibeDBCloudSync] ID 映射已保存: ${tableName} ${localId} -> ${cloudId}`);
        return;
      }

      // 其他错误才是真正的失败
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[VibeDBCloudSync] 保存 ID 映射失败:', response.status, errorText);
        return;
      }
    } catch (e) {
      console.error('[VibeDBCloudSync] 保存 ID 映射异常:', e);
    }
  };

  /**
   * 获取 ID 映射
   */
  this._getIdMapping = async function (userId, tableName, localId) {
    try {
      const result = await this._supabaseRequest(
        `id_mapping?user_id=eq.${userId}&table_name=eq.${tableName}&local_id=eq.${localId}`,
        'GET'
      );
      return result && result.length > 0 ? result[0] : null;
    } catch (e) {
      console.error('[VibeDBCloudSync] 获取 ID 映射失败:', e);
      return null;
    }
  };

  /**
   * 根据 item_id 获取云端 paper_id
   */
  this._getCloudPaperId = async function (userId, itemId) {
    try {
      const result = await this._supabaseRequest(
        `papers?user_id=eq.${userId}&item_id=eq.${itemId}&select=paper_id`,
        'GET'
      );
      return result && result.length > 0 ? result[0].paper_id : null;
    } catch (e) {
      console.error('[VibeDBCloudSync] 获取云端 paper_id 失败:', e);
      return null;
    }
  };

  /**
   * 获取同步状态
   */
  this.getSyncStatus = function () {
    return {
      isSyncing: _isSyncing,
      lastSyncTime: _lastSyncTime,
      isAutoSyncEnabled: _syncTimer !== null
    };
  };

  /**
   * 获取上次同步时间
   */
  this.getLastSyncTime = function () {
    return _lastSyncTime;
  };

  /**
   * 检查是否正在同步
   */
  this.isSyncing = function () {
    return _isSyncing;
  };
}();