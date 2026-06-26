import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import * as React from "react";
import { useContext } from "react";
import { Box, NoSelect, Text } from "../ink.js";
import { Ratchet } from "./design-system/Ratchet.js";
function MessageResponse(t0) {
  const $ = _c(8);
  const {
    children,
    height
  } = t0;
  const isMessageResponse = useContext(MessageResponseContext);
  if (isMessageResponse) {
    return children;
  }
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsx(NoSelect, { fromLeftEdge: true, flexShrink: 0, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "  ",
      "\u23BF \xA0"
    ] }) });
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== children) {
    t2 = /* @__PURE__ */ jsx(Box, { flexShrink: 1, flexGrow: 1, children });
    $[1] = children;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== height || $[4] !== t2) {
    t3 = /* @__PURE__ */ jsx(MessageResponseProvider, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "row", height, overflowY: "hidden", children: [
      t1,
      t2
    ] }) });
    $[3] = height;
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  const content = t3;
  if (height !== void 0) {
    return content;
  }
  let t4;
  if ($[6] !== content) {
    t4 = /* @__PURE__ */ jsx(Ratchet, { lock: "offscreen", children: content });
    $[6] = content;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  return t4;
}
const MessageResponseContext = React.createContext(false);
function MessageResponseProvider(t0) {
  const $ = _c(2);
  const {
    children
  } = t0;
  let t1;
  if ($[0] !== children) {
    t1 = /* @__PURE__ */ jsx(MessageResponseContext.Provider, { value: true, children });
    $[0] = children;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
export {
  MessageResponse
};
