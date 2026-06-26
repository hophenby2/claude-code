import { jsx } from "react/jsx-runtime";
import { MessageResponse } from "../../components/MessageResponse.js";
import { OutputLine } from "../../components/shell/OutputLine.js";
import { Text } from "../../ink.js";
import { jsonStringify } from "../../utils/slowOperations.js";
function renderToolUseMessage(input) {
  return input.server ? `List MCP resources from server "${input.server}"` : `List all MCP resources`;
}
function renderToolResultMessage(output, _progressMessagesForMessage, {
  verbose
}) {
  if (!output || output.length === 0) {
    return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "(No resources found)" }) });
  }
  const formattedOutput = jsonStringify(output, null, 2);
  return /* @__PURE__ */ jsx(OutputLine, { content: formattedOutput, verbose });
}
export {
  renderToolResultMessage,
  renderToolUseMessage
};
