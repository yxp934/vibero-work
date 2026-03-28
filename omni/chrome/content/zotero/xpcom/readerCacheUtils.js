(function (global) {
  function hasRenderableSections(sections) {
    if (!sections) {
      return false;
    }
    if (Array.isArray(sections)) {
      return sections.length > 0;
    }
    if (typeof sections !== 'object') {
      return false;
    }
    if (typeof sections.title === 'string' && sections.title.trim()) {
      return true;
    }
    return Array.isArray(sections.children) && sections.children.length > 0;
  }

  function hasRenderableParagraphs(loadedData) {
    if (Array.isArray(loadedData.paragraphs) && loadedData.paragraphs.length > 0) {
      return true;
    }
    if (!Array.isArray(loadedData.hierarchicalData)) {
      return false;
    }
    return loadedData.hierarchicalData.some((page) =>
      Array.isArray(page?.paragraphs) && page.paragraphs.length > 0
    );
  }

  function hasRenderableVibeReaderCache(loadedData) {
    if (!loadedData || typeof loadedData !== 'object') {
      return false;
    }
    if (hasRenderableParagraphs(loadedData)) {
      return true;
    }
    if (Array.isArray(loadedData.articleSummary) && loadedData.articleSummary.length > 0) {
      return true;
    }
    return hasRenderableSections(loadedData.sections);
  }

  const api = {
    hasRenderableVibeReaderCache,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.VibeReaderCacheUtils = Object.assign(global.VibeReaderCacheUtils || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
