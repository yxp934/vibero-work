var _llmapi = require("./llmapi.js");

async function testZhipuAI() {
  try {
    const prompt = '请用中文简短介绍 Transformer 模型的核心思想。';
    console.log('[test_llm] 开始测试智谱AI API...');
    const response = await (0, _llmapi.callZhipuAI)(prompt);
    console.log('[test_llm] 智谱AI API 测试成功，收到响应：');
    console.log(JSON.stringify(response, null, 2));
    return true;
  }
  catch (error) {
    console.error('[test_llm] 智谱AI API 测试失败:', error);
    return false;
  }
}

async function testDeepSeekAI() {
  try {
    const prompt = '请用中文简短介绍 Transformer 模型的核心思想。';
    console.log('[test_llm] 开始测试 DeepSeek AI API...');
    const response = await (0, _llmapi.callDeepseekAI)(prompt);
    console.log('[test_llm] DeepSeek AI API 测试成功，收到响应：');
    console.log(JSON.stringify(response, null, 2));
    return true;
  }
  catch (error) {
    console.error('[test_llm] DeepSeek AI API 测试失败:', error);
    return false;
  }
}

async function main() {
  console.log('[test_llm] 开始 LLM API 集成测试...\n');

  const testPrompts = process.argv.slice(2);
  let shouldTestZhipu = true;
  let shouldTestDeepseek = true;

  // 解析命令行参数
  if (testPrompts.length > 0) {
    shouldTestZhipu = testPrompts.includes('--zhipu');
    shouldTestDeepseek = testPrompts.includes('--deepseek');

    // 如果没有指定任何API，默认测试所有
    if (!shouldTestZhipu && !shouldTestDeepseek) {
      shouldTestZhipu = true;
      shouldTestDeepseek = true;
    }
  }

  const results = {
    zhipu: shouldTestZhipu ? await testZhipuAI() : null,
    deepseek: shouldTestDeepseek ? await testDeepSeekAI() : null
  };

  console.log('\n[test_llm] 测试结果汇总:');
  console.log('========================');
  if (results.zhipu !== null) {
    console.log(`智谱AI API: ${results.zhipu ? '✅ 成功' : '❌ 失败'}`);
  }
  if (results.deepseek !== null) {
    console.log(`DeepSeek API: ${results.deepseek ? '✅ 成功' : '❌ 失败'}`);
  }

  const successCount = Object.values(results).filter((result) => result === true).length;
  const totalTests = Object.values(results).filter((result) => result !== null).length;

  console.log(`\n总体结果: ${successCount}/${totalTests} 个 API 测试通过`);
}

main();