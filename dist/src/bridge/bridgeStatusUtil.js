import {
  getClaudeAiBaseUrl,
  getRemoteSessionUrl
} from "../constants/product.js";
import { stringWidth } from "../ink/stringWidth.js";
import { formatDuration, truncateToWidth } from "../utils/format.js";
import { getGraphemeSegmenter } from "../utils/intl.js";
const TOOL_DISPLAY_EXPIRY_MS = 3e4;
const SHIMMER_INTERVAL_MS = 150;
function timestamp() {
  const now = /* @__PURE__ */ new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
function abbreviateActivity(summary) {
  return truncateToWidth(summary, 30);
}
function buildBridgeConnectUrl(environmentId, ingressUrl) {
  const baseUrl = getClaudeAiBaseUrl(void 0, ingressUrl);
  return `${baseUrl}/code?bridge=${environmentId}`;
}
function buildBridgeSessionUrl(sessionId, environmentId, ingressUrl) {
  return `${getRemoteSessionUrl(sessionId, ingressUrl)}?bridge=${environmentId}`;
}
function computeGlimmerIndex(tick, messageWidth) {
  const cycleLength = messageWidth + 20;
  return messageWidth + 10 - tick % cycleLength;
}
function computeShimmerSegments(text, glimmerIndex) {
  const messageWidth = stringWidth(text);
  const shimmerStart = glimmerIndex - 1;
  const shimmerEnd = glimmerIndex + 1;
  if (shimmerStart >= messageWidth || shimmerEnd < 0) {
    return { before: text, shimmer: "", after: "" };
  }
  const clampedStart = Math.max(0, shimmerStart);
  let colPos = 0;
  let before = "";
  let shimmer = "";
  let after = "";
  for (const { segment } of getGraphemeSegmenter().segment(text)) {
    const segWidth = stringWidth(segment);
    if (colPos + segWidth <= clampedStart) {
      before += segment;
    } else if (colPos > shimmerEnd) {
      after += segment;
    } else {
      shimmer += segment;
    }
    colPos += segWidth;
  }
  return { before, shimmer, after };
}
function getBridgeStatus({
  error,
  connected,
  sessionActive,
  reconnecting
}) {
  if (error) return { label: "Remote Control failed", color: "error" };
  if (reconnecting)
    return { label: "Remote Control reconnecting", color: "warning" };
  if (sessionActive || connected)
    return { label: "Remote Control active", color: "success" };
  return { label: "Remote Control connecting\u2026", color: "warning" };
}
function buildIdleFooterText(url) {
  return `Code everywhere with the Claude app or ${url}`;
}
function buildActiveFooterText(url) {
  return `Continue coding in the Claude app or ${url}`;
}
const FAILED_FOOTER_TEXT = "Something went wrong, please try again";
function wrapWithOsc8Link(text, url) {
  return `\x1B]8;;${url}\x07${text}\x1B]8;;\x07`;
}
export {
  FAILED_FOOTER_TEXT,
  SHIMMER_INTERVAL_MS,
  TOOL_DISPLAY_EXPIRY_MS,
  abbreviateActivity,
  buildActiveFooterText,
  buildBridgeConnectUrl,
  buildBridgeSessionUrl,
  buildIdleFooterText,
  computeGlimmerIndex,
  computeShimmerSegments,
  formatDuration,
  getBridgeStatus,
  timestamp,
  truncateToWidth as truncatePrompt,
  wrapWithOsc8Link
};
