import { useCallback, useRef } from "react";
import { useTerminalFocus } from "../ink/hooks/use-terminal-focus.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { abortSpeculation } from "../services/PromptSuggestion/speculation.js";
import { useAppState, useSetAppState } from "../state/AppState.js";
function usePromptSuggestion({
  inputValue,
  isAssistantResponding
}) {
  const promptSuggestion = useAppState((s) => s.promptSuggestion);
  const setAppState = useSetAppState();
  const isTerminalFocused = useTerminalFocus();
  const {
    text: suggestionText,
    promptId,
    shownAt,
    acceptedAt,
    generationRequestId
  } = promptSuggestion;
  const suggestion = isAssistantResponding || inputValue.length > 0 ? null : suggestionText;
  const isValidSuggestion = suggestionText && shownAt > 0;
  const firstKeystrokeAt = useRef(0);
  const wasFocusedWhenShown = useRef(true);
  const prevShownAt = useRef(0);
  if (shownAt > 0 && shownAt !== prevShownAt.current) {
    prevShownAt.current = shownAt;
    wasFocusedWhenShown.current = isTerminalFocused;
    firstKeystrokeAt.current = 0;
  } else if (shownAt === 0) {
    prevShownAt.current = 0;
  }
  if (inputValue.length > 0 && firstKeystrokeAt.current === 0 && isValidSuggestion) {
    firstKeystrokeAt.current = Date.now();
  }
  const resetSuggestion = useCallback(() => {
    abortSpeculation(setAppState);
    setAppState((prev) => ({
      ...prev,
      promptSuggestion: {
        text: null,
        promptId: null,
        shownAt: 0,
        acceptedAt: 0,
        generationRequestId: null
      }
    }));
  }, [setAppState]);
  const markAccepted = useCallback(() => {
    if (!isValidSuggestion) return;
    setAppState((prev) => ({
      ...prev,
      promptSuggestion: {
        ...prev.promptSuggestion,
        acceptedAt: Date.now()
      }
    }));
  }, [isValidSuggestion, setAppState]);
  const markShown = useCallback(() => {
    setAppState((prev) => {
      if (prev.promptSuggestion.shownAt !== 0 || !prev.promptSuggestion.text) {
        return prev;
      }
      return {
        ...prev,
        promptSuggestion: {
          ...prev.promptSuggestion,
          shownAt: Date.now()
        }
      };
    });
  }, [setAppState]);
  const logOutcomeAtSubmission = useCallback(
    (finalInput, opts) => {
      if (!isValidSuggestion) return;
      const tabWasPressed = acceptedAt > shownAt;
      const wasAccepted = tabWasPressed || finalInput === suggestionText;
      const timeMs = wasAccepted ? acceptedAt || Date.now() : Date.now();
      logEvent("tengu_prompt_suggestion", {
        source: "cli",
        outcome: wasAccepted ? "accepted" : "ignored",
        prompt_id: promptId,
        ...generationRequestId && {
          generationRequestId
        },
        ...wasAccepted && {
          acceptMethod: tabWasPressed ? "tab" : "enter"
        },
        ...wasAccepted && {
          timeToAcceptMs: timeMs - shownAt
        },
        ...!wasAccepted && {
          timeToIgnoreMs: timeMs - shownAt
        },
        ...firstKeystrokeAt.current > 0 && {
          timeToFirstKeystrokeMs: firstKeystrokeAt.current - shownAt
        },
        wasFocusedWhenShown: wasFocusedWhenShown.current,
        similarity: Math.round(
          finalInput.length / (suggestionText?.length || 1) * 100
        ) / 100,
        ...process.env.USER_TYPE === "ant" && {
          suggestion: suggestionText,
          userInput: finalInput
        }
      });
      if (!opts?.skipReset) resetSuggestion();
    },
    [
      isValidSuggestion,
      acceptedAt,
      shownAt,
      suggestionText,
      promptId,
      generationRequestId,
      resetSuggestion
    ]
  );
  return {
    suggestion,
    markAccepted,
    markShown,
    logOutcomeAtSubmission
  };
}
export {
  usePromptSuggestion
};
