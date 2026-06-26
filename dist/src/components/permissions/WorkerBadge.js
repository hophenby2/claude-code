import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { BLACK_CIRCLE } from "../../constants/figures.js";
import { Box, Text } from "../../ink.js";
import { toInkColor } from "../../utils/ink.js";
function WorkerBadge(t0) {
  const $ = _c(7);
  const {
    name,
    color
  } = t0;
  let t1;
  if ($[0] !== color) {
    t1 = toInkColor(color);
    $[0] = color;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const inkColor = t1;
  let t2;
  if ($[2] !== name) {
    t2 = /* @__PURE__ */ jsxs(Text, { bold: true, children: [
      "@",
      name
    ] });
    $[2] = name;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== inkColor || $[5] !== t2) {
    t3 = /* @__PURE__ */ jsx(Box, { flexDirection: "row", gap: 1, children: /* @__PURE__ */ jsxs(Text, { color: inkColor, children: [
      BLACK_CIRCLE,
      " ",
      t2
    ] }) });
    $[4] = inkColor;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}
export {
  WorkerBadge
};
