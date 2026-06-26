import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { relative } from "path";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { getCwd } from "../utils/cwd.js";
import { Box, Text } from "../ink.js";
import { HighlightedCode } from "./HighlightedCode.js";
import { MessageResponse } from "./MessageResponse.js";
import { StructuredDiffList } from "./StructuredDiffList.js";
const MAX_LINES_TO_RENDER = 10;
function FileEditToolUseRejectedMessage(t0) {
  const $ = _c(38);
  const {
    file_path,
    operation,
    patch,
    firstLine,
    fileContent,
    content,
    style,
    verbose
  } = t0;
  const {
    columns
  } = useTerminalSize();
  let t1;
  if ($[0] !== operation) {
    t1 = /* @__PURE__ */ jsxs(Text, { color: "subtle", children: [
      "User rejected ",
      operation,
      " to "
    ] });
    $[0] = operation;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== file_path || $[3] !== verbose) {
    t2 = verbose ? file_path : relative(getCwd(), file_path);
    $[2] = file_path;
    $[3] = verbose;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] !== t2) {
    t3 = /* @__PURE__ */ jsx(Text, { bold: true, color: "subtle", children: t2 });
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== t1 || $[8] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      t1,
      t3
    ] });
    $[7] = t1;
    $[8] = t3;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  const text = t4;
  if (style === "condensed" && !verbose) {
    let t52;
    if ($[10] !== text) {
      t52 = /* @__PURE__ */ jsx(MessageResponse, { children: text });
      $[10] = text;
      $[11] = t52;
    } else {
      t52 = $[11];
    }
    return t52;
  }
  if (operation === "write" && content !== void 0) {
    let plusLines;
    let t52;
    if ($[12] !== content || $[13] !== verbose) {
      const lines = content.split("\n");
      const numLines = lines.length;
      plusLines = numLines - MAX_LINES_TO_RENDER;
      t52 = verbose ? content : lines.slice(0, MAX_LINES_TO_RENDER).join("\n");
      $[12] = content;
      $[13] = verbose;
      $[14] = plusLines;
      $[15] = t52;
    } else {
      plusLines = $[14];
      t52 = $[15];
    }
    const truncatedContent = t52;
    const t62 = truncatedContent || "(No content)";
    const t72 = columns - 12;
    let t8;
    if ($[16] !== file_path || $[17] !== t62 || $[18] !== t72) {
      t8 = /* @__PURE__ */ jsx(HighlightedCode, { code: t62, filePath: file_path, width: t72, dim: true });
      $[16] = file_path;
      $[17] = t62;
      $[18] = t72;
      $[19] = t8;
    } else {
      t8 = $[19];
    }
    let t9;
    if ($[20] !== plusLines || $[21] !== verbose) {
      t9 = !verbose && plusLines > 0 && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "\u2026 +",
        plusLines,
        " lines"
      ] });
      $[20] = plusLines;
      $[21] = verbose;
      $[22] = t9;
    } else {
      t9 = $[22];
    }
    let t10;
    if ($[23] !== t8 || $[24] !== t9 || $[25] !== text) {
      t10 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        text,
        t8,
        t9
      ] }) });
      $[23] = t8;
      $[24] = t9;
      $[25] = text;
      $[26] = t10;
    } else {
      t10 = $[26];
    }
    return t10;
  }
  if (!patch || patch.length === 0) {
    let t52;
    if ($[27] !== text) {
      t52 = /* @__PURE__ */ jsx(MessageResponse, { children: text });
      $[27] = text;
      $[28] = t52;
    } else {
      t52 = $[28];
    }
    return t52;
  }
  const t5 = columns - 12;
  let t6;
  if ($[29] !== fileContent || $[30] !== file_path || $[31] !== firstLine || $[32] !== patch || $[33] !== t5) {
    t6 = /* @__PURE__ */ jsx(StructuredDiffList, { hunks: patch, dim: true, width: t5, filePath: file_path, firstLine, fileContent });
    $[29] = fileContent;
    $[30] = file_path;
    $[31] = firstLine;
    $[32] = patch;
    $[33] = t5;
    $[34] = t6;
  } else {
    t6 = $[34];
  }
  let t7;
  if ($[35] !== t6 || $[36] !== text) {
    t7 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      text,
      t6
    ] }) });
    $[35] = t6;
    $[36] = text;
    $[37] = t7;
  } else {
    t7 = $[37];
  }
  return t7;
}
export {
  FileEditToolUseRejectedMessage
};
