import { randomUUID } from "crypto";
import { useCallback, useRef, useState } from "react";
function useSurveyState({
  hideThanksAfterMs,
  onOpen,
  onSelect,
  shouldShowTranscriptPrompt,
  onTranscriptPromptShown,
  onTranscriptSelect
}) {
  const [state, setState] = useState("closed");
  const [lastResponse, setLastResponse] = useState(null);
  const appearanceId = useRef(randomUUID());
  const lastResponseRef = useRef(null);
  const showThanksThenClose = useCallback(() => {
    setState("thanks");
    setTimeout((setState_0, setLastResponse_0) => {
      setState_0("closed");
      setLastResponse_0(null);
    }, hideThanksAfterMs, setState, setLastResponse);
  }, [hideThanksAfterMs]);
  const showSubmittedThenClose = useCallback(() => {
    setState("submitted");
    setTimeout(setState, hideThanksAfterMs, "closed");
  }, [hideThanksAfterMs]);
  const open = useCallback(() => {
    if (state !== "closed") {
      return;
    }
    setState("open");
    appearanceId.current = randomUUID();
    void onOpen(appearanceId.current);
  }, [state, onOpen]);
  const handleSelect = useCallback((selected) => {
    setLastResponse(selected);
    lastResponseRef.current = selected;
    void onSelect(appearanceId.current, selected);
    if (selected === "dismissed") {
      setState("closed");
      setLastResponse(null);
    } else if (shouldShowTranscriptPrompt?.(selected)) {
      setState("transcript_prompt");
      onTranscriptPromptShown?.(appearanceId.current, selected);
      return true;
    } else {
      showThanksThenClose();
    }
    return false;
  }, [showThanksThenClose, onSelect, shouldShowTranscriptPrompt, onTranscriptPromptShown]);
  const handleTranscriptSelect = useCallback((selected_0) => {
    switch (selected_0) {
      case "yes":
        setState("submitting");
        void (async () => {
          try {
            const success = await onTranscriptSelect?.(appearanceId.current, selected_0, lastResponseRef.current);
            if (success) {
              showSubmittedThenClose();
            } else {
              showThanksThenClose();
            }
          } catch {
            showThanksThenClose();
          }
        })();
        break;
      case "no":
      case "dont_ask_again":
        void onTranscriptSelect?.(appearanceId.current, selected_0, lastResponseRef.current);
        showThanksThenClose();
        break;
    }
  }, [showThanksThenClose, showSubmittedThenClose, onTranscriptSelect]);
  return {
    state,
    lastResponse,
    open,
    handleSelect,
    handleTranscriptSelect
  };
}
export {
  useSurveyState
};
