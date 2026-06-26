import { AsyncLocalStorage } from "async_hooks";
const teammateContextStorage = new AsyncLocalStorage();
function getTeammateContext() {
  return teammateContextStorage.getStore();
}
function runWithTeammateContext(context, fn) {
  return teammateContextStorage.run(context, fn);
}
function isInProcessTeammate() {
  return teammateContextStorage.getStore() !== void 0;
}
function createTeammateContext(config) {
  return {
    ...config,
    isInProcess: true
  };
}
export {
  createTeammateContext,
  getTeammateContext,
  isInProcessTeammate,
  runWithTeammateContext
};
