import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { Box, Text } from "../ink.js";
import { formatTokens } from "../utils/format.js";
import { StatusIcon } from "./design-system/StatusIcon.js";
function ContextSuggestions(t0) {
  const $ = _c(5);
  const {
    suggestions
  } = t0;
  if (suggestions.length === 0) {
    return null;
  }
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsx(Text, { bold: true, children: "Suggestions" });
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== suggestions) {
    t2 = suggestions.map(_temp);
    $[1] = suggestions;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== t2) {
    t3 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      t1,
      t2
    ] });
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  return t3;
}
function _temp(suggestion, i) {
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: i === 0 ? 0 : 1, children: [
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(StatusIcon, { status: suggestion.severity, withSpace: true }),
      /* @__PURE__ */ jsx(Text, { bold: true, children: suggestion.title }),
      suggestion.savingsTokens ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " ",
        figures.arrowRight,
        " save ~",
        formatTokens(suggestion.savingsTokens)
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx(Box, { marginLeft: 2, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: suggestion.detail }) })
  ] }, i);
}
export {
  ContextSuggestions
};
