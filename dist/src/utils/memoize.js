import { LRUCache } from "lru-cache";
import { logError } from "./log.js";
import { jsonStringify } from "./slowOperations.js";
function memoizeWithTTL(f, cacheLifetimeMs = 5 * 60 * 1e3) {
  const cache = /* @__PURE__ */ new Map();
  const memoized = (...args) => {
    const key = jsonStringify(args);
    const cached = cache.get(key);
    const now = Date.now();
    if (!cached) {
      const value = f(...args);
      cache.set(key, {
        value,
        timestamp: now,
        refreshing: false
      });
      return value;
    }
    if (cached && now - cached.timestamp > cacheLifetimeMs && !cached.refreshing) {
      cached.refreshing = true;
      Promise.resolve().then(() => {
        const newValue = f(...args);
        if (cache.get(key) === cached) {
          cache.set(key, {
            value: newValue,
            timestamp: Date.now(),
            refreshing: false
          });
        }
      }).catch((e) => {
        logError(e);
        if (cache.get(key) === cached) {
          cache.delete(key);
        }
      });
      return cached.value;
    }
    return cache.get(key).value;
  };
  memoized.cache = {
    clear: () => cache.clear()
  };
  return memoized;
}
function memoizeWithTTLAsync(f, cacheLifetimeMs = 5 * 60 * 1e3) {
  const cache = /* @__PURE__ */ new Map();
  const inFlight = /* @__PURE__ */ new Map();
  const memoized = async (...args) => {
    const key = jsonStringify(args);
    const cached = cache.get(key);
    const now = Date.now();
    if (!cached) {
      const pending = inFlight.get(key);
      if (pending) return pending;
      const promise = f(...args);
      inFlight.set(key, promise);
      try {
        const result = await promise;
        if (inFlight.get(key) === promise) {
          cache.set(key, {
            value: result,
            timestamp: now,
            refreshing: false
          });
        }
        return result;
      } finally {
        if (inFlight.get(key) === promise) {
          inFlight.delete(key);
        }
      }
    }
    if (cached && now - cached.timestamp > cacheLifetimeMs && !cached.refreshing) {
      cached.refreshing = true;
      const staleEntry = cached;
      f(...args).then((newValue) => {
        if (cache.get(key) === staleEntry) {
          cache.set(key, {
            value: newValue,
            timestamp: Date.now(),
            refreshing: false
          });
        }
      }).catch((e) => {
        logError(e);
        if (cache.get(key) === staleEntry) {
          cache.delete(key);
        }
      });
      return cached.value;
    }
    return cache.get(key).value;
  };
  memoized.cache = {
    clear: () => {
      cache.clear();
      inFlight.clear();
    }
  };
  return memoized;
}
function memoizeWithLRU(f, cacheFn, maxCacheSize = 100) {
  const cache = new LRUCache({
    max: maxCacheSize
  });
  const memoized = (...args) => {
    const key = cacheFn(...args);
    const cached = cache.get(key);
    if (cached !== void 0) {
      return cached;
    }
    const result = f(...args);
    cache.set(key, result);
    return result;
  };
  memoized.cache = {
    clear: () => cache.clear(),
    size: () => cache.size,
    delete: (key) => cache.delete(key),
    // peek() avoids updating recency — we only want to observe, not promote
    get: (key) => cache.peek(key),
    has: (key) => cache.has(key)
  };
  return memoized;
}
export {
  memoizeWithLRU,
  memoizeWithTTL,
  memoizeWithTTLAsync
};
