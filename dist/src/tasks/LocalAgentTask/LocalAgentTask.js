import { getSdkAgentProgressSummariesEnabled } from "../../bootstrap/state.js";
import { OUTPUT_FILE_TAG, STATUS_TAG, SUMMARY_TAG, TASK_ID_TAG, TASK_NOTIFICATION_TAG, TOOL_USE_ID_TAG, WORKTREE_BRANCH_TAG, WORKTREE_PATH_TAG, WORKTREE_TAG } from "../../constants/xml.js";
import { abortSpeculation } from "../../services/PromptSuggestion/speculation.js";
import { createTaskStateBase } from "../../Task.js";
import { findToolByName } from "../../Tool.js";
import { SYNTHETIC_OUTPUT_TOOL_NAME } from "../../tools/SyntheticOutputTool/SyntheticOutputTool.js";
import { asAgentId } from "../../types/ids.js";
import { createAbortController, createChildAbortController } from "../../utils/abortController.js";
import { registerCleanup } from "../../utils/cleanupRegistry.js";
import { getToolSearchOrReadInfo } from "../../utils/collapseReadSearch.js";
import { enqueuePendingNotification } from "../../utils/messageQueueManager.js";
import { getAgentTranscriptPath } from "../../utils/sessionStorage.js";
import { evictTaskOutput, getTaskOutputPath, initTaskOutputAsSymlink } from "../../utils/task/diskOutput.js";
import { PANEL_GRACE_MS, registerTask, updateTaskState } from "../../utils/task/framework.js";
import { emitTaskProgress } from "../../utils/task/sdkProgress.js";
const MAX_RECENT_ACTIVITIES = 5;
function createProgressTracker() {
  return {
    toolUseCount: 0,
    latestInputTokens: 0,
    cumulativeOutputTokens: 0,
    recentActivities: []
  };
}
function getTokenCountFromTracker(tracker) {
  return tracker.latestInputTokens + tracker.cumulativeOutputTokens;
}
function updateProgressFromMessage(tracker, message, resolveActivityDescription, tools) {
  if (message.type !== "assistant") {
    return;
  }
  const usage = message.message.usage;
  tracker.latestInputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  tracker.cumulativeOutputTokens += usage.output_tokens;
  for (const content of message.message.content) {
    if (content.type === "tool_use") {
      tracker.toolUseCount++;
      if (content.name !== SYNTHETIC_OUTPUT_TOOL_NAME) {
        const input = content.input;
        const classification = tools ? getToolSearchOrReadInfo(content.name, input, tools) : void 0;
        tracker.recentActivities.push({
          toolName: content.name,
          input,
          activityDescription: resolveActivityDescription?.(content.name, input),
          isSearch: classification?.isSearch,
          isRead: classification?.isRead
        });
      }
    }
  }
  while (tracker.recentActivities.length > MAX_RECENT_ACTIVITIES) {
    tracker.recentActivities.shift();
  }
}
function getProgressUpdate(tracker) {
  return {
    toolUseCount: tracker.toolUseCount,
    tokenCount: getTokenCountFromTracker(tracker),
    lastActivity: tracker.recentActivities.length > 0 ? tracker.recentActivities[tracker.recentActivities.length - 1] : void 0,
    recentActivities: [...tracker.recentActivities]
  };
}
function createActivityDescriptionResolver(tools) {
  return (toolName, input) => {
    const tool = findToolByName(tools, toolName);
    return tool?.getActivityDescription?.(input) ?? void 0;
  };
}
function isLocalAgentTask(task) {
  return typeof task === "object" && task !== null && "type" in task && task.type === "local_agent";
}
function isPanelAgentTask(t) {
  return isLocalAgentTask(t) && t.agentType !== "main-session";
}
function queuePendingMessage(taskId, msg, setAppState) {
  updateTaskState(taskId, setAppState, (task) => ({
    ...task,
    pendingMessages: [...task.pendingMessages, msg]
  }));
}
function appendMessageToLocalAgent(taskId, message, setAppState) {
  updateTaskState(taskId, setAppState, (task) => ({
    ...task,
    messages: [...task.messages ?? [], message]
  }));
}
function drainPendingMessages(taskId, getAppState, setAppState) {
  const task = getAppState().tasks[taskId];
  if (!isLocalAgentTask(task) || task.pendingMessages.length === 0) {
    return [];
  }
  const drained = task.pendingMessages;
  updateTaskState(taskId, setAppState, (t) => ({
    ...t,
    pendingMessages: []
  }));
  return drained;
}
function enqueueAgentNotification({
  taskId,
  description,
  status,
  error,
  setAppState,
  finalMessage,
  usage,
  toolUseId,
  worktreePath,
  worktreeBranch
}) {
  let shouldEnqueue = false;
  updateTaskState(taskId, setAppState, (task) => {
    if (task.notified) {
      return task;
    }
    shouldEnqueue = true;
    return {
      ...task,
      notified: true
    };
  });
  if (!shouldEnqueue) {
    return;
  }
  abortSpeculation(setAppState);
  const summary = status === "completed" ? `Agent "${description}" completed` : status === "failed" ? `Agent "${description}" failed: ${error || "Unknown error"}` : `Agent "${description}" was stopped`;
  const outputPath = getTaskOutputPath(taskId);
  const toolUseIdLine = toolUseId ? `
<${TOOL_USE_ID_TAG}>${toolUseId}</${TOOL_USE_ID_TAG}>` : "";
  const resultSection = finalMessage ? `
<result>${finalMessage}</result>` : "";
  const usageSection = usage ? `
<usage><total_tokens>${usage.totalTokens}</total_tokens><tool_uses>${usage.toolUses}</tool_uses><duration_ms>${usage.durationMs}</duration_ms></usage>` : "";
  const worktreeSection = worktreePath ? `
<${WORKTREE_TAG}><${WORKTREE_PATH_TAG}>${worktreePath}</${WORKTREE_PATH_TAG}>${worktreeBranch ? `<${WORKTREE_BRANCH_TAG}>${worktreeBranch}</${WORKTREE_BRANCH_TAG}>` : ""}</${WORKTREE_TAG}>` : "";
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${OUTPUT_FILE_TAG}>${outputPath}</${OUTPUT_FILE_TAG}>
<${STATUS_TAG}>${status}</${STATUS_TAG}>
<${SUMMARY_TAG}>${summary}</${SUMMARY_TAG}>${resultSection}${usageSection}${worktreeSection}
</${TASK_NOTIFICATION_TAG}>`;
  enqueuePendingNotification({
    value: message,
    mode: "task-notification"
  });
}
const LocalAgentTask = {
  name: "LocalAgentTask",
  type: "local_agent",
  async kill(taskId, setAppState) {
    killAsyncAgent(taskId, setAppState);
  }
};
function killAsyncAgent(taskId, setAppState) {
  let killed = false;
  updateTaskState(taskId, setAppState, (task) => {
    if (task.status !== "running") {
      return task;
    }
    killed = true;
    task.abortController?.abort();
    task.unregisterCleanup?.();
    return {
      ...task,
      status: "killed",
      endTime: Date.now(),
      evictAfter: task.retain ? void 0 : Date.now() + PANEL_GRACE_MS,
      abortController: void 0,
      unregisterCleanup: void 0,
      selectedAgent: void 0
    };
  });
  if (killed) {
    void evictTaskOutput(taskId);
  }
}
function killAllRunningAgentTasks(tasks, setAppState) {
  for (const [taskId, task] of Object.entries(tasks)) {
    if (task.type === "local_agent" && task.status === "running") {
      killAsyncAgent(taskId, setAppState);
    }
  }
}
function markAgentsNotified(taskId, setAppState) {
  updateTaskState(taskId, setAppState, (task) => {
    if (task.notified) {
      return task;
    }
    return {
      ...task,
      notified: true
    };
  });
}
function updateAgentProgress(taskId, progress, setAppState) {
  updateTaskState(taskId, setAppState, (task) => {
    if (task.status !== "running") {
      return task;
    }
    const existingSummary = task.progress?.summary;
    return {
      ...task,
      progress: existingSummary ? {
        ...progress,
        summary: existingSummary
      } : progress
    };
  });
}
function updateAgentSummary(taskId, summary, setAppState) {
  let captured = null;
  updateTaskState(taskId, setAppState, (task) => {
    if (task.status !== "running") {
      return task;
    }
    captured = {
      tokenCount: task.progress?.tokenCount ?? 0,
      toolUseCount: task.progress?.toolUseCount ?? 0,
      startTime: task.startTime,
      toolUseId: task.toolUseId
    };
    return {
      ...task,
      progress: {
        ...task.progress,
        toolUseCount: task.progress?.toolUseCount ?? 0,
        tokenCount: task.progress?.tokenCount ?? 0,
        summary
      }
    };
  });
  if (captured && getSdkAgentProgressSummariesEnabled()) {
    const {
      tokenCount,
      toolUseCount,
      startTime,
      toolUseId
    } = captured;
    emitTaskProgress({
      taskId,
      toolUseId,
      description: summary,
      startTime,
      totalTokens: tokenCount,
      toolUses: toolUseCount,
      summary
    });
  }
}
function completeAgentTask(result, setAppState) {
  const taskId = result.agentId;
  updateTaskState(taskId, setAppState, (task) => {
    if (task.status !== "running") {
      return task;
    }
    task.unregisterCleanup?.();
    return {
      ...task,
      status: "completed",
      result,
      endTime: Date.now(),
      evictAfter: task.retain ? void 0 : Date.now() + PANEL_GRACE_MS,
      abortController: void 0,
      unregisterCleanup: void 0,
      selectedAgent: void 0
    };
  });
  void evictTaskOutput(taskId);
}
function failAgentTask(taskId, error, setAppState) {
  updateTaskState(taskId, setAppState, (task) => {
    if (task.status !== "running") {
      return task;
    }
    task.unregisterCleanup?.();
    return {
      ...task,
      status: "failed",
      error,
      endTime: Date.now(),
      evictAfter: task.retain ? void 0 : Date.now() + PANEL_GRACE_MS,
      abortController: void 0,
      unregisterCleanup: void 0,
      selectedAgent: void 0
    };
  });
  void evictTaskOutput(taskId);
}
function registerAsyncAgent({
  agentId,
  description,
  prompt,
  selectedAgent,
  setAppState,
  parentAbortController,
  toolUseId
}) {
  void initTaskOutputAsSymlink(agentId, getAgentTranscriptPath(asAgentId(agentId)));
  const abortController = parentAbortController ? createChildAbortController(parentAbortController) : createAbortController();
  const taskState = {
    ...createTaskStateBase(agentId, "local_agent", description, toolUseId),
    type: "local_agent",
    status: "running",
    agentId,
    prompt,
    selectedAgent,
    agentType: selectedAgent.agentType ?? "general-purpose",
    abortController,
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    // registerAsyncAgent immediately backgrounds
    pendingMessages: [],
    retain: false,
    diskLoaded: false
  };
  const unregisterCleanup = registerCleanup(async () => {
    killAsyncAgent(agentId, setAppState);
  });
  taskState.unregisterCleanup = unregisterCleanup;
  registerTask(taskState, setAppState);
  return taskState;
}
const backgroundSignalResolvers = /* @__PURE__ */ new Map();
function registerAgentForeground({
  agentId,
  description,
  prompt,
  selectedAgent,
  setAppState,
  autoBackgroundMs,
  toolUseId
}) {
  void initTaskOutputAsSymlink(agentId, getAgentTranscriptPath(asAgentId(agentId)));
  const abortController = createAbortController();
  const unregisterCleanup = registerCleanup(async () => {
    killAsyncAgent(agentId, setAppState);
  });
  const taskState = {
    ...createTaskStateBase(agentId, "local_agent", description, toolUseId),
    type: "local_agent",
    status: "running",
    agentId,
    prompt,
    selectedAgent,
    agentType: selectedAgent.agentType ?? "general-purpose",
    abortController,
    unregisterCleanup,
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: false,
    // Not yet backgrounded - running in foreground
    pendingMessages: [],
    retain: false,
    diskLoaded: false
  };
  let resolveBackgroundSignal;
  const backgroundSignal = new Promise((resolve) => {
    resolveBackgroundSignal = resolve;
  });
  backgroundSignalResolvers.set(agentId, resolveBackgroundSignal);
  registerTask(taskState, setAppState);
  let cancelAutoBackground;
  if (autoBackgroundMs !== void 0 && autoBackgroundMs > 0) {
    const timer = setTimeout((setAppState2, agentId2) => {
      setAppState2((prev) => {
        const prevTask = prev.tasks[agentId2];
        if (!isLocalAgentTask(prevTask) || prevTask.isBackgrounded) {
          return prev;
        }
        return {
          ...prev,
          tasks: {
            ...prev.tasks,
            [agentId2]: {
              ...prevTask,
              isBackgrounded: true
            }
          }
        };
      });
      const resolver = backgroundSignalResolvers.get(agentId2);
      if (resolver) {
        resolver();
        backgroundSignalResolvers.delete(agentId2);
      }
    }, autoBackgroundMs, setAppState, agentId);
    cancelAutoBackground = () => clearTimeout(timer);
  }
  return {
    taskId: agentId,
    backgroundSignal,
    cancelAutoBackground
  };
}
function backgroundAgentTask(taskId, getAppState, setAppState) {
  const state = getAppState();
  const task = state.tasks[taskId];
  if (!isLocalAgentTask(task) || task.isBackgrounded) {
    return false;
  }
  setAppState((prev) => {
    const prevTask = prev.tasks[taskId];
    if (!isLocalAgentTask(prevTask)) {
      return prev;
    }
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...prevTask,
          isBackgrounded: true
        }
      }
    };
  });
  const resolver = backgroundSignalResolvers.get(taskId);
  if (resolver) {
    resolver();
    backgroundSignalResolvers.delete(taskId);
  }
  return true;
}
function unregisterAgentForeground(taskId, setAppState) {
  backgroundSignalResolvers.delete(taskId);
  let cleanupFn;
  setAppState((prev) => {
    const task = prev.tasks[taskId];
    if (!isLocalAgentTask(task) || task.isBackgrounded) {
      return prev;
    }
    cleanupFn = task.unregisterCleanup;
    const {
      [taskId]: removed,
      ...rest
    } = prev.tasks;
    return {
      ...prev,
      tasks: rest
    };
  });
  cleanupFn?.();
}
export {
  LocalAgentTask,
  appendMessageToLocalAgent,
  backgroundAgentTask,
  completeAgentTask,
  createActivityDescriptionResolver,
  createProgressTracker,
  drainPendingMessages,
  enqueueAgentNotification,
  failAgentTask,
  getProgressUpdate,
  getTokenCountFromTracker,
  isLocalAgentTask,
  isPanelAgentTask,
  killAllRunningAgentTasks,
  killAsyncAgent,
  markAgentsNotified,
  queuePendingMessage,
  registerAgentForeground,
  registerAsyncAgent,
  unregisterAgentForeground,
  updateAgentProgress,
  updateAgentSummary,
  updateProgressFromMessage
};
