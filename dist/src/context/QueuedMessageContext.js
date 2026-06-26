import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import * as React from "react";
import { Box } from "../ink.js";
const QueuedMessageContext = React.createContext(void 0);
function useQueuedMessage() {
  return React.useContext(QueuedMessageContext);
}
const PADDING_X = 2;
function QueuedMessageProvider(t0) {
  const $ = _c(9);
  const {
    isFirst,
    useBriefLayout,
    children
  } = t0;
  const padding = useBriefLayout ? 0 : PADDING_X;
  const t1 = padding * 2;
  let t2;
  if ($[0] !== isFirst || $[1] !== t1) {
    t2 = {
      isQueued: true,
      isFirst,
      paddingWidth: t1
    };
    $[0] = isFirst;
    $[1] = t1;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const value = t2;
  let t3;
  if ($[3] !== children || $[4] !== padding) {
    t3 = /* @__PURE__ */ jsx(Box, { paddingX: padding, children });
    $[3] = children;
    $[4] = padding;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== t3 || $[7] !== value) {
    t4 = /* @__PURE__ */ jsx(QueuedMessageContext.Provider, { value, children: t3 });
    $[6] = t3;
    $[7] = value;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  return t4;
}
export {
  QueuedMessageProvider,
  useQueuedMessage
};
