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
 * VibeDB - 独立的 SQLite 数据库，用于存储 VibeReading 系统的数据
 * 包括：PDF 解析结果、VibeCards、FlashCards、ArticleSummary、AI Chat 等
 * 
 * 架构说明：
 * 1. 与 Zotero 主数据库完全独立，避免冲突
 * 2. 通过 item_id 与 Zotero 的 items 表关联
 * 3. 使用相同的 DBConnection 基础架构
 * 4. 支持版本迁移和 schema 更新
 */

Zotero.VibeDB = new function () {
  // 数据库版本（与 vibeDB.sql 文件版本对应）
  const SCHEMA_VERSION = 12;

  // Schema 类型
  const SCHEMA_TYPE = 'vibedata';

  var _connection = null;
  var _dbInitialized = false;
  var _schemaUpdatePromise = null;
  var _schemaUpdateDeferred = Zotero.Promise.defer();

  /**
   * 初始化 VibeDB 数据库
   * 在 Zotero 启动时调用
   */
  this.init = async function () {
    if (_dbInitialized) {
      // console.log('[VibeDB] Database already initialized');
      Zotero.debug('[VibeDB] Database already initialized');
      return _connection;
    }

    try {
      // console.log('[VibeDB] 🚀 开始初始化 VibeDB 数据库');
      Zotero.debug('[VibeDB] Initializing database');

      // 创建数据库连接（使用 'vibeDB' 作为数据库名）
      // console.log('[VibeDB] 步骤 1: 创建数据库连接...');
      _connection = new Zotero.DBConnection('vibeDB');
      // console.log('[VibeDB] ✓ 数据库连接对象已创建');

      // 测试数据库连接
      // console.log('[VibeDB] 步骤 2: 测试数据库连接...');
      await _connection.test();
      // console.log('[VibeDB] ✓ 数据库连接测试成功');

      // 检查并更新 schema
      // console.log('[VibeDB] 步骤 3: 检查并更新 schema...');
      await this.updateSchema();
      // console.log('[VibeDB] ✓ Schema 检查/更新完成');

      _dbInitialized = true;
      _schemaUpdateDeferred.resolve(true);

      console.log('[VibeDB] ✅ VibeDB 初始化完成！');
      Zotero.debug('[VibeDB] Database initialized successfully');
      return _connection;
    }
    catch (e) {
      console.error('[VibeDB] ❌ 初始化失败:', e);
      Zotero.logError(e);
      _schemaUpdateDeferred.reject(e);
      throw e;
    }
  };

  /**
   * 获取数据库连接
   */
  this.getConnection = function () {
    if (!_connection) {
      throw new Error('[VibeDB] Database not initialized');
    }
    return _connection;
  };

  /**
   * 检查并更新数据库 schema
   */
  this.updateSchema = async function () {
    try {
      // console.log('[VibeDB]   -> 开始 Schema 检查...');
      // 获取当前数据库版本
      const currentVersion = await this.getDBVersion();
      // console.log(`[VibeDB]   -> 当前数据库版本: ${currentVersion === null ? '数据库不存在' : currentVersion}`);
      // console.log(`[VibeDB]   -> 代码版本: ${SCHEMA_VERSION}`);

      // 如果数据库不存在（版本为 null），则创建
      if (!currentVersion) {
        // console.log('[VibeDB]   -> 数据库不存在，开始创建新数据库...');
        Zotero.debug('[VibeDB] Database does not exist -- creating');
        await this._initializeSchema();
        // console.log('[VibeDB]   -> ✓ 新数据库创建完成');
        return true;
      }

      // 如果版本号相同，无需更新
      if (currentVersion === SCHEMA_VERSION) {
        // console.log('[VibeDB]   -> ✓ 数据库版本已是最新，无需更新');
        Zotero.debug(`[VibeDB] Database is up to date (version ${SCHEMA_VERSION})`);
        return false;
      }

      // 如果数据库版本较新，抛出错误（可能是降级导致）
      if (currentVersion > SCHEMA_VERSION) {
        console.error(`[VibeDB]   -> ❌ 数据库版本 (${currentVersion}) 高于代码版本 (${SCHEMA_VERSION})`);
        throw new Error(
          `[VibeDB] Database version (${currentVersion}) is newer than code version (${SCHEMA_VERSION}). ` +
          `Please upgrade VibeZotero.`
        );
      }

      // 执行版本迁移
      // console.log(`[VibeDB]   -> 开始迁移: v${currentVersion} → v${SCHEMA_VERSION}`);
      Zotero.debug(`[VibeDB] Migrating database from version ${currentVersion} to ${SCHEMA_VERSION}`);
      await this._migrateSchema(currentVersion, SCHEMA_VERSION);
      // console.log('[VibeDB]   -> ✓ 版本迁移完成');

      return true;
    }
    catch (e) {
      console.error('[VibeDB] ❌ Schema 更新失败:', e);
      Zotero.logError('[VibeDB] Schema update failed:', e);
      throw e;
    }
  };

  /**
   * 获取当前数据库版本
   */
  this.getDBVersion = async function () {
    try {
      // 检查 version 表是否存在
      const tableExists = await _connection.tableExists('version');
      if (!tableExists) {
        return null;
      }

      // 查询版本号
      const sql = "SELECT version FROM version WHERE schema = ?";
      const version = await _connection.valueQueryAsync(sql, [SCHEMA_TYPE]);

      return version ? parseInt(version) : null;
    }
    catch (e) {
      Zotero.debug('[VibeDB] Error getting DB version:', e);
      return null;
    }
  };

  /**
   * 更新数据库版本号
   */
  this._updateDBVersion = async function (version) {
    const sql = "REPLACE INTO version (schema, version) VALUES (?, ?)";
    await _connection.queryAsync(sql, [SCHEMA_TYPE, parseInt(version)]);
    Zotero.debug(`[VibeDB] Updated version to ${version}`);
  };

  /**
   * 初始化数据库 schema（首次创建）
   */
  this._initializeSchema = async function () {
    await _connection.executeTransaction(async () => {
      try {
        // console.log('[VibeDB]     -> 开始创建数据库表...');
        Zotero.debug('[VibeDB] Creating database tables');

        // 设置 SQLite pragmas
        // console.log('[VibeDB]     -> 设置 SQLite pragmas...');
        await _connection.queryAsync("PRAGMA page_size = 4096");
        await _connection.queryAsync("PRAGMA encoding = 'UTF-8'");
        await _connection.queryAsync("PRAGMA auto_vacuum = 1");
        await _connection.queryAsync("PRAGMA foreign_keys = ON");
        // console.log('[VibeDB]     -> ✓ SQLite pragmas 设置完成');

        // 读取并执行 schema SQL 文件
        // console.log('[VibeDB]     -> 读取 schema SQL 文件...');
        const schemaSQL = await this._getSchemaSQL();
        // console.log('[VibeDB]     -> ✓ Schema SQL 文件读取成功');

        // console.log('[VibeDB]     -> 执行 SQL 语句创建表...');
        await _connection.executeSQLFile(schemaSQL);
        // console.log('[VibeDB]     -> ✓ 所有表创建完成');

        // 设置初始版本
        // console.log('[VibeDB]     -> 设置数据库版本...');
        await this._updateDBVersion(SCHEMA_VERSION);
        // console.log(`[VibeDB]     -> ✓ 数据库版本已设置为 ${SCHEMA_VERSION}`);

        // console.log('[VibeDB]     -> ✓ Schema 初始化成功');
        Zotero.debug('[VibeDB] Schema initialized successfully');
      }
      catch (e) {
        console.error('[VibeDB] ❌ Schema 初始化失败:', e);
        Zotero.logError('[VibeDB] Failed to initialize schema:', e);
        throw e;
      }
    });
  };

  /**
   * 读取 schema SQL 文件
   */
  this._getSchemaSQL = async function () {
    try {
      // 从 resource 目录读取 vibeDB.sql 文件
      const sqlPath = 'resource://zotero/schema/vibeDB.sql';
      const sql = await Zotero.File.getResourceAsync(sqlPath);
      return sql;
    }
    catch (e) {
      Zotero.logError('[VibeDB] Failed to read schema SQL file:', e);
      throw e;
    }
  };

  /**
   * 执行数据库迁移
   * @param {Number} fromVersion - 起始版本
   * @param {Number} toVersion - 目标版本
   */
  this._migrateSchema = async function (fromVersion, toVersion) {
    await _connection.executeTransaction(async () => {
      Zotero.debug(`[VibeDB] Migrating from version ${fromVersion} to ${toVersion}`);

      // 逐步执行迁移
      for (let version = fromVersion + 1; version <= toVersion; version++) {
        Zotero.debug(`[VibeDB] Applying migration step ${version}`);
        await this._applyMigrationStep(version);
      }

      // 更新版本号
      await this._updateDBVersion(toVersion);

      Zotero.debug('[VibeDB] Migration completed successfully');
    });
  };

  /**
   * 应用特定版本的迁移步骤
   * @param {Number} version - 目标版本
   */
  this._applyMigrationStep = async function (version) {
    // 根据版本号执行对应的迁移逻辑
    switch (version) {
      case 7:
        // 版本 7: 重建 sections 表，确保包含 UNIQUE 约束
        await this._migrateToVersion7();
        break;

      case 8:
        // 版本 8: 为 points 表添加 importance_level 字段
        await this._migrateToVersion8();
        break;

      case 9:
        // 版本 9: 重构 article_summary 表，删除 img_ids 和 table_ids，重命名 title_block_ids 为 block_ids
        await this._migrateToVersion9();
        break;

      case 10:
        // 版本 10: 版本9的迁移已完成删除 block_ids 字段的功能，此版本为兼容性版本
        console.log('[VibeDB] 版本 10: article_summary 表已重构完成，无需额外迁移');
        break;

      case 11:
        // 版本 11: 删除 images 和 tables 表（不再使用）
        await this._migrateToVersion11();
        break;

      case 12:
        // 版本 12: 为 papers 表添加 github_url 字段
        await this._migrateToVersion12();
        break;

      default:
        Zotero.debug(`[VibeDB] No migration needed for version ${version}`);
    }
  };

  this._migrateToVersion7 = async function () {
    console.log('[VibeDB] 开始迁移到版本 7');
    // 7. 删除并重建 sections 表（确保包含 UNIQUE 约束）
    await _connection.queryAsync(`DROP TABLE IF EXISTS sections`);
    console.log('[VibeDB] ✓ 已删除旧的 sections 表');

    await _connection.queryAsync(`
			CREATE TABLE IF NOT EXISTS sections (
				section_id INTEGER PRIMARY KEY,
				paper_id INTEGER NOT NULL,
				parent_section_id INTEGER,      -- 父章节ID，支持层级嵌套
				title_block_id INTEGER NOT NULL, -- 关联到 block_mapping 中的 title_blocks
				level INTEGER NOT NULL,         -- 层级：0为根级，1为子章节等
				title TEXT NOT NULL,           -- 章节标题
				summary TEXT,                   -- 章节摘要
				points TEXT,                    -- JSON 数组，存储该章节的要点
				children_order INTEGER,         -- 在父章节中的排序
				created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
				FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE,
				FOREIGN KEY (parent_section_id) REFERENCES sections(section_id) ON DELETE CASCADE,
				CONSTRAINT sections_paper_id_title_block_id_unique UNIQUE (paper_id, title_block_id)
			)
		`);
    console.log('[VibeDB] ✓ 已重新创建 sections 表');
  };

  /**
   * 迁移到版本 8：为 points 表添加 importance_level 字段
   */
  this._migrateToVersion8 = async function () {
    console.log('[VibeDB] 开始迁移到版本 8');
    // 8. 为 points 表添加 importance_level 字段
    try {
      await _connection.queryAsync(`
				ALTER TABLE points ADD COLUMN importance_level INTEGER DEFAULT 1
			`);
      console.log('[VibeDB] ✓ 已为 points 表添加 importance_level 字段');
    } catch (e) {
      // 如果字段已存在，忽略错误
      if (e.message && e.message.includes('duplicate column name')) {
        console.log('[VibeDB] importance_level 字段已存在，跳过添加');
      } else {
        throw e;
      }
    }
  };

  /**
   * 迁移到版本 9：重构 article_summary 表
   * - 删除 img_ids 和 table_ids 字段
   * - 将 title_block_ids 重命名为 block_ids
   */
  this._migrateToVersion9 = async function () {
    console.log('[VibeDB] 开始迁移到版本 9');

    // SQLite 不支持直接删除列或重命名列，需要重建表
    // 1. 创建新表
    await _connection.queryAsync(`
			CREATE TABLE IF NOT EXISTS article_summary_new (
				summary_id INTEGER PRIMARY KEY,
				paper_id INTEGER NOT NULL,
				title TEXT NOT NULL,
				content TEXT,
				sort_order INTEGER NOT NULL,
				created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
				FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
			)
		`);
    console.log('[VibeDB] ✓ 已创建新的 article_summary_new 表');

    // 2. 复制数据（移除 block_ids 字段，points 的 block_ids 已包含在 content JSON 中）
    await _connection.queryAsync(`
			INSERT INTO article_summary_new (summary_id, paper_id, title, content, sort_order, created_at)
			SELECT summary_id, paper_id, title, content, sort_order, created_at
			FROM article_summary
		`);
    console.log('[VibeDB] ✓ 已复制数据到新表');

    // 3. 删除旧表
    await _connection.queryAsync(`DROP TABLE article_summary`);
    console.log('[VibeDB] ✓ 已删除旧的 article_summary 表');

    // 4. 重命名新表
    await _connection.queryAsync(`ALTER TABLE article_summary_new RENAME TO article_summary`);
    console.log('[VibeDB] ✓ 已将 article_summary_new 重命名为 article_summary');

    // 5. 重建索引
    await _connection.queryAsync(`
			CREATE INDEX IF NOT EXISTS idx_article_summary_paper ON article_summary(paper_id)
		`);
    await _connection.queryAsync(`
			CREATE INDEX IF NOT EXISTS idx_article_summary_sort ON article_summary(paper_id, sort_order)
		`);
    console.log('[VibeDB] ✓ 已重建索引');
  };

  /**
   * 迁移到版本 11：删除 images 和 tables 表（不再使用）
   */
  this._migrateToVersion11 = async function () {
    console.log('[VibeDB] 开始迁移到版本 11');

    // 删除 images 表及其索引
    await _connection.queryAsync(`DROP TABLE IF EXISTS images`);
    console.log('[VibeDB] ✓ 已删除 images 表');

    // 删除 tables 表及其索引
    await _connection.queryAsync(`DROP TABLE IF EXISTS tables`);
    console.log('[VibeDB] ✓ 已删除 tables 表');

    console.log('[VibeDB] ✓ 版本 11 迁移完成：images 和 tables 表已删除');
  };

  /**
   * 迁移到版本 12：为 papers 表添加 github_url 字段
   */
  this._migrateToVersion12 = async function () {
    console.log('[VibeDB] 开始迁移到版本 12');
    try {
      await _connection.queryAsync(`
				ALTER TABLE papers ADD COLUMN github_url TEXT
			`);
      console.log('[VibeDB] ✓ 已为 papers 表添加 github_url 字段');
    } catch (e) {
      // 如果字段已存在，忽略错误
      if (e.message && e.message.includes('duplicate column name')) {
        console.log('[VibeDB] github_url 字段已存在，跳过添加');
      } else {
        throw e;
      }
    }
    console.log('[VibeDB] ✓ 版本 12 迁移完成');
  };

  /**
   * 关闭数据库连接
   */
  this.close = async function () {
    if (_connection) {
      await _connection.closeDatabase();
      _connection = null;
      _dbInitialized = false;
      Zotero.debug('[VibeDB] Database connection closed');
    }
  };

  /**
   * 获取 schema 更新 Promise（类似 Zotero.Schema.schemaUpdatePromise）
   */
  Object.defineProperty(this, 'schemaUpdatePromise', {
    get: function () {
      return _schemaUpdateDeferred.promise;
    }
  });

  // ==================== 数据访问方法 ====================

  /**
   * Papers 表 CRUD
   */
  this.Papers = {
    /**
     * 创建或更新论文记录
     * @param {Number} itemID - Zotero item ID
     * @param {Object} data - 论文数据
     */
    save: async function (itemID, data) {
      // console.log(`[VibeDB.Papers] 步骤7: 开始保存论文数据: itemID=${itemID}`);

      // 检查数据库连接
      if (!_connection) {
        console.error(`[VibeDB.Papers] ❌ 数据库连接未初始化！`);
        throw new Error('Database connection not initialized');
      }
      // console.log(`[VibeDB.Papers] ✓ 数据库连接已就绪`);

      const {
        resultDir = null,
        markdownContent = null,
        articleSummary = null,
        outline = null,
        blockMapping = null,
        githubUrl = null
      } = data;

      const outlineStr = outline ? JSON.stringify(outline) : null;
      const blockMappingStr = blockMapping ? JSON.stringify(blockMapping) : null;
      const sql = `
		INSERT INTO papers (item_id, result_dir, markdown_content, article_summary, outline, block_mapping, github_url, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
		ON CONFLICT(item_id) DO UPDATE SET
			result_dir = excluded.result_dir,
			markdown_content = excluded.markdown_content,
			article_summary = excluded.article_summary,
			outline = excluded.outline,
			block_mapping = excluded.block_mapping,
			github_url = excluded.github_url,
			updated_at = strftime('%s', 'now')
	`;

      // console.log(`[VibeDB.Papers] 准备执行 SQL...`);
      try {
        await _connection.queryAsync(sql, [
        itemID,
        resultDir,
        markdownContent,
        articleSummary,
        outlineStr,
        blockMappingStr,
        githubUrl]
        );
        // console.log(`[VibeDB.Papers] ✓ SQL 执行成功`);

        // 通知云同步模块数据已变更
        if (Zotero.VibeDBCloudSync && Zotero.VibeDBCloudSync.markDataChanged) {
          Zotero.VibeDBCloudSync.markDataChanged();
        }
      } catch (e) {
        console.error(`[VibeDB.Papers] ❌ SQL 执行失败:`, e);
        throw e;
      }

      // console.log(`[VibeDB.Papers] ✓ 论文数据已保存: itemID=${itemID}`);
      Zotero.debug(`[VibeDB] Saved paper data for item ${itemID}`);
    },

    /**
     * 获取论文记录
     * @param {Number} itemID - Zotero item ID
     * @returns {Object|null}
     */
    get: async function (itemID) {
      const sql = "SELECT * FROM papers WHERE item_id = ?";
      const row = await _connection.rowQueryAsync(sql, [itemID]);
      if (!row) {
        return null;
      }

      // 创建新对象，避免修改只读的 row 对象
      const result = {
        paper_id: row.paper_id,
        item_id: row.item_id,
        result_dir: row.result_dir,
        markdown_content: row.markdown_content,
        article_summary: row.article_summary,
        outline: row.outline,
        block_mapping: row.block_mapping,
        github_url: row.github_url,
        created_at: row.created_at,
        updated_at: row.updated_at
      };

      // 解析 JSON 字段
      if (result.outline) {
        try {
          result.outline = JSON.parse(result.outline);
        } catch (e) {
          console.error(`[VibeDB] Failed to parse outline for item ${itemID}:`, e);
          Zotero.logError(`[VibeDB] Failed to parse outline for item ${itemID}:`, e);
          result.outline = null;
        }
      }

      // 解析 block_mapping JSON 字段
      if (result.block_mapping) {
        try {
          result.block_mapping = JSON.parse(result.block_mapping);
        } catch (e) {
          console.error(`[VibeDB] Failed to parse block_mapping for item ${itemID}:`, e);
          Zotero.logError(`[VibeDB] Failed to parse block_mapping for item ${itemID}:`, e);
          result.block_mapping = null;
        }
      }

      return result;
    },

    /**
     * 删除论文记录（级联删除相关数据）
     * @param {Number} itemID - Zotero item ID
     */
    delete: async function (itemID) {
      // 先获取 paper_id
      const paper = await this.get(itemID);
      if (!paper) {
        Zotero.debug(`[VibeDB] Paper not found for item ${itemID}`);
        return;
      }

      const sql = "DELETE FROM papers WHERE paper_id = ?";
      await _connection.queryAsync(sql, [paper.paper_id]);

      Zotero.debug(`[VibeDB] Deleted paper data for item ${itemID}`);
    },



    /**
     * 删除论文的所有数据（包括级联删除所有相关表）
     * 用于重新解析论文时清空旧数据
     * @param {Number} itemID - Zotero item ID
     * @returns {Boolean} 是否成功删除
     */
    deleteAll: async function (itemID) {
      // console.log(`[VibeDB.Papers] 开始删除论文所有数据: itemID=${itemID}`);

      // 先获取 paper_id
      const paper = await this.get(itemID);
      if (!paper) {
        // console.log(`[VibeDB.Papers] 论文不存在，无需删除: itemID=${itemID}`);
        return false;
      }

      const paperID = paper.paper_id;
      // console.log(`[VibeDB.Papers] 找到论文记录: paper_id=${paperID}`);

      try {
        await _connection.executeTransaction(async () => {
          // 统计删除前的数据量（用于验证）
          const countQueries = [
          { name: 'paragraphs', sql: 'SELECT COUNT(*) as count FROM paragraphs WHERE paper_id = ?' },
          { name: 'summary_cards', sql: 'SELECT COUNT(*) as count FROM summary_cards WHERE paper_id = ?' },
          { name: 'flash_cards', sql: 'SELECT COUNT(*) as count FROM flash_cards WHERE paper_id = ?' },
          { name: 'ai_chats', sql: 'SELECT COUNT(*) as count FROM ai_chats WHERE paper_id = ?' }];


          // console.log(`[VibeDB.Papers] 删除前数据统计:`);
          for (const query of countQueries) {
            const count = await _connection.valueQueryAsync(query.sql, [paperID]);
            // console.log(`[VibeDB.Papers]   - ${query.name}: ${count} 条`);
          }

          // 由于设置了外键级联删除（ON DELETE CASCADE），
          // 删除 papers 表记录会自动删除所有相关数据：
          // - paragraphs (通过 paper_id 外键)
          //   - points (通过 paragraph_id 外键)
          //   - sentences (通过 paragraph_id 外键)
          // - summary_cards (通过 paper_id 外键)
          // - flash_cards (通过 paper_id 外键)
          // - ai_chats (通过 paper_id 外键)

          try {
            // console.log(`[VibeDB.Papers] 执行级联删除: paper_id=${paperID}`);
            const sql = "DELETE FROM papers WHERE paper_id = ?";
            await _connection.queryAsync(sql, [paperID]);
          } catch (error) {
            console.error(`[VibeDB.Papers] ❌ 删除失败:`, error);
          }

          // console.log(`[VibeDB.Papers] ✅ 论文所有数据已删除: itemID=${itemID}, paper_id=${paperID}`);
        });

        return true;
      }
      catch (error) {
        console.error(`[VibeDB.Papers] ❌ 删除论文数据失败: itemID=${itemID}`, error);
        Zotero.logError(`[VibeDB] Failed to delete all data for item ${itemID}:`, error);
        throw error;
      }
    },

    /**
     * 删除论文的解析数据，但保留 FlashCards 和 AIChats
     * 用于重新解析论文时清空旧数据，但不丢失用户的重要数据
     * @param {Number} itemID - Zotero item ID
     * @returns {Boolean} 是否成功
     */
    deleteParsingResultsOnly: async function (itemID) {
      // console.log(`[VibeDB.Papers] 开始删除论文解析数据(保留用户数据): itemID=${itemID}`);

      // 先获取 paper_id
      const paper = await this.get(itemID);
      if (!paper) {
        return false;
      }

      const paperID = paper.paper_id;

      try {
        await _connection.executeTransaction(async () => {
          // 1. 删除段落 (级联删除 points, sentences, summary_cards)
          // 根据外键约束，flash_cards 的 paragraph_id 会被置为 NULL (ON DELETE SET NULL)
          await _connection.queryAsync("DELETE FROM paragraphs WHERE paper_id = ?", [paperID]);

          // 2. 删除 sections (单独的外键)
          await _connection.queryAsync("DELETE FROM sections WHERE paper_id = ?", [paperID]);

          // 3. 删除 article_summary (单独的外键)
          await _connection.queryAsync("DELETE FROM article_summary WHERE paper_id = ?", [paperID]);

          // 4. 不删除 papers 表记录，也不删除 ai_chats (仅关联 paper_id)
          // 5. 不删除 flash_cards (级联 set null 后保留，且关联 paper_id)
        });

        return true;
      }
      catch (error) {
        console.error(`[VibeDB.Papers] ❌ 删除论文解析数据失败: itemID=${itemID}`, error);
        throw error;
      }
    },

    /**
     * 更新论文的 GitHub URL
     * @param {Number} itemID - Zotero item ID
     * @param {String} githubUrl - GitHub 仓库 URL
     */
    updateGitHubUrl: async function (itemID, githubUrl) {
      // console.log(`[VibeDB.Papers] 更新 GitHub URL: itemID=${itemID}, url=${githubUrl}`);

      // 先检查论文是否存在
      const paper = await this.get(itemID);
      if (!paper) {
        console.warn(`[VibeDB.Papers] 论文不存在，无法更新 GitHub URL: itemID=${itemID}`);
        return false;
      }

      const sql = `
				UPDATE papers 
				SET github_url = ?, updated_at = strftime('%s', 'now')
				WHERE item_id = ?
			`;

      await _connection.queryAsync(sql, [githubUrl, itemID]);
      // console.log(`[VibeDB.Papers] ✓ GitHub URL 已更新: itemID=${itemID}`);
      return true;
    },

    /**
     * 获取论文的 GitHub URL
     * @param {Number} itemID - Zotero item ID
     * @returns {String|null} GitHub URL 或 null
     */
    getGitHubUrl: async function (itemID) {
      const sql = "SELECT github_url FROM papers WHERE item_id = ?";
      const githubUrl = await _connection.valueQueryAsync(sql, [itemID]);
      return githubUrl || null;
    }
  };

  /**
   * Paragraphs 表 CRUD
   */
  this.Paragraphs = {
    /**
     * 批量保存段落数据
     * @param {Number} itemID - Zotero item ID
     * @param {Array} paragraphs - 段落数组
     * @param {Number} paperID - 可选，paper_id（如果已知，避免重复查询）
     */
    saveBatch: async function (itemID, paragraphs, paperID = null) {
      // 如果没有提供 paperID，则查询获取
      if (!paperID) {
        const paper = await Zotero.VibeDB.Papers.get(itemID);
        if (!paper) {
          throw new Error(`[VibeDB] Paper not found for item ${itemID}`);
        }
        paperID = paper.paper_id;
      }

      // console.log(`[VibeDB.Paragraphs] 批量保存段落: paper_id=${paperID}, 数量=${paragraphs.length}`);

      await _connection.executeTransaction(async () => {
        for (const para of paragraphs) {
          try {
            const sql = `
							INSERT INTO paragraphs (
								paper_id, page_idx, paragraph_idx, minerU_id, paragraph_type,
								paragraph_text, paragraph_summary, importance_level,
								bbox, rects
							)
							VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
							ON CONFLICT(paper_id, page_idx, paragraph_idx) DO UPDATE SET
								minerU_id = excluded.minerU_id,
								paragraph_type = excluded.paragraph_type,
								paragraph_text = excluded.paragraph_text,
								paragraph_summary = excluded.paragraph_summary,
								importance_level = excluded.importance_level,
								bbox = excluded.bbox,
								rects = excluded.rects
						`;

            await _connection.queryAsync(sql, [
            paperID, // 使用参数传入的 paperID
            para.page_idx,
            para.paragraph_idx,
            para.minerU_id || null,
            para.paragraph_type,
            para.paragraph_text || null,
            para.paragraph_summary || null,
            para.importance_level || null,
            para.bbox ? JSON.stringify(para.bbox) : null,
            para.rects ? JSON.stringify(para.rects) : null]
            );
          } catch (error) {
            console.error(`[VibeDB.Paragraphs] ❌ 保存段落失败: sql=${sql};\n params=${[
            paperID, // 使用参数传入的 paperID
            para.page_idx,
            para.paragraph_idx,
            para.minerU_id || null,
            para.paragraph_type,
            para.paragraph_text || null,
            para.paragraph_summary || null,
            para.importance_level || null,
            para.bbox ? JSON.stringify(para.bbox) : null,
            para.rects ? JSON.stringify(para.rects) : null]};\n error=${
            error}`);
            throw error;
          }
        }
      });

      Zotero.debug(`[VibeDB] Saved ${paragraphs.length} paragraphs for item ${itemID}`);
    },

    /**
     * 获取论文的所有段落
     * @param {Number} itemID - Zotero item ID
     * @param {Number} paperID - 可选，paper_id（如果已知，避免重复查询）
     * @returns {Array}
     */
    getByItemID: async function (itemID, paperID = null) {
      // 如果没有提供 paperID，则查询获取
      if (!paperID) {
        const paper = await Zotero.VibeDB.Papers.get(itemID);
        if (!paper) {
          return [];
        }
        paperID = paper.paper_id;
      }

      const sql = `
		SELECT * FROM paragraphs
		WHERE paper_id = ?
		ORDER BY page_idx, paragraph_idx
	`;

      // console.log(`[VibeDB.Paragraphs] 执行查询 SQL:`, sql);
      // console.log(`[VibeDB.Paragraphs] 查询参数: paperID =`, paperID, typeof paperID);

      let rows = [];
      try {
        // 使用 onRow 回调来收集行数据
        await _connection.queryAsync(
          sql,
          [paperID],
          {
            onRow: function (row) {
              // 将行转换为普通对象
              const rowObj = {
                paragraph_id: row.getResultByName('paragraph_id'),
                paper_id: row.getResultByName('paper_id'),
                page_idx: row.getResultByName('page_idx'),
                paragraph_idx: row.getResultByName('paragraph_idx'),
                minerU_id: row.getResultByName('minerU_id'),
                paragraph_type: row.getResultByName('paragraph_type'),
                paragraph_text: row.getResultByName('paragraph_text'),
                paragraph_summary: row.getResultByName('paragraph_summary'),
                importance_level: row.getResultByName('importance_level'),
                bbox: row.getResultByName('bbox'),
                rects: row.getResultByName('rects')
              };
              rows.push(rowObj);
            }
          }
        );
        // console.log("[VibeDB.Paragraphs] 查询成功，找到", rows.length, "条记录");
      } catch (e) {
        console.error("[VibeDB.Paragraphs] 查询失败:", e);
        throw e;
      }
      // 如果没有结果，返回空数组
      if (!rows || rows.length === 0) {
        // console.log(`[VibeDB.Paragraphs] 没有找到段落记录: paper_id=${paperID}`);
        return [];
      }
      // console.log(`[VibeDB.Paragraphs] 找到 ${rows.length} 条段落记录`);

      // 解析 JSON 字段
      return rows.map((row) => {
        if (row.bbox) {
          try {
            row.bbox = JSON.parse(row.bbox);
          } catch (e) {
            row.bbox = null;
          }
        }
        if (row.rects) {
          try {
            row.rects = JSON.parse(row.rects);
          } catch (e) {
            row.rects = null;
          }
        }
        return row;
      });
    },

    /**
     * 更新单个段落的摘要
     */
    updateSummary: async function (paragraphID, paragraphSummary) {
      const sql = `
				UPDATE paragraphs
				SET paragraph_summary = ?
				WHERE paragraph_id = ?
			`;
      await _connection.queryAsync(sql, [
      paragraphSummary || null,
      paragraphID]
      );
    },

    /**
     * 更新段落的 importance_level
     * @param {Number} paragraphID - 段落 ID
     * @param {Number} importanceLevel - 重要性等级 (1=普通, 2=重要)
     */
    updateImportanceLevel: async function (paragraphID, importanceLevel) {
      const sql = `UPDATE paragraphs SET importance_level = ? WHERE paragraph_id = ?`;
      await _connection.queryAsync(sql, [importanceLevel, paragraphID]);
      Zotero.debug(`[VibeDB.Paragraphs] Updated importance_level to ${importanceLevel} for paragraph ${paragraphID}`);
    }
  };

  /**
   * Points 表 CRUD
   */
  this.Points = {
    /**
     * 批量保存 points 数据
     * @param {Number} paragraphID - 段落 ID
     * @param {Array} points - points 数组
     */
    saveBatch: async function (paragraphID, points) {
      // 参数验证：确保 paragraphID 是有效的数字
      if (paragraphID === null || paragraphID === undefined || typeof paragraphID !== 'number') {
        // console.log(`[VibeDB.Points.saveBatch] 无效的 paragraphID: ${paragraphID} (type: ${typeof paragraphID})，跳过保存`);
        return;
      }

      await _connection.executeTransaction(async () => {
        for (const point of points) {
          // 确保 point_idx 是数字
          const pointIdx = typeof point.point_idx === 'number' ? point.point_idx : parseInt(point.point_idx, 10);
          if (isNaN(pointIdx)) {
            // console.log(`[VibeDB.Points.saveBatch] 无效的 point_idx: ${point.point_idx}，跳过`);
            continue;
          }

          const sql = `
						INSERT INTO points (
							paragraph_id, point_idx, point_summary, point_translation,
							sentence_indices, char_mapping, rects, importance_level
						)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?)
						ON CONFLICT(paragraph_id, point_idx) DO UPDATE SET
							point_summary = excluded.point_summary,
							point_translation = excluded.point_translation,
							sentence_indices = excluded.sentence_indices,
							char_mapping = excluded.char_mapping,
							rects = excluded.rects,
							importance_level = excluded.importance_level
					`;

          // 安全地序列化 JSON 字段
          const sentenceIndices = point.sentence_indices && Array.isArray(point.sentence_indices) ?
          JSON.stringify(point.sentence_indices) : null;
          const charMapping = point.char_mapping && Array.isArray(point.char_mapping) ?
          JSON.stringify(point.char_mapping) : null;
          const rects = point.rects && Array.isArray(point.rects) ?
          JSON.stringify(point.rects) : null;
          const importanceLevel = typeof point.importance_level === 'number' ? point.importance_level : 1;

          // 确保字符串字段是有效的字符串或 null（避免 undefined 导致 bindByIndex 失败）
          const pointSummary = typeof point.point_summary === 'string' && point.point_summary.length > 0 ?
          point.point_summary : null;
          const pointTranslation = typeof point.point_translation === 'string' && point.point_translation.length > 0 ?
          point.point_translation : null;

          // 构建参数数组
          const params = [
          paragraphID,
          pointIdx,
          pointSummary,
          pointTranslation,
          sentenceIndices,
          charMapping,
          rects,
          importanceLevel];


          try {
            await _connection.queryAsync(sql, params);
          } catch (e) {
            // 详细记录每个参数的类型和值，便于调试
            console.error(`[VibeDB.Points.saveBatch] ❌ 保存点失败:`);
            console.error(`  paragraphID: ${paragraphID} (${typeof paragraphID})`);
            console.error(`  pointIdx: ${pointIdx} (${typeof pointIdx})`);
            console.error(`  pointSummary: ${pointSummary} (${typeof pointSummary})`);
            console.error(`  pointTranslation: ${pointTranslation} (${typeof pointTranslation})`);
            console.error(`  sentenceIndices: ${sentenceIndices} (${typeof sentenceIndices})`);
            console.error(`  charMapping: ${charMapping} (${typeof charMapping})`);
            console.error(`  rects: ${rects} (${typeof rects})`);
            console.error(`  importanceLevel: ${importanceLevel} (${typeof importanceLevel})`);
            console.error(`  错误: ${e.message || e}`);
            throw e;
          }
        }
      });
    },

    /**
     * 获取段落的所有 points
     * @param {Number} paragraphID - 段落 ID
     * @returns {Array}
     */
    getByParagraphID: async function (paragraphID) {
      const sql = `
				SELECT * FROM points
				WHERE paragraph_id = ?
				ORDER BY point_idx
			`;

      let rows = [];
      await _connection.queryAsync(sql, [paragraphID], {
        onRow: function (row) {
          const rowObj = {
            point_id: row.getResultByName('point_id'),
            paragraph_id: row.getResultByName('paragraph_id'),
            point_idx: row.getResultByName('point_idx'),
            point_summary: row.getResultByName('point_summary'),
            point_translation: row.getResultByName('point_translation'),
            sentence_indices: row.getResultByName('sentence_indices'),
            char_mapping: row.getResultByName('char_mapping'),
            rects: row.getResultByName('rects'),
            importance_level: row.getResultByName('importance_level')
          };
          rows.push(rowObj);
        }
      });

      // 解析 JSON 字段
      return rows.map((row) => {
        ['sentence_indices', 'char_mapping', 'rects'].forEach((field) => {
          if (row[field]) {
            try {
              row[field] = JSON.parse(row[field]);
            } catch (e) {
              row[field] = null;
            }
          }
        });
        // 确保 importance_level 有默认值
        if (row.importance_level === null || row.importance_level === undefined) {
          row.importance_level = 1;
        }
        return row;
      });
    },

    /**
     * 更新 point 的 importance_level
     * @param {String|Number} pointID - Point ID（可以是数据库 ID 或前端格式 "pageIdx_paragraphIdx_point_pointIdx"）
     * @param {Number} importanceLevel - 重要性等级 (1=普通, 2=重要)
     */
    updateImportanceLevel: async function (pointID, importanceLevel) {
      // 检查是否是前端格式的 ID（如 "0_1_point_2"）
      if (typeof pointID === 'string' && pointID.includes('_point_')) {
        // 解析前端格式：pageIdx_paragraphIdx_point_pointIdx
        const parts = pointID.split('_point_');
        if (parts.length === 2) {
          const [pageParaStr, pointIdxStr] = parts;
          const [pageIdx, paragraphIdx] = pageParaStr.split('_').map(Number);
          const pointIdx = parseInt(pointIdxStr, 10);

          // 通过 page_idx, paragraph_idx, point_idx 定位并更新
          const sql = `
						UPDATE points SET importance_level = ?
						WHERE paragraph_id IN (
							SELECT paragraph_id FROM paragraphs
							WHERE page_idx = ? AND paragraph_idx = ?
						) AND point_idx = ?
					`;
          await _connection.queryAsync(sql, [importanceLevel, pageIdx, paragraphIdx, pointIdx]);
          Zotero.debug(`[VibeDB.Points] Updated importance_level to ${importanceLevel} for point at page ${pageIdx}, para ${paragraphIdx}, point ${pointIdx}`);
          return;
        }
      }

      // 原有逻辑：直接使用数据库 ID
      const sql = `UPDATE points SET importance_level = ? WHERE point_id = ?`;
      await _connection.queryAsync(sql, [importanceLevel, pointID]);
      Zotero.debug(`[VibeDB.Points] Updated importance_level to ${importanceLevel} for point ${pointID}`);
    },

    /**
     * 删除段落的所有 points
     * @param {Number} paragraphID - 段落 ID
     */
    deleteByParagraphID: async function (paragraphID) {
      const sql = `DELETE FROM points WHERE paragraph_id = ?`;
      await _connection.queryAsync(sql, [paragraphID]);
      Zotero.debug(`[VibeDB.Points] Deleted all points for paragraph ${paragraphID}`);
    }
  };

  /**
   * Sentences 表 CRUD
   */
  this.Sentences = {
    /**
     * 批量保存句子
     * @param {Number} paragraphID - 段落 ID
     * @param {Array} sentences - 句子数组
     */
    saveBatch: async function (paragraphID, sentences) {
      for (const sentence of sentences) {
        const sql = `
					INSERT INTO sentences (
						paragraph_id, sentence_idx, sentence_text,
						char_mapping, start_char_offset, end_char_offset, rects
					)
					VALUES (?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT(paragraph_id, sentence_idx) DO UPDATE SET
						sentence_text = excluded.sentence_text,
						char_mapping = excluded.char_mapping,
						start_char_offset = excluded.start_char_offset,
						end_char_offset = excluded.end_char_offset,
						rects = excluded.rects
				`;

        await _connection.queryAsync(sql, [
        paragraphID,
        sentence.sentence_idx,
        sentence.sentence_text,
        sentence.char_mapping ? JSON.stringify(sentence.char_mapping) : null,
        sentence.start_char_offset,
        sentence.end_char_offset,
        sentence.rects ? JSON.stringify(sentence.rects) : null]
        );
      }
    },

    /**
     * 获取段落的所有句子
     * @param {Number} paragraphID - 段落 ID
     * @returns {Array}
     */
    getByParagraphID: async function (paragraphID) {
      const sql = `
				SELECT * FROM sentences
				WHERE paragraph_id = ?
				ORDER BY sentence_idx
			`;

      let rows = [];
      await _connection.queryAsync(sql, [paragraphID], {
        onRow: function (row) {
          const rowObj = {
            sentence_id: row.getResultByName('sentence_id'),
            paragraph_id: row.getResultByName('paragraph_id'),
            sentence_idx: row.getResultByName('sentence_idx'),
            sentence_text: row.getResultByName('sentence_text'),
            char_mapping: row.getResultByName('char_mapping'),
            start_char_offset: row.getResultByName('start_char_offset'),
            end_char_offset: row.getResultByName('end_char_offset'),
            rects: row.getResultByName('rects')
          };
          rows.push(rowObj);
        }
      });

      // 解析 JSON 字段
      return rows.map((row) => {
        ['char_mapping', 'rects'].forEach((field) => {
          if (row[field]) {
            try {
              row[field] = JSON.parse(row[field]);
            } catch (e) {
              row[field] = null;
            }
          }
        });
        return row;
      });
    }
  };

  /**
   * SummaryCards 表 CRUD（类似 VibeCards）
   */
  this.SummaryCards = {
    /**
     * 保存 SummaryCard
     */
    save: async function (itemID, summaryCard) {
      const paper = await Zotero.VibeDB.Papers.get(itemID);
      if (!paper) {
        throw new Error(`[VibeDB] Paper not found for item ${itemID}`);
      }

      const sql = `
				INSERT INTO summary_cards (
					paper_id, page_idx, paragraph_id, summarycard_name, position_rects
				)
				VALUES (?, ?, ?, ?, ?)
			`;

      await _connection.queryAsync(sql, [
      paper.paper_id,
      summaryCard.page_idx,
      summaryCard.paragraph_id,
      summaryCard.summarycard_name || null,
      JSON.stringify(summaryCard.position_rects)]
      );
    },

    /**
     * 更新 SummaryCard
     * @param {Number} summaryCardID - SummaryCard ID
     * @param {Object} updates - 要更新的字段（只更新提供的字段）
     */
    update: async function (summaryCardID, updates) {
      // 构建动态 SQL，只更新提供的字段
      const setParts = [];
      const params = [];

      if ('summarycard_name' in updates) {
        setParts.push('summarycard_name = ?');
        params.push(updates.summarycard_name || null);
      }

      if ('position_rects' in updates) {
        setParts.push('position_rects = ?');
        // 序列化 position_rects 为 JSON 字符串
        params.push(updates.position_rects !== undefined && updates.position_rects !== null ?
        JSON.stringify(updates.position_rects) :
        null);
      }

      // 如果没有要更新的字段，直接返回
      if (setParts.length === 0) {
        return;
      }

      // 总是更新 updated_at
      setParts.push("updated_at = strftime('%s', 'now')");

      const sql = `
				UPDATE summary_cards
				SET ${setParts.join(', ')}
				WHERE summarycard_id = ?
			`;

      params.push(summaryCardID);

      await _connection.queryAsync(sql, params);
    },

    /**
     * 获取论文的所有 SummaryCards
     */
    getByItemID: async function (itemID) {
      const paper = await Zotero.VibeDB.Papers.get(itemID);
      if (!paper) {
        return [];
      }

      const sql = `
		SELECT * FROM summary_cards
		WHERE paper_id = ?
		ORDER BY page_idx
	`;

      let rows = [];
      await _connection.queryAsync(
        sql,
        [paper.paper_id],
        {
          onRow: function (row) {
            const rowObj = {
              summarycard_id: row.getResultByName('summarycard_id'),
              paper_id: row.getResultByName('paper_id'),
              page_idx: row.getResultByName('page_idx'),
              paragraph_id: row.getResultByName('paragraph_id'),
              summarycard_name: row.getResultByName('summarycard_name'),
              position_rects: row.getResultByName('position_rects')
            };
            rows.push(rowObj);
          }
        }
      );

      if (rows.length === 0) {
        return [];
      }

      return rows.map((row) => {
        if (row.position_rects) {
          try {
            row.position_rects = JSON.parse(row.position_rects);
          } catch (e) {
            row.position_rects = null;
          }
        }
        return row;
      });
    },

    /**
     * 删除 SummaryCard
     * @param {Number} summaryCardID - SummaryCard ID
     */
    delete: async function (summaryCardID) {
      const sql = `
				DELETE FROM summary_cards
				WHERE summarycard_id = ?
			`;
      await _connection.queryAsync(sql, [summaryCardID]);
    }
  };

  /**
   * ArticleSummary 表 CRUD
   */
  this.ArticleSummary = {
    /**
     * 批量保存文章总结
     * @param {Number} paperID - 论文 ID
     * @param {Array} summaries - 文章总结数组
     */
    saveBatch: async function (paperID, summaries) {
      // 先删除现有的文章总结
      const deleteSql = 'DELETE FROM article_summary WHERE paper_id = ?';
      await _connection.queryAsync(deleteSql, [paperID]);

      // 插入新的文章总结（content 字段包含完整的 JSON 结构）
      for (const summary of summaries) {
        const sql = `
					INSERT INTO article_summary (
						paper_id, title, content, sort_order
					) VALUES (?, ?, ?, ?)
				`;

        await _connection.queryAsync(sql, [
        paperID,
        summary.title,
        summary.content ? JSON.stringify(summary.content) : null,
        summary.sort_order || 0]
        );
      }
    },

    /**
     * 根据论文 ID 获取所有文章总结
     * @param {Number} paperID - 论文 ID
     * @returns {Array}
     */
    getByPaperID: async function (paperID) {
      const sql = `
				SELECT * FROM article_summary
				WHERE paper_id = ?
				ORDER BY sort_order
			`;

      let rows = [];
      await _connection.queryAsync(sql, [paperID], {
        onRow: function (row) {
          const rowObj = {
            summary_id: row.getResultByName('summary_id'),
            paper_id: row.getResultByName('paper_id'),
            title: row.getResultByName('title'),
            content: row.getResultByName('content'),
            sort_order: row.getResultByName('sort_order')
          };
          rows.push(rowObj);
        }
      });

      // 解析 content JSON 字段
      return rows.map((row) => {
        if (row.content) {
          try {
            row.content = JSON.parse(row.content);
          } catch (e) {
            console.error('[VibeDB] 解析 article_summary.content 失败:', e);
            row.content = null;
          }
        }
        return row;
      });
    },

    /**
     * 根据 ID 删除文章总结
     * @param {Number} summaryID - 文章总结 ID
     */
    deleteByID: async function (summaryID) {
      const sql = 'DELETE FROM article_summary WHERE summary_id = ?';
      await _connection.queryAsync(sql, [summaryID]);
    },

    /**
     * 更新单个文章总结
     * @param {Number} summaryID - 文章总结 ID
     * @param {Object} updates - 更新的字段 { title?, content? }
     * @returns {Boolean} 是否更新成功
     */
    update: async function (summaryID, updates) {
      // 构建动态 SQL
      const setClauses = [];
      const params = [];

      if (updates.title !== undefined) {
        setClauses.push('title = ?');
        params.push(updates.title);
      }

      if (updates.content !== undefined) {
        setClauses.push('content = ?');
        // content 需要序列化为 JSON
        params.push(updates.content ? JSON.stringify(updates.content) : null);
      }

      if (setClauses.length === 0) {
        console.warn('[VibeDB.ArticleSummary.update] 没有需要更新的字段');
        return false;
      }

      params.push(summaryID);
      const sql = `UPDATE article_summary SET ${setClauses.join(', ')} WHERE summary_id = ?`;

      await _connection.queryAsync(sql, params);
      // console.log(`[VibeDB.ArticleSummary] 已更新 summary_id=${summaryID}`);
      return true;
    }
  };

  /**
   * Sections 表 CRUD
   */
  this.Sections = {
    /**
     * 保存章节数据（递归保存）
     * @param {Number} paperID - 论文 ID
     * @param {Object} section - 章节对象
     * @param {Number} parentSectionID - 父章节 ID（可选）
     */
    saveSection: async function (paperID, section, parentSectionID = null) {
      const sql = `
				INSERT INTO sections (
					paper_id, parent_section_id, title_block_id, level, title, summary, points, children_order
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(paper_id, title_block_id) DO UPDATE SET
					parent_section_id = excluded.parent_section_id,
					level = excluded.level,
					title = excluded.title,
					summary = excluded.summary,
					points = excluded.points,
					children_order = excluded.children_order
			`;

      const pointsJson = section.points ? JSON.stringify(section.points) : null;

      await _connection.queryAsync(sql, [
      paperID,
      parentSectionID,
      section.title_block_id,
      section.level || 0,
      section.title || '',
      section.summary || null,
      pointsJson,
      section.children_order || 0]
      );

      // 获取刚插入/更新的章节 ID
      const sectionID = await this.getSectionIDByBlockID(paperID, section.title_block_id);

      // 递归保存子章节
      if (section.children && section.children.length > 0) {
        for (let i = 0; i < section.children.length; i++) {
          const childSection = section.children[i];
          childSection.children_order = i;
          await this.saveSection(paperID, childSection, sectionID);
        }
      }

      return sectionID;
    },

    /**
     * 批量保存章节（从 sections 对象开始保存）
     * @param {Number} paperID - 论文 ID
     * @param {Object} sectionsRoot - 根章节对象
     */
    saveBatch: async function (paperID, sectionsRoot) {
      // 先删除现有的章节数据
      const deleteSql = 'DELETE FROM sections WHERE paper_id = ?';
      await _connection.queryAsync(deleteSql, [paperID]);

      // 保存根章节
      await this.saveSection(paperID, sectionsRoot, null);
    },

    /**
     * 根据 title_block_id 获取章节 ID
     * @param {Number} paperID - 论文 ID
     * @param {Number} titleBlockID - 标题块 ID
     * @returns {Number|null}
     */
    getSectionIDByBlockID: async function (paperID, titleBlockID) {
      const sql = 'SELECT section_id FROM sections WHERE paper_id = ? AND title_block_id = ?';
      let sectionID = null;

      await _connection.queryAsync(sql, [paperID, titleBlockID], {
        onRow: function (row) {
          sectionID = row.getResultByName('section_id');
        }
      });

      return sectionID;
    },

    /**
     * 递归构建章节树
     * @param {Number} paperID - 论文 ID
     * @param {Number} parentSectionID - 父章节 ID（null 时获取根章节）
     * @returns {Array}
     */
    buildSectionTree: async function (paperID, parentSectionID = null) {
      const sql = `
				SELECT * FROM sections
				WHERE paper_id = ? AND parent_section_id ${parentSectionID ? '= ?' : 'IS NULL'}
				ORDER BY children_order
			`;

      const params = parentSectionID ? [paperID, parentSectionID] : [paperID];
      let rows = [];

      await _connection.queryAsync(sql, params, {
        onRow: function (row) {
          const rowObj = {
            section_id: row.getResultByName('section_id'),
            paper_id: row.getResultByName('paper_id'),
            parent_section_id: row.getResultByName('parent_section_id'),
            title_block_id: row.getResultByName('title_block_id'),
            level: row.getResultByName('level'),
            title: row.getResultByName('title'),
            summary: row.getResultByName('summary'),
            points: row.getResultByName('points'),
            children_order: row.getResultByName('children_order')
          };
          rows.push(rowObj);
        }
      });

      // 解析 JSON 字段并递归获取子章节
      const sections = [];
      for (const row of rows) {
        if (row.points) {
          try {
            row.points = JSON.parse(row.points);
          } catch (e) {
            row.points = null;
          }
        }

        // 递归获取子章节
        row.children = await this.buildSectionTree(paperID, row.section_id);
        sections.push(row);
      }

      return sections;
    },

    /**
     * 根据论文 ID 获取完整的章节树
     * @param {Number} paperID - 论文 ID
     * @returns {Object|null}
     */
    getByPaperID: async function (paperID) {
      const sections = await this.buildSectionTree(paperID);
      return sections.length > 0 ? sections[0] : null;
    },

    /**
     * 根据 ID 删除章节（级联删除子章节）
     * @param {Number} sectionID - 章节 ID
     */
    deleteByID: async function (sectionID) {
      // SQLite 的外键约束会自动级联删除子章节
      const sql = 'DELETE FROM sections WHERE section_id = ?';
      await _connection.queryAsync(sql, [sectionID]);
    }
  };

  /**
   * FlashCards 表 CRUD
   */
  this.FlashCards = {
    /**
     * 保存 FlashCard
     */
    save: async function (itemID, flashCard) {
      const paper = await Zotero.VibeDB.Papers.get(itemID);
      if (!paper) {
        throw new Error(`[VibeDB] Paper not found for item ${itemID}`);
      }

      const sql = `
				INSERT INTO flash_cards (
					paper_id, page_idx, paragraph_id, messages, position_rects, updated_at
				)
				VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
			`;

      await _connection.queryAsync(sql, [
      paper.paper_id,
      flashCard.page_idx,
      flashCard.paragraph_id || null,
      JSON.stringify(flashCard.messages),
      JSON.stringify(flashCard.position_rects)]
      );

      // 通知云同步模块数据已变更
      if (Zotero.VibeDBCloudSync && Zotero.VibeDBCloudSync.markDataChanged) {
        Zotero.VibeDBCloudSync.markDataChanged();
      }

      // 通过 SQLite 内置函数获取刚插入行的 rowid
      const lastID = await _connection.valueQueryAsync('SELECT last_insert_rowid()');
      return lastID;
    },

    /**
     * 更新 FlashCard
     */
    update: async function (flashCardID, updates) {
      const sql = `
				UPDATE flash_cards
				SET messages = ?, position_rects = ?, updated_at = strftime('%s', 'now')
				WHERE flashcard_id = ?
			`;

      await _connection.queryAsync(sql, [
      JSON.stringify(updates.messages),
      JSON.stringify(updates.position_rects),
      flashCardID]
      );
    },

    /**
     * 获取论文的所有 FlashCards
     */
    getByItemID: async function (itemID) {
      const paper = await Zotero.VibeDB.Papers.get(itemID);
      if (!paper) {
        return [];
      }

      const sql = `
		SELECT * FROM flash_cards
		WHERE paper_id = ?
		ORDER BY page_idx, created_at
	`;

      let rows = [];
      await _connection.queryAsync(
        sql,
        [paper.paper_id],
        {
          onRow: function (row) {
            const rowObj = {
              flashcard_id: row.getResultByName('flashcard_id'),
              paper_id: row.getResultByName('paper_id'),
              page_idx: row.getResultByName('page_idx'),
              paragraph_id: row.getResultByName('paragraph_id'),
              messages: row.getResultByName('messages'),
              position_rects: row.getResultByName('position_rects'),
              created_at: row.getResultByName('created_at'),
              updated_at: row.getResultByName('updated_at')
            };
            rows.push(rowObj);
          }
        }
      );

      if (rows.length === 0) {
        return [];
      }

      return rows.map((row) => {
        ['messages', 'position_rects'].forEach((field) => {
          if (row[field]) {
            try {
              row[field] = JSON.parse(row[field]);
            } catch (e) {
              row[field] = null;
            }
          }
        });
        return row;
      });
    },

    /**
     * 删除 FlashCard
     */
    delete: async function (flashCardID) {
      console.log('[VibeDB.FlashCards] delete 被调用, flashCardID:', flashCardID);
      console.log('[VibeDB.FlashCards] flashCardID 类型:', typeof flashCardID);

      // 先检查卡片是否存在
      const checkSql = "SELECT flashcard_id FROM flash_cards WHERE flashcard_id = ?";
      let exists = false;
      await _connection.queryAsync(checkSql, [flashCardID], {
        onRow: function (row) {
          exists = true;
          console.log('[VibeDB.FlashCards] 找到要删除的卡片, flashcard_id:', row.getResultByName('flashcard_id'));
        }
      });

      if (!exists) {
        console.warn('[VibeDB.FlashCards] ⚠️ 要删除的卡片不存在, flashCardID:', flashCardID);
        return;
      }

      const sql = "DELETE FROM flash_cards WHERE flashcard_id = ?";
      console.log('[VibeDB.FlashCards] 执行 DELETE SQL, flashCardID:', flashCardID);
      await _connection.queryAsync(sql, [flashCardID]);
      console.log('[VibeDB.FlashCards] ✅ DELETE SQL 执行完成');

      // 验证删除是否成功
      let stillExists = false;
      await _connection.queryAsync(checkSql, [flashCardID], {
        onRow: function (row) {
          stillExists = true;
          console.error('[VibeDB.FlashCards] ❌ 删除后验证失败，卡片仍然存在！flashcard_id:', row.getResultByName('flashcard_id'));
        }
      });

      if (!stillExists) {
        console.log('[VibeDB.FlashCards] ✅ 删除验证成功，卡片已从数据库移除');
      }
    }
  };

  /**
   * AIChats 表 CRUD
   */
  this.AIChats = {
    /**
     * 保存或更新 AI Chat 消息
     */
    save: async function (itemID, messages) {
      const paper = await Zotero.VibeDB.Papers.get(itemID);
      if (!paper) {
        throw new Error(`[VibeDB] Paper not found for item ${itemID}`);
      }

      const sql = `
				INSERT INTO ai_chats (paper_id, messages, updated_at)
				VALUES (?, ?, strftime('%s', 'now'))
				ON CONFLICT(paper_id) DO UPDATE SET
					messages = excluded.messages,
					updated_at = strftime('%s', 'now')
			`;

      await _connection.queryAsync(sql, [
      paper.paper_id,
      JSON.stringify(messages)]
      );

      // 通知云同步模块数据已变更
      if (Zotero.VibeDBCloudSync && Zotero.VibeDBCloudSync.markDataChanged) {
        Zotero.VibeDBCloudSync.markDataChanged();
      }
    },

    /**
     * 获取 AI Chat 历史
     */
    get: async function (itemID) {
      const paper = await Zotero.VibeDB.Papers.get(itemID);
      if (!paper) {
        return null;
      }

      const sql = "SELECT * FROM ai_chats WHERE paper_id = ?";
      const row = await _connection.rowQueryAsync(sql, [paper.paper_id]);

      if (!row) {
        return null;
      }

      // 创建新对象返回，避免修改 XPCOM WrappedNative 对象
      const result = {
        aichat_id: row.aichat_id,
        paper_id: row.paper_id,
        messages: [],
        created_at: row.created_at,
        updated_at: row.updated_at
      };

      if (row.messages) {
        try {
          result.messages = JSON.parse(row.messages);
        } catch (e) {
          result.messages = [];
        }
      }

      return result;
    }
  };
}();