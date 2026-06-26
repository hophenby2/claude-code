import { logForDebugging } from "../../utils/debug.js";
import { logError } from "../../utils/log.js";
import { dequeueAllMatching } from "../../utils/messageQueueManager.js";
import { evictTaskOutput } from "../../utils/task/diskOutput.js";
import { updateTaskState } from "../../utils/task/framework.js";
import { isLocalShellTask } from "./guards.js";
function killTask(taskId, setAppState) {
  updateTaskState(taskId, setAppState, (task) => {
    if (task.status !== "running" || !isLocalShellTask(task)) {
      return task;
    }
    try {
      logForDebugging(`LocalShellTask ${taskId} kill requested`);
      task.shellCommand?.kill();
      task.shellCommand?.cleanup();
    } catch (error) {
      logError(error);
    }
    task.unregisterCleanup?.();
    if (task.cleanupTimeoutId) {
      clearTimeout(task.cleanupTimeoutId);
    }
    return {
      ...task,
      status: "killed",
      notified: true,
      shellCommand: null,
      unregisterCleanup: void 0,
      cleanupTimeoutId: void 0,
      endTime: Date.now()
    };
  });
  void evictTaskOutput(taskId);
}
function killShellTasksForAgent(agentId, getAppState, setAppState) {
  const tasks = getAppState().tasks ?? {};
  for (const [taskId, task] of Object.entries(tasks)) {
    if (isLocalShellTask(task) && task.agentId === agentId && task.status === "running") {
      logForDebugging(
        `killShellTasksForAgent: killing orphaned shell task ${taskId} (agent ${agentId} exiting)`
      );
      killTask(taskId, setAppState);
    }
  }
  dequeueAllMatching((cmd) => cmd.agentId === agentId);
}
export {
  killShellTasksForAgent,
  killTask
};
