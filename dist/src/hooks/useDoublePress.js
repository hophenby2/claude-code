import { useCallback, useEffect, useRef } from "react";
const DOUBLE_PRESS_TIMEOUT_MS = 800;
function useDoublePress(setPending, onDoublePress, onFirstPress) {
  const lastPressRef = useRef(0);
  const timeoutRef = useRef(void 0);
  const clearTimeoutSafe = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = void 0;
    }
  }, []);
  useEffect(() => {
    return () => {
      clearTimeoutSafe();
    };
  }, [clearTimeoutSafe]);
  return useCallback(() => {
    const now = Date.now();
    const timeSinceLastPress = now - lastPressRef.current;
    const isDoublePress = timeSinceLastPress <= DOUBLE_PRESS_TIMEOUT_MS && timeoutRef.current !== void 0;
    if (isDoublePress) {
      clearTimeoutSafe();
      setPending(false);
      onDoublePress();
    } else {
      onFirstPress?.();
      setPending(true);
      clearTimeoutSafe();
      timeoutRef.current = setTimeout(
        (setPending2, timeoutRef2) => {
          setPending2(false);
          timeoutRef2.current = void 0;
        },
        DOUBLE_PRESS_TIMEOUT_MS,
        setPending,
        timeoutRef
      );
    }
    lastPressRef.current = now;
  }, [setPending, onDoublePress, onFirstPress, clearTimeoutSafe]);
}
export {
  DOUBLE_PRESS_TIMEOUT_MS,
  useDoublePress
};
