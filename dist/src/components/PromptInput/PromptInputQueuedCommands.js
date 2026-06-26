import { jsx } from "react/jsx-runtime";
const feature = (_name) => false;
import * as React from "react";
import { useMemo } from "react";
import { Box } from "../../ink.js";
import { useAppState } from "../../state/AppState.js";
import { STATUS_TAG, SUMMARY_TAG, TASK_NOTIFICATION_TAG } from "../../constants/xml.js";
import { QueuedMessageProvider } from "../../context/QueuedMessageContext.js";
import { useCommandQueue } from "../../hooks/useCommandQueue.js";
import { isQueuedCommandVisible } from "../../utils/messageQueueManager.js";
import { createUserMessage, EMPTY_LOOKUPS, normalizeMessages } from "../../utils/messages.js";
import { jsonParse } from "../../utils/slowOperations.js";
import { Message } from "../Message.js";
const EMPTY_SET = /* @__PURE__ */ new Set();
function isIdleNotification(value) {
  try {
    const parsed = jsonParse(value);
    return parsed?.type === "idle_notification";
  } catch {
    return false;
  }
}
const MAX_VISIBLE_NOTIFICATIONS = 3;
function createOverflowNotificationMessage(count) {
  return `<${TASK_NOTIFICATION_TAG}>
<${SUMMARY_TAG}>+${count} more tasks completed</${SUMMARY_TAG}>
<${STATUS_TAG}>completed</${STATUS_TAG}>
</${TASK_NOTIFICATION_TAG}>`;
}
function processQueuedCommands(queuedCommands) {
  const filteredCommands = queuedCommands.filter((cmd) => typeof cmd.value !== "string" || !isIdleNotification(cmd.value));
  const taskNotifications = filteredCommands.filter((cmd) => cmd.mode === "task-notification");
  const otherCommands = filteredCommands.filter((cmd) => cmd.mode !== "task-notification");
  if (taskNotifications.length <= MAX_VISIBLE_NOTIFICATIONS) {
    return [...otherCommands, ...taskNotifications];
  }
  const visibleNotifications = taskNotifications.slice(0, MAX_VISIBLE_NOTIFICATIONS - 1);
  const overflowCount = taskNotifications.length - (MAX_VISIBLE_NOTIFICATIONS - 1);
  const overflowCommand = {
    value: createOverflowNotificationMessage(overflowCount),
    mode: "task-notification"
  };
  return [...otherCommands, ...visibleNotifications, overflowCommand];
}
function PromptInputQueuedCommandsImpl() {
  const queuedCommands = useCommandQueue();
  const viewingAgent = useAppState((s) => !!s.viewingAgentTaskId);
  const useBriefLayout = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAppState((s_0) => s_0.isBriefOnly)
  ) : false;
  const messages = useMemo(() => {
    if (queuedCommands.length === 0) return null;
    const visibleCommands = queuedCommands.filter(isQueuedCommandVisible);
    if (visibleCommands.length === 0) return null;
    const processedCommands = processQueuedCommands(visibleCommands);
    return normalizeMessages(processedCommands.map((cmd) => {
      let content = cmd.value;
      if (cmd.mode === "bash" && typeof content === "string") {
        content = `<bash-input>${content}</bash-input>`;
      }
      return createUserMessage({
        content
      });
    }));
  }, [queuedCommands]);
  if (viewingAgent || messages === null) {
    return null;
  }
  return /* @__PURE__ */ jsx(Box, { marginTop: 1, flexDirection: "column", children: messages.map((message, i) => /* @__PURE__ */ jsx(QueuedMessageProvider, { isFirst: i === 0, useBriefLayout, children: /* @__PURE__ */ jsx(Message, { message, lookups: EMPTY_LOOKUPS, addMargin: false, tools: [], commands: [], verbose: false, inProgressToolUseIDs: EMPTY_SET, progressMessagesForMessage: [], shouldAnimate: false, shouldShowDot: false, isTranscriptMode: false, isStatic: true }) }, i)) });
}
const PromptInputQueuedCommands = React.memo(PromptInputQueuedCommandsImpl);
export {
  PromptInputQueuedCommands
};
