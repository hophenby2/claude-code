import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../../ink.js";
import { Spinner } from "../Spinner.js";
function LoadingState(t0) {
  const $ = _c(10);
  const {
    message,
    bold: t1,
    dimColor: t2,
    subtitle
  } = t0;
  const bold = t1 === void 0 ? false : t1;
  const dimColor = t2 === void 0 ? false : t2;
  let t3;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = /* @__PURE__ */ jsx(Spinner, {});
    $[0] = t3;
  } else {
    t3 = $[0];
  }
  let t4;
  if ($[1] !== bold || $[2] !== dimColor || $[3] !== message) {
    t4 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      t3,
      /* @__PURE__ */ jsxs(Text, { bold, dimColor, children: [
        " ",
        message
      ] })
    ] });
    $[1] = bold;
    $[2] = dimColor;
    $[3] = message;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  let t5;
  if ($[5] !== subtitle) {
    t5 = subtitle && /* @__PURE__ */ jsx(Text, { dimColor: true, children: subtitle });
    $[5] = subtitle;
    $[6] = t5;
  } else {
    t5 = $[6];
  }
  let t6;
  if ($[7] !== t4 || $[8] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t4,
      t5
    ] });
    $[7] = t4;
    $[8] = t5;
    $[9] = t6;
  } else {
    t6 = $[9];
  }
  return t6;
}
export {
  LoadingState
};
