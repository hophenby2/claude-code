import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { BLACK_CIRCLE } from "../constants/figures.js";
import { useBlink } from "../hooks/useBlink.js";
import { Box, Text } from "../ink.js";
function ToolUseLoader(t0) {
  const $ = _c(7);
  const {
    isError,
    isUnresolved,
    shouldAnimate
  } = t0;
  const [ref, isBlinking] = useBlink(shouldAnimate);
  const color = isUnresolved ? void 0 : isError ? "error" : "success";
  const t1 = !shouldAnimate || isBlinking || isError || !isUnresolved ? BLACK_CIRCLE : " ";
  let t2;
  if ($[0] !== color || $[1] !== isUnresolved || $[2] !== t1) {
    t2 = /* @__PURE__ */ jsx(Text, { color, dimColor: isUnresolved, children: t1 });
    $[0] = color;
    $[1] = isUnresolved;
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== ref || $[5] !== t2) {
    t3 = /* @__PURE__ */ jsx(Box, { ref, minWidth: 2, children: t2 });
    $[4] = ref;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}
export {
  ToolUseLoader
};
