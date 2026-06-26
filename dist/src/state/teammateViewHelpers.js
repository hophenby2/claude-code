import { logEvent } from "../services/analytics/index.js";
import { isTerminalTaskStatus } from "../Task.js";
const PANEL_GRACE_MS = 3e4;
function isLocalAgent(task) {
  return typeof task === "object" && task !== null && "type" in task && task.type === "local_agent";
}
function release(task) {
  return {
    ...task,
    retain: false,
    messages: void 0,
    diskLoaded: false,
    evictAfter: isTerminalTaskStatus(task.status) ? Date.now() + PANEL_GRACE_MS : void 0
  };
}
function enterTeammateView(taskId, setAppState) {
  logEvent("tengu_transcript_view_enter", {});
  setAppState((prev) => {
    const task = prev.tasks[taskId];
    const prevId = prev.viewingAgentTaskId;
    const prevTask = prevId !== void 0 ? prev.tasks[prevId] : void 0;
    const switching = prevId !== void 0 && prevId !== taskId && isLocalAgent(prevTask) && prevTask.retain;
    const needsRetain = isLocalAgent(task) && (!task.retain || task.evictAfter !== void 0);
    const needsView = prev.viewingAgentTaskId !== taskId || prev.viewSelectionMode !== "viewing-agent";
    if (!needsRetain && !needsView && !switching) return prev;
    let tasks = prev.tasks;
    if (switching || needsRetain) {
      tasks = { ...prev.tasks };
      if (switching) tasks[prevId] = release(prevTask);
      if (needsRetain) {
        tasks[taskId] = { ...task, retain: true, evictAfter: void 0 };
      }
    }
    return {
      ...prev,
      viewingAgentTaskId: taskId,
      viewSelectionMode: "viewing-agent",
      tasks
    };
  });
}
function exitTeammateView(setAppState) {
  logEvent("tengu_transcript_view_exit", {});
  setAppState((prev) => {
    const id = prev.viewingAgentTaskId;
    const cleared = {
      ...prev,
      viewingAgentTaskId: void 0,
      viewSelectionMode: "none"
    };
    if (id === void 0) {
      return prev.viewSelectionMode === "none" ? prev : cleared;
    }
    const task = prev.tasks[id];
    if (!isLocalAgent(task) || !task.retain) return cleared;
    return {
      ...cleared,
      tasks: { ...prev.tasks, [id]: release(task) }
    };
  });
}
function stopOrDismissAgent(taskId, setAppState) {
  setAppState((prev) => {
    const task = prev.tasks[taskId];
    if (!isLocalAgent(task)) return prev;
    if (task.status === "running") {
      task.abortController?.abort();
      return prev;
    }
    if (task.evictAfter === 0) return prev;
    const viewingThis = prev.viewingAgentTaskId === taskId;
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: { ...release(task), evictAfter: 0 }
      },
      ...viewingThis && {
        viewingAgentTaskId: void 0,
        viewSelectionMode: "none"
      }
    };
  });
}
export {
  enterTeammateView,
  exitTeammateView,
  stopOrDismissAgent
};
