# API 测试脚本

这个目录包含了用于测试智谱AI API的JavaScript代码。

## 文件说明

- `api-test.js` - 主要的API测试脚本
- `package.json` - Node.js项目配置文件
- `README.md` - 使用说明文档

## 功能特性

### 1. 基础API调用
包含了您提供的原始API调用代码，支持：
- POST请求到智谱AI API
- Bearer Token认证
- JSON格式的请求和响应处理

### 2. 增强测试功能
- 多种测试场景（基础对话、代码生成、问答）
- 错误处理和日志记录
- 请求频率控制
- 响应数据格式化显示

### 3. 灵活的配置
- 可配置的API参数（temperature、top_p等）
- 支持自定义消息内容
- 模块化设计，可被其他脚本引用

## 使用方法

### 在Node.js环境中运行

1. 安装依赖（如果需要）：
```bash
cd /Users/yu/Downloads/code/startup/VibeZotero/reader/test
npm install
```

2. 运行完整测试：
```bash
npm run test
# 或者
node api-test.js
```

3. 运行简单测试：
```bash
npm run test:simple
```

4. 运行完整测试套件：
```bash
npm run test:full
```

### 在浏览器环境中使用

可以将 `api-test.js` 中的函数复制到浏览器控制台中直接运行：

```javascript
// 调用单个API
await callZhipuAI("你好，请介绍一下你自己");

// 运行简单测试
await simpleTest();
```

## API配置

当前配置的API信息：
- **URL**: `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- **模型**: `glm-4.6`
- **认证**: Bearer Token
- **响应格式**: JSON

## 注意事项

1. **API密钥安全**: 当前代码中包含了API密钥，在生产环境中应该使用环境变量或配置文件来管理
2. **请求频率**: 脚本包含了请求间隔控制，避免过于频繁的API调用
3. **错误处理**: 包含了完整的错误捕获和日志记录
4. **网络环境**: 确保网络环境可以访问智谱AI的API服务

## 测试场景

脚本包含以下测试场景：
1. **基础测试** - 简单的问候和自我介绍
2. **代码生成测试** - 请求生成JavaScript代码
3. **问答测试** - 知识问答类请求

每个测试都会显示详细的请求和响应信息，便于调试和验证API功能。