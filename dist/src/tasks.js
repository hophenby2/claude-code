const feature = (_name) => false;
import { DreamTask } from "./tasks/DreamTask/DreamTask.js";
import { LocalAgentTask } from "./tasks/LocalAgentTask/LocalAgentTask.js";
import { LocalShellTask } from "./tasks/LocalShellTask/LocalShellTask.js";
import { RemoteAgentTask } from "./tasks/RemoteAgentTask/RemoteAgentTask.js";
const LocalWorkflowTask = false ? null.LocalWorkflowTask : null;
const MonitorMcpTask = false ? null.MonitorMcpTask : null;
function getAllTasks() {
  const tasks = [
    LocalShellTask,
    LocalAgentTask,
    RemoteAgentTask,
    DreamTask
  ];
  if (LocalWorkflowTask) tasks.push(LocalWorkflowTask);
  if (MonitorMcpTask) tasks.push(MonitorMcpTask);
  return tasks;
}
function getTaskByType(type) {
  return getAllTasks().find((t) => t.type === type);
}
export {
  getAllTasks,
  getTaskByType
};
