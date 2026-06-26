import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { Box, Text } from "../../ink.js";
import { renderModelName } from "../../utils/model/model.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { CtrlOToExpand } from "../CtrlOToExpand.js";
import { MessageResponse } from "../MessageResponse.js";
import { ToolUseLoader } from "../ToolUseLoader.js";
function AdvisorMessage(t0) {
  const $ = _c(30);
  const {
    block,
    addMargin,
    resolvedToolUseIDs,
    erroredToolUseIDs,
    shouldAnimate,
    verbose,
    advisorModel
  } = t0;
  if (block.type === "server_tool_use") {
    let t12;
    if ($[0] !== block.input) {
      t12 = block.input && Object.keys(block.input).length > 0 ? jsonStringify(block.input) : null;
      $[0] = block.input;
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    const input = t12;
    const t2 = addMargin ? 1 : 0;
    let t3;
    if ($[2] !== block.id || $[3] !== resolvedToolUseIDs) {
      t3 = resolvedToolUseIDs.has(block.id);
      $[2] = block.id;
      $[3] = resolvedToolUseIDs;
      $[4] = t3;
    } else {
      t3 = $[4];
    }
    const t4 = !t3;
    let t5;
    if ($[5] !== block.id || $[6] !== erroredToolUseIDs) {
      t5 = erroredToolUseIDs.has(block.id);
      $[5] = block.id;
      $[6] = erroredToolUseIDs;
      $[7] = t5;
    } else {
      t5 = $[7];
    }
    let t6;
    if ($[8] !== shouldAnimate || $[9] !== t4 || $[10] !== t5) {
      t6 = /* @__PURE__ */ jsx(ToolUseLoader, { shouldAnimate, isUnresolved: t4, isError: t5 });
      $[8] = shouldAnimate;
      $[9] = t4;
      $[10] = t5;
      $[11] = t6;
    } else {
      t6 = $[11];
    }
    let t7;
    if ($[12] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t7 = /* @__PURE__ */ jsx(Text, { bold: true, children: "Advising" });
      $[12] = t7;
    } else {
      t7 = $[12];
    }
    let t8;
    if ($[13] !== advisorModel) {
      t8 = advisorModel ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " using ",
        renderModelName(advisorModel)
      ] }) : null;
      $[13] = advisorModel;
      $[14] = t8;
    } else {
      t8 = $[14];
    }
    let t9;
    if ($[15] !== input) {
      t9 = input ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " \xB7 ",
        input
      ] }) : null;
      $[15] = input;
      $[16] = t9;
    } else {
      t9 = $[16];
    }
    let t10;
    if ($[17] !== t2 || $[18] !== t6 || $[19] !== t8 || $[20] !== t9) {
      t10 = /* @__PURE__ */ jsxs(Box, { marginTop: t2, paddingRight: 2, flexDirection: "row", children: [
        t6,
        t7,
        t8,
        t9
      ] });
      $[17] = t2;
      $[18] = t6;
      $[19] = t8;
      $[20] = t9;
      $[21] = t10;
    } else {
      t10 = $[21];
    }
    return t10;
  }
  let body;
  bb0: switch (block.content.type) {
    case "advisor_tool_result_error": {
      let t12;
      if ($[22] !== block.content.error_code) {
        t12 = /* @__PURE__ */ jsxs(Text, { color: "error", children: [
          "Advisor unavailable (",
          block.content.error_code,
          ")"
        ] });
        $[22] = block.content.error_code;
        $[23] = t12;
      } else {
        t12 = $[23];
      }
      body = t12;
      break bb0;
    }
    case "advisor_result": {
      let t12;
      if ($[24] !== block.content.text || $[25] !== verbose) {
        t12 = verbose ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: block.content.text }) : /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          figures.tick,
          " Advisor has reviewed the conversation and will apply the feedback ",
          /* @__PURE__ */ jsx(CtrlOToExpand, {})
        ] });
        $[24] = block.content.text;
        $[25] = verbose;
        $[26] = t12;
      } else {
        t12 = $[26];
      }
      body = t12;
      break bb0;
    }
    case "advisor_redacted_result": {
      let t12;
      if ($[27] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t12 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          figures.tick,
          " Advisor has reviewed the conversation and will apply the feedback"
        ] });
        $[27] = t12;
      } else {
        t12 = $[27];
      }
      body = t12;
    }
  }
  let t1;
  if ($[28] !== body) {
    t1 = /* @__PURE__ */ jsx(Box, { paddingRight: 2, children: /* @__PURE__ */ jsx(MessageResponse, { children: body }) });
    $[28] = body;
    $[29] = t1;
  } else {
    t1 = $[29];
  }
  return t1;
}
export {
  AdvisorMessage
};
