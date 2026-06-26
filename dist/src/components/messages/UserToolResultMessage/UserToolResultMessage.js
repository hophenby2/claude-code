import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { CANCEL_MESSAGE, INTERRUPT_MESSAGE_FOR_TOOL_USE, REJECT_MESSAGE } from "../../../utils/messages.js";
import { UserToolCanceledMessage } from "./UserToolCanceledMessage.js";
import { UserToolErrorMessage } from "./UserToolErrorMessage.js";
import { UserToolRejectMessage } from "./UserToolRejectMessage.js";
import { UserToolSuccessMessage } from "./UserToolSuccessMessage.js";
import { useGetToolFromMessages } from "./utils.js";
function UserToolResultMessage(t0) {
  const $ = _c(28);
  const {
    param,
    message,
    lookups,
    progressMessagesForMessage,
    style,
    tools,
    verbose,
    width,
    isTranscriptMode
  } = t0;
  const toolUse = useGetToolFromMessages(param.tool_use_id, tools, lookups);
  if (!toolUse) {
    return null;
  }
  if (typeof param.content === "string" && param.content.startsWith(CANCEL_MESSAGE)) {
    let t12;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(UserToolCanceledMessage, {});
      $[0] = t12;
    } else {
      t12 = $[0];
    }
    return t12;
  }
  if (typeof param.content === "string" && param.content.startsWith(REJECT_MESSAGE) || param.content === INTERRUPT_MESSAGE_FOR_TOOL_USE) {
    const t12 = toolUse.toolUse.input;
    let t2;
    if ($[1] !== isTranscriptMode || $[2] !== lookups || $[3] !== progressMessagesForMessage || $[4] !== style || $[5] !== t12 || $[6] !== toolUse.tool || $[7] !== tools || $[8] !== verbose) {
      t2 = /* @__PURE__ */ jsx(UserToolRejectMessage, { input: t12, progressMessagesForMessage, tool: toolUse.tool, tools, lookups, style, verbose, isTranscriptMode });
      $[1] = isTranscriptMode;
      $[2] = lookups;
      $[3] = progressMessagesForMessage;
      $[4] = style;
      $[5] = t12;
      $[6] = toolUse.tool;
      $[7] = tools;
      $[8] = verbose;
      $[9] = t2;
    } else {
      t2 = $[9];
    }
    return t2;
  }
  if (param.is_error) {
    let t12;
    if ($[10] !== isTranscriptMode || $[11] !== param || $[12] !== progressMessagesForMessage || $[13] !== toolUse.tool || $[14] !== tools || $[15] !== verbose) {
      t12 = /* @__PURE__ */ jsx(UserToolErrorMessage, { progressMessagesForMessage, tool: toolUse.tool, tools, param, verbose, isTranscriptMode });
      $[10] = isTranscriptMode;
      $[11] = param;
      $[12] = progressMessagesForMessage;
      $[13] = toolUse.tool;
      $[14] = tools;
      $[15] = verbose;
      $[16] = t12;
    } else {
      t12 = $[16];
    }
    return t12;
  }
  let t1;
  if ($[17] !== isTranscriptMode || $[18] !== lookups || $[19] !== message || $[20] !== progressMessagesForMessage || $[21] !== style || $[22] !== toolUse.tool || $[23] !== toolUse.toolUse.id || $[24] !== tools || $[25] !== verbose || $[26] !== width) {
    t1 = /* @__PURE__ */ jsx(UserToolSuccessMessage, { message, lookups, toolUseID: toolUse.toolUse.id, progressMessagesForMessage, style, tool: toolUse.tool, tools, verbose, width, isTranscriptMode });
    $[17] = isTranscriptMode;
    $[18] = lookups;
    $[19] = message;
    $[20] = progressMessagesForMessage;
    $[21] = style;
    $[22] = toolUse.tool;
    $[23] = toolUse.toolUse.id;
    $[24] = tools;
    $[25] = verbose;
    $[26] = width;
    $[27] = t1;
  } else {
    t1 = $[27];
  }
  return t1;
}
export {
  UserToolResultMessage
};
