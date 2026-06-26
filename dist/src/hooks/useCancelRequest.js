import { useCallback, useRef } from "react";
import { logEvent } from "../services/analytics/index.js";
import {
  useAppState,
  useAppStateStore,
  useSetAppState
} from "../state/AppState.js";
import { isVimModeEnabled } from "../components/PromptInput/utils.js";
import { useNotifications } from "../context/notifications.js";
import { useIsOverlayActive } from "../context/overlayContext.js";
import { useCommandQueue } from "../hooks/useCommandQueue.js";
import { getShortcutDisplay } from "../keybindings/shortcutFormat.js";
import { useKeybinding } from "../keybindings/useKeybinding.js";
import { exitTeammateView } from "../state/teammateViewHelpers.js";
import {
  killAllRunningAgentTasks,
  markAgentsNotified
} from "../tasks/LocalAgentTask/LocalAgentTask.js";
import {
  clearCommandQueue,
  enqueuePendingNotification,
  hasCommandsInQueue
} from "../utils/messageQueueManager.js";
import { emitTaskTerminatedSdk } from "../utils/sdkEventQueue.js";
const KILL_AGENTS_CONFIRM_WINDOW_MS = 3e3;
function CancelRequestHandler(props) {
  const {
    setToolUseConfirmQueue,
    onCancel,
    onAgentsKilled,
    isMessageSelectorVisible,
    screen,
    abortSignal,
    popCommandFromQueue,
    vimMode,
    isLocalJSXCommand,
    isSearchingHistory,
    isHelpOpen,
    inputMode,
    inputValue,
    streamMode
  } = props;
  const store = useAppStateStore();
  const setAppState = useSetAppState();
  const queuedCommandsLength = useCommandQueue().length;
  const { addNotification, removeNotification } = useNotifications();
  const lastKillAgentsPressRef = useRef(0);
  const viewSelectionMode = useAppState((s) => s.viewSelectionMode);
  const handleCancel = useCallback(() => {
    const cancelProps = {
      source: "escape",
      streamMode
    };
    if (abortSignal !== void 0 && !abortSignal.aborted) {
      logEvent("tengu_cancel", cancelProps);
      setToolUseConfirmQueue(() => []);
      onCancel();
      return;
    }
    if (hasCommandsInQueue()) {
      if (popCommandFromQueue) {
        popCommandFromQueue();
        return;
      }
    }
    logEvent("tengu_cancel", cancelProps);
    setToolUseConfirmQueue(() => []);
    onCancel();
  }, [
    abortSignal,
    popCommandFromQueue,
    setToolUseConfirmQueue,
    onCancel,
    streamMode
  ]);
  const isOverlayActive = useIsOverlayActive();
  const canCancelRunningTask = abortSignal !== void 0 && !abortSignal.aborted;
  const hasQueuedCommands = queuedCommandsLength > 0;
  const isInSpecialModeWithEmptyInput = inputMode !== void 0 && inputMode !== "prompt" && !inputValue;
  const isViewingTeammate = viewSelectionMode === "viewing-agent";
  const isContextActive = screen !== "transcript" && !isSearchingHistory && !isMessageSelectorVisible && !isLocalJSXCommand && !isHelpOpen && !isOverlayActive && !(isVimModeEnabled() && vimMode === "INSERT");
  const isEscapeActive = isContextActive && (canCancelRunningTask || hasQueuedCommands) && !isInSpecialModeWithEmptyInput && !isViewingTeammate;
  const isCtrlCActive = isContextActive && (canCancelRunningTask || hasQueuedCommands || isViewingTeammate);
  useKeybinding("chat:cancel", handleCancel, {
    context: "Chat",
    isActive: isEscapeActive
  });
  const killAllAgentsAndNotify = useCallback(() => {
    const tasks = store.getState().tasks;
    const running = Object.entries(tasks).filter(
      ([, t]) => t.type === "local_agent" && t.status === "running"
    );
    if (running.length === 0) return false;
    killAllRunningAgentTasks(tasks, setAppState);
    const descriptions = [];
    for (const [taskId, task] of running) {
      markAgentsNotified(taskId, setAppState);
      descriptions.push(task.description);
      emitTaskTerminatedSdk(taskId, "stopped", {
        toolUseId: task.toolUseId,
        summary: task.description
      });
    }
    const summary = descriptions.length === 1 ? `Background agent "${descriptions[0]}" was stopped by the user.` : `${descriptions.length} background agents were stopped by the user: ${descriptions.map((d) => `"${d}"`).join(", ")}.`;
    enqueuePendingNotification({ value: summary, mode: "task-notification" });
    onAgentsKilled();
    return true;
  }, [store, setAppState, onAgentsKilled]);
  const handleInterrupt = useCallback(() => {
    if (isViewingTeammate) {
      killAllAgentsAndNotify();
      exitTeammateView(setAppState);
    }
    if (canCancelRunningTask || hasQueuedCommands) {
      handleCancel();
    }
  }, [
    isViewingTeammate,
    killAllAgentsAndNotify,
    setAppState,
    canCancelRunningTask,
    hasQueuedCommands,
    handleCancel
  ]);
  useKeybinding("app:interrupt", handleInterrupt, {
    context: "Global",
    isActive: isCtrlCActive
  });
  const handleKillAgents = useCallback(() => {
    const tasks = store.getState().tasks;
    const hasRunningAgents = Object.values(tasks).some(
      (t) => t.type === "local_agent" && t.status === "running"
    );
    if (!hasRunningAgents) {
      addNotification({
        key: "kill-agents-none",
        text: "No background agents running",
        priority: "immediate",
        timeoutMs: 2e3
      });
      return;
    }
    const now = Date.now();
    const elapsed = now - lastKillAgentsPressRef.current;
    if (elapsed <= KILL_AGENTS_CONFIRM_WINDOW_MS) {
      lastKillAgentsPressRef.current = 0;
      removeNotification("kill-agents-confirm");
      logEvent("tengu_cancel", {
        source: "kill_agents"
      });
      clearCommandQueue();
      killAllAgentsAndNotify();
      return;
    }
    lastKillAgentsPressRef.current = now;
    const shortcut = getShortcutDisplay(
      "chat:killAgents",
      "Chat",
      "ctrl+x ctrl+k"
    );
    addNotification({
      key: "kill-agents-confirm",
      text: `Press ${shortcut} again to stop background agents`,
      priority: "immediate",
      timeoutMs: KILL_AGENTS_CONFIRM_WINDOW_MS
    });
  }, [store, addNotification, removeNotification, killAllAgentsAndNotify]);
  useKeybinding("chat:killAgents", handleKillAgents, {
    context: "Chat"
  });
  return null;
}
export {
  CancelRequestHandler
};
