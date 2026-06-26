let registeredSetter = null;
let registeredPermissionContextSetter = null;
function registerLeaderToolUseConfirmQueue(setter) {
  registeredSetter = setter;
}
function getLeaderToolUseConfirmQueue() {
  return registeredSetter;
}
function unregisterLeaderToolUseConfirmQueue() {
  registeredSetter = null;
}
function registerLeaderSetToolPermissionContext(setter) {
  registeredPermissionContextSetter = setter;
}
function getLeaderSetToolPermissionContext() {
  return registeredPermissionContextSetter;
}
function unregisterLeaderSetToolPermissionContext() {
  registeredPermissionContextSetter = null;
}
export {
  getLeaderSetToolPermissionContext,
  getLeaderToolUseConfirmQueue,
  registerLeaderSetToolPermissionContext,
  registerLeaderToolUseConfirmQueue,
  unregisterLeaderSetToolPermissionContext,
  unregisterLeaderToolUseConfirmQueue
};
