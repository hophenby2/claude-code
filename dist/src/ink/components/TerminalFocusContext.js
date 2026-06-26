import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { createContext, useSyncExternalStore } from "react";
import { getTerminalFocused, getTerminalFocusState, subscribeTerminalFocus } from "../terminal-focus-state.js";
const TerminalFocusContext = createContext({
  isTerminalFocused: true,
  terminalFocusState: "unknown"
});
TerminalFocusContext.displayName = "TerminalFocusContext";
function TerminalFocusProvider(t0) {
  const $ = _c(6);
  const {
    children
  } = t0;
  const isTerminalFocused = useSyncExternalStore(subscribeTerminalFocus, getTerminalFocused);
  const terminalFocusState = useSyncExternalStore(subscribeTerminalFocus, getTerminalFocusState);
  let t1;
  if ($[0] !== isTerminalFocused || $[1] !== terminalFocusState) {
    t1 = {
      isTerminalFocused,
      terminalFocusState
    };
    $[0] = isTerminalFocused;
    $[1] = terminalFocusState;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const value = t1;
  let t2;
  if ($[3] !== children || $[4] !== value) {
    t2 = /* @__PURE__ */ jsx(TerminalFocusContext.Provider, { value, children });
    $[3] = children;
    $[4] = value;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  return t2;
}
var TerminalFocusContext_default = TerminalFocusContext;
export {
  TerminalFocusProvider,
  TerminalFocusContext_default as default
};
