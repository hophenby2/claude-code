import { jsx, jsxs } from "react/jsx-runtime";
import { MessageResponse } from "../../components/MessageResponse.js";
import { Text } from "../../ink.js";
import { jsonStringify } from "../../utils/slowOperations.js";
function renderToolUseMessage(input) {
  if (!input.setting) return null;
  if (input.value === void 0) {
    return /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Getting ",
      input.setting
    ] });
  }
  return /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
    "Setting ",
    input.setting,
    " to ",
    jsonStringify(input.value)
  ] });
}
function renderToolResultMessage(content) {
  if (!content.success) {
    return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Text, { color: "error", children: [
      "Failed: ",
      content.error
    ] }) });
  }
  if (content.operation === "get") {
    return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Text, { children: [
      /* @__PURE__ */ jsx(Text, { bold: true, children: content.setting }),
      " = ",
      jsonStringify(content.value)
    ] }) });
  }
  return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Text, { children: [
    "Set ",
    /* @__PURE__ */ jsx(Text, { bold: true, children: content.setting }),
    " to",
    " ",
    /* @__PURE__ */ jsx(Text, { bold: true, children: jsonStringify(content.newValue) })
  ] }) });
}
function renderToolUseRejectedMessage() {
  return /* @__PURE__ */ jsx(Text, { color: "warning", children: "Config change rejected" });
}
export {
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage
};
