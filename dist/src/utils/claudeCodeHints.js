import { logForDebugging } from "./debug.js";
import { createSignal } from "./signal.js";
const SUPPORTED_VERSIONS = /* @__PURE__ */ new Set([1]);
const SUPPORTED_TYPES = /* @__PURE__ */ new Set(["plugin"]);
const HINT_TAG_RE = /^[ \t]*<claude-code-hint\s+([^>]*?)\s*\/>[ \t]*$/gm;
const ATTR_RE = /(\w+)=(?:"([^"]*)"|([^\s/>]+))/g;
function extractClaudeCodeHints(output, command) {
  if (!output.includes("<claude-code-hint")) {
    return { hints: [], stripped: output };
  }
  const sourceCommand = firstCommandToken(command);
  const hints = [];
  const stripped = output.replace(HINT_TAG_RE, (rawLine) => {
    const attrs = parseAttrs(rawLine);
    const v = Number(attrs.v);
    const type = attrs.type;
    const value = attrs.value;
    if (!SUPPORTED_VERSIONS.has(v)) {
      logForDebugging(
        `[claudeCodeHints] dropped hint with unsupported v=${attrs.v}`
      );
      return "";
    }
    if (!type || !SUPPORTED_TYPES.has(type)) {
      logForDebugging(
        `[claudeCodeHints] dropped hint with unsupported type=${type}`
      );
      return "";
    }
    if (!value) {
      logForDebugging("[claudeCodeHints] dropped hint with empty value");
      return "";
    }
    hints.push({ v, type, value, sourceCommand });
    return "";
  });
  const collapsed = hints.length > 0 || stripped !== output ? stripped.replace(/\n{3,}/g, "\n\n") : stripped;
  return { hints, stripped: collapsed };
}
function parseAttrs(tagBody) {
  const attrs = {};
  for (const m of tagBody.matchAll(ATTR_RE)) {
    attrs[m[1]] = m[2] ?? m[3] ?? "";
  }
  return attrs;
}
function firstCommandToken(command) {
  const trimmed = command.trim();
  const spaceIdx = trimmed.search(/\s/);
  return spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
}
let pendingHint = null;
let shownThisSession = false;
const pendingHintChanged = createSignal();
const notify = pendingHintChanged.emit;
function setPendingHint(hint) {
  if (shownThisSession) return;
  pendingHint = hint;
  notify();
}
function clearPendingHint() {
  if (pendingHint !== null) {
    pendingHint = null;
    notify();
  }
}
function markShownThisSession() {
  shownThisSession = true;
}
const subscribeToPendingHint = pendingHintChanged.subscribe;
function getPendingHintSnapshot() {
  return pendingHint;
}
function hasShownHintThisSession() {
  return shownThisSession;
}
function _resetClaudeCodeHintStore() {
  pendingHint = null;
  shownThisSession = false;
}
const _test = {
  parseAttrs,
  firstCommandToken
};
export {
  _resetClaudeCodeHintStore,
  _test,
  clearPendingHint,
  extractClaudeCodeHints,
  getPendingHintSnapshot,
  hasShownHintThisSession,
  markShownThisSession,
  setPendingHint,
  subscribeToPendingHint
};
