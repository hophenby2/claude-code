import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../../ink.js";
import { CtrlOToExpand } from "../CtrlOToExpand.js";
import { Markdown } from "../Markdown.js";
function AssistantThinkingMessage(t0) {
  const $ = _c(9);
  const {
    param: t1,
    addMargin: t2,
    isTranscriptMode,
    verbose,
    hideInTranscript: t3
  } = t0;
  const {
    thinking
  } = t1;
  const addMargin = t2 === void 0 ? false : t2;
  const hideInTranscript = t3 === void 0 ? false : t3;
  if (!thinking) {
    return null;
  }
  if (hideInTranscript) {
    return null;
  }
  const shouldShowFullThinking = isTranscriptMode || verbose;
  if (!shouldShowFullThinking) {
    const t42 = addMargin ? 1 : 0;
    let t52;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t52 = /* @__PURE__ */ jsxs(Text, { dimColor: true, italic: true, children: [
        "\u2234 Thinking",
        " ",
        /* @__PURE__ */ jsx(CtrlOToExpand, {})
      ] });
      $[0] = t52;
    } else {
      t52 = $[0];
    }
    let t62;
    if ($[1] !== t42) {
      t62 = /* @__PURE__ */ jsx(Box, { marginTop: t42, children: t52 });
      $[1] = t42;
      $[2] = t62;
    } else {
      t62 = $[2];
    }
    return t62;
  }
  const t4 = addMargin ? 1 : 0;
  let t5;
  if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = /* @__PURE__ */ jsxs(Text, { dimColor: true, italic: true, children: [
      "\u2234 Thinking",
      "\u2026"
    ] });
    $[3] = t5;
  } else {
    t5 = $[3];
  }
  let t6;
  if ($[4] !== thinking) {
    t6 = /* @__PURE__ */ jsx(Box, { paddingLeft: 2, children: /* @__PURE__ */ jsx(Markdown, { dimColor: true, children: thinking }) });
    $[4] = thinking;
    $[5] = t6;
  } else {
    t6 = $[5];
  }
  let t7;
  if ($[6] !== t4 || $[7] !== t6) {
    t7 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, marginTop: t4, width: "100%", children: [
      t5,
      t6
    ] });
    $[6] = t4;
    $[7] = t6;
    $[8] = t7;
  } else {
    t7 = $[8];
  }
  return t7;
}
export {
  AssistantThinkingMessage
};
