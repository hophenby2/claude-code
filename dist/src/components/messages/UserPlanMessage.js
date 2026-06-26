import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../../ink.js";
import { Markdown } from "../Markdown.js";
function UserPlanMessage(t0) {
  const $ = _c(6);
  const {
    addMargin,
    planContent
  } = t0;
  const t1 = addMargin ? 1 : 0;
  let t2;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, color: "planMode", children: "Plan to implement" }) });
    $[0] = t2;
  } else {
    t2 = $[0];
  }
  let t3;
  if ($[1] !== planContent) {
    t3 = /* @__PURE__ */ jsx(Markdown, { children: planContent });
    $[1] = planContent;
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  let t4;
  if ($[3] !== t1 || $[4] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "planMode", marginTop: t1, paddingX: 1, children: [
      t2,
      t3
    ] });
    $[3] = t1;
    $[4] = t3;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  return t4;
}
export {
  UserPlanMessage
};
