import { jsx } from "react/jsx-runtime";
import { MessageResponse } from "../../components/MessageResponse.js";
import { OutputLine } from "../../components/shell/OutputLine.js";
import { Box, Text } from "../../ink.js";
import { jsonStringify } from "../../utils/slowOperations.js";
function renderToolUseMessage(input) {
  if (!input.uri || !input.server) {
    return null;
  }
  return `Read resource "${input.uri}" from server "${input.server}"`;
}
function userFacingName() {
  return "readMcpResource";
}
function renderToolResultMessage(output, _progressMessagesForMessage, {
  verbose
}) {
  if (!output || !output.contents || output.contents.length === 0) {
    return /* @__PURE__ */ jsx(Box, { justifyContent: "space-between", overflowX: "hidden", width: "100%", children: /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "(No content)" }) }) });
  }
  const formattedOutput = jsonStringify(output, null, 2);
  return /* @__PURE__ */ jsx(OutputLine, { content: formattedOutput, verbose });
}
export {
  renderToolResultMessage,
  renderToolUseMessage,
  userFacingName
};
