const timestamps = /* @__PURE__ */ new Map();
function markInternalWrite(path) {
  timestamps.set(path, Date.now());
}
function consumeInternalWrite(path, windowMs) {
  const ts = timestamps.get(path);
  if (ts !== void 0 && Date.now() - ts < windowMs) {
    timestamps.delete(path);
    return true;
  }
  return false;
}
function clearInternalWrites() {
  timestamps.clear();
}
export {
  clearInternalWrites,
  consumeInternalWrite,
  markInternalWrite
};
