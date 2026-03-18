-- VibeDB Schema Version: 12
-- 版本表（用于跟踪数据库schema版本）
CREATE TABLE IF NOT EXISTS version (
    schema TEXT PRIMARY KEY,
    version INT NOT NULL
);

-- 论文表
CREATE TABLE IF NOT EXISTS papers (
    paper_id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL UNIQUE, -- Zotero item ID (外键引用 Zotero 原生表)
    result_dir TEXT, -- MinerU 解析结果目录路径（用于拼接图片相对路径）
    markdown_content TEXT,
    article_summary TEXT, -- 保留字段，向后兼容
    outline TEXT, -- JSON 格式存储大纲
    block_mapping TEXT, -- JSON 格式存储 blockMapping 数据 {_createBlockMapping 的返回结果}
    github_url TEXT, -- 论文对应的 GitHub 代码仓库 URL
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    -- 注意：item_id 引用 Zotero 原生 items 表，但不在此定义外键约束
    -- 因为 items 表由 Zotero 管理，在应用层保证数据一致性
);

-- article_summary 表（存储文章级别的总结信息）
CREATE TABLE IF NOT EXISTS article_summary (
    summary_id INTEGER PRIMARY KEY,
    paper_id INTEGER NOT NULL,
    title TEXT NOT NULL,           -- "研究背景与问题", "核心创新点" 等
    content TEXT,                  -- JSON 数组，存储具体内容
    sort_order INTEGER NOT NULL,    -- 排序顺序
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
);

-- sections 表（存储文档章节层级结构）
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
);

-- 段落表
CREATE TABLE IF NOT EXISTS paragraphs (
    paragraph_id INTEGER PRIMARY KEY,
    paper_id INTEGER NOT NULL,
    page_idx INTEGER NOT NULL,
    paragraph_idx INTEGER NOT NULL,
    minerU_id TEXT, -- MinerU 原始ID，用于唯一标识段落（新增字段）
    paragraph_type TEXT NOT NULL, -- 'text', 'title', 'image', 'table'
    paragraph_text TEXT, -- 原始文本
    paragraph_summary TEXT,
    importance_level INTEGER DEFAULT 1, -- 1, 2, 3
    bbox TEXT, -- JSON: [x1, y1, x2, y2]
    rects TEXT, -- JSON: [[x1,y1,x2,y2], ...]
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE,
    UNIQUE(paper_id, page_idx, paragraph_idx)
);

-- Point 表（段落的逻辑分点）
CREATE TABLE IF NOT EXISTS points (
    point_id INTEGER PRIMARY KEY,
    paragraph_id INTEGER NOT NULL,
    point_idx INTEGER NOT NULL, -- 在段落中的索引
    point_summary TEXT,
    point_translation TEXT,
    sentence_indices TEXT, -- JSON: [0, 1, 2] 包含的句子索引
    char_mapping TEXT, -- JSON: [offset1, offset2, ...]
    rects TEXT, -- JSON: [[x1,y1,x2,y2], ...]
    importance_level INTEGER DEFAULT 1, -- 重要性等级：1=普通，2=重要
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (paragraph_id) REFERENCES paragraphs(paragraph_id) ON DELETE CASCADE,
    UNIQUE(paragraph_id, point_idx)
);

-- 句子表（简化版，避免冗余）
CREATE TABLE IF NOT EXISTS sentences (
    sentence_id INTEGER PRIMARY KEY,
    paragraph_id INTEGER NOT NULL,
    sentence_idx INTEGER NOT NULL, -- 在段落中的索引
    sentence_text TEXT NOT NULL,
    char_mapping TEXT, -- JSON: [offset1, offset2, ...]
    start_char_offset INTEGER, -- 全局字符偏移
    end_char_offset INTEGER,
    rects TEXT, -- JSON: [[x1,y1,x2,y2], ...]
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (paragraph_id) REFERENCES paragraphs(paragraph_id) ON DELETE CASCADE,
    UNIQUE(paragraph_id, sentence_idx)
);

-- SummaryCard 表
CREATE TABLE IF NOT EXISTS summary_cards (
    summarycard_id INTEGER PRIMARY KEY,
    paper_id INTEGER NOT NULL, -- 冗余字段：加速按论文查询
    page_idx INTEGER NOT NULL, -- 冗余字段：加速按页面查询
    paragraph_id INTEGER NOT NULL,
    summarycard_name TEXT,
    position_rects TEXT NOT NULL, -- JSON: [[x1,y1,x2,y2]]
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE,
    FOREIGN KEY (paragraph_id) REFERENCES paragraphs(paragraph_id) ON DELETE CASCADE
);

-- FlashCard 表
CREATE TABLE IF NOT EXISTS flash_cards (
    flashcard_id INTEGER PRIMARY KEY,
    paper_id INTEGER NOT NULL, -- 必须属于某篇论文
    page_idx INTEGER NOT NULL, -- 所在页面索引
    paragraph_id INTEGER, -- 可选：关联到具体段落
    messages TEXT NOT NULL, -- JSON: [{role, content, timestamp}, ...]
    position_rects TEXT NOT NULL, -- JSON: [[x1,y1,x2,y2]]
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE,
    FOREIGN KEY (paragraph_id) REFERENCES paragraphs(paragraph_id) ON DELETE SET NULL
);

-- AI Chat 表（每篇论文一个会话）
CREATE TABLE IF NOT EXISTS ai_chats (
    aichat_id INTEGER PRIMARY KEY,
    paper_id INTEGER NOT NULL UNIQUE,
    messages TEXT, -- JSON: [{role, content, timestamp}, ...]
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
);

-- ==================== 索引 ====================
-- 索引说明：
-- 1. 提升查询性能（按页面、论文、段落查询时）
-- 2. 加速关联查询（JOIN 操作）
-- 3. 优化外键约束检查

-- === 段落表索引 ===
CREATE INDEX IF NOT EXISTS idx_paragraphs_paper ON paragraphs(paper_id);
CREATE INDEX IF NOT EXISTS idx_paragraphs_page ON paragraphs(page_idx);
-- 复合索引：同时按论文和页面查询时更快
CREATE INDEX IF NOT EXISTS idx_paragraphs_paper_page ON paragraphs(paper_id, page_idx);

-- === Point 表索引 ===
CREATE INDEX IF NOT EXISTS idx_points_paragraph ON points(paragraph_id);

-- === 句子表索引 ===
CREATE INDEX IF NOT EXISTS idx_sentences_paragraph ON sentences(paragraph_id);

-- === article_summary 表索引 ===
CREATE INDEX IF NOT EXISTS idx_article_summary_paper ON article_summary(paper_id);
CREATE INDEX IF NOT EXISTS idx_article_summary_sort ON article_summary(paper_id, sort_order);

-- === sections 表索引 ===
CREATE INDEX IF NOT EXISTS idx_sections_paper ON sections(paper_id);
CREATE INDEX IF NOT EXISTS idx_sections_parent ON sections(parent_section_id);
CREATE INDEX IF NOT EXISTS idx_sections_level ON sections(paper_id, level);
-- 复合索引：按论文和父章节查询子章节
CREATE INDEX IF NOT EXISTS idx_sections_parent_paper ON sections(parent_section_id, paper_id);

-- === SummaryCard 表索引 ===
CREATE INDEX IF NOT EXISTS idx_summary_cards_paper ON summary_cards(paper_id);
CREATE INDEX IF NOT EXISTS idx_summary_cards_page ON summary_cards(page_idx);
CREATE INDEX IF NOT EXISTS idx_summary_cards_paragraph ON summary_cards(paragraph_id);
-- 复合索引：按论文和页面查询 SummaryCard
CREATE INDEX IF NOT EXISTS idx_summary_cards_paper_page ON summary_cards(paper_id, page_idx);

-- === FlashCard 表索引 ===
CREATE INDEX IF NOT EXISTS idx_flash_cards_paper ON flash_cards(paper_id);
CREATE INDEX IF NOT EXISTS idx_flash_cards_paragraph ON flash_cards(paragraph_id);
CREATE INDEX IF NOT EXISTS idx_flash_cards_page ON flash_cards(page_idx);
-- 复合索引：按论文和页面查询 FlashCard
CREATE INDEX IF NOT EXISTS idx_flash_cards_paper_page ON flash_cards(paper_id, page_idx);

-- ==================== 触发器 ====================
-- 自动更新 updated_at 时间戳
-- ";---" is an ugly hack for Zotero.DB.executeSQLFile()

-- papers 表触发器
CREATE TRIGGER IF NOT EXISTS update_papers_timestamp 
AFTER UPDATE ON papers BEGIN
    UPDATE papers SET updated_at = strftime('%s', 'now') WHERE paper_id = NEW.paper_id;---
END;

-- summary_cards 表触发器
CREATE TRIGGER IF NOT EXISTS update_summary_cards_timestamp 
AFTER UPDATE ON summary_cards BEGIN
    UPDATE summary_cards SET updated_at = strftime('%s', 'now') WHERE summarycard_id = NEW.summarycard_id;---
END;

-- flash_cards 表触发器
CREATE TRIGGER IF NOT EXISTS update_flash_cards_timestamp 
AFTER UPDATE ON flash_cards BEGIN
    UPDATE flash_cards SET updated_at = strftime('%s', 'now') WHERE flashcard_id = NEW.flashcard_id;---
END;

-- ai_chats 表触发器
CREATE TRIGGER IF NOT EXISTS update_ai_chats_timestamp 
AFTER UPDATE ON ai_chats BEGIN
    UPDATE ai_chats SET updated_at = strftime('%s', 'now') WHERE aichat_id = NEW.aichat_id;---
END;

