import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useTerminalSize } from "../../../hooks/useTerminalSize.js";
import { Box, NoSelect, Text } from "../../../ink.js";
import { intersperse } from "../../../utils/array.js";
import { getPatchForDisplay } from "../../../utils/diff.js";
import { HighlightedCode } from "../../HighlightedCode.js";
import { StructuredDiff } from "../../StructuredDiff.js";
function FileWriteToolDiff(t0) {
  const $ = _c(15);
  const {
    file_path,
    content,
    fileExists,
    oldContent
  } = t0;
  const {
    columns
  } = useTerminalSize();
  let t1;
  bb0: {
    if (!fileExists) {
      t1 = null;
      break bb0;
    }
    let t22;
    if ($[0] !== content || $[1] !== file_path || $[2] !== oldContent) {
      t22 = getPatchForDisplay({
        filePath: file_path,
        fileContents: oldContent,
        edits: [{
          old_string: oldContent,
          new_string: content,
          replace_all: false
        }]
      });
      $[0] = content;
      $[1] = file_path;
      $[2] = oldContent;
      $[3] = t22;
    } else {
      t22 = $[3];
    }
    t1 = t22;
  }
  const hunks = t1;
  let t2;
  if ($[4] !== content) {
    t2 = content.split("\n")[0] ?? null;
    $[4] = content;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  const firstLine = t2;
  let t3;
  if ($[6] !== columns || $[7] !== content || $[8] !== file_path || $[9] !== firstLine || $[10] !== hunks || $[11] !== oldContent) {
    t3 = hunks ? intersperse(hunks.map((_) => /* @__PURE__ */ jsx(StructuredDiff, { patch: _, dim: false, filePath: file_path, firstLine, fileContent: oldContent, width: columns - 2 }, _.newStart)), _temp) : /* @__PURE__ */ jsx(HighlightedCode, { code: content || "(No content)", filePath: file_path });
    $[6] = columns;
    $[7] = content;
    $[8] = file_path;
    $[9] = firstLine;
    $[10] = hunks;
    $[11] = oldContent;
    $[12] = t3;
  } else {
    t3 = $[12];
  }
  let t4;
  if ($[13] !== t3) {
    t4 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(Box, { borderColor: "subtle", borderStyle: "dashed", flexDirection: "column", borderLeft: false, borderRight: false, paddingX: 1, children: t3 }) });
    $[13] = t3;
    $[14] = t4;
  } else {
    t4 = $[14];
  }
  return t4;
}
function _temp(i) {
  return /* @__PURE__ */ jsx(NoSelect, { fromLeftEdge: true, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "..." }) }, `ellipsis-${i}`);
}
export {
  FileWriteToolDiff
};
