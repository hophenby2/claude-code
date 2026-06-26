import {
  OUTPUT_FILE_TAG,
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_NOTIFICATION_TAG,
  TASK_TYPE_TAG,
  TOOL_USE_ID_TAG
} from "../../constants/xml.js";
import {
  isTerminalTaskStatus
} from "../../Task.js";
import { enqueuePendingNotification } from "../messageQueueManager.js";
import { enqueueSdkEvent } from "../sdkEventQueue.js";
import { getTaskOutputDelta, getTaskOutputPath } from "./diskOutput.js";
const POLL_INTERVAL_MS = 1e3;
const STOPPED_DISPLAY_MS = 3e3;
const PANEL_GRACE_MS = 3e4;
function updateTaskState(taskId, setAppState, updater) {
  setAppState((prev) => {
    const task = prev.tasks?.[taskId];
    if (!task) {
      return prev;
    }
    const updated = updater(task);
    if (updated === task) {
      return prev;
    }
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: updated
      }
    };
  });
}
function registerTask(task, setAppState) {
  let isReplacement = false;
  setAppState((prev) => {
    const existing = prev.tasks[task.id];
    isReplacement = existing !== void 0;
    const merged = existing && "retain" in existing ? {
      ...task,
      retain: existing.retain,
      startTime: existing.startTime,
      messages: existing.messages,
      diskLoaded: existing.diskLoaded,
      pendingMessages: existing.pendingMessages
    } : task;
    return { ...prev, tasks: { ...prev.tasks, [task.id]: merged } };
  });
  if (isReplacement) return;
  enqueueSdkEvent({
    type: "system",
    subtype: "task_started",
    task_id: task.id,
    tool_use_id: task.toolUseId,
    description: task.description,
    task_type: task.type,
    workflow_name: "workflowName" in task ? task.workflowName : void 0,
    prompt: "prompt" in task ? task.prompt : void 0
  });
}
function evictTerminalTask(taskId, setAppState) {
  setAppState((prev) => {
    const task = prev.tasks?.[taskId];
    if (!task) return prev;
    if (!isTerminalTaskStatus(task.status)) return prev;
    if (!task.notified) return prev;
    if ("retain" in task && (task.evictAfter ?? Infinity) > Date.now()) {
      return prev;
    }
    const { [taskId]: _, ...remainingTasks } = prev.tasks;
    return { ...prev, tasks: remainingTasks };
  });
}
function getRunningTasks(state) {
  const tasks = state.tasks ?? {};
  return Object.values(tasks).filter((task) => task.status === "running");
}
async function generateTaskAttachments(state) {
  const attachments = [];
  const updatedTaskOffsets = {};
  const evictedTaskIds = [];
  const tasks = state.tasks ?? {};
  for (const taskState of Object.values(tasks)) {
    if (taskState.notified) {
      switch (taskState.status) {
        case "completed":
        case "failed":
        case "killed":
          evictedTaskIds.push(taskState.id);
          continue;
        case "pending":
          continue;
        case "running":
          break;
      }
    }
    if (taskState.status === "running") {
      const delta = await getTaskOutputDelta(
        taskState.id,
        taskState.outputOffset
      );
      if (delta.content) {
        updatedTaskOffsets[taskState.id] = delta.newOffset;
      }
    }
  }
  return { attachments, updatedTaskOffsets, evictedTaskIds };
}
function applyTaskOffsetsAndEvictions(setAppState, updatedTaskOffsets, evictedTaskIds) {
  const offsetIds = Object.keys(updatedTaskOffsets);
  if (offsetIds.length === 0 && evictedTaskIds.length === 0) {
    return;
  }
  setAppState((prev) => {
    let changed = false;
    const newTasks = { ...prev.tasks };
    for (const id of offsetIds) {
      const fresh = newTasks[id];
      if (fresh?.status === "running") {
        newTasks[id] = { ...fresh, outputOffset: updatedTaskOffsets[id] };
        changed = true;
      }
    }
    for (const id of evictedTaskIds) {
      const fresh = newTasks[id];
      if (!fresh || !isTerminalTaskStatus(fresh.status) || !fresh.notified) {
        continue;
      }
      if ("retain" in fresh && (fresh.evictAfter ?? Infinity) > Date.now()) {
        continue;
      }
      delete newTasks[id];
      changed = true;
    }
    return changed ? { ...prev, tasks: newTasks } : prev;
  });
}
async function pollTasks(getAppState, setAppState) {
  const state = getAppState();
  const { attachments, updatedTaskOffsets, evictedTaskIds } = await generateTaskAttachments(state);
  applyTaskOffsetsAndEvictions(setAppState, updatedTaskOffsets, evictedTaskIds);
  for (const attachment of attachments) {
    enqueueTaskNotification(attachment);
  }
}
function enqueueTaskNotification(attachment) {
  const statusText = getStatusText(attachment.status);
  const outputPath = getTaskOutputPath(attachment.taskId);
  const toolUseIdLine = attachment.toolUseId ? `
<${TOOL_USE_ID_TAG}>${attachment.toolUseId}</${TOOL_USE_ID_TAG}>` : "";
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${attachment.taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${TASK_TYPE_TAG}>${attachment.taskType}</${TASK_TYPE_TAG}>
<${OUTPUT_FILE_TAG}>${outputPath}</${OUTPUT_FILE_TAG}>
<${STATUS_TAG}>${attachment.status}</${STATUS_TAG}>
<${SUMMARY_TAG}>Task "${attachment.description}" ${statusText}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>`;
  enqueuePendingNotification({ value: message, mode: "task-notification" });
}
function getStatusText(status) {
  switch (status) {
    case "completed":
      return "completed successfully";
    case "failed":
      return "failed";
    case "killed":
      return "was stopped";
    case "running":
      return "is running";
    case "pending":
      return "is pending";
  }
}
export {
  PANEL_GRACE_MS,
  POLL_INTERVAL_MS,
  STOPPED_DISPLAY_MS,
  applyTaskOffsetsAndEvictions,
  evictTerminalTask,
  generateTaskAttachments,
  getRunningTasks,
  pollTasks,
  registerTask,
  updateTaskState
};
