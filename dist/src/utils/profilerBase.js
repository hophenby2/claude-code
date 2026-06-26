import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import { formatFileSize } from "./format.js";
let performance = null;
function getPerformance() {
  if (!performance) {
    performance = require2("perf_hooks").performance;
  }
  return performance;
}
function formatMs(ms) {
  return ms.toFixed(3);
}
function formatTimelineLine(totalMs, deltaMs, name, memory, totalPad, deltaPad, extra = "") {
  const memInfo = memory ? ` | RSS: ${formatFileSize(memory.rss)}, Heap: ${formatFileSize(memory.heapUsed)}` : "";
  return `[+${formatMs(totalMs).padStart(totalPad)}ms] (+${formatMs(deltaMs).padStart(deltaPad)}ms) ${name}${extra}${memInfo}`;
}
export {
  formatMs,
  formatTimelineLine,
  getPerformance
};
