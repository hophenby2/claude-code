import { isInProcessTeammateTask } from "../tasks/InProcessTeammateTask/types.js";
function getViewedTeammateTask(appState) {
  const { viewingAgentTaskId, tasks } = appState;
  if (!viewingAgentTaskId) {
    return void 0;
  }
  const task = tasks[viewingAgentTaskId];
  if (!task) {
    return void 0;
  }
  if (!isInProcessTeammateTask(task)) {
    return void 0;
  }
  return task;
}
function getActiveAgentForInput(appState) {
  const viewedTask = getViewedTeammateTask(appState);
  if (viewedTask) {
    return { type: "viewed", task: viewedTask };
  }
  const { viewingAgentTaskId, tasks } = appState;
  if (viewingAgentTaskId) {
    const task = tasks[viewingAgentTaskId];
    if (task?.type === "local_agent") {
      return { type: "named_agent", task };
    }
  }
  return { type: "leader" };
}
export {
  getActiveAgentForInput,
  getViewedTeammateTask
};
