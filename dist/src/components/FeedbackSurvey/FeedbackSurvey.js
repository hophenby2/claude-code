import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { logEvent } from "../../services/analytics/index.js";
import { Box, Text } from "../../ink.js";
import { FeedbackSurveyView, isValidResponseInput } from "./FeedbackSurveyView.js";
import { TranscriptSharePrompt } from "./TranscriptSharePrompt.js";
import { useDebouncedDigitInput } from "./useDebouncedDigitInput.js";
function FeedbackSurvey(t0) {
  const $ = _c(16);
  const {
    state,
    lastResponse,
    handleSelect,
    handleTranscriptSelect,
    inputValue,
    setInputValue,
    onRequestFeedback,
    message
  } = t0;
  if (state === "closed") {
    return null;
  }
  if (state === "thanks") {
    let t12;
    if ($[0] !== inputValue || $[1] !== lastResponse || $[2] !== onRequestFeedback || $[3] !== setInputValue) {
      t12 = /* @__PURE__ */ jsx(FeedbackSurveyThanks, { lastResponse, inputValue, setInputValue, onRequestFeedback });
      $[0] = inputValue;
      $[1] = lastResponse;
      $[2] = onRequestFeedback;
      $[3] = setInputValue;
      $[4] = t12;
    } else {
      t12 = $[4];
    }
    return t12;
  }
  if (state === "submitted") {
    let t12;
    if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { color: "success", children: [
        "\u2713",
        " Thanks for sharing your transcript!"
      ] }) });
      $[5] = t12;
    } else {
      t12 = $[5];
    }
    return t12;
  }
  if (state === "submitting") {
    let t12;
    if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Sharing transcript",
        "\u2026"
      ] }) });
      $[6] = t12;
    } else {
      t12 = $[6];
    }
    return t12;
  }
  if (state === "transcript_prompt") {
    if (!handleTranscriptSelect) {
      return null;
    }
    if (inputValue && !["1", "2", "3"].includes(inputValue)) {
      return null;
    }
    let t12;
    if ($[7] !== handleTranscriptSelect || $[8] !== inputValue || $[9] !== setInputValue) {
      t12 = /* @__PURE__ */ jsx(TranscriptSharePrompt, { onSelect: handleTranscriptSelect, inputValue, setInputValue });
      $[7] = handleTranscriptSelect;
      $[8] = inputValue;
      $[9] = setInputValue;
      $[10] = t12;
    } else {
      t12 = $[10];
    }
    return t12;
  }
  if (inputValue && !isValidResponseInput(inputValue)) {
    return null;
  }
  let t1;
  if ($[11] !== handleSelect || $[12] !== inputValue || $[13] !== message || $[14] !== setInputValue) {
    t1 = /* @__PURE__ */ jsx(FeedbackSurveyView, { onSelect: handleSelect, inputValue, setInputValue, message });
    $[11] = handleSelect;
    $[12] = inputValue;
    $[13] = message;
    $[14] = setInputValue;
    $[15] = t1;
  } else {
    t1 = $[15];
  }
  return t1;
}
const isFollowUpDigit = (char) => char === "1";
function FeedbackSurveyThanks(t0) {
  const $ = _c(12);
  const {
    lastResponse,
    inputValue,
    setInputValue,
    onRequestFeedback
  } = t0;
  const showFollowUp = onRequestFeedback && lastResponse === "good";
  const t1 = Boolean(showFollowUp);
  let t2;
  if ($[0] !== lastResponse || $[1] !== onRequestFeedback) {
    t2 = () => {
      logEvent("tengu_feedback_survey_event", {
        event_type: "followup_accepted",
        response: lastResponse
      });
      onRequestFeedback?.();
    };
    $[0] = lastResponse;
    $[1] = onRequestFeedback;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== inputValue || $[4] !== setInputValue || $[5] !== t1 || $[6] !== t2) {
    t3 = {
      inputValue,
      setInputValue,
      isValidDigit: isFollowUpDigit,
      enabled: t1,
      once: true,
      onDigit: t2
    };
    $[3] = inputValue;
    $[4] = setInputValue;
    $[5] = t1;
    $[6] = t2;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  useDebouncedDigitInput(t3);
  const feedbackCommand = false ? "/issue" : "/feedback";
  let t4;
  if ($[8] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = /* @__PURE__ */ jsx(Text, { color: "success", children: "Thanks for the feedback!" });
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  let t5;
  if ($[9] !== lastResponse || $[10] !== showFollowUp) {
    t5 = /* @__PURE__ */ jsxs(Box, { marginTop: 1, flexDirection: "column", children: [
      t4,
      showFollowUp ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "(Optional) Press [",
        /* @__PURE__ */ jsx(Text, { color: "ansi:cyan", children: "1" }),
        "] to tell us what went well ",
        " \xB7 ",
        feedbackCommand
      ] }) : lastResponse === "bad" ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Use /issue to report model behavior issues." }) : /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Use ",
        feedbackCommand,
        " to share detailed feedback anytime."
      ] })
    ] });
    $[9] = lastResponse;
    $[10] = showFollowUp;
    $[11] = t5;
  } else {
    t5 = $[11];
  }
  return t5;
}
export {
  FeedbackSurvey
};
