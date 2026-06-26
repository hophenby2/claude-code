import { useEffect, useRef } from "react";
import { normalizeFullWidthDigits } from "../../utils/stringUtils.js";
const DEFAULT_DEBOUNCE_MS = 400;
function useDebouncedDigitInput({
  inputValue,
  setInputValue,
  isValidDigit,
  onDigit,
  enabled = true,
  once = false,
  debounceMs = DEFAULT_DEBOUNCE_MS
}) {
  const initialInputValue = useRef(inputValue);
  const hasTriggeredRef = useRef(false);
  const debounceRef = useRef(null);
  const callbacksRef = useRef({ setInputValue, isValidDigit, onDigit });
  callbacksRef.current = { setInputValue, isValidDigit, onDigit };
  useEffect(() => {
    if (!enabled || once && hasTriggeredRef.current) {
      return;
    }
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (inputValue !== initialInputValue.current) {
      const lastChar = normalizeFullWidthDigits(inputValue.slice(-1));
      if (callbacksRef.current.isValidDigit(lastChar)) {
        const trimmed = inputValue.slice(0, -1);
        debounceRef.current = setTimeout(
          (debounceRef2, hasTriggeredRef2, callbacksRef2, trimmed2, lastChar2) => {
            debounceRef2.current = null;
            hasTriggeredRef2.current = true;
            callbacksRef2.current.setInputValue(trimmed2);
            callbacksRef2.current.onDigit(lastChar2);
          },
          debounceMs,
          debounceRef,
          hasTriggeredRef,
          callbacksRef,
          trimmed,
          lastChar
        );
      }
    }
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [inputValue, enabled, once, debounceMs]);
}
export {
  useDebouncedDigitInput
};
