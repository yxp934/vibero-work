/**
 * 测试调用智谱AI API的JavaScript代码
 * Test script for calling Zhipu AI API
 * 注意：API Key 已迁移到 Cloudflare Worker，客户端不再直接调用
 */

// 使用 Cloudflare Worker 代理（隐藏 API Key）
// 使用 Cloudflare Worker 代理（隐藏 API Key）
const API_CONFIG = {
  // 大模型供应商
  // 智谱 AI / DeepSeek / Gemini（多提供商）
  // proxyUrl: 'https://ai-summary-proxy.yuc430060.workers.dev'
  // proxyUrl: 'https://spb-wz98bgf6x7f3zs9b.supabase.opentrust.net/functions/v1/ai-summary-proxy'

  // Cloudflare
  // Cloudflare1: 火山引擎
  // proxyUrl: 'https://ai-summary-proxy-huoshan.yuc430060.workers.dev'
  // Cloudflare2: OpenRouter
  // proxyUrl: 'https://ai-summary-proxy-openrouter.yuc430060.workers.dev'

  // Aliyun Supabase (Old)
  // proxyUrl: 'https://spb-wz98bgf6x7f3zs9b.supabase.opentrust.net/functions/v1/ai-summary-proxy-huoshan'

  // Aliyun Supabase: 百炼 (Bailian / DashScope)
  proxyUrl: 'https://spb-wz98bgf6x7f3zs9b.supabase.opentrust.net/functions/v1/ai-summary-proxy-bailian'

  // Vibero Supabase
  // Vibero Supabase1: 火山引擎
  // proxyUrl: 'https://bcadsdoqvluzjuwhvjmt.supabase.co/functions/v1/ai-summary-proxy-huoshan'
  // Vibero Supabase2: OpenRouter
  // proxyUrl: 'https://bcadsdoqvluzjuwhvjmt.supabase.co/functions/v1/ai-summary-proxy-openrouter'
};

const MODEL_NAME_MAP = {
  'GLM47': 'ep-20260119112302-q7rcg', // 火山引擎 GLM endpoint ID
  'DEEPSEEK': 'ep-20260119112406-4c4rb', // 火山引擎 DeepSeek endpoint ID
  'DOUBAO': 'ep-20260116154917-bwg4d' // 火山引擎 Doubao endpoint ID
};
const DEFAULT_MODEL = MODEL_NAME_MAP.DEEPSEEK;

const BATCH_SIZE = 60; // 每批处理多少个对象

function ensureAIProvidersRegistry() {
  try {
    if (typeof Zotero === 'undefined' || !Zotero) {
      return;
    }
    if (!Zotero.AIProviders && typeof Services !== 'undefined' && Services.scriptloader) {
      Services.scriptloader.loadSubScript("chrome://zotero/content/xpcom/aiProviders.js", Zotero);
    }
  } catch (error) {
    console.error('[llmapi] 加载 AIProviders registry 失败:', error);
  }
}

function getCustomProviderConfig() {
  try {
    ensureAIProvidersRegistry();
    if (typeof Zotero === 'undefined' || !Zotero.AIProviders) {
      return null;
    }
    return Zotero.AIProviders.getDefaultProvider();
  } catch (error) {
    console.error('[llmapi] 读取自定义 AI 提供商配置失败:', error);
    return null;
  }
}

function formatCustomProviderEndpoint(baseUrl) {
  let url = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!url) {
    throw new Error('自定义 AI 提供商 baseUrl 为空');
  }
  if (url.endsWith('/chat/completions')) {
    return url;
  }
  if (/\/v\d+$/.test(url)) {
    return `${url}/chat/completions`;
  }
  if (/\/v\d+\//.test(url)) {
    return url.replace(/(\/v\d+\/).*$/, '$1chat/completions');
  }
  return `${url}/v1/chat/completions`;
}

function isXAIProvider(config) {
  if (!config) {
    return false;
  }

  const baseUrl = String(config.baseUrl || '').toLowerCase();
  const model = String(config.modelName || config.model || '').toLowerCase();
  return baseUrl.includes('api.x.ai') || model.startsWith('grok');
}

function shouldUseDefaultResponseFormat(config) {
  return !!config && !isXAIProvider(config);
}

function normalizeOpenAICompatibleResponse(data) {
  if (!data || !Array.isArray(data.choices)) {
    return data;
  }

  for (const choice of data.choices) {
    const message = choice && choice.message;
    if (!message || !Array.isArray(message.content)) {
      continue;
    }

    message.content = message.content.map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (part && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    }).join('').trim();
  }

  return data;
}

function recordTokenUsage(data) {
  if (!data || !data.usage || typeof Zotero === 'undefined') {
    return;
  }
  if (!Zotero._vibeTokenCounter) {
    Zotero._vibeTokenCounter = { prompt: 0, completion: 0, total: 0 };
  }
  Zotero._vibeTokenCounter.prompt += data.usage.prompt_tokens || 0;
  Zotero._vibeTokenCounter.completion += data.usage.completion_tokens || 0;
  Zotero._vibeTokenCounter.total += data.usage.total_tokens || 0;
}

async function callCustomProviderAI(message = "你好，请介绍一下你自己", options = {}) {
  const customConfig = getCustomProviderConfig();
  if (!customConfig) {
    throw new Error('未配置自定义 AI 提供商');
  }

  const endpoint = formatCustomProviderEndpoint(customConfig.baseUrl);
  const shouldAttachDefaultResponseFormat = shouldUseDefaultResponseFormat(customConfig);
  const requestBody = {
    model: options.model || customConfig.modelName || customConfig.model,
    stream: false,
    temperature: options.temperature !== undefined ? options.temperature : 1.0,
    top_p: options.top_p !== undefined ? options.top_p : 0.95,
    max_tokens: options.max_tokens,
    messages: [
    {
      role: "user",
      content: typeof message === 'string' || Array.isArray(message) ? message : String(message)
    }]

  };

  if (options.response_format) {
    requestBody.response_format = options.response_format;
  } else if (shouldAttachDefaultResponseFormat) {
    requestBody.response_format = {
      type: "json_object"
    };
  }

  const headers = {
    'Accept': 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${customConfig.apiKey}`
  };

  const sendRequest = async (body) => {
    return await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
  };

  try {
    let response = await sendRequest(requestBody);

    if (!response.ok && requestBody.response_format) {
      const retryBody = { ...requestBody };
      delete retryBody.response_format;
      response = await sendRequest(retryBody);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`自定义 AI 提供商请求失败 (${response.status}): ${errorText}`);
    }

    const data = normalizeOpenAICompatibleResponse(await response.json());
    recordTokenUsage(data);
    return data;
  } catch (error) {
    console.error('[llmapi] 自定义 AI 提供商调用失败:', error);
    throw error;
  }
}

/**
 * 调用火山引擎（豆包）API（通过 Cloudflare Worker 代理）
 * 注意：此函数专门用于火山引擎 Worker，不需要 X-API-Provider 请求头
 * 支持 response_format: json_schema 严格模式或 json_object 宽松模式
 * @param {string} message - 用户消息
 * @param {Object} options - 可选参数（包含 response_format）
 * @returns {Promise<Object>} API响应数据
 */
async function callHuoshanAI(message = "你好，请介绍一下你自己", options = {}) {
  const url = API_CONFIG.proxyUrl;

  // 构建请求体（火山引擎格式）
  const requestBody = {
    // model: options.model || "ep-20260116143400-qz6rl", // 火山引擎 endpoint ID
    model: DEFAULT_MODEL,
    stream: false, // 改为非流式传输
    temperature: options.temperature || 1.0,
    top_p: options.top_p || 0.95,
    max_tokens: options.max_tokens,
    thinking: {
      type: "disabled" // 火山引擎特有参数
    },
    messages: [
    {
      role: "user",
      content: message
    }]

  };

  // 支持 response_format 选项（json_schema 严格模式或 json_object）
  if (options.response_format) {
    requestBody.response_format = options.response_format;
  } else {
    // 默认使用 json_object
    requestBody.response_format = {
      type: "json_object"
    };
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  const fetchOptions = {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  };

  try {
    // console.log('🚀 发送请求到火山引擎 API (通过 Supabase 代理, 流式模式)...');
    // console.log('📝 请求消息:', message);
    // console.log(`[llmapi/callHuoshanAI] 发送请求, 模型: ${requestBody.model}, 是否流式(stream): ${requestBody.stream}`);

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      const responseHeaders = {};
      response.headers.forEach((val, key) => responseHeaders[key] = val);

      const errorDetail = {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: responseHeaders,
        body: errorText
      };

      throw new Error(`HTTP错误完整详情:\n${JSON.stringify(errorDetail, null, 2)}`);
    }

    // 非流式响应处理
    // console.log('[llmapi/callHuoshanAI] 🚀 接口调用成功，开始等待非流式 JSON 返回...');
    const data = await response.json();

    // 打印 Token 消耗情况
    if (data.usage) {
      // console.log(`[llmapi/callHuoshanAI] 📊 Token 消耗统计 - prompt_tokens: ${data.usage.prompt_tokens || 0}, completion_tokens: ${data.usage.completion_tokens || 0}, total_tokens: ${data.usage.total_tokens || 0}`);
      if (typeof Zotero !== 'undefined') {
        if (!Zotero._vibeTokenCounter) Zotero._vibeTokenCounter = { prompt: 0, completion: 0, total: 0 };
        Zotero._vibeTokenCounter.prompt += data.usage.prompt_tokens || 0;
        Zotero._vibeTokenCounter.completion += data.usage.completion_tokens || 0;
        Zotero._vibeTokenCounter.total += data.usage.total_tokens || 0;
      }
    } else {

      // console.log('[llmapi/callHuoshanAI] 📊 未返回 Token 消耗统计 (usage 参数缺失)');
    }
    // console.log('[llmapi/callHuoshanAI] ✅ 收到非流式完整 JSON 响应');
    return data;

  } catch (error) {
    console.error('❌ API调用失败:', error.message);
    console.error('🔍 错误详情:', error);
    throw error;
  }
}


/**
 * 调用阿里云百炼（通义千问）API（通过 Supabase Edge Function 代理）
 * 使用 OpenAI Compatible 格式，支持 response_format: json_schema 严格模式或 json_object 宽松模式
 * 与 callHuoshanAI 完全对称，只是后端 url 不同，且不需要 thinking 参数
 * @param {string} message - 用户消息
 * @param {Object} options - 可选参数（包含 response_format）
 * @returns {Promise<Object>} API响应数据
 */
async function callBailianAI(message = "你好，请介绍一下你自己", options = {}) {
  const url = API_CONFIG.proxyUrl;

  // 构建请求体（OpenAI Compatible 格式，百炼不支持 thinking 参数）
  const requestBody = {
    model: options.model || 'qwen-plus', // 百炼默认模型
    stream: false, // 改为非流式传输
    temperature: options.temperature || 1.0,
    top_p: options.top_p || 0.95,
    max_tokens: options.max_tokens,
    messages: [
    {
      role: "user",
      content: message
    }]

  };

  // 支持 response_format 选项（json_schema 严格模式或 json_object）
  if (options.response_format) {
    requestBody.response_format = options.response_format;
  } else {
    // 默认使用 json_object
    requestBody.response_format = {
      type: "json_object"
    };
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  const fetchOptions = {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  };

  try {
    // console.log(`[llmapi/callBailianAI] 发送请求, 模型: ${requestBody.model}, 是否流式(stream): ${requestBody.stream}`);
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      const responseHeaders = {};
      response.headers.forEach((val, key) => responseHeaders[key] = val);

      const errorDetail = {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: responseHeaders,
        body: errorText
      };

      throw new Error(`HTTP错误完整详情:\n${JSON.stringify(errorDetail, null, 2)}`);
    }

    // 非流式响应处理
    // console.log('[llmapi/callBailianAI] 🚀 接口调用成功，开始等待非流式 JSON 返回...');
    const data = await response.json();

    // 打印 Token 消耗情况
    if (data.usage) {
      // console.log(`[llmapi/callBailianAI] 📊 Token 消耗统计 - prompt_tokens: ${data.usage.prompt_tokens || 0}, completion_tokens: ${data.usage.completion_tokens || 0}, total_tokens: ${data.usage.total_tokens || 0}`);
      if (typeof Zotero !== 'undefined') {
        if (!Zotero._vibeTokenCounter) Zotero._vibeTokenCounter = { prompt: 0, completion: 0, total: 0 };
        Zotero._vibeTokenCounter.prompt += data.usage.prompt_tokens || 0;
        Zotero._vibeTokenCounter.completion += data.usage.completion_tokens || 0;
        Zotero._vibeTokenCounter.total += data.usage.total_tokens || 0;
      }
    } else {

      // console.log('[llmapi/callBailianAI] 📊 未返回 Token 消耗统计 (usage 参数缺失)');
    }
    // console.log('[llmapi/callBailianAI] ✅ 收到非流式完整 JSON 响应');
    return data;

  } catch (error) {
    console.error('❌ [Bailian] API调用失败:', error.message);
    console.error('🔍 错误详情:', error);
    throw error;
  }
}


/**
 * 调用 OpenRouter API（通过 Cloudflare Worker / Supabase Edge Function 代理）
 * @param {string} message - 用户消息
 * @param {Object} options - 可选参数
 * @returns {Promise<Object>} API响应数据
 */
async function callOpenRouterAI(message = "你好，请介绍一下你自己", options = {}) {
  const url = API_CONFIG.proxyUrl;
  // 更新为用户指定的 DeepSeek v3.2 (Chat Model)
  const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v3.2";

  // 构建请求体 (OpenAI Compatible)
  const requestBody = {
    model: options.model || DEFAULT_OPENROUTER_MODEL,
    model: options.model || DEFAULT_OPENROUTER_MODEL,
    stream: false, // 改为 false，避免 XPCOM 环境下流读取错误 (Error in input stream)
    // DeepSeek V3.2 是 Chat 模型，不需要处理 Thinking/Reasoning 标签
    temperature: options.temperature || 0.7,
    top_p: options.top_p || 0.9,
    max_tokens: options.max_tokens,
    messages: [
    {
      role: "user",
      content: message
    }]

  };

  // 支持 response_format 选项
  // OpenRouter 支持 json_schema (Structured Outputs)，不再强制降级为 json_object
  if (options.response_format) {
    // console.log('[callOpenRouterAI] 使用用户指定的 response_format:', options.response_format.type);
    requestBody.response_format = options.response_format;
  } else {
    // 默认使用 json_object
    requestBody.response_format = {
      type: "json_object"
    };
  }

  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  };

  try {
    // console.log('🚀 发送请求到 OpenRouter API (通过 Supabase 代理, 非流式模式)...');
    // console.log('📝 请求消息:', message);

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      const headers = {};
      response.headers.forEach((val, key) => headers[key] = val);

      const errorDetail = {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: headers,
        body: errorText
      };

      throw new Error(`HTTP错误完整详情:\n${JSON.stringify(errorDetail, null, 2)}`);
    }

    // 非流式模式：直接解析 JSON
    const data = await response.json();
    return data;

  } catch (error) {
    console.error('❌ API调用失败:', error.message);
    console.error('🔍 错误详情:', error);
    throw error;
  }
}

/**
 * 调用智谱AI API（通过 Cloudflare Worker 代理）
 * @param {string} message - 用户消息
 * @param {Object} options - 可选参数
 * @returns {Promise<Object>} API响应数据
 */
async function callZhipuAI(message = "你好，请介绍一下你自己", options = {}) {
  const customConfig = getCustomProviderConfig();
  if (customConfig) {
    return callCustomProviderAI(message, options);
  }

  // console.log("[API_CONFIG.proxyUrl]:", API_CONFIG.proxyUrl);
  // 如果使用火山引擎代理，调用 callHuoshanAI
  if (API_CONFIG.proxyUrl.includes('ai-summary-proxy-huoshan')) {
    return callHuoshanAI(message, options);
  }

  // 如果使用阿里云百炼代理，调用 callBailianAI
  if (API_CONFIG.proxyUrl.includes('ai-summary-proxy-bailian')) {
    return callBailianAI(message, options);
  }

  // 如果使用 OpenRouter Worker，调用 callOpenRouterAI
  if (API_CONFIG.proxyUrl.includes('ai-summary-proxy-openrouter')) {
    return callOpenRouterAI(message, options);
  }

  const url = API_CONFIG.proxyUrl;

  // 构建请求体
  const requestBody = {
    model: "GLM-4.6",
    stream: false,
    thinking: {
      type: "disabled"
    },
    do_sample: true,
    temperature: options.temperature || 1,
    top_p: options.top_p || 0.95,
    response_format: {
      type: "json_object"
    },
    messages: [
    {
      role: "user",
      content: message
    }]

  };

  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Provider': 'zhipu' // 指定使用智谱 AI
    },
    body: JSON.stringify(requestBody)
  };

  try {
    // console.log('🚀 发送请求到智谱AI API (通过代理)...');
    // console.log('📝 请求消息:', message);

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      const headers = {};
      response.headers.forEach((val, key) => headers[key] = val);

      const errorDetail = {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: headers,
        body: errorText
      };

      throw new Error(`HTTP错误完整详情:\n${JSON.stringify(errorDetail, null, 2)}`);
    }

    const data = await response.json();

    // console.log('✅ API调用成功!');
    // console.log('📊 响应数据:', data);

    // 提取并显示AI回复内容
    if (data.choices && data.choices[0] && data.choices[0].message) {

      // console.log('🤖 AI回复:', data.choices[0].message.content);
    }
    return data;

  } catch (error) {
    console.error('❌ API调用失败:', error.message);
    console.error('🔍 错误详情:', error);
    throw error;
  }
}

/**
 * 调用 DeepSeek API（通过 Cloudflare Worker 代理）
 * @param {string} message - 用户消息
 * @param {Object} options - 可选参数
 * @returns {Promise<Object>} API响应数据
 */
async function callDeepseekAI(message = "你好，请介绍一下你自己", options = {}) {
  const url = API_CONFIG.proxyUrl;

  // 构建请求体
  const requestBody = {
    model: "deepseek-chat",
    stream: false,
    temperature: options.temperature || 1.0,
    top_p: options.top_p || 0.95,
    max_tokens: options.max_tokens,
    messages: [
    {
      role: "user",
      content: message
    }]

  };

  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Provider': 'deepseek' // 指定使用 DeepSeek
    },
    body: JSON.stringify(requestBody)
  };

  try {
    // console.log('🚀 发送请求到 DeepSeek API (通过代理)...');
    // console.log('📝 请求消息:', message);

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      const headers = {};
      response.headers.forEach((val, key) => headers[key] = val);

      const errorDetail = {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: headers,
        body: errorText
      };

      throw new Error(`HTTP错误完整详情:\n${JSON.stringify(errorDetail, null, 2)}`);
    }

    const data = await response.json();

    // console.log('✅ API调用成功!');
    // console.log('📊 响应数据:', JSON.stringify(data, null, 2));

    // 提取并显示AI回复内容
    if (data.choices && data.choices[0] && data.choices[0].message) {

      // console.log('🤖 AI回复:', data.choices[0].message.content);
    }
    return data;

  } catch (error) {
    console.error('❌ API调用失败:', error.message);
    console.error('🔍 错误详情:', error);
    throw error;
  }
}

// XPCOM 环境下不使用 export，直接将函数暴露到全局作用域
// 这些函数会在 Services.scriptloader.loadSubScript 加载后自动可用
