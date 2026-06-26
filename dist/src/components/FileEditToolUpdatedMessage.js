import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Box, Text } from "../ink.js";
import { count } from "../utils/array.js";
import { MessageResponse } from "./MessageResponse.js";
import { StructuredDiffList } from "./StructuredDiffList.js";
function FileEditToolUpdatedMessage(t0) {
  const $ = _c(22);
  const {
    filePath,
    structuredPatch,
    firstLine,
    fileContent,
    style,
    verbose,
    previewHint
  } = t0;
  const {
    columns
  } = useTerminalSize();
  const numAdditions = structuredPatch.reduce(_temp2, 0);
  const numRemovals = structuredPatch.reduce(_temp4, 0);
  let t1;
  if ($[0] !== numAdditions) {
    t1 = numAdditions > 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
      "Added ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: numAdditions }),
      " ",
      numAdditions > 1 ? "lines" : "line"
    ] }) : null;
    $[0] = numAdditions;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const t2 = numAdditions > 0 && numRemovals > 0 ? ", " : null;
  let t3;
  if ($[2] !== numAdditions || $[3] !== numRemovals) {
    t3 = numRemovals > 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
      numAdditions === 0 ? "R" : "r",
      "emoved ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: numRemovals }),
      " ",
      numRemovals > 1 ? "lines" : "line"
    ] }) : null;
    $[2] = numAdditions;
    $[3] = numRemovals;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== t1 || $[6] !== t2 || $[7] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Text, { children: [
      t1,
      t2,
      t3
    ] });
    $[5] = t1;
    $[6] = t2;
    $[7] = t3;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  const text = t4;
  if (previewHint) {
    if (style !== "condensed" && !verbose) {
      let t52;
      if ($[9] !== previewHint) {
        t52 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: previewHint }) });
        $[9] = previewHint;
        $[10] = t52;
      } else {
        t52 = $[10];
      }
      return t52;
    }
  } else {
    if (style === "condensed" && !verbose) {
      return text;
    }
  }
  let t5;
  if ($[11] !== text) {
    t5 = /* @__PURE__ */ jsx(Text, { children: text });
    $[11] = text;
    $[12] = t5;
  } else {
    t5 = $[12];
  }
  const t6 = columns - 12;
  let t7;
  if ($[13] !== fileContent || $[14] !== filePath || $[15] !== firstLine || $[16] !== structuredPatch || $[17] !== t6) {
    t7 = /* @__PURE__ */ jsx(StructuredDiffList, { hunks: structuredPatch, dim: false, width: t6, filePath, firstLine, fileContent });
    $[13] = fileContent;
    $[14] = filePath;
    $[15] = firstLine;
    $[16] = structuredPatch;
    $[17] = t6;
    $[18] = t7;
  } else {
    t7 = $[18];
  }
  let t8;
  if ($[19] !== t5 || $[20] !== t7) {
    t8 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t5,
      t7
    ] }) });
    $[19] = t5;
    $[20] = t7;
    $[21] = t8;
  } else {
    t8 = $[21];
  }
  return t8;
}
function _temp4(acc_0, hunk_0) {
  return acc_0 + count(hunk_0.lines, _temp3);
}
function _temp3(__0) {
  return __0.startsWith("-");
}
function _temp2(acc, hunk) {
  return acc + count(hunk.lines, _temp);
}
function _temp(_) {
  return _.startsWith("+");
}
export {
  FileEditToolUpdatedMessage
};
