import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { extractTag } from "../../utils/messages.js";
import { FallbackToolUseErrorMessage } from "../../components/FallbackToolUseErrorMessage.js";
import { FilePathLink } from "../../components/FilePathLink.js";
import { HighlightedCode } from "../../components/HighlightedCode.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { NotebookEditToolUseRejectedMessage } from "../../components/NotebookEditToolUseRejectedMessage.js";
import { Box, Text } from "../../ink.js";
import { getDisplayPath } from "../../utils/file.js";
function getToolUseSummary(input) {
  if (!input?.notebook_path) {
    return null;
  }
  return getDisplayPath(input.notebook_path);
}
function renderToolUseMessage({
  notebook_path,
  cell_id,
  new_source,
  cell_type,
  edit_mode
}, {
  verbose
}) {
  if (!notebook_path || !new_source || !cell_type) {
    return null;
  }
  const displayPath = verbose ? notebook_path : getDisplayPath(notebook_path);
  if (verbose) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(FilePathLink, { filePath: notebook_path, children: displayPath }),
      `@${cell_id}, content: ${new_source.slice(0, 30)}\u2026, cell_type: ${cell_type}, edit_mode: ${edit_mode ?? "replace"}`
    ] });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(FilePathLink, { filePath: notebook_path, children: displayPath }),
    `@${cell_id}`
  ] });
}
function renderToolUseRejectedMessage(input, {
  verbose
}) {
  return /* @__PURE__ */ jsx(NotebookEditToolUseRejectedMessage, { notebook_path: input.notebook_path, cell_id: input.cell_id, new_source: input.new_source, cell_type: input.cell_type, edit_mode: input.edit_mode, verbose });
}
function renderToolUseErrorMessage(result, {
  verbose
}) {
  if (!verbose && typeof result === "string" && extractTag(result, "tool_use_error")) {
    return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color: "error", children: "Error editing notebook" }) });
  }
  return /* @__PURE__ */ jsx(FallbackToolUseErrorMessage, { result, verbose });
}
function renderToolResultMessage({
  cell_id,
  new_source,
  error
}) {
  if (error) {
    return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color: "error", children: error }) });
  }
  return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs(Text, { children: [
      "Updated cell ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: cell_id }),
      ":"
    ] }),
    /* @__PURE__ */ jsx(Box, { marginLeft: 2, children: /* @__PURE__ */ jsx(HighlightedCode, { code: new_source, filePath: "notebook.py" }) })
  ] }) });
}
export {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage
};
