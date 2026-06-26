import { LRUCache } from "lru-cache";
import { normalize } from "path";
const READ_FILE_STATE_CACHE_SIZE = 100;
const DEFAULT_MAX_CACHE_SIZE_BYTES = 25 * 1024 * 1024;
class FileStateCache {
  cache;
  constructor(maxEntries, maxSizeBytes) {
    this.cache = new LRUCache({
      max: maxEntries,
      maxSize: maxSizeBytes,
      sizeCalculation: (value) => Math.max(1, Buffer.byteLength(value.content))
    });
  }
  get(key) {
    return this.cache.get(normalize(key));
  }
  set(key, value) {
    this.cache.set(normalize(key), value);
    return this;
  }
  has(key) {
    return this.cache.has(normalize(key));
  }
  delete(key) {
    return this.cache.delete(normalize(key));
  }
  clear() {
    this.cache.clear();
  }
  get size() {
    return this.cache.size;
  }
  get max() {
    return this.cache.max;
  }
  get maxSize() {
    return this.cache.maxSize;
  }
  get calculatedSize() {
    return this.cache.calculatedSize;
  }
  keys() {
    return this.cache.keys();
  }
  entries() {
    return this.cache.entries();
  }
  dump() {
    return this.cache.dump();
  }
  load(entries) {
    this.cache.load(entries);
  }
}
function createFileStateCacheWithSizeLimit(maxEntries, maxSizeBytes = DEFAULT_MAX_CACHE_SIZE_BYTES) {
  return new FileStateCache(maxEntries, maxSizeBytes);
}
function cacheToObject(cache) {
  return Object.fromEntries(cache.entries());
}
function cacheKeys(cache) {
  return Array.from(cache.keys());
}
function cloneFileStateCache(cache) {
  const cloned = createFileStateCacheWithSizeLimit(cache.max, cache.maxSize);
  cloned.load(cache.dump());
  return cloned;
}
function mergeFileStateCaches(first, second) {
  const merged = cloneFileStateCache(first);
  for (const [filePath, fileState] of second.entries()) {
    const existing = merged.get(filePath);
    if (!existing || fileState.timestamp > existing.timestamp) {
      merged.set(filePath, fileState);
    }
  }
  return merged;
}
export {
  FileStateCache,
  READ_FILE_STATE_CACHE_SIZE,
  cacheKeys,
  cacheToObject,
  cloneFileStateCache,
  createFileStateCacheWithSizeLimit,
  mergeFileStateCaches
};
