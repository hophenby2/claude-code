import { useState } from "react";
import {
  logEvent
} from "../../services/analytics/index.js";
import { sanitizeToolNameForAnalytics } from "../../services/analytics/metadata.js";
import { useSetAppState } from "../../state/AppState.js";
import { logUnaryPermissionEvent } from "./utils.js";
function useShellPermissionFeedback({
  toolUseConfirm,
  onDone,
  onReject,
  explainerVisible
}) {
  const setAppState = useSetAppState();
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [acceptFeedback, setAcceptFeedback] = useState("");
  const [yesInputMode, setYesInputMode] = useState(false);
  const [noInputMode, setNoInputMode] = useState(false);
  const [focusedOption, setFocusedOption] = useState("yes");
  const [yesFeedbackModeEntered, setYesFeedbackModeEntered] = useState(false);
  const [noFeedbackModeEntered, setNoFeedbackModeEntered] = useState(false);
  function handleInputModeToggle(option) {
    toolUseConfirm.onUserInteraction();
    const analyticsProps = {
      toolName: sanitizeToolNameForAnalytics(
        toolUseConfirm.tool.name
      ),
      isMcp: toolUseConfirm.tool.isMcp ?? false
    };
    if (option === "yes") {
      if (yesInputMode) {
        setYesInputMode(false);
        logEvent("tengu_accept_feedback_mode_collapsed", analyticsProps);
      } else {
        setYesInputMode(true);
        setYesFeedbackModeEntered(true);
        logEvent("tengu_accept_feedback_mode_entered", analyticsProps);
      }
    } else if (option === "no") {
      if (noInputMode) {
        setNoInputMode(false);
        logEvent("tengu_reject_feedback_mode_collapsed", analyticsProps);
      } else {
        setNoInputMode(true);
        setNoFeedbackModeEntered(true);
        logEvent("tengu_reject_feedback_mode_entered", analyticsProps);
      }
    }
  }
  function handleReject(feedback) {
    const trimmedFeedback = feedback?.trim();
    const hasFeedback = !!trimmedFeedback;
    if (!hasFeedback) {
      logEvent("tengu_permission_request_escape", {
        explainer_visible: explainerVisible
      });
      setAppState((prev) => ({
        ...prev,
        attribution: {
          ...prev.attribution,
          escapeCount: prev.attribution.escapeCount + 1
        }
      }));
    }
    logUnaryPermissionEvent(
      "tool_use_single",
      toolUseConfirm,
      "reject",
      hasFeedback
    );
    if (trimmedFeedback) {
      toolUseConfirm.onReject(trimmedFeedback);
    } else {
      toolUseConfirm.onReject();
    }
    onReject();
    onDone();
  }
  function handleFocus(value) {
    if (value !== focusedOption) {
      toolUseConfirm.onUserInteraction();
    }
    if (value !== "yes" && yesInputMode && !acceptFeedback.trim()) {
      setYesInputMode(false);
    }
    if (value !== "no" && noInputMode && !rejectFeedback.trim()) {
      setNoInputMode(false);
    }
    setFocusedOption(value);
  }
  return {
    yesInputMode,
    noInputMode,
    yesFeedbackModeEntered,
    noFeedbackModeEntered,
    acceptFeedback,
    rejectFeedback,
    setAcceptFeedback,
    setRejectFeedback,
    focusedOption,
    handleInputModeToggle,
    handleReject,
    handleFocus
  };
}
export {
  useShellPermissionFeedback
};
