import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { KeyboardShortcutHint } from "../../components/design-system/KeyboardShortcutHint.js";
import { FallbackToolUseErrorMessage } from "../../components/FallbackToolUseErrorMessage.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { OutputLine } from "../../components/shell/OutputLine.js";
import { ShellProgressMessage } from "../../components/shell/ShellProgressMessage.js";
import { ShellTimeDisplay } from "../../components/shell/ShellTimeDisplay.js";
import { Box, Text } from "../../ink.js";
const MAX_COMMAND_DISPLAY_LINES = 2;
const MAX_COMMAND_DISPLAY_CHARS = 160;
function renderToolUseMessage(input, {
  verbose,
  theme: _theme
}) {
  const {
    command
  } = input;
  if (!command) {
    return null;
  }
  const displayCommand = command;
  if (!verbose) {
    const lines = displayCommand.split("\n");
    const needsLineTruncation = lines.length > MAX_COMMAND_DISPLAY_LINES;
    const needsCharTruncation = displayCommand.length > MAX_COMMAND_DISPLAY_CHARS;
    if (needsLineTruncation || needsCharTruncation) {
      let truncated = displayCommand;
      if (needsLineTruncation) {
        truncated = lines.slice(0, MAX_COMMAND_DISPLAY_LINES).join("\n");
      }
      if (truncated.length > MAX_COMMAND_DISPLAY_CHARS) {
        truncated = truncated.slice(0, MAX_COMMAND_DISPLAY_CHARS);
      }
      return /* @__PURE__ */ jsxs(Text, { children: [
        truncated.trim(),
        "\u2026"
      ] });
    }
  }
  return displayCommand;
}
function renderToolUseProgressMessage(progressMessagesForMessage, {
  verbose,
  tools: _tools,
  terminalSize: _terminalSize,
  inProgressToolCallCount: _inProgressToolCallCount
}) {
  const lastProgress = progressMessagesForMessage.at(-1);
  if (!lastProgress || !lastProgress.data) {
    return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Running\u2026" }) });
  }
  const data = lastProgress.data;
  return /* @__PURE__ */ jsx(ShellProgressMessage, { fullOutput: data.fullOutput, output: data.output, elapsedTimeSeconds: data.elapsedTimeSeconds, totalLines: data.totalLines, totalBytes: data.totalBytes, timeoutMs: data.timeoutMs, taskId: data.taskId, verbose });
}
function renderToolUseQueuedMessage() {
  return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Waiting\u2026" }) });
}
function renderToolResultMessage(content, progressMessagesForMessage, {
  verbose,
  theme: _theme,
  tools: _tools,
  style: _style
}) {
  const lastProgress = progressMessagesForMessage.at(-1);
  const timeoutMs = lastProgress?.data?.timeoutMs;
  const {
    stdout,
    stderr,
    interrupted,
    returnCodeInterpretation,
    isImage,
    backgroundTaskId
  } = content;
  if (isImage) {
    return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "[Image data detected and sent to Claude]" }) });
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    stdout !== "" ? /* @__PURE__ */ jsx(OutputLine, { content: stdout, verbose }) : null,
    stderr.trim() !== "" ? /* @__PURE__ */ jsx(OutputLine, { content: stderr, verbose, isError: true }) : null,
    stdout === "" && stderr.trim() === "" ? /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: backgroundTaskId ? /* @__PURE__ */ jsxs(Fragment, { children: [
      "Running in the background",
      " ",
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2193", action: "manage", parens: true })
    ] }) : interrupted ? "Interrupted" : returnCodeInterpretation || "(No output)" }) }) : null,
    timeoutMs ? /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(ShellTimeDisplay, { timeoutMs }) }) : null
  ] });
}
function renderToolUseErrorMessage(result, {
  verbose,
  progressMessagesForMessage: _progressMessagesForMessage,
  tools: _tools
}) {
  return /* @__PURE__ */ jsx(FallbackToolUseErrorMessage, { result, verbose });
}
export {
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseQueuedMessage
};
