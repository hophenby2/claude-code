import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Suspense, use, useState } from "react";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Box, Text } from "../ink.js";
import { findActualString, preserveQuoteStyle } from "../tools/FileEditTool/utils.js";
import { adjustHunkLineNumbers, CONTEXT_LINES, getPatchForDisplay } from "../utils/diff.js";
import { logError } from "../utils/log.js";
import { CHUNK_SIZE, openForScan, readCapped, scanForContext } from "../utils/readEditContext.js";
import { firstLineOf } from "../utils/stringUtils.js";
import { StructuredDiffList } from "./StructuredDiffList.js";
function FileEditToolDiff(props) {
  const $ = _c(7);
  let t0;
  if ($[0] !== props.edits || $[1] !== props.file_path) {
    t0 = () => loadDiffData(props.file_path, props.edits);
    $[0] = props.edits;
    $[1] = props.file_path;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  const [dataPromise] = useState(t0);
  let t1;
  if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsx(DiffFrame, { placeholder: true });
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  let t2;
  if ($[4] !== dataPromise || $[5] !== props.file_path) {
    t2 = /* @__PURE__ */ jsx(Suspense, { fallback: t1, children: /* @__PURE__ */ jsx(DiffBody, { promise: dataPromise, file_path: props.file_path }) });
    $[4] = dataPromise;
    $[5] = props.file_path;
    $[6] = t2;
  } else {
    t2 = $[6];
  }
  return t2;
}
function DiffBody(t0) {
  const $ = _c(6);
  const {
    promise,
    file_path
  } = t0;
  const {
    patch,
    firstLine,
    fileContent
  } = use(promise);
  const {
    columns
  } = useTerminalSize();
  let t1;
  if ($[0] !== columns || $[1] !== fileContent || $[2] !== file_path || $[3] !== firstLine || $[4] !== patch) {
    t1 = /* @__PURE__ */ jsx(DiffFrame, { children: /* @__PURE__ */ jsx(StructuredDiffList, { hunks: patch, dim: false, width: columns, filePath: file_path, firstLine, fileContent }) });
    $[0] = columns;
    $[1] = fileContent;
    $[2] = file_path;
    $[3] = firstLine;
    $[4] = patch;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  return t1;
}
function DiffFrame(t0) {
  const $ = _c(5);
  const {
    children,
    placeholder
  } = t0;
  let t1;
  if ($[0] !== children || $[1] !== placeholder) {
    t1 = placeholder ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\u2026" }) : children;
    $[0] = children;
    $[1] = placeholder;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== t1) {
    t2 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(Box, { borderColor: "subtle", borderStyle: "dashed", flexDirection: "column", borderLeft: false, borderRight: false, children: t1 }) });
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}
async function loadDiffData(file_path, edits) {
  const valid = edits.filter((e) => e.old_string != null && e.new_string != null);
  const single = valid.length === 1 ? valid[0] : void 0;
  if (single && single.old_string.length >= CHUNK_SIZE) {
    return diffToolInputsOnly(file_path, [single]);
  }
  try {
    const handle = await openForScan(file_path);
    if (handle === null) return diffToolInputsOnly(file_path, valid);
    try {
      if (!single || single.old_string === "") {
        const file = await readCapped(handle);
        if (file === null) return diffToolInputsOnly(file_path, valid);
        const normalized2 = valid.map((e) => normalizeEdit(file, e));
        return {
          patch: getPatchForDisplay({
            filePath: file_path,
            fileContents: file,
            edits: normalized2
          }),
          firstLine: firstLineOf(file),
          fileContent: file
        };
      }
      const ctx = await scanForContext(handle, single.old_string, CONTEXT_LINES);
      if (ctx.truncated || ctx.content === "") {
        return diffToolInputsOnly(file_path, [single]);
      }
      const normalized = normalizeEdit(ctx.content, single);
      const hunks = getPatchForDisplay({
        filePath: file_path,
        fileContents: ctx.content,
        edits: [normalized]
      });
      return {
        patch: adjustHunkLineNumbers(hunks, ctx.lineOffset - 1),
        firstLine: ctx.lineOffset === 1 ? firstLineOf(ctx.content) : null,
        fileContent: ctx.content
      };
    } finally {
      await handle.close();
    }
  } catch (e) {
    logError(e);
    return diffToolInputsOnly(file_path, valid);
  }
}
function diffToolInputsOnly(filePath, edits) {
  return {
    patch: edits.flatMap((e) => getPatchForDisplay({
      filePath,
      fileContents: e.old_string,
      edits: [e]
    })),
    firstLine: null,
    fileContent: void 0
  };
}
function normalizeEdit(fileContent, edit) {
  const actualOld = findActualString(fileContent, edit.old_string) || edit.old_string;
  const actualNew = preserveQuoteStyle(edit.old_string, actualOld, edit.new_string);
  return {
    ...edit,
    old_string: actualOld,
    new_string: actualNew
  };
}
export {
  FileEditToolDiff
};
