let focusState = "unknown";
const resolvers = /* @__PURE__ */ new Set();
const subscribers = /* @__PURE__ */ new Set();
function setTerminalFocused(v) {
  focusState = v ? "focused" : "blurred";
  for (const cb of subscribers) {
    cb();
  }
  if (!v) {
    for (const resolve of resolvers) {
      resolve();
    }
    resolvers.clear();
  }
}
function getTerminalFocused() {
  return focusState !== "blurred";
}
function getTerminalFocusState() {
  return focusState;
}
function subscribeTerminalFocus(cb) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
function resetTerminalFocusState() {
  focusState = "unknown";
  for (const cb of subscribers) {
    cb();
  }
}
export {
  getTerminalFocusState,
  getTerminalFocused,
  resetTerminalFocusState,
  setTerminalFocused,
  subscribeTerminalFocus
};
