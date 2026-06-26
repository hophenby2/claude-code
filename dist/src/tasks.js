import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import { DreamTask } from "./tasks/DreamTask/DreamTask.js";
import { LocalAgentTask } from "./tasks/LocalAgentTask/LocalAgentTask.js";
import { LocalShellTask } from "./tasks/LocalShellTask/LocalShellTask.js";
import { RemoteAgentTask } from "./tasks/RemoteAgentTask/RemoteAgentTask.js";
const LocalWorkflowTask = false ? require2("./tasks/LocalWorkflowTask/LocalWorkflowTask.js").LocalWorkflowTask : null;
const MonitorMcpTask = false ? require2("./tasks/MonitorMcpTask/MonitorMcpTask.js").MonitorMcpTask : null;
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
