# MinerU PDF 解析模块

## 概述

MinerU PDF 解析模块是 Zotero 的扩展功能，提供基于 MinerU API 的智能 PDF 文档解析和处理能力。

## 主要功能

- **智能 PDF 解析**: 利用 MinerU API 对 PDF 文档进行深度解析
- **自动文件管理**: 自动处理上传、下载和解压缩操作
- **结果存储**: 解析结果统一存储到指定目录
- **错误处理**: 提供友好的错误提示和配置指导

## 处理流程

### 1. 初始化
- 创建 `MinerUParser` 实例
- 设置结果存储目录: `{Zotero数据目录}/MinerUResult` （/Users/yu/Zotero/MinerUResult/）
- 确保目录存在

### 2. 文件上传
- 调用 `__requestUploadUrl()` 获取上传 URL
- 使用 `__uploadFileToMinerU()` 上传 PDF 文件到 MinerU 服务器

### 3. 处理监控
- 通过 `__pollMinerUBatchResult()` 轮询处理状态
- 默认轮询间隔: 5秒
- 自动等待处理完成

### 4. 结果下载
- 使用 `__downloadMinerUResult()` 下载处理结果
- 自动解压缩 ZIP 文件到结果目录
- 提取文档内容和元数据

### 5. 完成处理
- 返回处理结果和提取路径
- 提供成功/失败状态信息

## 结果存储位置

解析结果默认存储在:
```
{Zotero数据目录}/MinerUResult/
```

每个处理的 PDF 文件会在此目录下创建对应的子目录，包含:
- 提取的文本内容
- 图片和表格
- 元数据信息
- 其他解析结果

## 配置要求

使用前需要配置有效的 MinerU API Token:
1. 访问 [MinerU API 管理页面](https://mineru.net/apiManage/docs) 申请 Token
2. 在 `MinerU.js` 中更新 `MINERU_API_TOKEN` 常量

## 错误处理

模块提供详细的错误分类和用户友好的提示信息:
- API Token 相关错误
- 网络连接问题
- 文件处理错误
- 服务器状态异常

## 技术难点与解决方案
### 网络问题
注意：不能连外网，否则无法下载解析后的压缩包

### 模块导入导出问题

在开发过程中遇到了 Zotero XPCOM 环境下的模块导入导出兼容性问题:

**问题原因:**
- Zotero 基于 Firefox/Gecko 引擎，使用 XPCOM 组件架构
- 不支持标准的 ES6 模块 `import/export` 语法
- 无法直接使用 Node.js 风格的 `require()` 和 `module.exports`
- 缺少现代 JavaScript 环境中的 `__dirname`、`import.meta.url` 等路径获取方法

**解决方案:**
1. **使用 ChromeUtils.importESModule()** 导入系统模块:
   ```javascript
   const { FileUtils } = ChromeUtils.importESModule("resource://gre/modules/FileUtils.sys.mjs");
   const { OS } = ChromeUtils.importESModule("chrome://zotero/content/osfile.mjs");
   ```

2. **使用 Components.Constructor** 创建 XPCOM 组件:
   ```javascript
   const ZipReader = Components.Constructor(
       "@mozilla.org/libjar/zip-reader;1",
       "nsIZipReader",
       "open"
   );
   ```

3. **通过 Zotero 命名空间导出类**:
   ```javascript
   // 替代 export default MinerUParser
   Zotero.MinerUParser = MinerUParser;
   ```

4. **路径解析问题解决**:
   - 尝试使用 `nsIChromeRegistry` 将 `chrome://` 路径转换为文件系统路径
   - 最终采用 `Zotero.DataDirectory.dir` 作为可靠的基础路径
   - 使用 `OS.Path.join()` 进行路径拼接

## 使用方法

```javascript
// 创建解析器实例
const parser = new Zotero.MinerUParser();

// 处理 PDF 文件
const result = await parser.processFile('/path/to/document.pdf');

if (result.success) {
    console.log('解析完成:', result.extractedPath);
} else {
    console.error('解析失败:', result.message);
}
```