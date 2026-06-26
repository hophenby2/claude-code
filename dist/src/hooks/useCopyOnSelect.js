import { useEffect, useRef } from "react";
import { useTheme } from "../components/design-system/ThemeProvider.js";
import { getGlobalConfig } from "../utils/config.js";
import { getTheme } from "../utils/theme.js";
function useCopyOnSelect(selection, isActive, onCopied) {
  const copiedRef = useRef(false);
  const onCopiedRef = useRef(onCopied);
  onCopiedRef.current = onCopied;
  useEffect(() => {
    if (!isActive) return;
    const unsubscribe = selection.subscribe(() => {
      const sel = selection.getState();
      const has = selection.hasSelection();
      if (sel?.isDragging) {
        copiedRef.current = false;
        return;
      }
      if (!has) {
        copiedRef.current = false;
        return;
      }
      if (copiedRef.current) return;
      const enabled = getGlobalConfig().copyOnSelect ?? true;
      if (!enabled) return;
      const text = selection.copySelectionNoClear();
      if (!text || !text.trim()) {
        copiedRef.current = true;
        return;
      }
      copiedRef.current = true;
      onCopiedRef.current?.(text);
    });
    return unsubscribe;
  }, [isActive, selection]);
}
function useSelectionBgColor(selection) {
  const [themeName] = useTheme();
  useEffect(() => {
    selection.setSelectionBgColor(getTheme(themeName).selectionBg);
  }, [selection, themeName]);
}
export {
  useCopyOnSelect,
  useSelectionBgColor
};
