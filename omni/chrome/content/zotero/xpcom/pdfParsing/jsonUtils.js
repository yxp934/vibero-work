/**
 * JSON工具类
 * 提供在XPCOM环境中兼容的JSON读取和处理方法
 */

class JSONUtils {
  /**
   * 解析JSON字符串
   * @param {string} jsonString - 要解析的JSON字符串
   * @returns {Object|null} 解析后的对象或null
   */
  static parseJSON(jsonString) {
    try {
      // 在 XPCOM 环境中，JSON 对象可能不可用，先检查
      if (typeof JSON !== 'undefined' && typeof JSON.parse === 'function') {
        return JSON.parse(jsonString);
      } else {
        // XPCOM 环境中 JSON.parse 不可用，使用 eval
        console.warn("JSON.parse 不可用，使用 eval 解析");
        return eval('(' + jsonString + ')');
      }
    } catch (error) {
      console.warn("JSON.parse 失败，尝试使用 eval:", error.message);
      try {
        // 降级使用 eval（兼容某些特殊格式）
        return eval('(' + jsonString + ')');
      } catch (evalError) {
        console.error("JSON解析失败:", evalError);
        return null;
      }
    }
  }

  /**
   * 将对象转换为JSON字符串
   * @param {Object} obj - 要转换的对象
   * @param {number} indent - 缩进空格数，默认为2
   * @returns {string} JSON字符串
   */
  static stringifyJSON(obj, indent = 2) {
    try {
      // 在XPCOM环境中手动实现JSON.stringify的功能
      const stringify = (value, depth = 0) => {
        const indentStr = ' '.repeat(depth * indent);
        const nextIndentStr = ' '.repeat((depth + 1) * indent);

        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'string') return '"' + value.replace(/"/g, '\\"') + '"';
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);

        if (Array.isArray(value)) {
          if (value.length === 0) return '[]';
          const items = value.map((item) => nextIndentStr + stringify(item, depth + 1));
          return '[\n' + items.join(',\n') + '\n' + indentStr + ']';
        }

        if (typeof value === 'object') {
          const keys = Object.keys(value);
          if (keys.length === 0) return '{}';
          const items = keys.map((key) =>
          nextIndentStr + '"' + key + '": ' + stringify(value[key], depth + 1)
          );
          return '{\n' + items.join(',\n') + '\n' + indentStr + '}';
        }

        return String(value);
      };

      return stringify(obj);
    } catch (error) {
      console.error("JSON字符串化失败:", error);
      return String(obj);
    }
  }

  /**
   * 读取JSON文件内容（XPCOM兼容版本）
   * @param {string} filePath - JSON文件路径
   * @returns {Promise<Object|null>} 解析后的JSON对象或null
   */
  static async readJSONFile(filePath) {
    try {
      // 创建文件对象
      const file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
      file.initWithPath(filePath);

      if (!file.exists()) {
        console.warn("JSON文件不存在:", filePath);
        return null;
      }

      // 创建文件输入流
      const fis = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
      fis.init(file, -1, -1, false);

      // 创建UTF-8转换输入流以正确处理中文编码
      const cis = Components.classes["@mozilla.org/intl/converter-input-stream;1"].createInstance(Components.interfaces.nsIConverterInputStream);
      cis.init(fis, "UTF-8", 0, 0);

      // 读取文件内容
      let content = "";
      const str = {};
      let bytesRead;

      // 使用nsIConverterInputStream读取UTF-8编码的内容
      while ((bytesRead = cis.readString(4096, str)) > 0) {
        content += str.value;
      }

      // 关闭流
      cis.close();
      fis.close();

      // 使用统一的JSON解析方法
      const jsonData = JSONUtils.parseJSON(content);
      // console.log("成功读取JSON文件:", filePath, "内容长度:", content.length);
      return jsonData;

    } catch (error) {
      console.error("读取JSON文件时出错:", error);
      return null;
    }
  }

  /**
   * 写入JSON文件内容（XPCOM兼容版本）
   * @param {string} filePath - JSON文件路径
   * @param {Object} data - 要写入的数据对象
   * @param {number} indent - 缩进空格数，默认为2
   * @returns {Promise<boolean>} 写入是否成功
   */
  static async writeJSONFile(filePath, data, indent = 2) {
    try {
      // 创建文件对象
      const file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
      file.initWithPath(filePath);

      // 创建文件输出流
      const fos = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
      fos.init(file, 0x02 | 0x08 | 0x20, 0o666, 0); // 写入、创建、截断

      // 创建转换流以处理UTF-8编码
      const converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"].createInstance(Components.interfaces.nsIConverterOutputStream);
      converter.init(fos, "UTF-8", 0, 0);

      // 将数据转换为JSON字符串并写入
      const jsonString = JSONUtils.stringifyJSON(data, indent);
      converter.writeString(jsonString);

      // 关闭流
      converter.close();
      fos.close();

      console.log("成功写入JSON文件:", filePath);
      return true;

    } catch (error) {
      console.error("写入JSON文件时出错:", error);
      return false;
    }
  }
}

// 导出到Zotero命名空间
Zotero.JSONUtils = JSONUtils;