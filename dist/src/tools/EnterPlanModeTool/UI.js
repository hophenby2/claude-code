import { jsx, jsxs } from "react/jsx-runtime";
import { BLACK_CIRCLE } from "../../constants/figures.js";
import { getModeColor } from "../../utils/permissions/PermissionMode.js";
import { Box, Text } from "../../ink.js";
function renderToolUseMessage() {
  return null;
}
function renderToolResultMessage(_output, _progressMessagesForMessage, _options) {
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
    /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      /* @__PURE__ */ jsx(Text, { color: getModeColor("plan"), children: BLACK_CIRCLE }),
      /* @__PURE__ */ jsx(Text, { children: " Entered plan mode" })
    ] }),
    /* @__PURE__ */ jsx(Box, { paddingLeft: 2, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Claude is now exploring and designing an implementation approach." }) })
  ] });
}
function renderToolUseRejectedMessage() {
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: 1, children: [
    /* @__PURE__ */ jsx(Text, { color: getModeColor("default"), children: BLACK_CIRCLE }),
    /* @__PURE__ */ jsx(Text, { children: " User declined to enter plan mode" })
  ] });
}
export {
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage
};
