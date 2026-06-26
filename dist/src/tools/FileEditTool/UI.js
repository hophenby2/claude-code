import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Suspense, use, useState } from "react";
import { FileEditToolUseRejectedMessage } from "../../components/FileEditToolUseRejectedMessage.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { extractTag } from "../../utils/messages.js";
import { FallbackToolUseErrorMessage } from "../../components/FallbackToolUseErrorMessage.js";
import { FileEditToolUpdatedMessage } from "../../components/FileEditToolUpdatedMessage.js";
import { FilePathLink } from "../../components/FilePathLink.js";
import { Text } from "../../ink.js";
import { adjustHunkLineNumbers, CONTEXT_LINES } from "../../utils/diff.js";
import { FILE_NOT_FOUND_CWD_NOTE, getDisplayPath } from "../../utils/file.js";
import { logError } from "../../utils/log.js";
import { getPlansDirectory } from "../../utils/plans.js";
import { readEditContext } from "../../utils/readEditContext.js";
import { firstLineOf } from "../../utils/stringUtils.js";
import { findActualString, getPatchForEdit, preserveQuoteStyle } from "./utils.js";
function userFacingName(input) {
  if (!input) {
    return "Update";
  }
  if (input.file_path?.startsWith(getPlansDirectory())) {
    return "Updated plan";
  }
  if (input.edits != null) {
    return "Update";
  }
  if (input.old_string === "") {
    return "Create";
  }
  return "Update";
}
function getToolUseSummary(input) {
  if (!input?.file_path) {
    return null;
  }
  return getDisplayPath(input.file_path);
}
function renderToolUseMessage({
  file_path
}, {
  verbose
}) {
  if (!file_path) {
    return null;
  }
  if (file_path.startsWith(getPlansDirectory())) {
    return "";
  }
  return /* @__PURE__ */ jsx(FilePathLink, { filePath: file_path, children: verbose ? file_path : getDisplayPath(file_path) });
}
function renderToolResultMessage({
  filePath,
  structuredPatch,
  originalFile
}, _progressMessagesForMessage, {
  style,
  verbose
}) {
  const isPlanFile = filePath.startsWith(getPlansDirectory());
  return /* @__PURE__ */ jsx(FileEditToolUpdatedMessage, { filePath, structuredPatch, firstLine: originalFile.split("\n")[0] ?? null, fileContent: originalFile, style, verbose, previewHint: isPlanFile ? "/plan to preview" : void 0 });
}
function renderToolUseRejectedMessage(input, options) {
  const {
    style,
    verbose
  } = options;
  const filePath = input.file_path;
  const oldString = input.old_string ?? "";
  const newString = input.new_string ?? "";
  const replaceAll = input.replace_all ?? false;
  if ("edits" in input && input.edits != null) {
    return /* @__PURE__ */ jsx(FileEditToolUseRejectedMessage, { file_path: filePath, operation: "update", firstLine: null, verbose });
  }
  const isNewFile = oldString === "";
  if (isNewFile) {
    return /* @__PURE__ */ jsx(FileEditToolUseRejectedMessage, { file_path: filePath, operation: "write", content: newString, firstLine: firstLineOf(newString), verbose });
  }
  return /* @__PURE__ */ jsx(EditRejectionDiff, { filePath, oldString, newString, replaceAll, style, verbose });
}
function renderToolUseErrorMessage(result, options) {
  const {
    verbose
  } = options;
  if (!verbose && typeof result === "string" && extractTag(result, "tool_use_error")) {
    const errorMessage = extractTag(result, "tool_use_error");
    if (errorMessage?.includes("File has not been read yet")) {
      return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "File must be read first" }) });
    }
    if (errorMessage?.includes(FILE_NOT_FOUND_CWD_NOTE)) {
      return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color: "error", children: "File not found" }) });
    }
    return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color: "error", children: "Error editing file" }) });
  }
  return /* @__PURE__ */ jsx(FallbackToolUseErrorMessage, { result, verbose });
}
function EditRejectionDiff(t0) {
  const $ = _c(16);
  const {
    filePath,
    oldString,
    newString,
    replaceAll,
    style,
    verbose
  } = t0;
  let t1;
  if ($[0] !== filePath || $[1] !== newString || $[2] !== oldString || $[3] !== replaceAll) {
    t1 = () => loadRejectionDiff(filePath, oldString, newString, replaceAll);
    $[0] = filePath;
    $[1] = newString;
    $[2] = oldString;
    $[3] = replaceAll;
    $[4] = t1;
  } else {
    t1 = $[4];
  }
  const [dataPromise] = useState(t1);
  let t2;
  if ($[5] !== filePath || $[6] !== verbose) {
    t2 = /* @__PURE__ */ jsx(FileEditToolUseRejectedMessage, { file_path: filePath, operation: "update", firstLine: null, verbose });
    $[5] = filePath;
    $[6] = verbose;
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  let t3;
  if ($[8] !== dataPromise || $[9] !== filePath || $[10] !== style || $[11] !== verbose) {
    t3 = /* @__PURE__ */ jsx(EditRejectionBody, { promise: dataPromise, filePath, style, verbose });
    $[8] = dataPromise;
    $[9] = filePath;
    $[10] = style;
    $[11] = verbose;
    $[12] = t3;
  } else {
    t3 = $[12];
  }
  let t4;
  if ($[13] !== t2 || $[14] !== t3) {
    t4 = /* @__PURE__ */ jsx(Suspense, { fallback: t2, children: t3 });
    $[13] = t2;
    $[14] = t3;
    $[15] = t4;
  } else {
    t4 = $[15];
  }
  return t4;
}
function EditRejectionBody(t0) {
  const $ = _c(7);
  const {
    promise,
    filePath,
    style,
    verbose
  } = t0;
  const {
    patch,
    firstLine,
    fileContent
  } = use(promise);
  let t1;
  if ($[0] !== fileContent || $[1] !== filePath || $[2] !== firstLine || $[3] !== patch || $[4] !== style || $[5] !== verbose) {
    t1 = /* @__PURE__ */ jsx(FileEditToolUseRejectedMessage, { file_path: filePath, operation: "update", patch, firstLine, fileContent, style, verbose });
    $[0] = fileContent;
    $[1] = filePath;
    $[2] = firstLine;
    $[3] = patch;
    $[4] = style;
    $[5] = verbose;
    $[6] = t1;
  } else {
    t1 = $[6];
  }
  return t1;
}
async function loadRejectionDiff(filePath, oldString, newString, replaceAll) {
  try {
    const ctx = await readEditContext(filePath, oldString, CONTEXT_LINES);
    if (ctx === null || ctx.truncated || ctx.content === "") {
      const {
        patch: patch2
      } = getPatchForEdit({
        filePath,
        fileContents: oldString,
        oldString,
        newString
      });
      return {
        patch: patch2,
        firstLine: null,
        fileContent: void 0
      };
    }
    const actualOld = findActualString(ctx.content, oldString) || oldString;
    const actualNew = preserveQuoteStyle(oldString, actualOld, newString);
    const {
      patch
    } = getPatchForEdit({
      filePath,
      fileContents: ctx.content,
      oldString: actualOld,
      newString: actualNew,
      replaceAll
    });
    return {
      patch: adjustHunkLineNumbers(patch, ctx.lineOffset - 1),
      firstLine: ctx.lineOffset === 1 ? firstLineOf(ctx.content) : null,
      fileContent: ctx.content
    };
  } catch (e) {
    logError(e);
    return {
      patch: [],
      firstLine: null,
      fileContent: void 0
    };
  }
}
export {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage,
  userFacingName
};
