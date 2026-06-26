import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Text } from "../ink.js";
function InterruptedByUser() {
  const $ = _c(1);
  let t0;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t0 = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Interrupted " }),
      false ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\xB7 [ANT-ONLY] /issue to report a model issue" }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\xB7 What should Claude do instead?" })
    ] });
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}
export {
  InterruptedByUser
};
