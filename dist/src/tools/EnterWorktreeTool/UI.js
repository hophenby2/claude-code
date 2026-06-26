import { jsx, jsxs } from "react/jsx-runtime";
import { Box, Text } from "../../ink.js";
function renderToolUseMessage() {
  return "Creating worktree\u2026";
}
function renderToolResultMessage(output, _progressMessagesForMessage, _options) {
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs(Text, { children: [
      "Switched to worktree on branch ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: output.worktreeBranch })
    ] }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: output.worktreePath })
  ] });
}
export {
  renderToolResultMessage,
  renderToolUseMessage
};
