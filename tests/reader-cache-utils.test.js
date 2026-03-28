const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasRenderableVibeReaderCache,
} = require('../omni/chrome/content/zotero/xpcom/readerCacheUtils.js');

test('returns false for empty paper shell data', () => {
  assert.equal(
    hasRenderableVibeReaderCache({
      paragraphs: [],
      hierarchicalData: [],
      articleSummary: [],
      sections: null,
    }),
    false
  );
});

test('returns true when hierarchical paragraphs exist', () => {
  assert.equal(
    hasRenderableVibeReaderCache({
      hierarchicalData: [{ pageIndex: 0, paragraphs: [{ paragraphIndex: 0 }] }],
      articleSummary: [],
      sections: null,
    }),
    true
  );
});

test('returns true when article summary exists without paragraphs', () => {
  assert.equal(
    hasRenderableVibeReaderCache({
      paragraphs: [],
      articleSummary: [{ title: '论文标题', content: 'Example' }],
      sections: null,
    }),
    true
  );
});

test('returns true when sections exist without paragraphs', () => {
  assert.equal(
    hasRenderableVibeReaderCache({
      paragraphs: [],
      articleSummary: [],
      sections: { title: 'Introduction', children: [] },
    }),
    true
  );
});
