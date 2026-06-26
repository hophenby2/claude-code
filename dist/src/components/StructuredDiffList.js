import { jsx } from "react/jsx-runtime";
import { Box, NoSelect, Text } from "../ink.js";
import { intersperse } from "../utils/array.js";
import { StructuredDiff } from "./StructuredDiff.js";
function StructuredDiffList({
  hunks,
  dim,
  width,
  filePath,
  firstLine,
  fileContent
}) {
  return intersperse(hunks.map((hunk) => /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(StructuredDiff, { patch: hunk, dim, width, filePath, firstLine, fileContent }) }, hunk.newStart)), (i) => /* @__PURE__ */ jsx(NoSelect, { fromLeftEdge: true, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "..." }) }, `ellipsis-${i}`));
}
export {
  StructuredDiffList
};
