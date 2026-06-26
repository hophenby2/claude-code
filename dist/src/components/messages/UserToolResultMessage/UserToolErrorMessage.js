import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import "../../../constants/figures.js";
import "../../../ink.js";
import { filterToolProgressMessages } from "../../../Tool.js";
import { INTERRUPT_MESSAGE_FOR_TOOL_USE, PLAN_REJECTION_PREFIX, REJECT_MESSAGE_WITH_REASON_PREFIX } from "../../../utils/messages.js";
import { FallbackToolUseErrorMessage } from "../../FallbackToolUseErrorMessage.js";
import { InterruptedByUser } from "../../InterruptedByUser.js";
import { MessageResponse } from "../../MessageResponse.js";
import { RejectedPlanMessage } from "./RejectedPlanMessage.js";
import { RejectedToolUseMessage } from "./RejectedToolUseMessage.js";
function UserToolErrorMessage(t0) {
  const $ = _c(14);
  const {
    progressMessagesForMessage,
    tool,
    tools,
    param,
    verbose,
    isTranscriptMode
  } = t0;
  if (typeof param.content === "string" && param.content.includes(INTERRUPT_MESSAGE_FOR_TOOL_USE)) {
    let t12;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(InterruptedByUser, {}) });
      $[0] = t12;
    } else {
      t12 = $[0];
    }
    return t12;
  }
  if (typeof param.content === "string" && param.content.startsWith(PLAN_REJECTION_PREFIX)) {
    let t12;
    if ($[1] !== param.content) {
      t12 = param.content.substring(PLAN_REJECTION_PREFIX.length);
      $[1] = param.content;
      $[2] = t12;
    } else {
      t12 = $[2];
    }
    const planContent = t12;
    let t2;
    if ($[3] !== planContent) {
      t2 = /* @__PURE__ */ jsx(RejectedPlanMessage, { plan: planContent });
      $[3] = planContent;
      $[4] = t2;
    } else {
      t2 = $[4];
    }
    return t2;
  }
  if (typeof param.content === "string" && param.content.startsWith(REJECT_MESSAGE_WITH_REASON_PREFIX)) {
    let t12;
    if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(RejectedToolUseMessage, {});
      $[5] = t12;
    } else {
      t12 = $[5];
    }
    return t12;
  }
  if (false) {
    let t12;
    if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Denied by auto mode classifier ",
        BULLET_OPERATOR,
        " /feedback if incorrect"
      ] }) });
      $[6] = t12;
    } else {
      t12 = $[6];
    }
    return t12;
  }
  let t1;
  if ($[7] !== isTranscriptMode || $[8] !== param.content || $[9] !== progressMessagesForMessage || $[10] !== tool || $[11] !== tools || $[12] !== verbose) {
    t1 = tool?.renderToolUseErrorMessage?.(param.content, {
      progressMessagesForMessage: filterToolProgressMessages(progressMessagesForMessage),
      tools,
      verbose,
      isTranscriptMode
    }) ?? /* @__PURE__ */ jsx(FallbackToolUseErrorMessage, { result: param.content, verbose });
    $[7] = isTranscriptMode;
    $[8] = param.content;
    $[9] = progressMessagesForMessage;
    $[10] = tool;
    $[11] = tools;
    $[12] = verbose;
    $[13] = t1;
  } else {
    t1 = $[13];
  }
  return t1;
}
export {
  UserToolErrorMessage
};
