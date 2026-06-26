import { useCallback, useContext, useLayoutEffect, useRef } from "react";
import { TerminalSizeContext } from "../components/TerminalSizeContext.js";
function useTerminalViewport() {
  const terminalSize = useContext(TerminalSizeContext);
  const elementRef = useRef(null);
  const entryRef = useRef({ isVisible: true });
  const setElement = useCallback((el) => {
    elementRef.current = el;
  }, []);
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element?.yogaNode || !terminalSize) {
      return;
    }
    const height = element.yogaNode.getComputedHeight();
    const rows = terminalSize.rows;
    let absoluteTop = element.yogaNode.getComputedTop();
    let parent = element.parentNode;
    let root = element.yogaNode;
    while (parent) {
      if (parent.yogaNode) {
        absoluteTop += parent.yogaNode.getComputedTop();
        root = parent.yogaNode;
      }
      if (parent.scrollTop) absoluteTop -= parent.scrollTop;
      parent = parent.parentNode;
    }
    const screenHeight = root.getComputedHeight();
    const bottom = absoluteTop + height;
    const cursorRestoreScroll = screenHeight > rows ? 1 : 0;
    const viewportY = Math.max(0, screenHeight - rows) + cursorRestoreScroll;
    const viewportBottom = viewportY + rows;
    const visible = bottom > viewportY && absoluteTop < viewportBottom;
    if (visible !== entryRef.current.isVisible) {
      entryRef.current = { isVisible: visible };
    }
  });
  return [setElement, entryRef.current];
}
export {
  useTerminalViewport
};
