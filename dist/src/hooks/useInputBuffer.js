import { useCallback, useRef, useState } from "react";
function useInputBuffer({
  maxBufferSize,
  debounceMs
}) {
  const [buffer, setBuffer] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const lastPushTime = useRef(0);
  const pendingPush = useRef(null);
  const pushToBuffer = useCallback(
    (text, cursorOffset, pastedContents = {}) => {
      const now = Date.now();
      if (pendingPush.current) {
        clearTimeout(pendingPush.current);
        pendingPush.current = null;
      }
      if (now - lastPushTime.current < debounceMs) {
        pendingPush.current = setTimeout(
          pushToBuffer,
          debounceMs,
          text,
          cursorOffset,
          pastedContents
        );
        return;
      }
      lastPushTime.current = now;
      setBuffer((prevBuffer) => {
        const newBuffer = currentIndex >= 0 ? prevBuffer.slice(0, currentIndex + 1) : prevBuffer;
        const lastEntry = newBuffer[newBuffer.length - 1];
        if (lastEntry && lastEntry.text === text) {
          return newBuffer;
        }
        const updatedBuffer = [
          ...newBuffer,
          { text, cursorOffset, pastedContents, timestamp: now }
        ];
        if (updatedBuffer.length > maxBufferSize) {
          return updatedBuffer.slice(-maxBufferSize);
        }
        return updatedBuffer;
      });
      setCurrentIndex((prev) => {
        const newIndex = prev >= 0 ? prev + 1 : buffer.length;
        return Math.min(newIndex, maxBufferSize - 1);
      });
    },
    [debounceMs, maxBufferSize, currentIndex, buffer.length]
  );
  const undo = useCallback(() => {
    if (currentIndex < 0 || buffer.length === 0) {
      return void 0;
    }
    const targetIndex = Math.max(0, currentIndex - 1);
    const entry = buffer[targetIndex];
    if (entry) {
      setCurrentIndex(targetIndex);
      return entry;
    }
    return void 0;
  }, [buffer, currentIndex]);
  const clearBuffer = useCallback(() => {
    setBuffer([]);
    setCurrentIndex(-1);
    lastPushTime.current = 0;
    if (pendingPush.current) {
      clearTimeout(pendingPush.current);
      pendingPush.current = null;
    }
  }, [lastPushTime, pendingPush]);
  const canUndo = currentIndex > 0 && buffer.length > 1;
  return {
    pushToBuffer,
    undo,
    canUndo,
    clearBuffer
  };
}
export {
  useInputBuffer
};
