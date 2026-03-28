const test = require('node:test');
const assert = require('node:assert/strict');

const { ParseQueue } = require('./parseQueue.js');

test('runs queued tasks one at a time in FIFO order', async () => {
  const queue = new ParseQueue();
  let activeCount = 0;
  let maxActiveCount = 0;
  const executionOrder = [];

  function createTask(label, delayMs) {
    return queue.enqueue(async () => {
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      executionOrder.push(`start:${label}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      executionOrder.push(`end:${label}`);
      activeCount -= 1;
      return label;
    });
  }

  const results = await Promise.all([
    createTask('A', 20),
    createTask('B', 0),
    createTask('C', 0)
  ]);

  assert.deepEqual(results, ['A', 'B', 'C']);
  assert.equal(maxActiveCount, 1);
  assert.deepEqual(executionOrder, [
    'start:A',
    'end:A',
    'start:B',
    'end:B',
    'start:C',
    'end:C'
  ]);
});

test('continues with later tasks after a task fails', async () => {
  const queue = new ParseQueue();
  const states = [];

  const firstResult = queue.enqueue(async () => {
    states.push('first');
    throw new Error('boom');
  });

  const secondResult = queue.enqueue(async () => {
    states.push('second');
    return 'ok';
  });

  await assert.rejects(firstResult, /boom/);
  await assert.doesNotReject(secondResult);
  assert.deepEqual(states, ['first', 'second']);
});

test('coalesces queued tasks that use the same key', async () => {
  const queue = new ParseQueue();
  let runCount = 0;

  const task = async () => {
    runCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return 'shared-result';
  };

  const [first, second] = await Promise.all([
    queue.enqueue(task, { key: 'paper-1' }),
    queue.enqueue(task, { key: 'paper-1' })
  ]);

  assert.equal(first, 'shared-result');
  assert.equal(second, 'shared-result');
  assert.equal(runCount, 1);
});
