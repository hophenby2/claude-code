import {
  isInProcessTeammateTask
} from "../tasks/InProcessTeammateTask/types.js";
import { updateTaskState } from "./task/framework.js";
import {
  isPermissionResponse,
  isSandboxPermissionResponse
} from "./teammateMailbox.js";
function findInProcessTeammateTaskId(agentName, appState) {
  for (const task of Object.values(appState.tasks)) {
    if (isInProcessTeammateTask(task) && task.identity.agentName === agentName) {
      return task.id;
    }
  }
  return void 0;
}
function setAwaitingPlanApproval(taskId, setAppState, awaiting) {
  updateTaskState(taskId, setAppState, (task) => ({
    ...task,
    awaitingPlanApproval: awaiting
  }));
}
function handlePlanApprovalResponse(taskId, _response, setAppState) {
  setAwaitingPlanApproval(taskId, setAppState, false);
}
function isPermissionRelatedResponse(messageText) {
  return !!isPermissionResponse(messageText) || !!isSandboxPermissionResponse(messageText);
}
export {
  findInProcessTeammateTaskId,
  handlePlanApprovalResponse,
  isPermissionRelatedResponse,
  setAwaitingPlanApproval
};
