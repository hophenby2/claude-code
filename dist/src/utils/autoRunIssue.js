import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useEffect, useRef } from "react";
import { KeyboardShortcutHint } from "../components/design-system/KeyboardShortcutHint.js";
import { Box, Text } from "../ink.js";
import { useKeybinding } from "../keybindings/useKeybinding.js";
function AutoRunIssueNotification(t0) {
  const $ = _c(8);
  const {
    onRun,
    onCancel,
    reason
  } = t0;
  const hasRunRef = useRef(false);
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = {
      context: "Confirmation"
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  useKeybinding("confirm:no", onCancel, t1);
  let t2;
  let t3;
  if ($[1] !== onRun) {
    t2 = () => {
      if (!hasRunRef.current) {
        hasRunRef.current = true;
        onRun();
      }
    };
    t3 = [onRun];
    $[1] = onRun;
    $[2] = t2;
    $[3] = t3;
  } else {
    t2 = $[2];
    t3 = $[3];
  }
  useEffect(t2, t3);
  let t4;
  if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Running feedback capture..." }) });
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  let t5;
  if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Press ",
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Esc", action: "cancel" }),
      " anytime"
    ] }) });
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  let t6;
  if ($[6] !== reason) {
    t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      t4,
      t5,
      /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Reason: ",
        reason
      ] }) })
    ] });
    $[6] = reason;
    $[7] = t6;
  } else {
    t6 = $[7];
  }
  return t6;
}
function shouldAutoRunIssue(reason) {
  if (true) {
    return false;
  }
  switch (reason) {
    case "feedback_survey_bad":
      return false;
    case "feedback_survey_good":
      return false;
    default:
      return false;
  }
}
function getAutoRunCommand(reason) {
  if (false) {
    return "/good-claude";
  }
  return "/issue";
}
function getAutoRunIssueReasonText(reason) {
  switch (reason) {
    case "feedback_survey_bad":
      return 'You responded "Bad" to the feedback survey';
    case "feedback_survey_good":
      return 'You responded "Good" to the feedback survey';
    default:
      return "Unknown reason";
  }
}
export {
  AutoRunIssueNotification,
  getAutoRunCommand,
  getAutoRunIssueReasonText,
  shouldAutoRunIssue
};
