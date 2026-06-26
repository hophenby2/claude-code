import { stringWidth } from "./stringWidth.js";
const cache = /* @__PURE__ */ new Map();
const MAX_CACHE_SIZE = 4096;
function lineWidth(line) {
  const cached = cache.get(line);
  if (cached !== void 0) return cached;
  const width = stringWidth(line);
  if (cache.size >= MAX_CACHE_SIZE) {
    cache.clear();
  }
  cache.set(line, width);
  return width;
}
export {
  lineWidth
};
