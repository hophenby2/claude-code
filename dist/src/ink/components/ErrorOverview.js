import { jsx, jsxs } from "react/jsx-runtime";
import codeExcerpt from "code-excerpt";
import { readFileSync } from "fs";
import StackUtils from "stack-utils";
import Box from "./Box.js";
import Text from "./Text.js";
const cleanupPath = (path) => {
  return path?.replace(`file://${process.cwd()}/`, "");
};
let stackUtils;
function getStackUtils() {
  return stackUtils ??= new StackUtils({
    cwd: process.cwd(),
    internals: StackUtils.nodeInternals()
  });
}
function ErrorOverview({
  error
}) {
  const stack = error.stack ? error.stack.split("\n").slice(1) : void 0;
  const origin = stack ? getStackUtils().parseLine(stack[0]) : void 0;
  const filePath = cleanupPath(origin?.file);
  let excerpt;
  let lineWidth = 0;
  if (filePath && origin?.line) {
    try {
      const sourceCode = readFileSync(filePath, "utf8");
      excerpt = codeExcerpt(sourceCode, origin.line);
      if (excerpt) {
        for (const {
          line
        } of excerpt) {
          lineWidth = Math.max(lineWidth, String(line).length);
        }
      }
    } catch {
    }
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", padding: 1, children: [
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsxs(Text, { backgroundColor: "ansi:red", color: "ansi:white", children: [
        " ",
        "ERROR",
        " "
      ] }),
      /* @__PURE__ */ jsxs(Text, { children: [
        " ",
        error.message
      ] })
    ] }),
    origin && filePath && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dim: true, children: [
      filePath,
      ":",
      origin.line,
      ":",
      origin.column
    ] }) }),
    origin && excerpt && /* @__PURE__ */ jsx(Box, { marginTop: 1, flexDirection: "column", children: excerpt.map(({
      line: line_0,
      value
    }) => /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Box, { width: lineWidth + 1, children: /* @__PURE__ */ jsxs(Text, { dim: line_0 !== origin.line, backgroundColor: line_0 === origin.line ? "ansi:red" : void 0, color: line_0 === origin.line ? "ansi:white" : void 0, children: [
        String(line_0).padStart(lineWidth, " "),
        ":"
      ] }) }),
      /* @__PURE__ */ jsx(Text, { backgroundColor: line_0 === origin.line ? "ansi:red" : void 0, color: line_0 === origin.line ? "ansi:white" : void 0, children: " " + value }, line_0)
    ] }, line_0)) }),
    error.stack && /* @__PURE__ */ jsx(Box, { marginTop: 1, flexDirection: "column", children: error.stack.split("\n").slice(1).map((line_1) => {
      const parsedLine = getStackUtils().parseLine(line_1);
      if (!parsedLine) {
        return /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { dim: true, children: "- " }),
          /* @__PURE__ */ jsx(Text, { bold: true, children: line_1 })
        ] }, line_1);
      }
      return /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { dim: true, children: "- " }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: parsedLine.function }),
        /* @__PURE__ */ jsxs(Text, { dim: true, children: [
          " ",
          "(",
          cleanupPath(parsedLine.file) ?? "",
          ":",
          parsedLine.line,
          ":",
          parsedLine.column,
          ")"
        ] })
      ] }, line_1);
    }) })
  ] });
}
export {
  ErrorOverview as default
};
