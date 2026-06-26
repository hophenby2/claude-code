const feature = (_name) => false;
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getModeFromInput,
  getValueFromInput
} from "../components/PromptInput/inputModes.js";
import { makeHistoryReader } from "../history.js";
import { KeyboardEvent } from "../ink/events/keyboard-event.js";
import { useInput } from "../ink.js";
import { useKeybinding, useKeybindings } from "../keybindings/useKeybinding.js";
function useHistorySearch(onAcceptHistory, currentInput, onInputChange, onCursorChange, currentCursorOffset, onModeChange, currentMode, isSearching, setIsSearching, setPastedContents, currentPastedContents) {
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFailedMatch, setHistoryFailedMatch] = useState(false);
  const [originalInput, setOriginalInput] = useState("");
  const [originalCursorOffset, setOriginalCursorOffset] = useState(0);
  const [originalMode, setOriginalMode] = useState("prompt");
  const [originalPastedContents, setOriginalPastedContents] = useState({});
  const [historyMatch, setHistoryMatch] = useState(
    void 0
  );
  const historyReader = useRef(
    void 0
  );
  const seenPrompts = useRef(/* @__PURE__ */ new Set());
  const searchAbortController = useRef(null);
  const closeHistoryReader = useCallback(() => {
    if (historyReader.current) {
      void historyReader.current.return(void 0);
      historyReader.current = void 0;
    }
  }, []);
  const reset = useCallback(() => {
    setIsSearching(false);
    setHistoryQuery("");
    setHistoryFailedMatch(false);
    setOriginalInput("");
    setOriginalCursorOffset(0);
    setOriginalMode("prompt");
    setOriginalPastedContents({});
    setHistoryMatch(void 0);
    closeHistoryReader();
    seenPrompts.current.clear();
  }, [setIsSearching, closeHistoryReader]);
  const searchHistory = useCallback(
    async (resume, signal) => {
      if (!isSearching) {
        return;
      }
      if (historyQuery.length === 0) {
        closeHistoryReader();
        seenPrompts.current.clear();
        setHistoryMatch(void 0);
        setHistoryFailedMatch(false);
        onInputChange(originalInput);
        onCursorChange(originalCursorOffset);
        onModeChange(originalMode);
        setPastedContents(originalPastedContents);
        return;
      }
      if (!resume) {
        closeHistoryReader();
        historyReader.current = makeHistoryReader();
        seenPrompts.current.clear();
      }
      if (!historyReader.current) {
        return;
      }
      while (true) {
        if (signal?.aborted) {
          return;
        }
        const item = await historyReader.current.next();
        if (item.done) {
          setHistoryFailedMatch(true);
          return;
        }
        const display = item.value.display;
        const matchPosition = display.lastIndexOf(historyQuery);
        if (matchPosition !== -1 && !seenPrompts.current.has(display)) {
          seenPrompts.current.add(display);
          setHistoryMatch(item.value);
          setHistoryFailedMatch(false);
          const mode = getModeFromInput(display);
          onModeChange(mode);
          onInputChange(display);
          setPastedContents(item.value.pastedContents);
          const value = getValueFromInput(display);
          const cleanMatchPosition = value.lastIndexOf(historyQuery);
          onCursorChange(
            cleanMatchPosition !== -1 ? cleanMatchPosition : matchPosition
          );
          return;
        }
      }
    },
    [
      isSearching,
      historyQuery,
      closeHistoryReader,
      onInputChange,
      onCursorChange,
      onModeChange,
      setPastedContents,
      originalInput,
      originalCursorOffset,
      originalMode,
      originalPastedContents
    ]
  );
  const handleStartSearch = useCallback(() => {
    setIsSearching(true);
    setOriginalInput(currentInput);
    setOriginalCursorOffset(currentCursorOffset);
    setOriginalMode(currentMode);
    setOriginalPastedContents(currentPastedContents);
    historyReader.current = makeHistoryReader();
    seenPrompts.current.clear();
  }, [
    setIsSearching,
    currentInput,
    currentCursorOffset,
    currentMode,
    currentPastedContents
  ]);
  const handleNextMatch = useCallback(() => {
    void searchHistory(true);
  }, [searchHistory]);
  const handleAccept = useCallback(() => {
    if (historyMatch) {
      const mode = getModeFromInput(historyMatch.display);
      const value = getValueFromInput(historyMatch.display);
      onInputChange(value);
      onModeChange(mode);
      setPastedContents(historyMatch.pastedContents);
    } else {
      setPastedContents(originalPastedContents);
    }
    reset();
  }, [
    historyMatch,
    onInputChange,
    onModeChange,
    setPastedContents,
    originalPastedContents,
    reset
  ]);
  const handleCancel = useCallback(() => {
    onInputChange(originalInput);
    onCursorChange(originalCursorOffset);
    setPastedContents(originalPastedContents);
    reset();
  }, [
    onInputChange,
    onCursorChange,
    setPastedContents,
    originalInput,
    originalCursorOffset,
    originalPastedContents,
    reset
  ]);
  const handleExecute = useCallback(() => {
    if (historyQuery.length === 0) {
      onAcceptHistory({
        display: originalInput,
        pastedContents: originalPastedContents
      });
    } else if (historyMatch) {
      const mode = getModeFromInput(historyMatch.display);
      const value = getValueFromInput(historyMatch.display);
      onModeChange(mode);
      onAcceptHistory({
        display: value,
        pastedContents: historyMatch.pastedContents
      });
    }
    reset();
  }, [
    historyQuery,
    historyMatch,
    onAcceptHistory,
    onModeChange,
    originalInput,
    originalPastedContents,
    reset
  ]);
  useKeybinding("history:search", handleStartSearch, {
    context: "Global",
    isActive: false ? false : !isSearching
  });
  const historySearchHandlers = useMemo(
    () => ({
      "historySearch:next": handleNextMatch,
      "historySearch:accept": handleAccept,
      "historySearch:cancel": handleCancel,
      "historySearch:execute": handleExecute
    }),
    [handleNextMatch, handleAccept, handleCancel, handleExecute]
  );
  useKeybindings(historySearchHandlers, {
    context: "HistorySearch",
    isActive: isSearching
  });
  const handleKeyDown = (e) => {
    if (!isSearching) return;
    if (e.key === "backspace" && historyQuery === "") {
      e.preventDefault();
      handleCancel();
    }
  };
  useInput(
    (_input, _key, event) => {
      handleKeyDown(new KeyboardEvent(event.keypress));
    },
    { isActive: isSearching }
  );
  const searchHistoryRef = useRef(searchHistory);
  searchHistoryRef.current = searchHistory;
  useEffect(() => {
    searchAbortController.current?.abort();
    const controller = new AbortController();
    searchAbortController.current = controller;
    void searchHistoryRef.current(false, controller.signal);
    return () => {
      controller.abort();
    };
  }, [historyQuery]);
  return {
    historyQuery,
    setHistoryQuery,
    historyMatch,
    historyFailedMatch,
    handleKeyDown
  };
}
export {
  useHistorySearch
};
