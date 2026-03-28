/**
 * PDF解析模块入口
 * 提供统一的PDF解析接口
 */

// 在Zotero环境中，Components、Services等全局对象已经可用
// 不需要额外导入，直接使用即可

function __appendPDFParserDebugLog(message) {
  try {
    let file = Components.classes["@mozilla.org/file/local;1"]
      .createInstance(Components.interfaces.nsIFile);
    file.initWithPath("/tmp/vibero-pdfparser-debug.log");
    let stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
      .createInstance(Components.interfaces.nsIFileOutputStream);
    stream.init(file, 0x02 | 0x08 | 0x10, 0o644, 0);
    let converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
      .createInstance(Components.interfaces.nsIConverterOutputStream);
    converter.init(stream, "UTF-8", 0, 0);
    converter.writeString(`${new Date().toISOString()} ${message}\n`);
    converter.close();
    stream.close();
  } catch (e) {
  }
}

// 导入MinerU解析器
// 在XPCOM环境中，需要先加载MinerU.js文件
try {
  Services.scriptloader.loadSubScript("chrome://zotero/content/xpcom/pdfParsing/MinerU/MinerU.js");
  __appendPDFParserDebugLog("loadSubScript MinerU.js ok");
} catch (e) {
  __appendPDFParserDebugLog(`loadSubScript MinerU.js failed: ${e && e.stack ? e.stack : e}`);
  throw e;
}

// 导入LLM API模块
try {
  Services.scriptloader.loadSubScript("chrome://zotero/content/xpcom/pdfParsing/LLMApi/llmapi.js");
  __appendPDFParserDebugLog("loadSubScript llmapi.js ok");
} catch (e) {
  __appendPDFParserDebugLog(`loadSubScript llmapi.js failed: ${e && e.stack ? e.stack : e}`);
  throw e;
}

// 导入JSON工具类
/**
 * XPCOM环境下的JSON处理工具函数
 * 由于XPCOM环境中JSON对象可能不完整，提供统一的JSON处理方法
 */
try {
  Services.scriptloader.loadSubScript("chrome://zotero/content/xpcom/pdfParsing/jsonUtils.js");
  __appendPDFParserDebugLog("loadSubScript jsonUtils.js ok");
} catch (e) {
  __appendPDFParserDebugLog(`loadSubScript jsonUtils.js failed: ${e && e.stack ? e.stack : e}`);
  throw e;
}

try {
  Services.scriptloader.loadSubScript("chrome://zotero/content/xpcom/pdfParsing/parseQueue.js");
  __appendPDFParserDebugLog("loadSubScript parseQueue.js ok");
} catch (e) {
  __appendPDFParserDebugLog(`loadSubScript parseQueue.js failed: ${e && e.stack ? e.stack : e}`);
  throw e;
}

/**
 * PDF解析器类
 * 作为统一的入口点，调用具体的解析实现
 */
class PDFParser {
  constructor() {
    // 直接使用MinerUParser类，无需通过Zotero命名空间
    try {
      this.mineruParser = new MinerUParser();
      this.parseQueue = new ParseQueue();
      __appendPDFParserDebugLog("new MinerUParser ok");
    } catch (e) {
      __appendPDFParserDebugLog(`new MinerUParser failed: ${e && e.stack ? e.stack : e}`);
      throw e;
    }
  }

  /**
   * 设置 MinerU API 模式
   * @param {string} mode - 'cloud' 或 'local'
   */
  setApiMode(mode) {
    this.mineruParser.setApiMode(mode);
  }

  /**
   * 获取当前 MinerU API 模式
   * @returns {string} 'cloud' 或 'local'
   */
  getApiMode() {
    return this.mineruParser.getApiMode();
  }

  /**
   * 检查本地 MinerU API 是否可用
   * @returns {Promise<boolean>} 是否可用
   */
  async isLocalAPIAvailable() {
    return await this.mineruParser.isLocalAPIAvailable();
  }

  /**
   * 处理contentList数据，为每个对象添加唯一ID
   * @param {Array} contentListData - 原始的contentList数据数组
   * @returns {Object} 包含处理后数据
   */
  processContentListData(contentListData) {
    if (!contentListData || !Array.isArray(contentListData)) {
      console.warn("contentListData不是有效的数组:", contentListData);
      return contentListData;
    }

    // 为每个对象添加唯一ID
    const processedData = contentListData.map((item, index) => {
      return {
        id: index,
        ...item
      };
    });

    return processedData;
  }

  /**
   * 处理PDF文件的主要入口函数
   * @param {string} filePath - PDF文件路径
   * @returns {Promise<Object>} 解析结果
   */
  async processFile(filePath) {
    return this.parseQueue.enqueue(() => this._processFileImmediately(filePath), {
      key: filePath
    });
  }

  async _processFileImmediately(filePath) {
    // 原始实现已注释掉，现在直接读取预处理的JSON文件
    // 1. MinerU解析pdf文件
    let resultData, resultDir;
    try {
      __appendPDFParserDebugLog(`processFile start filePath=${filePath}`);
      // 调用MinerU解析器处理文件
      resultData = await this.mineruParser.processFile(filePath);
      __appendPDFParserDebugLog(`processFile mineruResult success=${resultData && resultData.success} message=${resultData && (resultData.message || resultData.error || "")}`);

      // 检查 MinerU 解析结果
      if (!resultData.success) {
        // MinerU 返回失败，直接传递错误信息
        console.error('解析失败:', resultData.message || resultData.error);
        return {
          success: false,
          filePath: filePath,
          error: resultData.error || resultData.message,
          message: resultData.message || `解析失败: ${resultData.error}`,
          timestamp: Zotero.Date.getUnixTimestamp()
        };
      }

      resultDir = resultData["extractedPath"];
      __appendPDFParserDebugLog(`processFile extractedPath=${resultDir}`);

      // 2. 在resultDir目录下搜索以content_list.json结尾的文件
      const contentListData = await this.findAndReadContentList(resultDir);
      __appendPDFParserDebugLog(`processFile contentListData found=${Boolean(contentListData)}`);

      // 3. 对json进行后处理
      const processedContentList = this.processContentListData(contentListData);
      // console.log("处理后的JSON数据:", this.stringifyJSON(processedContentList));


      return {
        success: true,
        filePath: filePath,
        resultDir: resultDir,
        contentList: processedContentList,
        timestamp: Zotero.Date.getUnixTimestamp()
      };

    } catch (error) {
      console.error("PDF解析失败:", error);
      __appendPDFParserDebugLog(`processFile failed: ${error && error.stack ? error.stack : error}`);

      return {
        success: false,
        filePath: filePath,
        resultDir: resultDir,
        error: error.message,
        message: `PDF解析失败: ${error.message}`,
        timestamp: Zotero.Date.getUnixTimestamp()
      };
    }
  }

  /**
   * 调用LLM API处理PDF内容
   * @param {Object} prompt - LLM API请求的prompt
   * @returns {Promise<Object>} 处理结果
   */
  async llmRequest(prompt) {
    try {
      const response = await callZhipuAI(prompt);
      // console.log('[pdfParser] LLM API 响应:', response);
      const content = response?.choices?.[0]?.message?.content;
      if (!content) {
        console.warn('[pdfParser] LLM 响应为空，返回空字符串');
        return '';
      }

      // 尝试解析 LLM 返回的内容
      const parsedResult = this._parseLLMResponse(content);

      if (parsedResult !== null) {
        // 如果解析成功
        if (Array.isArray(parsedResult)) {
          // 数组格式：直接返回解析后的数组（兼容旧的段落处理逻辑）
          // console.log('[pdfParser] 返回解析后的数组，长度:', parsedResult.length);
          return parsedResult;
        } else if (typeof parsedResult === 'object') {
          // 对象格式：返回原始 JSON 字符串（供 articleSummaryRequest 使用）
          // console.log('[pdfParser] 返回原始 JSON 字符串');
          return content;
        }
      }

      // 解析失败，返回原始内容
      console.warn('[pdfParser] 无法解析 LLM 响应，返回原始内容');
      return content;
    }
    catch (error) {
      console.error('[pdfParser] LLM API 调用失败:', error);
      // 🔴 关键：如果是 429 错误（并发限制），必须向上抛出，让上层处理
      if (error.message && error.message.includes('429')) {
        // console.warn("[pdfParser]----------------429----------")
        throw error;
      }
      // 其他错误返回空字符串，让上层使用空结果
      return '';
    }
  }

  /**
   * 解析 LLM 返回的 JSON 内容（支持对象和数组）
   * @param {string} content - LLM 返回的文本内容
   * @returns {Object|Array|null} 解析后的结果或 null
   */
  _parseLLMResponse(content) {
    if (!content) {
      return null;
    }
    let trimmed = content.trim();

    // 1. 尝试直接解析整个内容
    try {
      const directParsed = JSONUtils.parseJSON(trimmed);
      if (directParsed !== null && typeof directParsed === 'object') {
        // console.log('[pdfParser] 直接解析成功');
        return directParsed;
      }
    }
    catch (error) {
      console.warn('[pdfParser] 直接解析失败，尝试提取 JSON:', error);
    }

    // 2. 尝试提取 JSON 对象（优先）
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSONUtils.parseJSON(objectMatch[0]);
        if (parsed !== null && typeof parsed === 'object') {
          // console.log('[pdfParser] 提取 JSON 对象成功');
          return parsed;
        }
      }
      catch (error) {
        console.warn('[pdfParser] 提取的 JSON 对象解析失败:', error);
      }
    }

    // 3. 尝试提取 JSON 数组（兼容旧逻辑）
    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSONUtils.parseJSON(arrayMatch[0]);
        if (Array.isArray(parsed)) {
          // console.log('[pdfParser] 提取 JSON 数组成功');
          return parsed;
        }
      }
      catch (error) {
        console.warn('[pdfParser] 提取的 JSON 数组解析失败:', error);
      }
    }

    return null;
  }

  /**
   * 在指定目录下搜索以content_list.json结尾的文件并读取内容
   * @param {string} dirPath - 要搜索的目录路径
   * @returns {Promise<Object|null>} JSON文件内容或null
   */
  async findAndReadContentList(dirPath) {
    try {
      // console.log("在", dirPath, "中查找content list")
      // 获取目录对象
      const dir = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
      dir.initWithPath(dirPath);

      if (!dir.exists() || !dir.isDirectory()) {
        console.warn("目录不存在或不是有效目录:", dirPath);
        return null;
      }

      // 遍历目录寻找以content_list.json结尾的文件
      const entries = dir.directoryEntries;
      while (entries.hasMoreElements()) {
        const entry = entries.getNext().QueryInterface(Components.interfaces.nsIFile);

        if (entry.isFile() && entry.leafName.endsWith("content_list.json")) {
          // console.log("找到content_list.json文件:", entry.path);

          // 读取JSON文件内容
          const fileContent = await this.readJSONFile(entry.path);
          return fileContent;
        }
      }

      console.warn("未找到以content_list.json结尾的文件");
      return null;

    } catch (error) {
      console.error("搜索content_list.json文件时出错:", error);
      return null;
    }
  }

  /**
   * 读取JSON文件内容
   * @param {string} filePath - JSON文件路径
   * @returns {Promise<Object|null>} 解析后的JSON对象或null
   */
  async readJSONFile(filePath) {
    return await Zotero.JSONUtils.readJSONFile(filePath);
  }
}

// 导出PDF解析器类到Zotero命名空间，符合XPCOM模块惯例
Zotero.PDFParser = PDFParser;

// 单例模式：全局 PDFParser 实例缓存
let _pdfParserInstance = null;

/**
 * 获取或创建 PDFParser 单例实例
 * @returns {PDFParser} 全局唯一的 PDFParser 实例
 */
function getPDFParserInstance() {
  if (!_pdfParserInstance) {
    _pdfParserInstance = new Zotero.PDFParser();
  }
  return _pdfParserInstance;
}

// 创建 pdfParser 模块接口（单例模式）
Zotero.pdfParser = {
  /**
   * 处理 PDF 文件（复用单例实例）
   * @param {string} filePath - PDF 文件路径
   * @returns {Promise<Object>} 解析结果
   */
  processFile: async function (filePath) {
    return await getPDFParserInstance().processFile(filePath);
  },

  /**
   * 调用 LLM API（复用单例实例）
   * @param {string} prompt - LLM 提示词
   * @returns {Promise<Array>} LLM 返回结果
   */
  llmRequest: async function (prompt) {
    return await getPDFParserInstance().llmRequest(prompt);
  },

  /**
   * 设置 MinerU API 模式
   * @param {string} mode - 'cloud' 或 'local'
   */
  setApiMode: function (mode) {
    getPDFParserInstance().setApiMode(mode);
  },

  /**
   * 获取当前 MinerU API 模式
   * @returns {string} 'cloud' 或 'local'
   */
  getApiMode: function () {
    return getPDFParserInstance().getApiMode();
  },

  /**
   * 检查本地 MinerU API 是否可用
   * @returns {Promise<boolean>} 是否可用
   */
  isLocalAPIAvailable: async function () {
    return await getPDFParserInstance().isLocalAPIAvailable();
  },

  /**
   * 获取当前 PDFParser 实例（可选，用于调试或特殊需求）
   * @returns {PDFParser|null} 当前实例或 null
   */
  getInstance: function () {
    return _pdfParserInstance;
  },

  /**
   * 重置 PDFParser 实例（可选，用于清理资源）
   */
  reset: function () {
    _pdfParserInstance = null;
  }
};
