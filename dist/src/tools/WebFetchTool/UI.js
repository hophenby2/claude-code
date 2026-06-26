import { jsx, jsxs } from "react/jsx-runtime";
import { MessageResponse } from "../../components/MessageResponse.js";
import { TOOL_SUMMARY_MAX_LENGTH } from "../../constants/toolLimits.js";
import { Box, Text } from "../../ink.js";
import { formatFileSize, truncate } from "../../utils/format.js";
function renderToolUseMessage({
  url,
  prompt
}, {
  verbose
}) {
  if (!url) {
    return null;
  }
  if (verbose) {
    return `url: "${url}"${verbose && prompt ? `, prompt: "${prompt}"` : ""}`;
  }
  return url;
}
function renderToolUseProgressMessage() {
  return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Fetching\u2026" }) });
}
function renderToolResultMessage({
  bytes,
  code,
  codeText,
  result
}, _progressMessagesForMessage, {
  verbose
}) {
  const formattedSize = formatFileSize(bytes);
  if (verbose) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
        "Received ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: formattedSize }),
        " (",
        code,
        " ",
        codeText,
        ")"
      ] }) }),
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(Text, { children: result }) })
    ] });
  }
  return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
    "Received ",
    /* @__PURE__ */ jsx(Text, { bold: true, children: formattedSize }),
    " (",
    code,
    " ",
    codeText,
    ")"
  ] }) });
}
function getToolUseSummary(input) {
  if (!input?.url) {
    return null;
  }
  return truncate(input.url, TOOL_SUMMARY_MAX_LENGTH);
}
export {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage
};
