import { isTerminalTaskStatus } from "../../Task.js";
import { logForDebugging } from "../../utils/debug.js";
import { createUserMessage } from "../../utils/messages.js";
import { killInProcessTeammate } from "../../utils/swarm/spawnInProcess.js";
import { updateTaskState } from "../../utils/task/framework.js";
import { appendCappedMessage, isInProcessTeammateTask } from "./types.js";
const InProcessTeammateTask = {
  name: "InProcessTeammateTask",
  type: "in_process_teammate",
  async kill(taskId, setAppState) {
    killInProcessTeammate(taskId, setAppState);
  }
};
function requestTeammateShutdown(taskId, setAppState) {
  updateTaskState(taskId, setAppState, (task) => {
    if (task.status !== "running" || task.shutdownRequested) {
      return task;
    }
    return {
      ...task,
      shutdownRequested: true
    };
  });
}
function appendTeammateMessage(taskId, message, setAppState) {
  updateTaskState(taskId, setAppState, (task) => {
    if (task.status !== "running") {
      return task;
    }
    return {
      ...task,
      messages: appendCappedMessage(task.messages, message)
    };
  });
}
function injectUserMessageToTeammate(taskId, message, setAppState) {
  updateTaskState(taskId, setAppState, (task) => {
    if (isTerminalTaskStatus(task.status)) {
      logForDebugging(`Dropping message for teammate task ${taskId}: task status is "${task.status}"`);
      return task;
    }
    return {
      ...task,
      pendingUserMessages: [...task.pendingUserMessages, message],
      messages: appendCappedMessage(task.messages, createUserMessage({
        content: message
      }))
    };
  });
}
function findTeammateTaskByAgentId(agentId, tasks) {
  let fallback;
  for (const task of Object.values(tasks)) {
    if (isInProcessTeammateTask(task) && task.identity.agentId === agentId) {
      if (task.status === "running") {
        return task;
      }
      if (!fallback) {
        fallback = task;
      }
    }
  }
  return fallback;
}
function getAllInProcessTeammateTasks(tasks) {
  return Object.values(tasks).filter(isInProcessTeammateTask);
}
function getRunningTeammatesSorted(tasks) {
  return getAllInProcessTeammateTasks(tasks).filter((t) => t.status === "running").sort((a, b) => a.identity.agentName.localeCompare(b.identity.agentName));
}
export {
  InProcessTeammateTask,
  appendTeammateMessage,
  findTeammateTaskByAgentId,
  getAllInProcessTeammateTasks,
  getRunningTeammatesSorted,
  injectUserMessageToTeammate,
  requestTeammateShutdown
};
