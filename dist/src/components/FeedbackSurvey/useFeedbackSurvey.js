import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDynamicConfig } from "../../hooks/useDynamicConfig.js";
import { isFeedbackSurveyDisabled } from "../../services/analytics/config.js";
import { logEvent } from "../../services/analytics/index.js";
import { isPolicyAllowed } from "../../services/policyLimits/index.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { getLastAssistantMessage } from "../../utils/messages.js";
import { getMainLoopModel } from "../../utils/model/model.js";
import { getInitialSettings } from "../../utils/settings/settings.js";
import { logOTelEvent } from "../../utils/telemetry/events.js";
import { submitTranscriptShare } from "./submitTranscriptShare.js";
import { useSurveyState } from "./useSurveyState.js";
const DEFAULT_FEEDBACK_SURVEY_CONFIG = {
  minTimeBeforeFeedbackMs: 6e5,
  minTimeBetweenFeedbackMs: 36e5,
  minTimeBetweenGlobalFeedbackMs: 1e8,
  minUserTurnsBeforeFeedback: 5,
  minUserTurnsBetweenFeedback: 10,
  hideThanksAfterMs: 3e3,
  onForModels: ["*"],
  probability: 5e-3
};
const DEFAULT_TRANSCRIPT_ASK_CONFIG = {
  probability: 0
};
function useFeedbackSurvey(messages, isLoading, submitCount, surveyType = "session", hasActivePrompt = false) {
  const lastAssistantMessageIdRef = useRef("unknown");
  lastAssistantMessageIdRef.current = getLastAssistantMessage(messages)?.message?.id || "unknown";
  const [feedbackSurvey, setFeedbackSurvey] = useState(() => ({
    timeLastShown: null,
    submitCountAtLastAppearance: null
  }));
  const config = useDynamicConfig("tengu_feedback_survey_config", DEFAULT_FEEDBACK_SURVEY_CONFIG);
  const badTranscriptAskConfig = useDynamicConfig("tengu_bad_survey_transcript_ask_config", DEFAULT_TRANSCRIPT_ASK_CONFIG);
  const goodTranscriptAskConfig = useDynamicConfig("tengu_good_survey_transcript_ask_config", DEFAULT_TRANSCRIPT_ASK_CONFIG);
  const settingsRate = getInitialSettings().feedbackSurveyRate;
  const sessionStartTime = useRef(Date.now());
  const submitCountAtSessionStart = useRef(submitCount);
  const submitCountRef = useRef(submitCount);
  submitCountRef.current = submitCount;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const probabilityPassedRef = useRef(false);
  const lastEligibleSubmitCountRef = useRef(null);
  const updateLastShownTime = useCallback((timestamp, submitCountValue) => {
    setFeedbackSurvey((prev) => {
      if (prev.timeLastShown === timestamp && prev.submitCountAtLastAppearance === submitCountValue) {
        return prev;
      }
      return {
        timeLastShown: timestamp,
        submitCountAtLastAppearance: submitCountValue
      };
    });
    if (getGlobalConfig().feedbackSurveyState?.lastShownTime !== timestamp) {
      saveGlobalConfig((current) => ({
        ...current,
        feedbackSurveyState: {
          lastShownTime: timestamp
        }
      }));
    }
  }, []);
  const onOpen = useCallback((appearanceId) => {
    updateLastShownTime(Date.now(), submitCountRef.current);
    logEvent("tengu_feedback_survey_event", {
      event_type: "appeared",
      appearance_id: appearanceId,
      last_assistant_message_id: lastAssistantMessageIdRef.current,
      survey_type: surveyType
    });
    void logOTelEvent("feedback_survey", {
      event_type: "appeared",
      appearance_id: appearanceId,
      survey_type: surveyType
    });
  }, [updateLastShownTime, surveyType]);
  const onSelect = useCallback((appearanceId_0, selected) => {
    updateLastShownTime(Date.now(), submitCountRef.current);
    logEvent("tengu_feedback_survey_event", {
      event_type: "responded",
      appearance_id: appearanceId_0,
      response: selected,
      last_assistant_message_id: lastAssistantMessageIdRef.current,
      survey_type: surveyType
    });
    void logOTelEvent("feedback_survey", {
      event_type: "responded",
      appearance_id: appearanceId_0,
      response: selected,
      survey_type: surveyType
    });
  }, [updateLastShownTime, surveyType]);
  const shouldShowTranscriptPrompt = useCallback((selected_0) => {
    if (selected_0 !== "bad" && selected_0 !== "good") {
      return false;
    }
    if (getGlobalConfig().transcriptShareDismissed) {
      return false;
    }
    if (!isPolicyAllowed("allow_product_feedback")) {
      return false;
    }
    const probability = selected_0 === "bad" ? badTranscriptAskConfig.probability : goodTranscriptAskConfig.probability;
    return Math.random() <= probability;
  }, [badTranscriptAskConfig.probability, goodTranscriptAskConfig.probability]);
  const onTranscriptPromptShown = useCallback((appearanceId_1, surveyResponse) => {
    const trigger = surveyResponse === "good" ? "good_feedback_survey" : "bad_feedback_survey";
    logEvent("tengu_feedback_survey_event", {
      event_type: "transcript_prompt_appeared",
      appearance_id: appearanceId_1,
      last_assistant_message_id: lastAssistantMessageIdRef.current,
      survey_type: surveyType,
      trigger
    });
    void logOTelEvent("feedback_survey", {
      event_type: "transcript_prompt_appeared",
      appearance_id: appearanceId_1,
      survey_type: surveyType
    });
  }, [surveyType]);
  const onTranscriptSelect = useCallback(async (appearanceId_2, selected_1, surveyResponse_0) => {
    const trigger_0 = surveyResponse_0 === "good" ? "good_feedback_survey" : "bad_feedback_survey";
    logEvent("tengu_feedback_survey_event", {
      event_type: `transcript_share_${selected_1}`,
      appearance_id: appearanceId_2,
      last_assistant_message_id: lastAssistantMessageIdRef.current,
      survey_type: surveyType,
      trigger: trigger_0
    });
    if (selected_1 === "dont_ask_again") {
      saveGlobalConfig((current_0) => ({
        ...current_0,
        transcriptShareDismissed: true
      }));
    }
    if (selected_1 === "yes") {
      const result = await submitTranscriptShare(messagesRef.current, trigger_0, appearanceId_2);
      logEvent("tengu_feedback_survey_event", {
        event_type: result.success ? "transcript_share_submitted" : "transcript_share_failed",
        appearance_id: appearanceId_2,
        trigger: trigger_0
      });
      return result.success;
    }
    return false;
  }, [surveyType]);
  const {
    state,
    lastResponse,
    open,
    handleSelect,
    handleTranscriptSelect
  } = useSurveyState({
    hideThanksAfterMs: config.hideThanksAfterMs,
    onOpen,
    onSelect,
    shouldShowTranscriptPrompt,
    onTranscriptPromptShown,
    onTranscriptSelect
  });
  const currentModel = getMainLoopModel();
  const isModelAllowed = useMemo(() => {
    if (config.onForModels.length === 0) {
      return false;
    }
    if (config.onForModels.includes("*")) {
      return true;
    }
    return config.onForModels.includes(currentModel);
  }, [config.onForModels, currentModel]);
  const shouldOpen = useMemo(() => {
    if (state !== "closed") {
      return false;
    }
    if (isLoading) {
      return false;
    }
    if (hasActivePrompt) {
      return false;
    }
    if (process.env.CLAUDE_FORCE_DISPLAY_SURVEY && !feedbackSurvey.timeLastShown) {
      return true;
    }
    if (!isModelAllowed) {
      return false;
    }
    if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY)) {
      return false;
    }
    if (isFeedbackSurveyDisabled()) {
      return false;
    }
    if (!isPolicyAllowed("allow_product_feedback")) {
      return false;
    }
    if (feedbackSurvey.timeLastShown) {
      const timeSinceLastShown = Date.now() - feedbackSurvey.timeLastShown;
      if (timeSinceLastShown < config.minTimeBetweenFeedbackMs) {
        return false;
      }
      if (feedbackSurvey.submitCountAtLastAppearance !== null && submitCount < feedbackSurvey.submitCountAtLastAppearance + config.minUserTurnsBetweenFeedback) {
        return false;
      }
    } else {
      const timeSinceSessionStart = Date.now() - sessionStartTime.current;
      if (timeSinceSessionStart < config.minTimeBeforeFeedbackMs) {
        return false;
      }
      if (submitCount < submitCountAtSessionStart.current + config.minUserTurnsBeforeFeedback) {
        return false;
      }
    }
    if (lastEligibleSubmitCountRef.current !== submitCount) {
      lastEligibleSubmitCountRef.current = submitCount;
      probabilityPassedRef.current = Math.random() <= (settingsRate ?? config.probability);
    }
    if (!probabilityPassedRef.current) {
      return false;
    }
    const globalFeedbackState = getGlobalConfig().feedbackSurveyState;
    if (globalFeedbackState?.lastShownTime) {
      const timeSinceGlobalLastShown = Date.now() - globalFeedbackState.lastShownTime;
      if (timeSinceGlobalLastShown < config.minTimeBetweenGlobalFeedbackMs) {
        return false;
      }
    }
    return true;
  }, [state, isLoading, hasActivePrompt, isModelAllowed, feedbackSurvey.timeLastShown, feedbackSurvey.submitCountAtLastAppearance, submitCount, config.minTimeBetweenFeedbackMs, config.minTimeBetweenGlobalFeedbackMs, config.minUserTurnsBetweenFeedback, config.minTimeBeforeFeedbackMs, config.minUserTurnsBeforeFeedback, config.probability, settingsRate]);
  useEffect(() => {
    if (shouldOpen) {
      open();
    }
  }, [shouldOpen, open]);
  return {
    state,
    lastResponse,
    handleSelect,
    handleTranscriptSelect
  };
}
export {
  useFeedbackSurvey
};
