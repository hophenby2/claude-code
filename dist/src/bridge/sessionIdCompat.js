let _isCseShimEnabled;
function setCseShimGate(gate) {
  _isCseShimEnabled = gate;
}
function toCompatSessionId(id) {
  if (!id.startsWith("cse_")) return id;
  if (_isCseShimEnabled && !_isCseShimEnabled()) return id;
  return "session_" + id.slice("cse_".length);
}
function toInfraSessionId(id) {
  if (!id.startsWith("session_")) return id;
  return "cse_" + id.slice("session_".length);
}
export {
  setCseShimGate,
  toCompatSessionId,
  toInfraSessionId
};
