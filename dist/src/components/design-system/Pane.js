import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useIsInsideModal } from "../../context/modalContext.js";
import { Box } from "../../ink.js";
import { Divider } from "./Divider.js";
function Pane(t0) {
  const $ = _c(9);
  const {
    children,
    color
  } = t0;
  if (useIsInsideModal()) {
    let t12;
    if ($[0] !== children) {
      t12 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", paddingX: 1, flexShrink: 0, children });
      $[0] = children;
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    return t12;
  }
  let t1;
  if ($[2] !== color) {
    t1 = /* @__PURE__ */ jsx(Divider, { color });
    $[2] = color;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  let t2;
  if ($[4] !== children) {
    t2 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", paddingX: 2, children });
    $[4] = children;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  let t3;
  if ($[6] !== t1 || $[7] !== t2) {
    t3 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingTop: 1, children: [
      t1,
      t2
    ] });
    $[6] = t1;
    $[7] = t2;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  return t3;
}
export {
  Pane
};
