import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import * as React from "react";
import { useContext } from "react";
const ExpandShellOutputContext = React.createContext(false);
function ExpandShellOutputProvider(t0) {
  const $ = _c(2);
  const {
    children
  } = t0;
  let t1;
  if ($[0] !== children) {
    t1 = /* @__PURE__ */ jsx(ExpandShellOutputContext.Provider, { value: true, children });
    $[0] = children;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function useExpandShellOutput() {
  return useContext(ExpandShellOutputContext);
}
export {
  ExpandShellOutputProvider,
  useExpandShellOutput
};
