(function (globalScope) {
  async function runPDFParseBatch(items, runItem) {
    if (!Array.isArray(items)) {
      throw new Error('Batch parse items must be an array');
    }
    if (typeof runItem !== 'function') {
      throw new Error('Batch parse runner must be a function');
    }

    const results = [];
    for (const item of items) {
      try {
        const value = await runItem(item);
        results.push({
          item,
          success: true,
          value
        });
      } catch (error) {
        results.push({
          item,
          success: false,
          error: getErrorMessage(error),
          reason: error
        });
      }
    }
    return results;
  }

  function getErrorMessage(error) {
    if (error && error.message) {
      return error.message;
    }
    return String(error || 'Unknown error');
  }

  globalScope.runPDFParseBatch = runPDFParseBatch;
  globalScope.getBatchParseErrorMessage = getErrorMessage;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      runPDFParseBatch,
      getBatchParseErrorMessage: getErrorMessage
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
