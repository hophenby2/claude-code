import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { createContext, useContext } from "react";
import { Box, Text } from "../../ink.js";
const OrderedListItemContext = createContext({
  marker: ""
});
function OrderedListItem(t0) {
  const $ = _c(7);
  const {
    children
  } = t0;
  const {
    marker
  } = useContext(OrderedListItemContext);
  let t1;
  if ($[0] !== marker) {
    t1 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: marker });
    $[0] = marker;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== children) {
    t2 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children });
    $[2] = children;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t1 || $[5] !== t2) {
    t3 = /* @__PURE__ */ jsxs(Box, { gap: 1, children: [
      t1,
      t2
    ] });
    $[4] = t1;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}
export {
  OrderedListItem,
  OrderedListItemContext
};
