import { jsx } from "react/jsx-runtime";
import { useCallback, useRef, useState } from "react";
import { getModeFromInput } from "../components/PromptInput/inputModes.js";
import { useNotifications } from "../context/notifications.js";
import { ConfigurableShortcutHint } from "../components/ConfigurableShortcutHint.js";
import { FOOTER_TEMPORARY_STATUS_TIMEOUT } from "../components/PromptInput/Notifications.js";
import { getHistory } from "../history.js";
import { Text } from "../ink.js";
const HISTORY_CHUNK_SIZE = 10;
let pendingLoad = null;
let pendingLoadTarget = 0;
let pendingLoadModeFilter = void 0;
async function loadHistoryEntries(minCount, modeFilter) {
  const target = Math.ceil(minCount / HISTORY_CHUNK_SIZE) * HISTORY_CHUNK_SIZE;
  if (pendingLoad && pendingLoadTarget >= target && pendingLoadModeFilter === modeFilter) {
    return pendingLoad;
  }
  if (pendingLoad) {
    await pendingLoad;
  }
  pendingLoadTarget = target;
  pendingLoadModeFilter = modeFilter;
  pendingLoad = (async () => {
    const entries = [];
    let loaded = 0;
    for await (const entry of getHistory()) {
      if (modeFilter) {
        const entryMode = getModeFromInput(entry.display);
        if (entryMode !== modeFilter) {
          continue;
        }
      }
      entries.push(entry);
      loaded++;
      if (loaded >= pendingLoadTarget) break;
    }
    return entries;
  })();
  try {
    return await pendingLoad;
  } finally {
    pendingLoad = null;
    pendingLoadTarget = 0;
    pendingLoadModeFilter = void 0;
  }
}
function useArrowKeyHistory(onSetInput, currentInput, pastedContents, setCursorOffset, currentMode) {
  const [historyIndex, setHistoryIndex] = useState(0);
  const [lastShownHistoryEntry, setLastShownHistoryEntry] = useState(void 0);
  const hasShownSearchHintRef = useRef(false);
  const {
    addNotification,
    removeNotification
  } = useNotifications();
  const historyCache = useRef([]);
  const historyCacheModeFilter = useRef(void 0);
  const historyIndexRef = useRef(0);
  const initialModeFilterRef = useRef(void 0);
  const currentInputRef = useRef(currentInput);
  const pastedContentsRef = useRef(pastedContents);
  const currentModeRef = useRef(currentMode);
  currentInputRef.current = currentInput;
  pastedContentsRef.current = pastedContents;
  currentModeRef.current = currentMode;
  const setInputWithCursor = useCallback((value, mode, contents, cursorToStart = false) => {
    onSetInput(value, mode, contents);
    setCursorOffset?.(cursorToStart ? 0 : value.length);
  }, [onSetInput, setCursorOffset]);
  const updateInput = useCallback((input, cursorToStart_0 = false) => {
    if (!input || !input.display) return;
    const mode_0 = getModeFromInput(input.display);
    const value_0 = mode_0 === "bash" ? input.display.slice(1) : input.display;
    setInputWithCursor(value_0, mode_0, input.pastedContents ?? {}, cursorToStart_0);
  }, [setInputWithCursor]);
  const showSearchHint = useCallback(() => {
    addNotification({
      key: "search-history-hint",
      jsx: /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "history:search", context: "Global", fallback: "ctrl+r", description: "search history" }) }),
      priority: "immediate",
      timeoutMs: FOOTER_TEMPORARY_STATUS_TIMEOUT
    });
  }, [addNotification]);
  const onHistoryUp = useCallback(() => {
    const targetIndex = historyIndexRef.current;
    historyIndexRef.current++;
    const inputAtPress = currentInputRef.current;
    const pastedContentsAtPress = pastedContentsRef.current;
    const modeAtPress = currentModeRef.current;
    if (targetIndex === 0) {
      initialModeFilterRef.current = modeAtPress === "bash" ? modeAtPress : void 0;
      const hasInput = inputAtPress.trim() !== "";
      setLastShownHistoryEntry(hasInput ? {
        display: inputAtPress,
        pastedContents: pastedContentsAtPress,
        mode: modeAtPress
      } : void 0);
    }
    const modeFilter = initialModeFilterRef.current;
    void (async () => {
      const neededCount = targetIndex + 1;
      if (historyCacheModeFilter.current !== modeFilter) {
        historyCache.current = [];
        historyCacheModeFilter.current = modeFilter;
        historyIndexRef.current = 0;
      }
      if (historyCache.current.length < neededCount) {
        const entries = await loadHistoryEntries(neededCount, modeFilter);
        if (entries.length > historyCache.current.length) {
          historyCache.current = entries;
        }
      }
      if (targetIndex >= historyCache.current.length) {
        historyIndexRef.current--;
        return;
      }
      const newIndex = targetIndex + 1;
      setHistoryIndex(newIndex);
      updateInput(historyCache.current[targetIndex], true);
      if (newIndex >= 2 && !hasShownSearchHintRef.current) {
        hasShownSearchHintRef.current = true;
        showSearchHint();
      }
    })();
  }, [updateInput, showSearchHint]);
  const onHistoryDown = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    if (currentIndex > 1) {
      historyIndexRef.current--;
      setHistoryIndex(currentIndex - 1);
      updateInput(historyCache.current[currentIndex - 2]);
    } else if (currentIndex === 1) {
      historyIndexRef.current = 0;
      setHistoryIndex(0);
      if (lastShownHistoryEntry) {
        const savedMode = lastShownHistoryEntry.mode;
        if (savedMode) {
          setInputWithCursor(lastShownHistoryEntry.display, savedMode, lastShownHistoryEntry.pastedContents ?? {});
        } else {
          updateInput(lastShownHistoryEntry);
        }
      } else {
        setInputWithCursor("", initialModeFilterRef.current ?? "prompt", {});
      }
    }
    return currentIndex <= 0;
  }, [lastShownHistoryEntry, updateInput, setInputWithCursor]);
  const resetHistory = useCallback(() => {
    setLastShownHistoryEntry(void 0);
    setHistoryIndex(0);
    historyIndexRef.current = 0;
    initialModeFilterRef.current = void 0;
    removeNotification("search-history-hint");
    historyCache.current = [];
    historyCacheModeFilter.current = void 0;
  }, [removeNotification]);
  const dismissSearchHint = useCallback(() => {
    removeNotification("search-history-hint");
  }, [removeNotification]);
  return {
    historyIndex,
    setHistoryIndex,
    onHistoryUp,
    onHistoryDown,
    resetHistory,
    dismissSearchHint
  };
}
export {
  useArrowKeyHistory
};
