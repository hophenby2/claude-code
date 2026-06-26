import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../../ink.js";
const feature = (_name) => false;
import { useState } from "react";
import sample from "lodash-es/sample.js";
import { BLACK_CIRCLE, REFERENCE_MARK, TEARDROP_ASTERISK } from "../../constants/figures.js";
import figures from "figures";
import { basename } from "path";
import { MessageResponse } from "../MessageResponse.js";
import { FilePathLink } from "../FilePathLink.js";
import { openPath } from "../../utils/browser.js";
const teamMemSaved = false ? require2("./teamMemSaved.js") : null;
import { TURN_COMPLETION_VERBS } from "../../constants/turnCompletionVerbs.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { SystemAPIErrorMessage } from "./SystemAPIErrorMessage.js";
import { formatDuration, formatNumber } from "../../utils/format.js";
import { getGlobalConfig } from "../../utils/config.js";
import Link from "../../ink/components/Link.js";
import ThemedText from "../design-system/ThemedText.js";
import { CtrlOToExpand } from "../CtrlOToExpand.js";
import { useAppStateStore } from "../../state/AppState.js";
import { isBackgroundTask } from "../../tasks/types.js";
import { getPillLabel } from "../../tasks/pillLabel.js";
import { useSelectedMessageBg } from "../messageActions.js";
function SystemTextMessage(t0) {
  const $ = _c(51);
  const {
    message,
    addMargin,
    verbose,
    isTranscriptMode
  } = t0;
  const bg = useSelectedMessageBg();
  if (message.subtype === "turn_duration") {
    let t12;
    if ($[0] !== addMargin || $[1] !== message) {
      t12 = /* @__PURE__ */ jsx(TurnDurationMessage, { message, addMargin });
      $[0] = addMargin;
      $[1] = message;
      $[2] = t12;
    } else {
      t12 = $[2];
    }
    return t12;
  }
  if (message.subtype === "memory_saved") {
    let t12;
    if ($[3] !== addMargin || $[4] !== message) {
      t12 = /* @__PURE__ */ jsx(MemorySavedMessage, { message, addMargin });
      $[3] = addMargin;
      $[4] = message;
      $[5] = t12;
    } else {
      t12 = $[5];
    }
    return t12;
  }
  if (message.subtype === "away_summary") {
    const t12 = addMargin ? 1 : 0;
    let t22;
    if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t22 = /* @__PURE__ */ jsx(Box, { minWidth: 2, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: REFERENCE_MARK }) });
      $[6] = t22;
    } else {
      t22 = $[6];
    }
    let t32;
    if ($[7] !== message.content) {
      t32 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: message.content });
      $[7] = message.content;
      $[8] = t32;
    } else {
      t32 = $[8];
    }
    let t42;
    if ($[9] !== bg || $[10] !== t12 || $[11] !== t32) {
      t42 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: t12, backgroundColor: bg, width: "100%", children: [
        t22,
        t32
      ] });
      $[9] = bg;
      $[10] = t12;
      $[11] = t32;
      $[12] = t42;
    } else {
      t42 = $[12];
    }
    return t42;
  }
  if (message.subtype === "agents_killed") {
    const t12 = addMargin ? 1 : 0;
    let t22;
    let t32;
    if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t22 = /* @__PURE__ */ jsx(Box, { minWidth: 2, children: /* @__PURE__ */ jsx(Text, { color: "error", children: BLACK_CIRCLE }) });
      t32 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "All background agents stopped" });
      $[13] = t22;
      $[14] = t32;
    } else {
      t22 = $[13];
      t32 = $[14];
    }
    let t42;
    if ($[15] !== bg || $[16] !== t12) {
      t42 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: t12, backgroundColor: bg, width: "100%", children: [
        t22,
        t32
      ] });
      $[15] = bg;
      $[16] = t12;
      $[17] = t42;
    } else {
      t42 = $[17];
    }
    return t42;
  }
  if (message.subtype === "thinking") {
    return null;
  }
  if (message.subtype === "bridge_status") {
    let t12;
    if ($[18] !== addMargin || $[19] !== message) {
      t12 = /* @__PURE__ */ jsx(BridgeStatusMessage, { message, addMargin });
      $[18] = addMargin;
      $[19] = message;
      $[20] = t12;
    } else {
      t12 = $[20];
    }
    return t12;
  }
  if (message.subtype === "scheduled_task_fire") {
    const t12 = addMargin ? 1 : 0;
    let t22;
    if ($[21] !== message.content) {
      t22 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        TEARDROP_ASTERISK,
        " ",
        message.content
      ] });
      $[21] = message.content;
      $[22] = t22;
    } else {
      t22 = $[22];
    }
    let t32;
    if ($[23] !== bg || $[24] !== t12 || $[25] !== t22) {
      t32 = /* @__PURE__ */ jsx(Box, { marginTop: t12, backgroundColor: bg, width: "100%", children: t22 });
      $[23] = bg;
      $[24] = t12;
      $[25] = t22;
      $[26] = t32;
    } else {
      t32 = $[26];
    }
    return t32;
  }
  if (message.subtype === "permission_retry") {
    const t12 = addMargin ? 1 : 0;
    let t22;
    let t32;
    if ($[27] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t22 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        TEARDROP_ASTERISK,
        " "
      ] });
      t32 = /* @__PURE__ */ jsx(Text, { children: "Allowed " });
      $[27] = t22;
      $[28] = t32;
    } else {
      t22 = $[27];
      t32 = $[28];
    }
    let t42;
    if ($[29] !== message.commands) {
      t42 = message.commands.join(", ");
      $[29] = message.commands;
      $[30] = t42;
    } else {
      t42 = $[30];
    }
    let t5;
    if ($[31] !== t42) {
      t5 = /* @__PURE__ */ jsx(Text, { bold: true, children: t42 });
      $[31] = t42;
      $[32] = t5;
    } else {
      t5 = $[32];
    }
    let t6;
    if ($[33] !== bg || $[34] !== t12 || $[35] !== t5) {
      t6 = /* @__PURE__ */ jsxs(Box, { marginTop: t12, backgroundColor: bg, width: "100%", children: [
        t22,
        t32,
        t5
      ] });
      $[33] = bg;
      $[34] = t12;
      $[35] = t5;
      $[36] = t6;
    } else {
      t6 = $[36];
    }
    return t6;
  }
  const isStopHookSummary = message.subtype === "stop_hook_summary";
  if (!isStopHookSummary && !verbose && message.level === "info") {
    return null;
  }
  if (message.subtype === "api_error") {
    let t12;
    if ($[37] !== message || $[38] !== verbose) {
      t12 = /* @__PURE__ */ jsx(SystemAPIErrorMessage, { message, verbose });
      $[37] = message;
      $[38] = verbose;
      $[39] = t12;
    } else {
      t12 = $[39];
    }
    return t12;
  }
  if (message.subtype === "stop_hook_summary") {
    let t12;
    if ($[40] !== addMargin || $[41] !== isTranscriptMode || $[42] !== message || $[43] !== verbose) {
      t12 = /* @__PURE__ */ jsx(StopHookSummaryMessage, { message, addMargin, verbose, isTranscriptMode });
      $[40] = addMargin;
      $[41] = isTranscriptMode;
      $[42] = message;
      $[43] = verbose;
      $[44] = t12;
    } else {
      t12 = $[44];
    }
    return t12;
  }
  const content = message.content;
  if (typeof content !== "string") {
    return null;
  }
  const t1 = message.level !== "info";
  const t2 = message.level === "warning" ? "warning" : void 0;
  const t3 = message.level === "info";
  let t4;
  if ($[45] !== addMargin || $[46] !== content || $[47] !== t1 || $[48] !== t2 || $[49] !== t3) {
    t4 = /* @__PURE__ */ jsx(Box, { flexDirection: "row", width: "100%", children: /* @__PURE__ */ jsx(SystemTextMessageInner, { content, addMargin, dot: t1, color: t2, dimColor: t3 }) });
    $[45] = addMargin;
    $[46] = content;
    $[47] = t1;
    $[48] = t2;
    $[49] = t3;
    $[50] = t4;
  } else {
    t4 = $[50];
  }
  return t4;
}
function StopHookSummaryMessage(t0) {
  const $ = _c(47);
  const {
    message,
    addMargin,
    verbose,
    isTranscriptMode
  } = t0;
  const bg = useSelectedMessageBg();
  const {
    hookCount,
    hookInfos,
    hookErrors,
    preventedContinuation,
    stopReason
  } = message;
  const {
    columns
  } = useTerminalSize();
  let t1;
  if ($[0] !== hookInfos || $[1] !== message.totalDurationMs) {
    t1 = message.totalDurationMs ?? hookInfos.reduce(_temp, 0);
    $[0] = hookInfos;
    $[1] = message.totalDurationMs;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const totalDurationMs = t1;
  if (hookErrors.length === 0 && !preventedContinuation && !message.hookLabel) {
    if (true) {
      return null;
    }
  }
  let t2;
  if ($[3] !== totalDurationMs) {
    t2 = false ? ` (${formatSecondsShort(totalDurationMs)})` : "";
    $[3] = totalDurationMs;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  const totalStr = t2;
  if (message.hookLabel) {
    const t32 = hookCount === 1 ? "hook" : "hooks";
    let t42;
    if ($[5] !== hookCount || $[6] !== message.hookLabel || $[7] !== t32 || $[8] !== totalStr) {
      t42 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "  \u23BF  ",
        "Ran ",
        hookCount,
        " ",
        message.hookLabel,
        " ",
        t32,
        totalStr
      ] });
      $[5] = hookCount;
      $[6] = message.hookLabel;
      $[7] = t32;
      $[8] = totalStr;
      $[9] = t42;
    } else {
      t42 = $[9];
    }
    let t52;
    if ($[10] !== hookInfos || $[11] !== isTranscriptMode) {
      t52 = isTranscriptMode && hookInfos.map(_temp2);
      $[10] = hookInfos;
      $[11] = isTranscriptMode;
      $[12] = t52;
    } else {
      t52 = $[12];
    }
    let t62;
    if ($[13] !== t42 || $[14] !== t52) {
      t62 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: "100%", children: [
        t42,
        t52
      ] });
      $[13] = t42;
      $[14] = t52;
      $[15] = t62;
    } else {
      t62 = $[15];
    }
    return t62;
  }
  const t3 = addMargin ? 1 : 0;
  let t4;
  if ($[16] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = /* @__PURE__ */ jsx(Box, { minWidth: 2, children: /* @__PURE__ */ jsx(Text, { children: BLACK_CIRCLE }) });
    $[16] = t4;
  } else {
    t4 = $[16];
  }
  const t5 = columns - 10;
  let t6;
  if ($[17] !== hookCount) {
    t6 = /* @__PURE__ */ jsx(Text, { bold: true, children: hookCount });
    $[17] = hookCount;
    $[18] = t6;
  } else {
    t6 = $[18];
  }
  const t7 = message.hookLabel ?? "stop";
  const t8 = hookCount === 1 ? "hook" : "hooks";
  let t9;
  if ($[19] !== hookInfos || $[20] !== verbose) {
    t9 = !verbose && hookInfos.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      " ",
      /* @__PURE__ */ jsx(CtrlOToExpand, {})
    ] });
    $[19] = hookInfos;
    $[20] = verbose;
    $[21] = t9;
  } else {
    t9 = $[21];
  }
  let t10;
  if ($[22] !== t6 || $[23] !== t7 || $[24] !== t8 || $[25] !== t9 || $[26] !== totalStr) {
    t10 = /* @__PURE__ */ jsxs(Text, { children: [
      "Ran ",
      t6,
      " ",
      t7,
      " ",
      t8,
      totalStr,
      t9
    ] });
    $[22] = t6;
    $[23] = t7;
    $[24] = t8;
    $[25] = t9;
    $[26] = totalStr;
    $[27] = t10;
  } else {
    t10 = $[27];
  }
  let t11;
  if ($[28] !== hookInfos || $[29] !== verbose) {
    t11 = verbose && hookInfos.length > 0 && hookInfos.map(_temp3);
    $[28] = hookInfos;
    $[29] = verbose;
    $[30] = t11;
  } else {
    t11 = $[30];
  }
  let t12;
  if ($[31] !== preventedContinuation || $[32] !== stopReason) {
    t12 = preventedContinuation && stopReason && /* @__PURE__ */ jsxs(Text, { children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\u23BF \xA0" }),
      stopReason
    ] });
    $[31] = preventedContinuation;
    $[32] = stopReason;
    $[33] = t12;
  } else {
    t12 = $[33];
  }
  let t13;
  if ($[34] !== hookErrors || $[35] !== message.hookLabel) {
    t13 = hookErrors.length > 0 && hookErrors.map((err, idx_1) => /* @__PURE__ */ jsxs(Text, { children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\u23BF \xA0" }),
      message.hookLabel ?? "Stop",
      " hook error: ",
      err
    ] }, idx_1));
    $[34] = hookErrors;
    $[35] = message.hookLabel;
    $[36] = t13;
  } else {
    t13 = $[36];
  }
  let t14;
  if ($[37] !== t10 || $[38] !== t11 || $[39] !== t12 || $[40] !== t13 || $[41] !== t5) {
    t14 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: t5, children: [
      t10,
      t11,
      t12,
      t13
    ] });
    $[37] = t10;
    $[38] = t11;
    $[39] = t12;
    $[40] = t13;
    $[41] = t5;
    $[42] = t14;
  } else {
    t14 = $[42];
  }
  let t15;
  if ($[43] !== bg || $[44] !== t14 || $[45] !== t3) {
    t15 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: t3, backgroundColor: bg, width: "100%", children: [
      t4,
      t14
    ] });
    $[43] = bg;
    $[44] = t14;
    $[45] = t3;
    $[46] = t15;
  } else {
    t15 = $[46];
  }
  return t15;
}
function _temp3(info_0, idx_0) {
  const durationStr_0 = false ? ` (${formatSecondsShort(info_0.durationMs)})` : "";
  return /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
    "\u23BF \xA0",
    info_0.command === "prompt" ? `prompt: ${info_0.promptText || ""}` : info_0.command,
    durationStr_0
  ] }, `cmd-${idx_0}`);
}
function _temp2(info, idx) {
  const durationStr = false ? ` (${formatSecondsShort(info.durationMs)})` : "";
  return /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
    "     \u23BF ",
    info.command === "prompt" ? `prompt: ${info.promptText || ""}` : info.command,
    durationStr
  ] }, `cmd-${idx}`);
}
function _temp(sum, h) {
  return sum + (h.durationMs ?? 0);
}
function SystemTextMessageInner(t0) {
  const $ = _c(18);
  const {
    content,
    addMargin,
    dot,
    color,
    dimColor
  } = t0;
  const {
    columns
  } = useTerminalSize();
  const bg = useSelectedMessageBg();
  const t1 = addMargin ? 1 : 0;
  let t2;
  if ($[0] !== color || $[1] !== dimColor || $[2] !== dot) {
    t2 = dot && /* @__PURE__ */ jsx(Box, { minWidth: 2, children: /* @__PURE__ */ jsx(Text, { color, dimColor, children: BLACK_CIRCLE }) });
    $[0] = color;
    $[1] = dimColor;
    $[2] = dot;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const t3 = columns - 10;
  let t4;
  if ($[4] !== content) {
    t4 = content.trim();
    $[4] = content;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  let t5;
  if ($[6] !== color || $[7] !== dimColor || $[8] !== t4) {
    t5 = /* @__PURE__ */ jsx(Text, { color, dimColor, wrap: "wrap", children: t4 });
    $[6] = color;
    $[7] = dimColor;
    $[8] = t4;
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  let t6;
  if ($[10] !== t3 || $[11] !== t5) {
    t6 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: t3, children: t5 });
    $[10] = t3;
    $[11] = t5;
    $[12] = t6;
  } else {
    t6 = $[12];
  }
  let t7;
  if ($[13] !== bg || $[14] !== t1 || $[15] !== t2 || $[16] !== t6) {
    t7 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: t1, backgroundColor: bg, width: "100%", children: [
      t2,
      t6
    ] });
    $[13] = bg;
    $[14] = t1;
    $[15] = t2;
    $[16] = t6;
    $[17] = t7;
  } else {
    t7 = $[17];
  }
  return t7;
}
function TurnDurationMessage(t0) {
  const $ = _c(17);
  const {
    message,
    addMargin
  } = t0;
  const bg = useSelectedMessageBg();
  const [verb] = useState(_temp4);
  const store = useAppStateStore();
  let t1;
  if ($[0] !== store) {
    t1 = () => {
      const tasks = store.getState().tasks;
      const running = Object.values(tasks ?? {}).filter(isBackgroundTask);
      return running.length > 0 ? getPillLabel(running) : null;
    };
    $[0] = store;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const [backgroundTaskSummary] = useState(t1);
  let t2;
  if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = getGlobalConfig().showTurnDuration ?? true;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const showTurnDuration = t2;
  let t3;
  if ($[3] !== message.durationMs) {
    t3 = formatDuration(message.durationMs);
    $[3] = message.durationMs;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  const duration = t3;
  const hasBudget = message.budgetLimit !== void 0;
  let t4;
  bb0: {
    if (!hasBudget) {
      t4 = "";
      break bb0;
    }
    const tokens = message.budgetTokens;
    const limit = message.budgetLimit;
    let t52;
    if ($[5] !== limit || $[6] !== tokens) {
      t52 = tokens >= limit ? `${formatNumber(tokens)} used (${formatNumber(limit)} min ${figures.tick})` : `${formatNumber(tokens)} / ${formatNumber(limit)} (${Math.round(tokens / limit * 100)}%)`;
      $[5] = limit;
      $[6] = tokens;
      $[7] = t52;
    } else {
      t52 = $[7];
    }
    const usage = t52;
    const nudges = message.budgetNudges > 0 ? ` \xB7 ${message.budgetNudges} ${message.budgetNudges === 1 ? "nudge" : "nudges"}` : "";
    t4 = `${showTurnDuration ? " \xB7 " : ""}${usage}${nudges}`;
  }
  const budgetSuffix = t4;
  if (!showTurnDuration && !hasBudget) {
    return null;
  }
  const t5 = addMargin ? 1 : 0;
  let t6;
  if ($[8] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t6 = /* @__PURE__ */ jsx(Box, { minWidth: 2, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: TEARDROP_ASTERISK }) });
    $[8] = t6;
  } else {
    t6 = $[8];
  }
  const t7 = showTurnDuration && `${verb} for ${duration}`;
  const t8 = backgroundTaskSummary && ` \xB7 ${backgroundTaskSummary} still running`;
  let t9;
  if ($[9] !== budgetSuffix || $[10] !== t7 || $[11] !== t8) {
    t9 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      t7,
      budgetSuffix,
      t8
    ] });
    $[9] = budgetSuffix;
    $[10] = t7;
    $[11] = t8;
    $[12] = t9;
  } else {
    t9 = $[12];
  }
  let t10;
  if ($[13] !== bg || $[14] !== t5 || $[15] !== t9) {
    t10 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: t5, backgroundColor: bg, width: "100%", children: [
      t6,
      t9
    ] });
    $[13] = bg;
    $[14] = t5;
    $[15] = t9;
    $[16] = t10;
  } else {
    t10 = $[16];
  }
  return t10;
}
function _temp4() {
  return sample(TURN_COMPLETION_VERBS) ?? "Worked";
}
function MemorySavedMessage(t0) {
  const $ = _c(16);
  const {
    message,
    addMargin
  } = t0;
  const bg = useSelectedMessageBg();
  const {
    writtenPaths
  } = message;
  let t1;
  if ($[0] !== message) {
    t1 = false ? teamMemSaved.teamMemSavedPart(message) : null;
    $[0] = message;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const team = t1;
  const privateCount = writtenPaths.length - (team?.count ?? 0);
  const t2 = privateCount > 0 ? `${privateCount} ${privateCount === 1 ? "memory" : "memories"}` : null;
  const t3 = team?.segment;
  let t4;
  if ($[2] !== t2 || $[3] !== t3) {
    t4 = [t2, t3].filter(Boolean);
    $[2] = t2;
    $[3] = t3;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  const parts = t4;
  const t5 = addMargin ? 1 : 0;
  let t6;
  if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t6 = /* @__PURE__ */ jsx(Box, { minWidth: 2, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: BLACK_CIRCLE }) });
    $[5] = t6;
  } else {
    t6 = $[5];
  }
  const t7 = message.verb ?? "Saved";
  const t8 = parts.join(" \xB7 ");
  let t9;
  if ($[6] !== t7 || $[7] !== t8) {
    t9 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      t6,
      /* @__PURE__ */ jsxs(Text, { children: [
        t7,
        " ",
        t8
      ] })
    ] });
    $[6] = t7;
    $[7] = t8;
    $[8] = t9;
  } else {
    t9 = $[8];
  }
  let t10;
  if ($[9] !== writtenPaths) {
    t10 = writtenPaths.map(_temp5);
    $[9] = writtenPaths;
    $[10] = t10;
  } else {
    t10 = $[10];
  }
  let t11;
  if ($[11] !== bg || $[12] !== t10 || $[13] !== t5 || $[14] !== t9) {
    t11 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: t5, backgroundColor: bg, children: [
      t9,
      t10
    ] });
    $[11] = bg;
    $[12] = t10;
    $[13] = t5;
    $[14] = t9;
    $[15] = t11;
  } else {
    t11 = $[15];
  }
  return t11;
}
function _temp5(p) {
  return /* @__PURE__ */ jsx(MemoryFileRow, { path: p }, p);
}
function MemoryFileRow(t0) {
  const $ = _c(16);
  const {
    path
  } = t0;
  const [hover, setHover] = useState(false);
  let t1;
  if ($[0] !== path) {
    t1 = () => void openPath(path);
    $[0] = path;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  let t3;
  if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => setHover(true);
    t3 = () => setHover(false);
    $[2] = t2;
    $[3] = t3;
  } else {
    t2 = $[2];
    t3 = $[3];
  }
  const t4 = !hover;
  let t5;
  if ($[4] !== path) {
    t5 = basename(path);
    $[4] = path;
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  let t6;
  if ($[6] !== path || $[7] !== t5) {
    t6 = /* @__PURE__ */ jsx(FilePathLink, { filePath: path, children: t5 });
    $[6] = path;
    $[7] = t5;
    $[8] = t6;
  } else {
    t6 = $[8];
  }
  let t7;
  if ($[9] !== hover || $[10] !== t4 || $[11] !== t6) {
    t7 = /* @__PURE__ */ jsx(Text, { dimColor: t4, underline: hover, children: t6 });
    $[9] = hover;
    $[10] = t4;
    $[11] = t6;
    $[12] = t7;
  } else {
    t7 = $[12];
  }
  let t8;
  if ($[13] !== t1 || $[14] !== t7) {
    t8 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Box, { onClick: t1, onMouseEnter: t2, onMouseLeave: t3, children: t7 }) });
    $[13] = t1;
    $[14] = t7;
    $[15] = t8;
  } else {
    t8 = $[15];
  }
  return t8;
}
function ThinkingMessage(t0) {
  const $ = _c(7);
  const {
    message,
    addMargin
  } = t0;
  const bg = useSelectedMessageBg();
  const t1 = addMargin ? 1 : 0;
  let t2;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsx(Box, { minWidth: 2, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: TEARDROP_ASTERISK }) });
    $[0] = t2;
  } else {
    t2 = $[0];
  }
  let t3;
  if ($[1] !== message.content) {
    t3 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: message.content });
    $[1] = message.content;
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  let t4;
  if ($[3] !== bg || $[4] !== t1 || $[5] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: t1, backgroundColor: bg, width: "100%", children: [
      t2,
      t3
    ] });
    $[3] = bg;
    $[4] = t1;
    $[5] = t3;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  return t4;
}
function BridgeStatusMessage(t0) {
  const $ = _c(13);
  const {
    message,
    addMargin
  } = t0;
  const bg = useSelectedMessageBg();
  const t1 = addMargin ? 1 : 0;
  let t2;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsx(Box, { minWidth: 2 });
    $[0] = t2;
  } else {
    t2 = $[0];
  }
  let t3;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = /* @__PURE__ */ jsxs(Text, { children: [
      /* @__PURE__ */ jsx(ThemedText, { color: "suggestion", children: "/remote-control" }),
      " is active. Code in CLI or at"
    ] });
    $[1] = t3;
  } else {
    t3 = $[1];
  }
  let t4;
  if ($[2] !== message.url) {
    t4 = /* @__PURE__ */ jsx(Link, { url: message.url, children: message.url });
    $[2] = message.url;
    $[3] = t4;
  } else {
    t4 = $[3];
  }
  let t5;
  if ($[4] !== message.upgradeNudge) {
    t5 = message.upgradeNudge && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "\u23BF ",
      message.upgradeNudge
    ] });
    $[4] = message.upgradeNudge;
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  let t6;
  if ($[6] !== t4 || $[7] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t3,
      t4,
      t5
    ] });
    $[6] = t4;
    $[7] = t5;
    $[8] = t6;
  } else {
    t6 = $[8];
  }
  let t7;
  if ($[9] !== bg || $[10] !== t1 || $[11] !== t6) {
    t7 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: t1, backgroundColor: bg, width: 999, children: [
      t2,
      t6
    ] });
    $[9] = bg;
    $[10] = t1;
    $[11] = t6;
    $[12] = t7;
  } else {
    t7 = $[12];
  }
  return t7;
}
export {
  SystemTextMessage
};
