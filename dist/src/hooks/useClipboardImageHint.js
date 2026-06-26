import { useEffect, useRef } from "react";
import { useNotifications } from "../context/notifications.js";
import { getShortcutDisplay } from "../keybindings/shortcutFormat.js";
import { hasImageInClipboard } from "../utils/imagePaste.js";
const NOTIFICATION_KEY = "clipboard-image-hint";
const FOCUS_CHECK_DEBOUNCE_MS = 1e3;
const HINT_COOLDOWN_MS = 3e4;
function useClipboardImageHint(isFocused, enabled) {
  const { addNotification } = useNotifications();
  const lastFocusedRef = useRef(isFocused);
  const lastHintTimeRef = useRef(0);
  const checkTimeoutRef = useRef(null);
  useEffect(() => {
    const wasFocused = lastFocusedRef.current;
    lastFocusedRef.current = isFocused;
    if (!enabled || !isFocused || wasFocused) {
      return;
    }
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }
    checkTimeoutRef.current = setTimeout(
      async (checkTimeoutRef2, lastHintTimeRef2, addNotification2) => {
        checkTimeoutRef2.current = null;
        const now = Date.now();
        if (now - lastHintTimeRef2.current < HINT_COOLDOWN_MS) {
          return;
        }
        if (await hasImageInClipboard()) {
          lastHintTimeRef2.current = now;
          addNotification2({
            key: NOTIFICATION_KEY,
            text: `Image in clipboard \xB7 ${getShortcutDisplay("chat:imagePaste", "Chat", "ctrl+v")} to paste`,
            priority: "immediate",
            timeoutMs: 8e3
          });
        }
      },
      FOCUS_CHECK_DEBOUNCE_MS,
      checkTimeoutRef,
      lastHintTimeRef,
      addNotification
    );
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
        checkTimeoutRef.current = null;
      }
    };
  }, [isFocused, enabled, addNotification]);
}
export {
  useClipboardImageHint
};
