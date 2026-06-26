import { jsx } from "react/jsx-runtime";
import { MessageResponse } from "../../components/MessageResponse.js";
import { Text } from "../../ink.js";
import { jsonParse } from "../../utils/slowOperations.js";
function renderToolUseMessage(input) {
  if (typeof input.message !== "object" || input.message === null) {
    return null;
  }
  if (input.message.type === "plan_approval_response") {
    return input.message.approve ? `approve plan from: ${input.to}` : `reject plan from: ${input.to}`;
  }
  return null;
}
function renderToolResultMessage(content, _progressMessages, {
  verbose
}) {
  const result = typeof content === "string" ? jsonParse(content) : content;
  if ("routing" in result && result.routing) {
    return null;
  }
  if ("request_id" in result && "target" in result) {
    return null;
  }
  return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: result.message }) });
}
export {
  renderToolResultMessage,
  renderToolUseMessage
};
