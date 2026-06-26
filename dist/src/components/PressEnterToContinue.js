import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Text } from "../ink.js";
function PressEnterToContinue() {
  const $ = _c(1);
  let t0;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t0 = /* @__PURE__ */ jsxs(Text, { color: "permission", children: [
      "Press ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: "Enter" }),
      " to continue\u2026"
    ] });
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}
export {
  PressEnterToContinue
};
