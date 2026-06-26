import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Box, Text } from "../../ink.js";
function renderToolUseMessage() {
  return "Exiting worktree\u2026";
}
function renderToolResultMessage(output, _progressMessagesForMessage, _options) {
  const actionLabel = output.action === "keep" ? "Kept worktree" : "Removed worktree";
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs(Text, { children: [
      actionLabel,
      output.worktreeBranch ? /* @__PURE__ */ jsxs(Fragment, { children: [
        " ",
        "(branch ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: output.worktreeBranch }),
        ")"
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Returned to ",
      output.originalCwd
    ] })
  ] });
}
export {
  renderToolResultMessage,
  renderToolUseMessage
};
