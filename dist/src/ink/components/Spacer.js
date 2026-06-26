import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import Box from "./Box.js";
function Spacer() {
  const $ = _c(1);
  let t0;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t0 = /* @__PURE__ */ jsx(Box, { flexGrow: 1 });
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}
export {
  Spacer as default
};
