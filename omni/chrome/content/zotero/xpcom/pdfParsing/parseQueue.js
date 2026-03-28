(function (globalScope) {
  class ParseQueue {
    constructor() {
      this._items = [];
      this._running = false;
      this._pendingByKey = new Map();
    }

    enqueue(run, options = {}) {
      if (typeof run !== 'function') {
        return Promise.reject(new Error('ParseQueue task must be a function'));
      }

      const key = this._normalizeKey(options.key);
      if (key && this._pendingByKey.has(key)) {
        return this._pendingByKey.get(key).promise;
      }

      let resolvePromise;
      let rejectPromise;
      const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });

      const item = {
        key,
        run,
        promise,
        resolve: resolvePromise,
        reject: rejectPromise
      };

      if (key) {
        this._pendingByKey.set(key, item);
      }

      this._items.push(item);
      this._drain();
      return promise;
    }

    get size() {
      return this._items.length + (this._running ? 1 : 0);
    }

    async _drain() {
      if (this._running) {
        return;
      }

      const nextItem = this._items.shift();
      if (!nextItem) {
        return;
      }

      this._running = true;
      try {
        const result = await nextItem.run();
        nextItem.resolve(result);
      } catch (error) {
        nextItem.reject(error);
      } finally {
        if (nextItem.key) {
          this._pendingByKey.delete(nextItem.key);
        }
        this._running = false;
        this._drain();
      }
    }

    _normalizeKey(rawKey) {
      const key = String(rawKey || '').trim();
      return key || '';
    }
  }

  globalScope.ParseQueue = ParseQueue;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ParseQueue };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
