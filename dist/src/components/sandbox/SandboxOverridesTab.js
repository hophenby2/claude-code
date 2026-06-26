import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, color, Link, Text, useTheme } from "../../ink.js";
import { SandboxManager } from "../../utils/sandbox/sandbox-adapter.js";
import { Select } from "../CustomSelect/select.js";
import { useTabHeaderFocus } from "../design-system/Tabs.js";
function SandboxOverridesTab(t0) {
  const $ = _c(5);
  const {
    onComplete
  } = t0;
  const isEnabled = SandboxManager.isSandboxingEnabled();
  const isLocked = SandboxManager.areSandboxSettingsLockedByPolicy();
  const currentAllowUnsandboxed = SandboxManager.areUnsandboxedCommandsAllowed();
  if (!isEnabled) {
    let t12;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", paddingY: 1, children: /* @__PURE__ */ jsx(Text, { color: "subtle", children: "Sandbox is not enabled. Enable sandbox to configure override settings." }) });
      $[0] = t12;
    } else {
      t12 = $[0];
    }
    return t12;
  }
  if (isLocked) {
    let t12;
    if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(Text, { color: "subtle", children: "Override settings are managed by a higher-priority configuration and cannot be changed locally." });
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    let t2;
    if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t2 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingY: 1, children: [
        t12,
        /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Current setting:",
          " ",
          currentAllowUnsandboxed ? "Allow unsandboxed fallback" : "Strict sandbox mode"
        ] }) })
      ] });
      $[2] = t2;
    } else {
      t2 = $[2];
    }
    return t2;
  }
  let t1;
  if ($[3] !== onComplete) {
    t1 = /* @__PURE__ */ jsx(OverridesSelect, { onComplete, currentMode: currentAllowUnsandboxed ? "open" : "closed" });
    $[3] = onComplete;
    $[4] = t1;
  } else {
    t1 = $[4];
  }
  return t1;
}
function OverridesSelect(t0) {
  const $ = _c(25);
  const {
    onComplete,
    currentMode
  } = t0;
  const [theme] = useTheme();
  const {
    headerFocused,
    focusHeader
  } = useTabHeaderFocus();
  let t1;
  if ($[0] !== theme) {
    t1 = color("success", theme)("(current)");
    $[0] = theme;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const currentIndicator = t1;
  const t2 = currentMode === "open" ? `Allow unsandboxed fallback ${currentIndicator}` : "Allow unsandboxed fallback";
  let t3;
  if ($[2] !== t2) {
    t3 = {
      label: t2,
      value: "open"
    };
    $[2] = t2;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  const t4 = currentMode === "closed" ? `Strict sandbox mode ${currentIndicator}` : "Strict sandbox mode";
  let t5;
  if ($[4] !== t4) {
    t5 = {
      label: t4,
      value: "closed"
    };
    $[4] = t4;
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  let t6;
  if ($[6] !== t3 || $[7] !== t5) {
    t6 = [t3, t5];
    $[6] = t3;
    $[7] = t5;
    $[8] = t6;
  } else {
    t6 = $[8];
  }
  const options = t6;
  let t7;
  if ($[9] !== onComplete) {
    t7 = async function handleSelect2(value) {
      const mode = value;
      await SandboxManager.setSandboxSettings({
        allowUnsandboxedCommands: mode === "open"
      });
      const message = mode === "open" ? "\u2713 Unsandboxed fallback allowed - commands can run outside sandbox when necessary" : "\u2713 Strict sandbox mode - all commands must run in sandbox or be excluded via the `excludedCommands` option";
      onComplete(message);
    };
    $[9] = onComplete;
    $[10] = t7;
  } else {
    t7 = $[10];
  }
  const handleSelect = t7;
  let t8;
  if ($[11] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t8 = /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Configure Overrides:" }) });
    $[11] = t8;
  } else {
    t8 = $[11];
  }
  let t9;
  if ($[12] !== onComplete) {
    t9 = () => onComplete(void 0, {
      display: "skip"
    });
    $[12] = onComplete;
    $[13] = t9;
  } else {
    t9 = $[13];
  }
  let t10;
  if ($[14] !== focusHeader || $[15] !== handleSelect || $[16] !== headerFocused || $[17] !== options || $[18] !== t9) {
    t10 = /* @__PURE__ */ jsx(Select, { options, onChange: handleSelect, onCancel: t9, onUpFromFirstItem: focusHeader, isDisabled: headerFocused });
    $[14] = focusHeader;
    $[15] = handleSelect;
    $[16] = headerFocused;
    $[17] = options;
    $[18] = t9;
    $[19] = t10;
  } else {
    t10 = $[19];
  }
  let t11;
  if ($[20] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t11 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      /* @__PURE__ */ jsx(Text, { bold: true, dimColor: true, children: "Allow unsandboxed fallback:" }),
      " ",
      "When a command fails due to sandbox restrictions, Claude can retry with dangerouslyDisableSandbox to run outside the sandbox (falling back to default permissions)."
    ] });
    $[20] = t11;
  } else {
    t11 = $[20];
  }
  let t12;
  if ($[21] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t12 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      /* @__PURE__ */ jsx(Text, { bold: true, dimColor: true, children: "Strict sandbox mode:" }),
      " ",
      "All bash commands invoked by the model must run in the sandbox unless they are explicitly listed in excludedCommands."
    ] });
    $[21] = t12;
  } else {
    t12 = $[21];
  }
  let t13;
  if ($[22] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t13 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, gap: 1, children: [
      t11,
      t12,
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Learn more:",
        " ",
        /* @__PURE__ */ jsx(Link, { url: "https://code.claude.com/docs/en/sandboxing#configure-sandboxing", children: "code.claude.com/docs/en/sandboxing#configure-sandboxing" })
      ] })
    ] });
    $[22] = t13;
  } else {
    t13 = $[22];
  }
  let t14;
  if ($[23] !== t10) {
    t14 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingY: 1, children: [
      t8,
      t10,
      t13
    ] });
    $[23] = t10;
    $[24] = t14;
  } else {
    t14 = $[24];
  }
  return t14;
}
export {
  SandboxOverridesTab
};
