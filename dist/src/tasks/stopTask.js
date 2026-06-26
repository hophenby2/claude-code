import { getTaskByType } from "../tasks.js";
import { emitTaskTerminatedSdk } from "../utils/sdkEventQueue.js";
import { isLocalShellTask } from "./LocalShellTask/guards.js";
class StopTaskError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "StopTaskError";
  }
  code;
}
async function stopTask(taskId, context) {
  const { getAppState, setAppState } = context;
  const appState = getAppState();
  const task = appState.tasks?.[taskId];
  if (!task) {
    throw new StopTaskError(`No task found with ID: ${taskId}`, "not_found");
  }
  if (task.status !== "running") {
    throw new StopTaskError(
      `Task ${taskId} is not running (status: ${task.status})`,
      "not_running"
    );
  }
  const taskImpl = getTaskByType(task.type);
  if (!taskImpl) {
    throw new StopTaskError(
      `Unsupported task type: ${task.type}`,
      "unsupported_type"
    );
  }
  await taskImpl.kill(taskId, setAppState);
  if (isLocalShellTask(task)) {
    let suppressed = false;
    setAppState((prev) => {
      const prevTask = prev.tasks[taskId];
      if (!prevTask || prevTask.notified) {
        return prev;
      }
      suppressed = true;
      return {
        ...prev,
        tasks: {
          ...prev.tasks,
          [taskId]: { ...prevTask, notified: true }
        }
      };
    });
    if (suppressed) {
      emitTaskTerminatedSdk(taskId, "stopped", {
        toolUseId: task.toolUseId,
        summary: task.description
      });
    }
  }
  const command = isLocalShellTask(task) ? task.command : task.description;
  return { taskId, taskType: task.type, command };
}
export {
  StopTaskError,
  stopTask
};
