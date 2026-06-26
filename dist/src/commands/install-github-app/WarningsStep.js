import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { GITHUB_ACTION_SETUP_DOCS_URL } from "../../constants/github-app.js";
import { Box, Text } from "../../ink.js";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
function WarningsStep(t0) {
  const $ = _c(8);
  const {
    warnings,
    onContinue
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = {
      context: "Confirmation"
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  useKeybinding("confirm:yes", onContinue, t1);
  let t2;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        figures.warning,
        " Setup Warnings"
      ] }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "We found some potential issues, but you can continue anyway" })
    ] });
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] !== warnings) {
    t3 = warnings.map(_temp2);
    $[2] = warnings;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, color: "permission", children: "Press Enter to continue anyway, or Ctrl+C to exit and fix issues" }) });
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  let t5;
  if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "You can also try the manual setup steps if needed:",
      " ",
      /* @__PURE__ */ jsx(Text, { color: "claude", children: GITHUB_ACTION_SETUP_DOCS_URL })
    ] }) });
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  let t6;
  if ($[6] !== t3) {
    t6 = /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", borderStyle: "round", paddingX: 1, children: [
      t2,
      t3,
      t4,
      t5
    ] }) });
    $[6] = t3;
    $[7] = t6;
  } else {
    t6 = $[7];
  }
  return t6;
}
function _temp2(warning, index) {
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsx(Text, { color: "warning", bold: true, children: warning.title }),
    /* @__PURE__ */ jsx(Text, { children: warning.message }),
    warning.instructions.length > 0 && /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginLeft: 2, marginTop: 1, children: warning.instructions.map(_temp) })
  ] }, index);
}
function _temp(instruction, i) {
  return /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
    "\u2022 ",
    instruction
  ] }, i);
}
export {
  WarningsStep
};
