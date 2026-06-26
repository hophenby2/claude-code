import { jsx, jsxs } from "react/jsx-runtime";
import { MessageResponse } from "../../components/MessageResponse.js";
import { Text } from "../../ink.js";
import { truncate } from "../../utils/format.js";
function renderCreateToolUseMessage(input) {
  return `${input.cron ?? ""}${input.prompt ? `: ${truncate(input.prompt, 60, true)}` : ""}`;
}
function renderCreateResultMessage(output) {
  return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Text, { children: [
    "Scheduled ",
    /* @__PURE__ */ jsx(Text, { bold: true, children: output.id }),
    " ",
    /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "(",
      output.humanSchedule,
      ")"
    ] })
  ] }) });
}
function renderDeleteToolUseMessage(input) {
  return input.id ?? "";
}
function renderDeleteResultMessage(output) {
  return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Text, { children: [
    "Cancelled ",
    /* @__PURE__ */ jsx(Text, { bold: true, children: output.id })
  ] }) });
}
function renderListToolUseMessage() {
  return "";
}
function renderListResultMessage(output) {
  if (output.jobs.length === 0) {
    return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "No scheduled jobs" }) });
  }
  return /* @__PURE__ */ jsx(MessageResponse, { children: output.jobs.map((j) => /* @__PURE__ */ jsxs(Text, { children: [
    /* @__PURE__ */ jsx(Text, { bold: true, children: j.id }),
    " ",
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: j.humanSchedule })
  ] }, j.id)) });
}
export {
  renderCreateResultMessage,
  renderCreateToolUseMessage,
  renderDeleteResultMessage,
  renderDeleteToolUseMessage,
  renderListResultMessage,
  renderListToolUseMessage
};
