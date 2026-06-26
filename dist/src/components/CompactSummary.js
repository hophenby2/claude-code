import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { BLACK_CIRCLE } from "../constants/figures.js";
import { Box, Text } from "../ink.js";
import { getUserMessageText } from "../utils/messages.js";
import { ConfigurableShortcutHint } from "./ConfigurableShortcutHint.js";
import { MessageResponse } from "./MessageResponse.js";
function CompactSummary(t0) {
  const $ = _c(24);
  const {
    message,
    screen
  } = t0;
  const isTranscriptMode = screen === "transcript";
  let t1;
  if ($[0] !== message) {
    t1 = getUserMessageText(message) || "";
    $[0] = message;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const textContent = t1;
  const metadata = message.summarizeMetadata;
  if (metadata) {
    let t22;
    if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t22 = /* @__PURE__ */ jsx(Box, { minWidth: 2, children: /* @__PURE__ */ jsx(Text, { color: "text", children: BLACK_CIRCLE }) });
      $[2] = t22;
    } else {
      t22 = $[2];
    }
    let t32;
    if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t32 = /* @__PURE__ */ jsx(Text, { bold: true, children: "Summarized conversation" });
      $[3] = t32;
    } else {
      t32 = $[3];
    }
    let t42;
    if ($[4] !== isTranscriptMode || $[5] !== metadata) {
      t42 = !isTranscriptMode && /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Summarized ",
          metadata.messagesSummarized,
          " messages",
          " ",
          metadata.direction === "up_to" ? "up to this point" : "from this point"
        ] }),
        metadata.userContext && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Context: ",
          "\u201C",
          metadata.userContext,
          "\u201D"
        ] }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "app:toggleTranscript", context: "Global", fallback: "ctrl+o", description: "expand history", parens: true }) })
      ] }) });
      $[4] = isTranscriptMode;
      $[5] = metadata;
      $[6] = t42;
    } else {
      t42 = $[6];
    }
    let t52;
    if ($[7] !== isTranscriptMode || $[8] !== textContent) {
      t52 = isTranscriptMode && /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { children: textContent }) });
      $[7] = isTranscriptMode;
      $[8] = textContent;
      $[9] = t52;
    } else {
      t52 = $[9];
    }
    let t62;
    if ($[10] !== t42 || $[11] !== t52) {
      t62 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginTop: 1, children: /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
        t22,
        /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
          t32,
          t42,
          t52
        ] })
      ] }) });
      $[10] = t42;
      $[11] = t52;
      $[12] = t62;
    } else {
      t62 = $[12];
    }
    return t62;
  }
  let t2;
  if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsx(Box, { minWidth: 2, children: /* @__PURE__ */ jsx(Text, { color: "text", children: BLACK_CIRCLE }) });
    $[13] = t2;
  } else {
    t2 = $[13];
  }
  let t3;
  if ($[14] !== isTranscriptMode) {
    t3 = !isTranscriptMode && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " ",
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "app:toggleTranscript", context: "Global", fallback: "ctrl+o", description: "expand", parens: true })
    ] });
    $[14] = isTranscriptMode;
    $[15] = t3;
  } else {
    t3 = $[15];
  }
  let t4;
  if ($[16] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      t2,
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        "Compact summary",
        t3
      ] }) })
    ] });
    $[16] = t3;
    $[17] = t4;
  } else {
    t4 = $[17];
  }
  let t5;
  if ($[18] !== isTranscriptMode || $[19] !== textContent) {
    t5 = isTranscriptMode && /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { children: textContent }) });
    $[18] = isTranscriptMode;
    $[19] = textContent;
    $[20] = t5;
  } else {
    t5 = $[20];
  }
  let t6;
  if ($[21] !== t4 || $[22] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      t4,
      t5
    ] });
    $[21] = t4;
    $[22] = t5;
    $[23] = t6;
  } else {
    t6 = $[23];
  }
  return t6;
}
export {
  CompactSummary
};
