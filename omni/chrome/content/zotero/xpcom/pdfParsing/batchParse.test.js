const test = require('node:test');
const assert = require('node:assert/strict');

const { runPDFParseBatch } = require('./batchParse.js');

test('runs selected PDFs in sequence', async () => {
  const calls = [];
  let activeCount = 0;
  let maxActiveCount = 0;

  const results = await runPDFParseBatch(
    [
      { id: 1, filePath: '/tmp/a.pdf' },
      { id: 2, filePath: '/tmp/b.pdf' }
    ],
    async (item) => {
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      calls.push(`start:${item.id}`);
      await new Promise((resolve) => setTimeout(resolve, item.id === 1 ? 20 : 0));
      calls.push(`end:${item.id}`);
      activeCount -= 1;
      return { ok: item.id };
    }
  );

  assert.equal(maxActiveCount, 1);
  assert.deepEqual(calls, [
    'start:1',
    'end:1',
    'start:2',
    'end:2'
  ]);
  assert.deepEqual(
    results.map((result) => ({ id: result.item.id, success: result.success })),
    [
      { id: 1, success: true },
      { id: 2, success: true }
    ]
  );
});

test('continues after a failed PDF parse', async () => {
  const calls = [];

  const results = await runPDFParseBatch(
    [
      { id: 1, filePath: '/tmp/a.pdf' },
      { id: 2, filePath: '/tmp/b.pdf' },
      { id: 3, filePath: '/tmp/c.pdf' }
    ],
    async (item) => {
      calls.push(item.id);
      if (item.id === 2) {
        throw new Error('boom');
      }
      return { ok: item.id };
    }
  );

  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(
    results.map((result) => ({
      id: result.item.id,
      success: result.success,
      error: result.error || null
    })),
    [
      { id: 1, success: true, error: null },
      { id: 2, success: false, error: 'boom' },
      { id: 3, success: true, error: null }
    ]
  );
});
