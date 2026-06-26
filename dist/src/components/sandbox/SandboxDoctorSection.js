import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../../ink.js";
import { SandboxManager } from "../../utils/sandbox/sandbox-adapter.js";
function SandboxDoctorSection() {
  const $ = _c(2);
  if (!SandboxManager.isSupportedPlatform()) {
    return null;
  }
  if (!SandboxManager.isSandboxEnabledInSettings()) {
    return null;
  }
  let t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const depCheck = SandboxManager.checkDependencies();
      const hasErrors = depCheck.errors.length > 0;
      const hasWarnings = depCheck.warnings.length > 0;
      if (!hasErrors && !hasWarnings) {
        t1 = null;
        break bb0;
      }
      const statusColor = hasErrors ? "error" : "warning";
      const statusText = hasErrors ? "Missing dependencies" : "Available (with warnings)";
      t0 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Sandbox" }),
        /* @__PURE__ */ jsxs(Text, { children: [
          "\u2514 Status: ",
          /* @__PURE__ */ jsx(Text, { color: statusColor, children: statusText })
        ] }),
        depCheck.errors.map(_temp),
        depCheck.warnings.map(_temp2),
        hasErrors && /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\u2514 Run /sandbox for install instructions" })
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
function _temp2(w, i_0) {
  return /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
    "\u2514 ",
    w
  ] }, i_0);
}
function _temp(e, i) {
  return /* @__PURE__ */ jsxs(Text, { color: "error", children: [
    "\u2514 ",
    e
  ] }, i);
}
export {
  SandboxDoctorSection
};
