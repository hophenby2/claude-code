import { detectFileEncoding } from "./file.js";
import { getFsImplementation } from "./fsOperations.js";
class FileReadCache {
  cache = /* @__PURE__ */ new Map();
  maxCacheSize = 1e3;
  /**
   * Reads a file with caching. Returns both content and encoding.
   * Cache key includes file path and modification time for automatic invalidation.
   */
  readFile(filePath) {
    const fs = getFsImplementation();
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch (error) {
      this.cache.delete(filePath);
      throw error;
    }
    const cacheKey = filePath;
    const cachedData = this.cache.get(cacheKey);
    if (cachedData && cachedData.mtime === stats.mtimeMs) {
      return {
        content: cachedData.content,
        encoding: cachedData.encoding
      };
    }
    const encoding = detectFileEncoding(filePath);
    const content = fs.readFileSync(filePath, { encoding }).replaceAll("\r\n", "\n");
    this.cache.set(cacheKey, {
      content,
      encoding,
      mtime: stats.mtimeMs
    });
    if (this.cache.size > this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    return { content, encoding };
  }
  /**
   * Clears the entire cache. Useful for testing or memory management.
   */
  clear() {
    this.cache.clear();
  }
  /**
   * Removes a specific file from the cache.
   */
  invalidate(filePath) {
    this.cache.delete(filePath);
  }
  /**
   * Gets cache statistics for debugging/monitoring.
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}
const fileReadCache = new FileReadCache();
export {
  fileReadCache
};
