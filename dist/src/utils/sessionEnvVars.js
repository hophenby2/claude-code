const sessionEnvVars = /* @__PURE__ */ new Map();
function getSessionEnvVars() {
  return sessionEnvVars;
}
function setSessionEnvVar(name, value) {
  sessionEnvVars.set(name, value);
}
function deleteSessionEnvVar(name) {
  sessionEnvVars.delete(name);
}
function clearSessionEnvVars() {
  sessionEnvVars.clear();
}
export {
  clearSessionEnvVars,
  deleteSessionEnvVar,
  getSessionEnvVars,
  setSessionEnvVar
};
