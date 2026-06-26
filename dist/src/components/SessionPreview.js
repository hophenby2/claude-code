import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import React from "react";
import { Box, Text } from "../ink.js";
import { useKeybinding } from "../keybindings/useKeybinding.js";
import { getAllBaseTools } from "../tools.js";
import { formatRelativeTimeAgo } from "../utils/format.js";
import { getSessionIdFromLog, isLiteLog, loadFullLog } from "../utils/sessionStorage.js";
import { ConfigurableShortcutHint } from "./ConfigurableShortcutHint.js";
import { Byline } from "./design-system/Byline.js";
import { KeyboardShortcutHint } from "./design-system/KeyboardShortcutHint.js";
import { LoadingState } from "./design-system/LoadingState.js";
import { Messages } from "./Messages.js";
function SessionPreview(t0) {
  const $ = _c(33);
  const {
    log,
    onExit,
    onSelect
  } = t0;
  const [fullLog, setFullLog] = React.useState(null);
  let t1;
  let t2;
  if ($[0] !== log) {
    t1 = () => {
      setFullLog(null);
      if (isLiteLog(log)) {
        loadFullLog(log).then(setFullLog);
      }
    };
    t2 = [log];
    $[0] = log;
    $[1] = t1;
    $[2] = t2;
  } else {
    t1 = $[1];
    t2 = $[2];
  }
  React.useEffect(t1, t2);
  const isLoading = isLiteLog(log) && fullLog === null;
  const displayLog = fullLog ?? log;
  let t3;
  if ($[3] !== displayLog) {
    t3 = getSessionIdFromLog(displayLog) || "";
    $[3] = displayLog;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  const conversationId = t3;
  let t4;
  if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = getAllBaseTools();
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  const tools = t4;
  let t5;
  if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = {
      context: "Confirmation"
    };
    $[6] = t5;
  } else {
    t5 = $[6];
  }
  useKeybinding("confirm:no", onExit, t5);
  let t6;
  if ($[7] !== fullLog || $[8] !== log || $[9] !== onSelect) {
    t6 = () => {
      onSelect(fullLog ?? log);
    };
    $[7] = fullLog;
    $[8] = log;
    $[9] = onSelect;
    $[10] = t6;
  } else {
    t6 = $[10];
  }
  const handleSelect = t6;
  let t7;
  if ($[11] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t7 = {
      context: "Confirmation"
    };
    $[11] = t7;
  } else {
    t7 = $[11];
  }
  useKeybinding("confirm:yes", handleSelect, t7);
  if (isLoading) {
    let t82;
    if ($[12] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t82 = /* @__PURE__ */ jsx(LoadingState, { message: "Loading session\u2026" });
      $[12] = t82;
    } else {
      t82 = $[12];
    }
    let t92;
    if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t92 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", padding: 1, children: [
        t82,
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(Byline, { children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" }) }) })
      ] });
      $[13] = t92;
    } else {
      t92 = $[13];
    }
    return t92;
  }
  let t8;
  if ($[14] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t8 = [];
    $[14] = t8;
  } else {
    t8 = $[14];
  }
  let t10;
  let t9;
  if ($[15] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t9 = [];
    t10 = /* @__PURE__ */ new Set();
    $[15] = t10;
    $[16] = t9;
  } else {
    t10 = $[15];
    t9 = $[16];
  }
  let t11;
  if ($[17] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t11 = [];
    $[17] = t11;
  } else {
    t11 = $[17];
  }
  let t12;
  if ($[18] !== conversationId || $[19] !== displayLog.messages) {
    t12 = /* @__PURE__ */ jsx(Messages, { messages: displayLog.messages, tools, commands: t8, verbose: true, toolJSX: null, toolUseConfirmQueue: t9, inProgressToolUseIDs: t10, isMessageSelectorVisible: false, conversationId, screen: "transcript", streamingToolUses: t11, showAllInTranscript: true, isLoading: false });
    $[18] = conversationId;
    $[19] = displayLog.messages;
    $[20] = t12;
  } else {
    t12 = $[20];
  }
  let t13;
  if ($[21] !== displayLog.modified) {
    t13 = formatRelativeTimeAgo(displayLog.modified);
    $[21] = displayLog.modified;
    $[22] = t13;
  } else {
    t13 = $[22];
  }
  const t14 = displayLog.gitBranch ? ` \xB7 ${displayLog.gitBranch}` : "";
  let t15;
  if ($[23] !== displayLog.messageCount || $[24] !== t13 || $[25] !== t14) {
    t15 = /* @__PURE__ */ jsxs(Text, { children: [
      t13,
      " \xB7",
      " ",
      displayLog.messageCount,
      " messages",
      t14
    ] });
    $[23] = displayLog.messageCount;
    $[24] = t13;
    $[25] = t14;
    $[26] = t15;
  } else {
    t15 = $[26];
  }
  let t16;
  if ($[27] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t16 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "resume" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" })
    ] }) });
    $[27] = t16;
  } else {
    t16 = $[27];
  }
  let t17;
  if ($[28] !== t15) {
    t17 = /* @__PURE__ */ jsxs(Box, { flexShrink: 0, flexDirection: "column", borderTopDimColor: true, borderBottom: false, borderLeft: false, borderRight: false, borderStyle: "single", paddingLeft: 2, children: [
      t15,
      t16
    ] });
    $[28] = t15;
    $[29] = t17;
  } else {
    t17 = $[29];
  }
  let t18;
  if ($[30] !== t12 || $[31] !== t17) {
    t18 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t12,
      t17
    ] });
    $[30] = t12;
    $[31] = t17;
    $[32] = t18;
  } else {
    t18 = $[32];
  }
  return t18;
}
export {
  SessionPreview
};
