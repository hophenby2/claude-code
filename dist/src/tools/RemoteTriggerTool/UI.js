import { jsx, jsxs } from "react/jsx-runtime";
import { MessageResponse } from "../../components/MessageResponse.js";
import { Text } from "../../ink.js";
import { countCharInString } from "../../utils/stringUtils.js";
function renderToolUseMessage(input) {
  return `${input.action ?? ""}${input.trigger_id ? ` ${input.trigger_id}` : ""}`;
}
function renderToolResultMessage(output) {
  const lines = countCharInString(output.json, "\n") + 1;
  return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Text, { children: [
    "HTTP ",
    output.status,
    " ",
    /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "(",
      lines,
      " lines)"
    ] })
  ] }) });
}
export {
  renderToolResultMessage,
  renderToolUseMessage
};
