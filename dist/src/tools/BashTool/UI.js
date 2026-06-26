import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { KeyboardShortcutHint } from "../../components/design-system/KeyboardShortcutHint.js";
import { FallbackToolUseErrorMessage } from "../../components/FallbackToolUseErrorMessage.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { ShellProgressMessage } from "../../components/shell/ShellProgressMessage.js";
import { Box, Text } from "../../ink.js";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
import { useShortcutDisplay } from "../../keybindings/useShortcutDisplay.js";
import { useAppStateStore, useSetAppState } from "../../state/AppState.js";
import { backgroundAll } from "../../tasks/LocalShellTask/LocalShellTask.js";
import { env } from "../../utils/env.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { getDisplayPath } from "../../utils/file.js";
import { isFullscreenEnvEnabled } from "../../utils/fullscreen.js";
import BashToolResultMessage from "./BashToolResultMessage.js";
import { extractBashCommentLabel } from "./commentLabel.js";
import { parseSedEditCommand } from "./sedEditParser.js";
const MAX_COMMAND_DISPLAY_LINES = 2;
const MAX_COMMAND_DISPLAY_CHARS = 160;
function BackgroundHint(t0) {
  const $ = _c(9);
  let t1;
  if ($[0] !== t0) {
    t1 = t0 === void 0 ? {} : t0;
    $[0] = t0;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const {
    onBackground
  } = t1;
  const store = useAppStateStore();
  const setAppState = useSetAppState();
  let t2;
  if ($[2] !== onBackground || $[3] !== setAppState || $[4] !== store) {
    t2 = () => {
      backgroundAll(() => store.getState(), setAppState);
      onBackground?.();
    };
    $[2] = onBackground;
    $[3] = setAppState;
    $[4] = store;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  const handleBackground = t2;
  let t3;
  if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = {
      context: "Task"
    };
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  useKeybinding("task:background", handleBackground, t3);
  const baseShortcut = useShortcutDisplay("task:background", "Task", "ctrl+b");
  const shortcut = env.terminal === "tmux" && baseShortcut === "ctrl+b" ? "ctrl+b ctrl+b (twice)" : baseShortcut;
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null;
  }
  let t4;
  if ($[7] !== shortcut) {
    t4 = /* @__PURE__ */ jsx(Box, { paddingLeft: 5, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut, action: "run in background", parens: true }) }) });
    $[7] = shortcut;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  return t4;
}
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
  const sedInfo = parseSedEditCommand(command);
  if (sedInfo) {
    return verbose ? sedInfo.filePath : getDisplayPath(sedInfo.filePath);
  }
  if (!verbose) {
    const lines = command.split("\n");
    if (isFullscreenEnvEnabled()) {
      const label = extractBashCommentLabel(command);
      if (label) {
        return label.length > MAX_COMMAND_DISPLAY_CHARS ? label.slice(0, MAX_COMMAND_DISPLAY_CHARS) + "\u2026" : label;
      }
    }
    const needsLineTruncation = lines.length > MAX_COMMAND_DISPLAY_LINES;
    const needsCharTruncation = command.length > MAX_COMMAND_DISPLAY_CHARS;
    if (needsLineTruncation || needsCharTruncation) {
      let truncated = command;
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
  return command;
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
  return /* @__PURE__ */ jsx(BashToolResultMessage, { content, verbose, timeoutMs });
}
function renderToolUseErrorMessage(result, {
  verbose,
  progressMessagesForMessage: _progressMessagesForMessage,
  tools: _tools
}) {
  return /* @__PURE__ */ jsx(FallbackToolUseErrorMessage, { result, verbose });
}
export {
  BackgroundHint,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseQueuedMessage
};
