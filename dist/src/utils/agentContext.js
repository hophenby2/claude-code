import { AsyncLocalStorage } from "async_hooks";
import { isAgentSwarmsEnabled } from "./agentSwarmsEnabled.js";
const agentContextStorage = new AsyncLocalStorage();
function getAgentContext() {
  return agentContextStorage.getStore();
}
function runWithAgentContext(context, fn) {
  return agentContextStorage.run(context, fn);
}
function isSubagentContext(context) {
  return context?.agentType === "subagent";
}
function isTeammateAgentContext(context) {
  if (isAgentSwarmsEnabled()) {
    return context?.agentType === "teammate";
  }
  return false;
}
function getSubagentLogName() {
  const context = getAgentContext();
  if (!isSubagentContext(context) || !context.subagentName) {
    return void 0;
  }
  return context.isBuiltIn ? context.subagentName : "user-defined";
}
function consumeInvokingRequestId() {
  const context = getAgentContext();
  if (!context?.invokingRequestId || context.invocationEmitted) {
    return void 0;
  }
  context.invocationEmitted = true;
  return {
    invokingRequestId: context.invokingRequestId,
    invocationKind: context.invocationKind
  };
}
export {
  consumeInvokingRequestId,
  getAgentContext,
  getSubagentLogName,
  isSubagentContext,
  isTeammateAgentContext,
  runWithAgentContext
};
