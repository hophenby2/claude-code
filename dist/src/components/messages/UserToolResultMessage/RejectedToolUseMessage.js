import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Text } from "../../../ink.js";
import { MessageResponse } from "../../MessageResponse.js";
function RejectedToolUseMessage() {
  const $ = _c(1);
  let t0;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t0 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Tool use rejected" }) });
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}
export {
  RejectedToolUseMessage
};
