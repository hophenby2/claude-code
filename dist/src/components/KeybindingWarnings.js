import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../ink.js";
import { getCachedKeybindingWarnings, getKeybindingsPath, isKeybindingCustomizationEnabled } from "../keybindings/loadUserBindings.js";
function KeybindingWarnings() {
  const $ = _c(2);
  if (!isKeybindingCustomizationEnabled()) {
    return null;
  }
  let t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const warnings = getCachedKeybindingWarnings();
      if (warnings.length === 0) {
        t1 = null;
        break bb0;
      }
      const errors = warnings.filter(_temp);
      const warns = warnings.filter(_temp2);
      t0 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, marginBottom: 1, children: [
        /* @__PURE__ */ jsx(Text, { bold: true, color: errors.length > 0 ? "error" : "warning", children: "Keybinding Configuration Issues" }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Location: " }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: getKeybindingsPath() })
        ] }),
        /* @__PURE__ */ jsxs(Box, { marginLeft: 1, flexDirection: "column", marginTop: 1, children: [
          errors.map(_temp3),
          warns.map(_temp4)
        ] })
      ] });
    }
    $[0] = t0;
    $[1] = t1;
  } else {
    t0 = $[0];
    t1 = $[1];
  }
  if (t1 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t1;
  }
  return t0;
}
function _temp4(warning, i_0) {
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\u2514 " }),
      /* @__PURE__ */ jsx(Text, { color: "warning", children: "[Warning]" }),
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " ",
        warning.message
      ] })
    ] }),
    warning.suggestion && /* @__PURE__ */ jsx(Box, { marginLeft: 3, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "\u2192 ",
      warning.suggestion
    ] }) })
  ] }, `warning-${i_0}`);
}
function _temp3(error, i) {
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\u2514 " }),
      /* @__PURE__ */ jsx(Text, { color: "error", children: "[Error]" }),
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " ",
        error.message
      ] })
    ] }),
    error.suggestion && /* @__PURE__ */ jsx(Box, { marginLeft: 3, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "\u2192 ",
      error.suggestion
    ] }) })
  ] }, `error-${i}`);
}
function _temp2(w_0) {
  return w_0.severity === "warning";
}
function _temp(w) {
  return w.severity === "error";
}
export {
  KeybindingWarnings
};
