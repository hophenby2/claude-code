import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { isAbsolute, relative, resolve } from "path";
import { Suspense, use, useState } from "react";
import { MessageResponse } from "../../components/MessageResponse.js";
import { extractTag } from "../../utils/messages.js";
import { CtrlOToExpand } from "../../components/CtrlOToExpand.js";
import { FallbackToolUseErrorMessage } from "../../components/FallbackToolUseErrorMessage.js";
import { FileEditToolUpdatedMessage } from "../../components/FileEditToolUpdatedMessage.js";
import { FileEditToolUseRejectedMessage } from "../../components/FileEditToolUseRejectedMessage.js";
import { FilePathLink } from "../../components/FilePathLink.js";
import { HighlightedCode } from "../../components/HighlightedCode.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { Box, Text } from "../../ink.js";
import { getCwd } from "../../utils/cwd.js";
import { getPatchForDisplay } from "../../utils/diff.js";
import { getDisplayPath } from "../../utils/file.js";
import { logError } from "../../utils/log.js";
import { getPlansDirectory } from "../../utils/plans.js";
import { openForScan, readCapped } from "../../utils/readEditContext.js";
const MAX_LINES_TO_RENDER = 10;
const EOL = "\n";
function countLines(content) {
  const parts = content.split(EOL);
  return content.endsWith(EOL) ? parts.length - 1 : parts.length;
}
function FileWriteToolCreatedMessage(t0) {
  const $ = _c(25);
  const {
    filePath,
    content,
    verbose
  } = t0;
  const {
    columns
  } = useTerminalSize();
  const contentWithFallback = content || "(No content)";
  const numLines = countLines(content);
  const plusLines = numLines - MAX_LINES_TO_RENDER;
  let t1;
  if ($[0] !== numLines) {
    t1 = /* @__PURE__ */ jsx(Text, { bold: true, children: numLines });
    $[0] = numLines;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== filePath || $[3] !== verbose) {
    t2 = verbose ? filePath : relative(getCwd(), filePath);
    $[2] = filePath;
    $[3] = verbose;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] !== t2) {
    t3 = /* @__PURE__ */ jsx(Text, { bold: true, children: t2 });
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== t1 || $[8] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Text, { children: [
      "Wrote ",
      t1,
      " lines to",
      " ",
      t3
    ] });
    $[7] = t1;
    $[8] = t3;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  let t5;
  if ($[10] !== contentWithFallback || $[11] !== verbose) {
    t5 = verbose ? contentWithFallback : contentWithFallback.split("\n").slice(0, MAX_LINES_TO_RENDER).join("\n");
    $[10] = contentWithFallback;
    $[11] = verbose;
    $[12] = t5;
  } else {
    t5 = $[12];
  }
  const t6 = columns - 12;
  let t7;
  if ($[13] !== filePath || $[14] !== t5 || $[15] !== t6) {
    t7 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(HighlightedCode, { code: t5, filePath, width: t6 }) });
    $[13] = filePath;
    $[14] = t5;
    $[15] = t6;
    $[16] = t7;
  } else {
    t7 = $[16];
  }
  let t8;
  if ($[17] !== numLines || $[18] !== plusLines || $[19] !== verbose) {
    t8 = !verbose && plusLines > 0 && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "\u2026 +",
      plusLines,
      " ",
      plusLines === 1 ? "line" : "lines",
      " ",
      numLines > 0 && /* @__PURE__ */ jsx(CtrlOToExpand, {})
    ] });
    $[17] = numLines;
    $[18] = plusLines;
    $[19] = verbose;
    $[20] = t8;
  } else {
    t8 = $[20];
  }
  let t9;
  if ($[21] !== t4 || $[22] !== t7 || $[23] !== t8) {
    t9 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t4,
      t7,
      t8
    ] }) });
    $[21] = t4;
    $[22] = t7;
    $[23] = t8;
    $[24] = t9;
  } else {
    t9 = $[24];
  }
  return t9;
}
function userFacingName(input) {
  if (input?.file_path?.startsWith(getPlansDirectory())) {
    return "Updated plan";
  }
  return "Write";
}
function isResultTruncated({
  type,
  content
}) {
  if (type !== "create") return false;
  let pos = 0;
  for (let i = 0; i < MAX_LINES_TO_RENDER; i++) {
    pos = content.indexOf(EOL, pos);
    if (pos === -1) return false;
    pos++;
  }
  return pos < content.length;
}
function getToolUseSummary(input) {
  if (!input?.file_path) {
    return null;
  }
  return getDisplayPath(input.file_path);
}
function renderToolUseMessage(input, {
  verbose
}) {
  if (!input.file_path) {
    return null;
  }
  if (input.file_path.startsWith(getPlansDirectory())) {
    return "";
  }
  return /* @__PURE__ */ jsx(FilePathLink, { filePath: input.file_path, children: verbose ? input.file_path : getDisplayPath(input.file_path) });
}
function renderToolUseRejectedMessage({
  file_path,
  content
}, {
  style,
  verbose
}) {
  return /* @__PURE__ */ jsx(WriteRejectionDiff, { filePath: file_path, content, style, verbose });
}
function WriteRejectionDiff(t0) {
  const $ = _c(20);
  const {
    filePath,
    content,
    style,
    verbose
  } = t0;
  let t1;
  if ($[0] !== content || $[1] !== filePath) {
    t1 = () => loadRejectionDiff(filePath, content);
    $[0] = content;
    $[1] = filePath;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const [dataPromise] = useState(t1);
  let t2;
  if ($[3] !== content) {
    t2 = content.split("\n")[0] ?? null;
    $[3] = content;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  const firstLine = t2;
  let t3;
  if ($[5] !== content || $[6] !== filePath || $[7] !== firstLine || $[8] !== verbose) {
    t3 = /* @__PURE__ */ jsx(FileEditToolUseRejectedMessage, { file_path: filePath, operation: "write", content, firstLine, verbose });
    $[5] = content;
    $[6] = filePath;
    $[7] = firstLine;
    $[8] = verbose;
    $[9] = t3;
  } else {
    t3 = $[9];
  }
  const createFallback = t3;
  let t4;
  if ($[10] !== createFallback || $[11] !== dataPromise || $[12] !== filePath || $[13] !== firstLine || $[14] !== style || $[15] !== verbose) {
    t4 = /* @__PURE__ */ jsx(WriteRejectionBody, { promise: dataPromise, filePath, firstLine, createFallback, style, verbose });
    $[10] = createFallback;
    $[11] = dataPromise;
    $[12] = filePath;
    $[13] = firstLine;
    $[14] = style;
    $[15] = verbose;
    $[16] = t4;
  } else {
    t4 = $[16];
  }
  let t5;
  if ($[17] !== createFallback || $[18] !== t4) {
    t5 = /* @__PURE__ */ jsx(Suspense, { fallback: createFallback, children: t4 });
    $[17] = createFallback;
    $[18] = t4;
    $[19] = t5;
  } else {
    t5 = $[19];
  }
  return t5;
}
function WriteRejectionBody(t0) {
  const $ = _c(8);
  const {
    promise,
    filePath,
    firstLine,
    createFallback,
    style,
    verbose
  } = t0;
  const data = use(promise);
  if (data.type === "create") {
    return createFallback;
  }
  if (data.type === "error") {
    let t12;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { children: "(No changes)" }) });
      $[0] = t12;
    } else {
      t12 = $[0];
    }
    return t12;
  }
  let t1;
  if ($[1] !== data.oldContent || $[2] !== data.patch || $[3] !== filePath || $[4] !== firstLine || $[5] !== style || $[6] !== verbose) {
    t1 = /* @__PURE__ */ jsx(FileEditToolUseRejectedMessage, { file_path: filePath, operation: "update", patch: data.patch, firstLine, fileContent: data.oldContent, style, verbose });
    $[1] = data.oldContent;
    $[2] = data.patch;
    $[3] = filePath;
    $[4] = firstLine;
    $[5] = style;
    $[6] = verbose;
    $[7] = t1;
  } else {
    t1 = $[7];
  }
  return t1;
}
async function loadRejectionDiff(filePath, content) {
  try {
    const fullFilePath = isAbsolute(filePath) ? filePath : resolve(getCwd(), filePath);
    const handle = await openForScan(fullFilePath);
    if (handle === null) return {
      type: "create"
    };
    let oldContent;
    try {
      oldContent = await readCapped(handle);
    } finally {
      await handle.close();
    }
    if (oldContent === null) return {
      type: "create"
    };
    const patch = getPatchForDisplay({
      filePath,
      fileContents: oldContent,
      edits: [{
        old_string: oldContent,
        new_string: content,
        replace_all: false
      }]
    });
    return {
      type: "update",
      patch,
      oldContent
    };
  } catch (e) {
    logError(e);
    return {
      type: "error"
    };
  }
}
function renderToolUseErrorMessage(result, {
  verbose
}) {
  if (!verbose && typeof result === "string" && extractTag(result, "tool_use_error")) {
    return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color: "error", children: "Error writing file" }) });
  }
  return /* @__PURE__ */ jsx(FallbackToolUseErrorMessage, { result, verbose });
}
function renderToolResultMessage({
  filePath,
  content,
  structuredPatch,
  type,
  originalFile
}, _progressMessagesForMessage, {
  style,
  verbose
}) {
  switch (type) {
    case "create": {
      const isPlanFile = filePath.startsWith(getPlansDirectory());
      if (isPlanFile && !verbose) {
        if (style !== "condensed") {
          return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "/plan to preview" }) });
        }
      } else if (style === "condensed" && !verbose) {
        const numLines = countLines(content);
        return /* @__PURE__ */ jsxs(Text, { children: [
          "Wrote ",
          /* @__PURE__ */ jsx(Text, { bold: true, children: numLines }),
          " lines to",
          " ",
          /* @__PURE__ */ jsx(Text, { bold: true, children: relative(getCwd(), filePath) })
        ] });
      }
      return /* @__PURE__ */ jsx(FileWriteToolCreatedMessage, { filePath, content, verbose });
    }
    case "update": {
      const isPlanFile = filePath.startsWith(getPlansDirectory());
      return /* @__PURE__ */ jsx(FileEditToolUpdatedMessage, { filePath, structuredPatch, firstLine: content.split("\n")[0] ?? null, fileContent: originalFile ?? void 0, style, verbose, previewHint: isPlanFile ? "/plan to preview" : void 0 });
    }
  }
}
export {
  countLines,
  getToolUseSummary,
  isResultTruncated,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage,
  userFacingName
};
