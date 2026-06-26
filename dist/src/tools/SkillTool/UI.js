import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { SubAgentProvider } from "../../components/CtrlOToExpand.js";
import { FallbackToolUseErrorMessage } from "../../components/FallbackToolUseErrorMessage.js";
import { FallbackToolUseRejectedMessage } from "../../components/FallbackToolUseRejectedMessage.js";
import { Byline } from "../../components/design-system/Byline.js";
import { Message as MessageComponent } from "../../components/Message.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { Box, Text } from "../../ink.js";
import { buildSubagentLookups, EMPTY_LOOKUPS } from "../../utils/messages.js";
import { plural } from "../../utils/stringUtils.js";
const MAX_PROGRESS_MESSAGES_TO_SHOW = 3;
const INITIALIZING_TEXT = "Initializing\u2026";
function renderToolResultMessage(output) {
  if ("status" in output && output.status === "forked") {
    return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { children: /* @__PURE__ */ jsx(Byline, { children: ["Done"] }) }) });
  }
  const parts = ["Successfully loaded skill"];
  if ("allowedTools" in output && output.allowedTools && output.allowedTools.length > 0) {
    const count = output.allowedTools.length;
    parts.push(`${count} ${plural(count, "tool")} allowed`);
  }
  if ("model" in output && output.model) {
    parts.push(output.model);
  }
  return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { children: /* @__PURE__ */ jsx(Byline, { children: parts }) }) });
}
function renderToolUseMessage({
  skill
}, {
  commands
}) {
  if (!skill) {
    return null;
  }
  const command = commands?.find((c) => c.name === skill);
  const displayName = command?.loadedFrom === "commands_DEPRECATED" ? `/${skill}` : skill;
  return displayName;
}
function renderToolUseProgressMessage(progressMessages, {
  tools,
  verbose
}) {
  if (!progressMessages.length) {
    return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: INITIALIZING_TEXT }) });
  }
  const displayedMessages = verbose ? progressMessages : progressMessages.slice(-MAX_PROGRESS_MESSAGES_TO_SHOW);
  const hiddenCount = progressMessages.length - displayedMessages.length;
  const {
    inProgressToolUseIDs
  } = buildSubagentLookups(progressMessages.map((pm) => pm.data));
  return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx(SubAgentProvider, { children: displayedMessages.map((progressMessage) => /* @__PURE__ */ jsx(Box, { height: 1, overflow: "hidden", children: /* @__PURE__ */ jsx(MessageComponent, { message: progressMessage.data.message, lookups: EMPTY_LOOKUPS, addMargin: false, tools, commands: [], verbose, inProgressToolUseIDs, progressMessagesForMessage: [], shouldAnimate: false, shouldShowDot: false, style: "condensed", isTranscriptMode: false, isStatic: true }) }, progressMessage.uuid)) }),
    hiddenCount > 0 && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "+",
      hiddenCount,
      " more tool ",
      plural(hiddenCount, "use")
    ] })
  ] }) });
}
function renderToolUseRejectedMessage(_input, {
  progressMessagesForMessage,
  tools,
  verbose
}) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    renderToolUseProgressMessage(progressMessagesForMessage, {
      tools,
      verbose
    }),
    /* @__PURE__ */ jsx(FallbackToolUseRejectedMessage, {})
  ] });
}
function renderToolUseErrorMessage(result, {
  progressMessagesForMessage,
  tools,
  verbose
}) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    renderToolUseProgressMessage(progressMessagesForMessage, {
      tools,
      verbose
    }),
    /* @__PURE__ */ jsx(FallbackToolUseErrorMessage, { result, verbose })
  ] });
}
export {
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseRejectedMessage
};
