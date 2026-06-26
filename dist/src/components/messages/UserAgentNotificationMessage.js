import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { BLACK_CIRCLE } from "../../constants/figures.js";
import { Box, Text } from "../../ink.js";
import { extractTag } from "../../utils/messages.js";
function getStatusColor(status) {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "killed":
      return "warning";
    default:
      return "text";
  }
}
function UserAgentNotificationMessage(t0) {
  const $ = _c(12);
  const {
    addMargin,
    param: t1
  } = t0;
  const {
    text
  } = t1;
  let t2;
  if ($[0] !== text) {
    t2 = extractTag(text, "summary");
    $[0] = text;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const summary = t2;
  if (!summary) {
    return null;
  }
  let t3;
  if ($[2] !== text) {
    const status = extractTag(text, "status");
    t3 = getStatusColor(status);
    $[2] = text;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  const color = t3;
  const t4 = addMargin ? 1 : 0;
  let t5;
  if ($[4] !== color) {
    t5 = /* @__PURE__ */ jsx(Text, { color, children: BLACK_CIRCLE });
    $[4] = color;
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  let t6;
  if ($[6] !== summary || $[7] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Text, { children: [
      t5,
      " ",
      summary
    ] });
    $[6] = summary;
    $[7] = t5;
    $[8] = t6;
  } else {
    t6 = $[8];
  }
  let t7;
  if ($[9] !== t4 || $[10] !== t6) {
    t7 = /* @__PURE__ */ jsx(Box, { marginTop: t4, children: t6 });
    $[9] = t4;
    $[10] = t6;
    $[11] = t7;
  } else {
    t7 = $[11];
  }
  return t7;
}
export {
  UserAgentNotificationMessage
};
