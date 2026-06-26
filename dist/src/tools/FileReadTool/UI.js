import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { extractTag } from "../../utils/messages.js";
import { FallbackToolUseErrorMessage } from "../../components/FallbackToolUseErrorMessage.js";
import { FilePathLink } from "../../components/FilePathLink.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { Text } from "../../ink.js";
import { FILE_NOT_FOUND_CWD_NOTE, getDisplayPath } from "../../utils/file.js";
import { formatFileSize } from "../../utils/format.js";
import { getPlansDirectory } from "../../utils/plans.js";
import { getTaskOutputDir } from "../../utils/task/diskOutput.js";
function getAgentOutputTaskId(filePath) {
  const prefix = `${getTaskOutputDir()}/`;
  const suffix = ".output";
  if (filePath.startsWith(prefix) && filePath.endsWith(suffix)) {
    const taskId = filePath.slice(prefix.length, -suffix.length);
    if (taskId.length > 0 && taskId.length <= 20 && /^[a-zA-Z0-9_-]+$/.test(taskId)) {
      return taskId;
    }
  }
  return null;
}
function renderToolUseMessage({
  file_path,
  offset,
  limit,
  pages
}, {
  verbose
}) {
  if (!file_path) {
    return null;
  }
  if (getAgentOutputTaskId(file_path)) {
    return "";
  }
  const displayPath = verbose ? file_path : getDisplayPath(file_path);
  if (pages) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(FilePathLink, { filePath: file_path, children: displayPath }),
      ` \xB7 pages ${pages}`
    ] });
  }
  if (verbose && (offset || limit)) {
    const startLine = offset ?? 1;
    const lineRange = limit ? `lines ${startLine}-${startLine + limit - 1}` : `from line ${startLine}`;
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(FilePathLink, { filePath: file_path, children: displayPath }),
      ` \xB7 ${lineRange}`
    ] });
  }
  return /* @__PURE__ */ jsx(FilePathLink, { filePath: file_path, children: displayPath });
}
function renderToolUseTag({
  file_path
}) {
  const agentTaskId = file_path ? getAgentOutputTaskId(file_path) : null;
  if (!agentTaskId) {
    return null;
  }
  return /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
    " ",
    agentTaskId
  ] });
}
function renderToolResultMessage(output) {
  switch (output.type) {
    case "image": {
      const {
        originalSize
      } = output.file;
      const formattedSize = formatFileSize(originalSize);
      return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
        "Read image (",
        formattedSize,
        ")"
      ] }) });
    }
    case "notebook": {
      const {
        cells
      } = output.file;
      if (!cells || cells.length < 1) {
        return /* @__PURE__ */ jsx(Text, { color: "error", children: "No cells found in notebook" });
      }
      return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
        "Read ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: cells.length }),
        " cells"
      ] }) });
    }
    case "pdf": {
      const {
        originalSize
      } = output.file;
      const formattedSize = formatFileSize(originalSize);
      return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
        "Read PDF (",
        formattedSize,
        ")"
      ] }) });
    }
    case "parts": {
      return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
        "Read ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: output.file.count }),
        " ",
        output.file.count === 1 ? "page" : "pages",
        " (",
        formatFileSize(output.file.originalSize),
        ")"
      ] }) });
    }
    case "text": {
      const {
        numLines
      } = output.file;
      return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
        "Read ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: numLines }),
        " ",
        numLines === 1 ? "line" : "lines"
      ] }) });
    }
    case "file_unchanged": {
      return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Unchanged since last read" }) });
    }
  }
}
function renderToolUseErrorMessage(result, {
  verbose
}) {
  if (!verbose && typeof result === "string") {
    if (result.includes(FILE_NOT_FOUND_CWD_NOTE)) {
      return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color: "error", children: "File not found" }) });
    }
    if (extractTag(result, "tool_use_error")) {
      return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color: "error", children: "Error reading file" }) });
    }
  }
  return /* @__PURE__ */ jsx(FallbackToolUseErrorMessage, { result, verbose });
}
function userFacingName(input) {
  if (input?.file_path?.startsWith(getPlansDirectory())) {
    return "Reading Plan";
  }
  if (input?.file_path && getAgentOutputTaskId(input.file_path)) {
    return "Read agent output";
  }
  return "Read";
}
function getToolUseSummary(input) {
  if (!input?.file_path) {
    return null;
  }
  const agentTaskId = getAgentOutputTaskId(input.file_path);
  if (agentTaskId) {
    return agentTaskId;
  }
  return getDisplayPath(input.file_path);
}
export {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseTag,
  userFacingName
};
