import { jsx } from "react/jsx-runtime";
import { MessageResponse } from "../../components/MessageResponse.js";
import { extractTag } from "../../utils/messages.js";
import { FallbackToolUseErrorMessage } from "../../components/FallbackToolUseErrorMessage.js";
import { TOOL_SUMMARY_MAX_LENGTH } from "../../constants/toolLimits.js";
import { Text } from "../../ink.js";
import { FILE_NOT_FOUND_CWD_NOTE, getDisplayPath } from "../../utils/file.js";
import { truncate } from "../../utils/format.js";
import { GrepTool } from "../GrepTool/GrepTool.js";
function userFacingName() {
  return "Search";
}
function renderToolUseMessage({
  pattern,
  path
}, {
  verbose
}) {
  if (!pattern) {
    return null;
  }
  if (!path) {
    return `pattern: "${pattern}"`;
  }
  return `pattern: "${pattern}", path: "${verbose ? path : getDisplayPath(path)}"`;
}
function renderToolUseErrorMessage(result, {
  verbose
}) {
  if (!verbose && typeof result === "string" && extractTag(result, "tool_use_error")) {
    const errorMessage = extractTag(result, "tool_use_error");
    if (errorMessage?.includes(FILE_NOT_FOUND_CWD_NOTE)) {
      return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color: "error", children: "File not found" }) });
    }
    return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color: "error", children: "Error searching files" }) });
  }
  return /* @__PURE__ */ jsx(FallbackToolUseErrorMessage, { result, verbose });
}
const renderToolResultMessage = GrepTool.renderToolResultMessage;
function getToolUseSummary(input) {
  if (!input?.pattern) {
    return null;
  }
  return truncate(input.pattern, TOOL_SUMMARY_MAX_LENGTH);
}
export {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  userFacingName
};
