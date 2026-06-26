import { useEffect, useRef } from "react";
import {
  logEvent
} from "../services/analytics/index.js";
import { useOptionalKeybindingContext } from "./KeybindingContext.js";
function useShortcutDisplay(action, context, fallback) {
  const keybindingContext = useOptionalKeybindingContext();
  const resolved = keybindingContext?.getDisplayText(action, context);
  const isFallback = resolved === void 0;
  const reason = keybindingContext ? "action_not_found" : "no_context";
  const hasLoggedRef = useRef(false);
  useEffect(() => {
    if (isFallback && !hasLoggedRef.current) {
      hasLoggedRef.current = true;
      logEvent("tengu_keybinding_fallback_used", {
        action,
        context,
        fallback,
        reason
      });
    }
  }, [isFallback, action, context, fallback, reason]);
  return isFallback ? fallback : resolved;
}
export {
  useShortcutDisplay
};
