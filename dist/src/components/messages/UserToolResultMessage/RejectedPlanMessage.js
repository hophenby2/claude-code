import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Markdown } from "../../Markdown.js";
import { MessageResponse } from "../../MessageResponse.js";
import { Box, Text } from "../../../ink.js";
function RejectedPlanMessage(t0) {
  const $ = _c(3);
  const {
    plan
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsx(Text, { color: "subtle", children: "User rejected Claude's plan:" });
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== plan) {
    t2 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t1,
      /* @__PURE__ */ jsx(Box, { borderStyle: "round", borderColor: "planMode", paddingX: 1, overflow: "hidden", children: /* @__PURE__ */ jsx(Markdown, { children: plan }) })
    ] }) });
    $[1] = plan;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}
export {
  RejectedPlanMessage
};
