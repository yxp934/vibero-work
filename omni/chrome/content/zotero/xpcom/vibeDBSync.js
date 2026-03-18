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
 * VibeDB 同步管理器
 * 负责管理云同步的用户状态和偏好设置
 * 
 * 架构说明：
 * - 注册：使用 MCP create_auth_user（后端安全处理）
 * - 登录：前端 Supabase SDK signInWithPassword（获取 session）
 * - 用户管理：使用 MCP 工具（管理员功能）
 */

Zotero.VibeDBSync = new function () {
  // Supabase 配置
  // 注意：只使用 anon key，不在客户端暴露 service_role key
  // 官方Supabase
  // const SUPABASE_URL = 'https://bcadsdoqvluzjuwhvjmt.supabase.co';
  // const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjYWRzZG9xdmx1emp1d2h2am10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDM2NTIsImV4cCI6MjA4NTE3OTY1Mn0.wBLBACUn1RNG49Gql0wGdNHycP3ZM6VztjjMRTfqLnM';
  // Ali Supabase
  const SUPABASE_URL = 'https://spb-wz98bgf6x7f3zs9b.supabase.opentrust.net';
  const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsInJlZiI6InNwYi13ejk4YmdmNng3ZjN6czliIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzA4NjMwMzcsImV4cCI6MjA4NjQzOTAzN30.BXi01-5dSsCPRz4BxisrTCCG5fajp3P-fYj0moyL6iQ';

  // 当前用户信息
  this._currentUser = null;
  let _syncEnabled = false;

  // 统一Credits配置
  this.PRICING = { PAGE: 1, CHAT: 8 };

  // Supabase session（内存和持久化存储）
  this._supabaseSession = null;

  /**
   * 初始化同步管理器
   */
  this.init = async function () {
    console.log('[VibeDBSync] 初始化同步管理器...');

    try {
      // 从偏好设置中恢复用户信息
      const savedUser = Zotero.Prefs.get('sync.vibedb.user');
      if (savedUser) {
        try {
          this._currentUser = JSON.parse(savedUser);
          // console.log(`[VibeDBSync] 从 Prefs 恢复用户信息: ${this._currentUser.email}`);

          // 验证 session 是否有效
          const session = this._loadSessionFromPrefs();
          if (session && session.access_token) {
            this._supabaseSession = session;

            // 检查 token 是否过期
            const expiresAt = session.expires_at || 0;
            const now = Math.floor(Date.now() / 1000);
            if (expiresAt > 0 && now >= expiresAt) {
              console.log('[VibeDBSync] ⚠️ Token 已过期，需要重新登录');
              // 清除过期的用户信息
              this.clearUser();
            } else {
              _syncEnabled = true;
              // console.log(`[VibeDBSync] ✅ 恢复用户会话: ${this._currentUser.email}, token 有效期至 ${new Date(expiresAt * 1000).toLocaleString()}`);
            }
          } else {
            console.log('[VibeDBSync] ⚠️ Session 不存在，清除用户信息');
            // 没有 session，清除用户信息
            this.clearUser();
          }
        } catch (e) {
          console.error('[VibeDBSync] 解析用户信息失败:', e);
          this.clearUser();
        }
      } else {
        console.log('[VibeDBSync] 未找到已保存的用户信息');
      }

      console.log('[VibeDBSync] ✅ 同步管理器初始化完成');
    }
    catch (e) {
      console.error('[VibeDBSync] ❌ 初始化失败:', e);
      Zotero.logError(e);
    }
  };

  /**
   * 用户注册（已禁用邮箱验证功能，保留代码备用）
   */
  /*
  this.signUp = async function (email, password) {
  	console.log(`[VibeDBSync] 开始注册用户: ${email}`);
  	
  	try {
  		// 验证输入
  		if (!email || !password) {
  			throw new Error('邮箱和密码不能为空');
  		}
  		
  		if (password.length < 6) {
  			throw new Error('密码长度至少为 6 位');
  		}
  		
  		// 使用 Supabase Auth REST API 注册（安全，使用 anon key）
  		const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
  			method: 'POST',
  			headers: {
  				'Content-Type': 'application/json',
  				'apikey': SUPABASE_ANON_KEY
  			},
  			body: JSON.stringify({
  				email: email,
  				password: password
  			})
  		});
  		
  		const data = await response.json();
  		
  		if (!response.ok) {
  			throw new Error(data.error_description || data.msg || '注册失败');
  		}
  		
  		console.log(`[VibeDBSync] ✅ 用户注册成功: ${data.email || email}`);
  		
  		return data;
  	}
  	catch (e) {
  		console.error('[VibeDBSync] ❌ 注册失败:', e);
  		throw e;
  	}
  };
  */

  /**
   * 用户登录（已弃用，登录由前端 iframe 处理）
   */
  /*
  this.signIn = async function (email, password) {
  	console.log(`[VibeDBSync] 登录请求: ${email}`);
  	// 此方法由前端 iframe 调用 Supabase SDK 完成
  	// 这里只是占位，实际不会被调用
  	throw new Error('请使用前端 Supabase SDK 进行登录');
  };
  */

  /**
   * 用户登出
   */
  this.signOut = async function () {
    console.log('[VibeDBSync] 用户登出');

    // 停止自动同步
    if (Zotero.VibeDBCloudSync && Zotero.VibeDBCloudSync.stopAutoSync) {
      Zotero.VibeDBCloudSync.stopAutoSync();
    }

    // 清除用户信息和 session
    this.clearUser();
  };

  /**
   * 使用 REST API 登录
   * @param {string} email - 用户邮箱
   * @param {string} password - 用户密码
   * @returns {Promise<Object>} 登录结果
   */
  this.signInWithPassword = async function (email, password) {
    // console.log(`[VibeDBSync] 开始登录: ${email}`);

    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.msg || '登录失败');
      }

      // 保存用户信息
      if (data.user) {
        this.setUser(data.user);
      }

      // 保存完整的 session（包含 access_token 和 refresh_token）
      if (data.access_token) {
        const session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
          expires_in: data.expires_in,
          token_type: data.token_type,
          user: data.user
        };
        this._supabaseSession = session;
        this._saveSessionToPrefs(session);
      }

      // console.log(`[VibeDBSync] ✅ 登录成功: ${email}`);
      return data;
    }
    catch (e) {
      console.error('[VibeDBSync] ❌ 登录失败:', e);
      throw e;
    }
  };

  /**
   * 保存用户信息
   * @param {Object} user - 用户对象 { id, email, ... }
   */
  this.setUser = function (user) {
    this._currentUser = user;
    _syncEnabled = true;

    // 保存到偏好设置
    Zotero.Prefs.set('sync.vibedb.user', JSON.stringify(user));

    // console.log(`[VibeDBSync] ✅ 用户已登录: ${user.email}`);
  };

  /**
   * 清除用户信息
   */
  this.clearUser = function () {
    this._currentUser = null;
    this._supabaseSession = null;
    _syncEnabled = false;

    // 清除所有相关的偏好设置
    Zotero.Prefs.clear('sync.vibedb.user');
    Zotero.Prefs.clear('sync.vibedb.supabase_session');

    console.log('[VibeDBSync] ✅ 用户已登出，已清除所有会话信息');
  };

  /**
   * 获取当前用户信息
   */
  this.getCurrentUser = function () {
    return this._currentUser;
  };

  /**
   * 获取当前 Access Token (自动处理刷新)
   * 优先使用 CloudSync 模块的刷新逻辑，如果不可用则返回当前内存中的 token
   * @returns {Promise<string|null>} access_token
   */
  this.getAccessToken = async function () {
    // 优先使用 VibeDBCloudSync 的获取方法（包含自动刷新逻辑）
    if (Zotero.VibeDBCloudSync && Zotero.VibeDBCloudSync._getAccessToken) {
      return await Zotero.VibeDBCloudSync._getAccessToken();
    }

    // 降级策略：直接返回当前 session 的 token
    const session = this._supabaseSession || this._loadSessionFromPrefs();
    // 简单的过期检查
    if (session && session.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      if (now >= session.expires_at) {
        console.log('[VibeDBSync] Token 已过期 (Fallback check)');
        return null;
      }
    }
    return session ? session.access_token : null;
  };

  /**
   * 检查是否已登录（需要同时验证用户信息和 session）
   * @returns {boolean}
   */
  this.isLoggedIn = function () {
    // 必须同时满足：用户信息存在 + session 存在
    if (!this._currentUser) {
      return false;
    }

    // 检查 session 是否存在
    let session = this._supabaseSession;
    if (!session || !session.access_token) {
      // 尝试从 Prefs 加载
      session = this._loadSessionFromPrefs();
      if (!session || !session.access_token) {
        console.log('[VibeDBSync] Session 不存在，用户未真正登录');
        return false;
      }
      this._supabaseSession = session;
    }

    // 检查 token 是否已过期（不提前刷新，只检查是否过期）
    const expiresAt = session.expires_at || 0;
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt > 0 && now >= expiresAt) {
      console.log('[VibeDBSync] Token 已过期，自动清空并提示登录');
      this.clearUser();

      // 1. 先确保面板已打开并创建了 iframe
      this.ensureLoggedIn();

      // 2. 带重试地通知 UI 切换到登录视图
      // 延迟 500ms 后开始，给面板足够的时间打开并渲染 iframe
      setTimeout(() => {
        this.notifyAuthStatusChanged();
      }, 500);

      return false;
    }

    return true;
  };

  /**
   * 确保用户已登录，未登录则尝试打开登录面板
   * @returns {boolean} 是否已登录
   */
  this.ensureLoggedIn = function () {
    if (this.isLoggedIn()) {
      return true;
    }

    // 尝试打开登录面板
    try {
      const mainWindow = Zotero.getMainWindow();
      if (mainWindow && mainWindow.ZoteroPane && mainWindow.ZoteroPane.toggleCloudSyncPanel) {
        const cloudSyncButton = mainWindow.document.getElementById('zotero-tb-cloud-sync');
        // 如果面板未打开，则打开
        // 注意：toggleCloudSyncPanel通常是切换，这里最好只在未打开时打开
        // 但由于无法轻易检测面板状态，调用 toggle 可能关闭已打开的面板
        // 暂时直接调用，假设用户点击触发此逻辑时面板通常是关闭的
        mainWindow.ZoteroPane.toggleCloudSyncPanel(cloudSyncButton);

        // 显示提示
        /*
        const notifier = mainWindow.document.getElementById('zotero-error-message-box');
        if (notifier) {
        	// 简单的提示逻辑，或者使用 Zotero 的通知机制
        }
        */
      }
    } catch (e) {
      console.error('[VibeDBSync] 打开登录面板失败:', e);
    }
    return false;
  };

  /**
   * 检查同步是否启用
   */
  this.isSyncEnabled = function () {
    return _syncEnabled;
  };

  /**
   * 保存 Supabase session（公开方法，供云同步模块调用）
   * @param {Object} session - Supabase session 对象
   */
  this.saveSupabaseSession = function (session) {
    // 保存到内存
    this._supabaseSession = session;
    // 持久化到 Prefs
    this._saveSessionToPrefs(session);
  };

  /**
   * 保存 Supabase session 到 Prefs（持久化存储）
   * @param {Object} session - Supabase session 对象
   */
  this._saveSessionToPrefs = function (session) {
    try {
      if (!session) {
        Zotero.Prefs.clear('sync.vibedb.supabase_session');
        console.log('[VibeDBSync] ✅ Supabase session 已清除');
        return;
      }

      // 保存完整的 session（包含 refresh_token）
      Zotero.Prefs.set('sync.vibedb.supabase_session', JSON.stringify(session));
      // console.log('[VibeDBSync] ✅ Supabase session 已保存到 Prefs');
    } catch (e) {
      console.error('[VibeDBSync] 保存 session 到 Prefs 失败:', e);
    }
  };

  /**
   * 从 Prefs 加载 Supabase session
   * @returns {Object|null} Supabase session 或 null
   */
  this._loadSessionFromPrefs = function () {
    try {
      const sessionStr = Zotero.Prefs.get('sync.vibedb.supabase_session');
      if (!sessionStr) {
        return null;
      }

      const session = JSON.parse(sessionStr);
      // console.log('[VibeDBSync] ✅ 从 Prefs 加载 Supabase session');
      return session;
    } catch (e) {
      console.error('[VibeDBSync] 加载 session 失败:', e);
      return null;
    }
  };

  /**
   * 获取 Supabase 配置（供前端使用）
   */
  this.getSupabaseConfig = function () {
    return {
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY
    };
  };

  this.getUserBalance = async function () {
    // console.log('[VibeDBSync] 获取用户余额 (V2)...');

    try {
      // 检查是否已登录
      if (!this._currentUser || !this._currentUser.id) {
        console.error('[VibeDBSync] 用户未登录，无法获取余额');
        return null;
      }

      const userId = this._currentUser.id;

      // 获取 access_token
      const token = await this.getAccessToken();
      if (!token) {
        console.error('[VibeDBSync] 无法获取 access_token，可能未登录或 session 已过期');
        return null;
      }

      // 调用 Supabase RPC 函数查询双重余额 V2
      const url = `${SUPABASE_URL}/rest/v1/rpc/get_user_balance_v2`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_user_id: userId })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[VibeDBSync] 查询余额失败 (${response.status}):`, errorText);

        // Handle 401 Unauthorized
        if (response.status === 401) {
          console.log('[VibeDBSync] Token 失效，触发重新登录流程');
          this.clearUser();
          this.ensureLoggedIn();
        }

        return null;
      }

      const data = await response.json();
      // JSON 格式: { credits: 2000, credits_used: 100, user_balance: { ... }, subscription_info: { ... } }
      if (data) {
        return {
          // 聚合的Credits返回到最外层
          credits: data.credits || 0,
          credits_used: data.credits_used || 0,

          // 存储具体细节供 UI 分析
          user_balance_detail: data.user_balance,
          subscription_info: data.subscription_info,

          // 保留部分兼容字段
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      } else {
        console.log('[VibeDBSync] ⚠️ 余额接口返回空');
        return null;
      }
    } catch (e) {
      console.error('[VibeDBSync] ❌ 获取余额异常:', e);
      console.error('[VibeDBSync] 错误堆栈:', e.stack);
      return null;
    }
  };

  /**
   * 扣减Credits
   * @param {number} amount - 扣减的Credits数量
   * @returns {Promise<boolean>} 是否扣减成功
   */
  this.deductCredits = async function (amount) {
    try {
      // 检查是否已登录
      if (!this._currentUser || !this._currentUser.id) {
        console.error('[VibeDBSync] 用户未登录，无法扣减Credits');
        return false;
      }

      const userId = this._currentUser.id;

      // 获取 access_token
      const token = await Zotero.VibeDBCloudSync._getAccessToken();
      if (!token) {
        console.error('[VibeDBSync] 无法获取 access_token');
        return false;
      }

      // 调用 Supabase RPC 函数扣减Credits
      const url = `${SUPABASE_URL}/rest/v1/rpc/deduct_credits_v2`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_amount: amount
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[VibeDBSync] 扣减Credits失败 (${response.status}):`, errorText);
        return false;
      }

      // 扣减成功后通知刷新余额显示
      this.notifyBalanceChanged();

      return true;
    } catch (e) {
      console.error('[VibeDBSync] ❌ 扣减Credits异常:', e);
      console.error('[VibeDBSync] 错误堆栈:', e.stack);
      return false;
    }
  };

  /**
   * 记录用户本次解析的 Token 和页数消耗
   * @param {number} pageCount - PDF 解析页数
   * @param {number} inputTokens - 输入 Token
   * @param {number} outputTokens - 输出 Token
   * @param {number} totalTokens - 总 Token
   */
  this.logUsage = async function (pageCount, inputTokens, outputTokens, totalTokens) {
    try {
      if (!this._currentUser || !this._currentUser.id) return false;
      const userId = this._currentUser.id;

      const token = await this.getAccessToken();
      if (!token) return false;

      const url = `${SUPABASE_URL}/rest/v1/token_usage_logs`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_id: userId,
          page_count: pageCount || 0,
          input_tokens: inputTokens || 0,
          output_tokens: outputTokens || 0,
          total_tokens: totalTokens || 0
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[VibeDBSync] 记录使用量失败 (${response.status}):`, errorText);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[VibeDBSync] ❌ 记录使用量异常:', e);
      return false;
    }
  };

  /**
   * 通知余额已变化，触发 UI 刷新
   * 通过查找 account-status iframe 并调用其刷新方法
   */
  this.notifyBalanceChanged = function () {
    // console.log('[VibeDBSync] 通知余额已变化，开始刷新 UI...');

    try {
      // 查找主窗口中的 account-status iframe
      const mainWindow = Zotero.getMainWindow();
      if (!mainWindow || !mainWindow.document) {
        console.warn('[VibeDBSync] 无法获取主窗口');
        return;
      }

      // 查找 account-status iframe
      const accountIframe = mainWindow.document.getElementById('account-status-iframe');
      if (!accountIframe || !accountIframe.contentWindow) {
        console.warn('[VibeDBSync] 未找到 account-status iframe');
        return;
      }

      // 调用 iframe 中的刷新方法
      if (typeof accountIframe.contentWindow.refreshBalance === 'function') {
        // console.log('[VibeDBSync] ✅ 调用 account-status iframe 的 refreshBalance()');
        accountIframe.contentWindow.refreshBalance();
      } else {
        console.warn('[VibeDBSync] account-status iframe 中未找到 refreshBalance 方法');
      }
    } catch (e) {
      console.error('[VibeDBSync] 通知余额变化失败:', e);
    }
  };

  /**
   * 通知认证状态变化，触发 UI 刷新
   * 在 Token 过期或被动登出时调用
   * 采用带重试的轮询机制，确保面板和 iframe 加载完成后再通知
   */
  this.notifyAuthStatusChanged = function () {
    const MAX_RETRIES = 10; // 最多重试 10 次
    const RETRY_INTERVAL = 300; // 每次间隔 300ms，总最大等待 3s
    let attempts = 0;

    const tryNotify = () => {
      try {
        const mainWindow = Zotero.getMainWindow();
        if (!mainWindow || !mainWindow.document) {
          console.warn('[VibeDBSync] 无法获取主窗口');
          return;
        }

        // 查找 account-status iframe
        const accountIframe = mainWindow.document.getElementById('account-status-iframe');
        if (!accountIframe || !accountIframe.contentWindow) {
          // iframe 尚未就绪，继续重试
          if (attempts < MAX_RETRIES) {
            attempts++;
            setTimeout(tryNotify, RETRY_INTERVAL);
          } else {
            console.warn('[VibeDBSync] 超出重试次数，account-status iframe 始终未就绪');
          }
          return;
        }

        // 检查 iframe 内的方法是否就绪
        if (typeof accountIframe.contentWindow.showLoginView !== 'function') {
          // iframe 已存在但内部脚本还未加载完
          if (attempts < MAX_RETRIES) {
            attempts++;
            setTimeout(tryNotify, RETRY_INTERVAL);
          } else {
            console.warn('[VibeDBSync] account-status iframe 中未找到 showLoginView 方法');
          }
          return;
        }

        // iframe 已就绪，切换到登录视图并提示
        accountIframe.contentWindow.showLoginView();
        if (typeof accountIframe.contentWindow.showStatus === 'function') {
          accountIframe.contentWindow.showStatus('error', '登录会话已过期，请重新登录');
        }
        console.log('[VibeDBSync] ✅ 已通知 iframe 切换到登录视图');
      } catch (e) {
        console.error('[VibeDBSync] 通知认证状态变化失败:', e);
      }
    };

    tryNotify();
  };

  /**
   * 【仅供调试】立即将 session 标记为已过期，用于测试 token 过期流程
   * 使用方式：在 Zotero 开发者控制台输入：
   *   Zotero.VibeDBSync.debugExpireToken()
   * 然后点击任意需要登录的功能（onflow 按钮 / AI Chat 发送）即可触发过期流程
   */
  this.debugExpireToken = function () {
    try {
      const expiredAt = Math.floor(Date.now() / 1000) - 1; // 1 秒前

      // 更新内存中的 session
      if (this._supabaseSession) {
        this._supabaseSession.expires_at = expiredAt;
      }

      // 同步更新 Prefs 中持久化的 session
      const session = this._loadSessionFromPrefs();
      if (session) {
        session.expires_at = expiredAt;
        this._saveSessionToPrefs(session);
      }

      console.log(`[VibeDBSync] 🧪 DEBUG: expires_at 已设为 ${expiredAt}（已在 ${new Date().toLocaleTimeString()} 过期），下次调用 isLoggedIn() 将立即触发过期流程`);
    } catch (e) {
      console.error('[VibeDBSync] debugExpireToken 失败:', e);
    }
  };
}();