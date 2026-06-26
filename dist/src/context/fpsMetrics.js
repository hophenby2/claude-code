import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { createContext, useContext } from "react";
const FpsMetricsContext = createContext(void 0);
function FpsMetricsProvider(t0) {
  const $ = _c(3);
  const {
    getFpsMetrics,
    children
  } = t0;
  let t1;
  if ($[0] !== children || $[1] !== getFpsMetrics) {
    t1 = /* @__PURE__ */ jsx(FpsMetricsContext.Provider, { value: getFpsMetrics, children });
    $[0] = children;
    $[1] = getFpsMetrics;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}
function useFpsMetrics() {
  return useContext(FpsMetricsContext);
}
export {
  FpsMetricsProvider,
  useFpsMetrics
};
