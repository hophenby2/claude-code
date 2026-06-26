import {
  createTeammateContext,
  getTeammateContext,
  isInProcessTeammate,
  runWithTeammateContext
} from "./teammateContext.js";
import { isEnvTruthy } from "./envUtils.js";
import { getTeammateContext as getTeammateContext2 } from "./teammateContext.js";
function getParentSessionId() {
  const inProcessCtx = getTeammateContext2();
  if (inProcessCtx) return inProcessCtx.parentSessionId;
  return dynamicTeamContext?.parentSessionId;
}
let dynamicTeamContext = null;
function setDynamicTeamContext(context) {
  dynamicTeamContext = context;
}
function clearDynamicTeamContext() {
  dynamicTeamContext = null;
}
function getDynamicTeamContext() {
  return dynamicTeamContext;
}
function getAgentId() {
  const inProcessCtx = getTeammateContext2();
  if (inProcessCtx) return inProcessCtx.agentId;
  return dynamicTeamContext?.agentId;
}
function getAgentName() {
  const inProcessCtx = getTeammateContext2();
  if (inProcessCtx) return inProcessCtx.agentName;
  return dynamicTeamContext?.agentName;
}
function getTeamName(teamContext) {
  const inProcessCtx = getTeammateContext2();
  if (inProcessCtx) return inProcessCtx.teamName;
  if (dynamicTeamContext?.teamName) return dynamicTeamContext.teamName;
  return teamContext?.teamName;
}
function isTeammate() {
  const inProcessCtx = getTeammateContext2();
  if (inProcessCtx) return true;
  return !!(dynamicTeamContext?.agentId && dynamicTeamContext?.teamName);
}
function getTeammateColor() {
  const inProcessCtx = getTeammateContext2();
  if (inProcessCtx) return inProcessCtx.color;
  return dynamicTeamContext?.color;
}
function isPlanModeRequired() {
  const inProcessCtx = getTeammateContext2();
  if (inProcessCtx) return inProcessCtx.planModeRequired;
  if (dynamicTeamContext !== null) {
    return dynamicTeamContext.planModeRequired;
  }
  return isEnvTruthy(process.env.CLAUDE_CODE_PLAN_MODE_REQUIRED);
}
function isTeamLead(teamContext) {
  if (!teamContext?.leadAgentId) {
    return false;
  }
  const myAgentId = getAgentId();
  const leadAgentId = teamContext.leadAgentId;
  if (myAgentId === leadAgentId) {
    return true;
  }
  if (!myAgentId) {
    return true;
  }
  return false;
}
function hasActiveInProcessTeammates(appState) {
  for (const task of Object.values(appState.tasks)) {
    if (task.type === "in_process_teammate" && task.status === "running") {
      return true;
    }
  }
  return false;
}
function hasWorkingInProcessTeammates(appState) {
  for (const task of Object.values(appState.tasks)) {
    if (task.type === "in_process_teammate" && task.status === "running" && !task.isIdle) {
      return true;
    }
  }
  return false;
}
function waitForTeammatesToBecomeIdle(setAppState, appState) {
  const workingTaskIds = [];
  for (const [taskId, task] of Object.entries(appState.tasks)) {
    if (task.type === "in_process_teammate" && task.status === "running" && !task.isIdle) {
      workingTaskIds.push(taskId);
    }
  }
  if (workingTaskIds.length === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let remaining = workingTaskIds.length;
    const onIdle = () => {
      remaining--;
      if (remaining === 0) {
        resolve();
      }
    };
    setAppState((prev) => {
      const newTasks = { ...prev.tasks };
      for (const taskId of workingTaskIds) {
        const task = newTasks[taskId];
        if (task && task.type === "in_process_teammate") {
          if (task.isIdle) {
            onIdle();
          } else {
            newTasks[taskId] = {
              ...task,
              onIdleCallbacks: [...task.onIdleCallbacks ?? [], onIdle]
            };
          }
        }
      }
      return { ...prev, tasks: newTasks };
    });
  });
}
export {
  clearDynamicTeamContext,
  createTeammateContext,
  getAgentId,
  getAgentName,
  getDynamicTeamContext,
  getParentSessionId,
  getTeamName,
  getTeammateColor,
  getTeammateContext,
  hasActiveInProcessTeammates,
  hasWorkingInProcessTeammates,
  isInProcessTeammate,
  isPlanModeRequired,
  isTeamLead,
  isTeammate,
  runWithTeammateContext,
  setDynamicTeamContext,
  waitForTeammatesToBecomeIdle
};
