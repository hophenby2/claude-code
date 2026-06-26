import {
  logEvent
} from "../services/analytics/index.js";
import { loadKeybindingsSync } from "./loadUserBindings.js";
import { getBindingDisplayText } from "./resolver.js";
const LOGGED_FALLBACKS = /* @__PURE__ */ new Set();
function getShortcutDisplay(action, context, fallback) {
  const bindings = loadKeybindingsSync();
  const resolved = getBindingDisplayText(action, context, bindings);
  if (resolved === void 0) {
    const key = `${action}:${context}`;
    if (!LOGGED_FALLBACKS.has(key)) {
      LOGGED_FALLBACKS.add(key);
      logEvent("tengu_keybinding_fallback_used", {
        action,
        context,
        fallback,
        reason: "action_not_found"
      });
    }
    return fallback;
  }
  return resolved;
}
export {
  getShortcutDisplay
};
