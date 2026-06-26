import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import { useExitOnCtrlCDWithKeybindings } from "../hooks/useExitOnCtrlCDWithKeybindings.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Box, Text, usePreviewTheme, useTheme, useThemeSetting } from "../ink.js";
import { useRegisterKeybindingContext } from "../keybindings/KeybindingContext.js";
import { useKeybinding } from "../keybindings/useKeybinding.js";
import { useShortcutDisplay } from "../keybindings/useShortcutDisplay.js";
import { useAppState, useSetAppState } from "../state/AppState.js";
import { gracefulShutdown } from "../utils/gracefulShutdown.js";
import { updateSettingsForSource } from "../utils/settings/settings.js";
import { Select } from "./CustomSelect/index.js";
import { Byline } from "./design-system/Byline.js";
import { KeyboardShortcutHint } from "./design-system/KeyboardShortcutHint.js";
import { getColorModuleUnavailableReason, getSyntaxTheme } from "./StructuredDiff/colorDiff.js";
import { StructuredDiff } from "./StructuredDiff.js";
function ThemePicker(t0) {
  const $ = _c(59);
  const {
    onThemeSelect,
    showIntroText: t1,
    helpText: t2,
    showHelpTextBelow: t3,
    hideEscToCancel: t4,
    skipExitHandling: t5,
    onCancel: onCancelProp
  } = t0;
  const showIntroText = t1 === void 0 ? false : t1;
  const helpText = t2 === void 0 ? "" : t2;
  const showHelpTextBelow = t3 === void 0 ? false : t3;
  const hideEscToCancel = t4 === void 0 ? false : t4;
  const skipExitHandling = t5 === void 0 ? false : t5;
  const [theme] = useTheme();
  const themeSetting = useThemeSetting();
  const {
    columns
  } = useTerminalSize();
  let t6;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t6 = getColorModuleUnavailableReason();
    $[0] = t6;
  } else {
    t6 = $[0];
  }
  const colorModuleUnavailableReason = t6;
  let t7;
  if ($[1] !== theme) {
    t7 = colorModuleUnavailableReason === null ? getSyntaxTheme(theme) : null;
    $[1] = theme;
    $[2] = t7;
  } else {
    t7 = $[2];
  }
  const syntaxTheme = t7;
  const {
    setPreviewTheme,
    savePreview,
    cancelPreview
  } = usePreviewTheme();
  const syntaxHighlightingDisabled = useAppState(_temp) ?? false;
  const setAppState = useSetAppState();
  useRegisterKeybindingContext("ThemePicker");
  const syntaxToggleShortcut = useShortcutDisplay("theme:toggleSyntaxHighlighting", "ThemePicker", "ctrl+t");
  let t8;
  if ($[3] !== setAppState || $[4] !== syntaxHighlightingDisabled) {
    t8 = () => {
      if (colorModuleUnavailableReason === null) {
        const newValue = !syntaxHighlightingDisabled;
        updateSettingsForSource("userSettings", {
          syntaxHighlightingDisabled: newValue
        });
        setAppState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            syntaxHighlightingDisabled: newValue
          }
        }));
      }
    };
    $[3] = setAppState;
    $[4] = syntaxHighlightingDisabled;
    $[5] = t8;
  } else {
    t8 = $[5];
  }
  let t9;
  if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t9 = {
      context: "ThemePicker"
    };
    $[6] = t9;
  } else {
    t9 = $[6];
  }
  useKeybinding("theme:toggleSyntaxHighlighting", t8, t9);
  const exitState = useExitOnCtrlCDWithKeybindings(skipExitHandling ? _temp2 : void 0);
  let t10;
  if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t10 = [...false ? [{
      label: "Auto (match terminal)",
      value: "auto"
    }] : [], {
      label: "Dark mode",
      value: "dark"
    }, {
      label: "Light mode",
      value: "light"
    }, {
      label: "Dark mode (colorblind-friendly)",
      value: "dark-daltonized"
    }, {
      label: "Light mode (colorblind-friendly)",
      value: "light-daltonized"
    }, {
      label: "Dark mode (ANSI colors only)",
      value: "dark-ansi"
    }, {
      label: "Light mode (ANSI colors only)",
      value: "light-ansi"
    }];
    $[7] = t10;
  } else {
    t10 = $[7];
  }
  const themeOptions = t10;
  let t11;
  if ($[8] !== showIntroText) {
    t11 = showIntroText ? /* @__PURE__ */ jsx(Text, { children: "Let's get started." }) : /* @__PURE__ */ jsx(Text, { bold: true, color: "permission", children: "Theme" });
    $[8] = showIntroText;
    $[9] = t11;
  } else {
    t11 = $[9];
  }
  let t12;
  if ($[10] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t12 = /* @__PURE__ */ jsx(Text, { bold: true, children: "Choose the text style that looks best with your terminal" });
    $[10] = t12;
  } else {
    t12 = $[10];
  }
  let t13;
  if ($[11] !== helpText || $[12] !== showHelpTextBelow) {
    t13 = helpText && !showHelpTextBelow && /* @__PURE__ */ jsx(Text, { dimColor: true, children: helpText });
    $[11] = helpText;
    $[12] = showHelpTextBelow;
    $[13] = t13;
  } else {
    t13 = $[13];
  }
  let t14;
  if ($[14] !== t13) {
    t14 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t12,
      t13
    ] });
    $[14] = t13;
    $[15] = t14;
  } else {
    t14 = $[15];
  }
  let t15;
  if ($[16] !== setPreviewTheme) {
    t15 = (setting) => {
      setPreviewTheme(setting);
    };
    $[16] = setPreviewTheme;
    $[17] = t15;
  } else {
    t15 = $[17];
  }
  let t16;
  if ($[18] !== onThemeSelect || $[19] !== savePreview) {
    t16 = (setting_0) => {
      savePreview();
      onThemeSelect(setting_0);
    };
    $[18] = onThemeSelect;
    $[19] = savePreview;
    $[20] = t16;
  } else {
    t16 = $[20];
  }
  let t17;
  if ($[21] !== cancelPreview || $[22] !== onCancelProp || $[23] !== skipExitHandling) {
    t17 = skipExitHandling ? () => {
      cancelPreview();
      onCancelProp?.();
    } : async () => {
      cancelPreview();
      await gracefulShutdown(0);
    };
    $[21] = cancelPreview;
    $[22] = onCancelProp;
    $[23] = skipExitHandling;
    $[24] = t17;
  } else {
    t17 = $[24];
  }
  let t18;
  if ($[25] !== t15 || $[26] !== t16 || $[27] !== t17 || $[28] !== themeSetting) {
    t18 = /* @__PURE__ */ jsx(Select, { options: themeOptions, onFocus: t15, onChange: t16, onCancel: t17, visibleOptionCount: themeOptions.length, defaultValue: themeSetting, defaultFocusValue: themeSetting });
    $[25] = t15;
    $[26] = t16;
    $[27] = t17;
    $[28] = themeSetting;
    $[29] = t18;
  } else {
    t18 = $[29];
  }
  let t19;
  if ($[30] !== t11 || $[31] !== t14 || $[32] !== t18) {
    t19 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      t11,
      t14,
      t18
    ] });
    $[30] = t11;
    $[31] = t14;
    $[32] = t18;
    $[33] = t19;
  } else {
    t19 = $[33];
  }
  let t20;
  if ($[34] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t20 = {
      oldStart: 1,
      newStart: 1,
      oldLines: 3,
      newLines: 3,
      lines: [" function greet() {", '-  console.log("Hello, World!");', '+  console.log("Hello, Claude!");', " }"]
    };
    $[34] = t20;
  } else {
    t20 = $[34];
  }
  let t21;
  if ($[35] !== columns) {
    t21 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", borderTop: true, borderBottom: true, borderLeft: false, borderRight: false, borderStyle: "dashed", borderColor: "subtle", children: /* @__PURE__ */ jsx(StructuredDiff, { patch: t20, dim: false, filePath: "demo.js", firstLine: null, width: columns }) });
    $[35] = columns;
    $[36] = t21;
  } else {
    t21 = $[36];
  }
  const t22 = colorModuleUnavailableReason === "env" ? `Syntax highlighting disabled (via CLAUDE_CODE_SYNTAX_HIGHLIGHT=${process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT})` : syntaxHighlightingDisabled ? `Syntax highlighting disabled (${syntaxToggleShortcut} to enable)` : syntaxTheme ? `Syntax theme: ${syntaxTheme.theme}${syntaxTheme.source ? ` (from ${syntaxTheme.source})` : ""} (${syntaxToggleShortcut} to disable)` : `Syntax highlighting enabled (${syntaxToggleShortcut} to disable)`;
  let t23;
  if ($[37] !== t22) {
    t23 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " ",
      t22
    ] });
    $[37] = t22;
    $[38] = t23;
  } else {
    t23 = $[38];
  }
  let t24;
  if ($[39] !== t21 || $[40] !== t23) {
    t24 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: "100%", children: [
      t21,
      t23
    ] });
    $[39] = t21;
    $[40] = t23;
    $[41] = t24;
  } else {
    t24 = $[41];
  }
  let t25;
  if ($[42] !== t19 || $[43] !== t24) {
    t25 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      t19,
      t24
    ] });
    $[42] = t19;
    $[43] = t24;
    $[44] = t25;
  } else {
    t25 = $[44];
  }
  const content = t25;
  if (!showIntroText) {
    let t26;
    if ($[45] !== content) {
      t26 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: content });
      $[45] = content;
      $[46] = t26;
    } else {
      t26 = $[46];
    }
    let t27;
    if ($[47] !== helpText || $[48] !== showHelpTextBelow) {
      t27 = showHelpTextBelow && helpText && /* @__PURE__ */ jsx(Box, { marginLeft: 3, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: helpText }) });
      $[47] = helpText;
      $[48] = showHelpTextBelow;
      $[49] = t27;
    } else {
      t27 = $[49];
    }
    let t28;
    if ($[50] !== exitState || $[51] !== hideEscToCancel) {
      t28 = !hideEscToCancel && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: exitState.pending ? /* @__PURE__ */ jsxs(Fragment, { children: [
        "Press ",
        exitState.keyName,
        " again to exit"
      ] }) : /* @__PURE__ */ jsxs(Byline, { children: [
        /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "select" }),
        /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Esc", action: "cancel" })
      ] }) }) });
      $[50] = exitState;
      $[51] = hideEscToCancel;
      $[52] = t28;
    } else {
      t28 = $[52];
    }
    let t29;
    if ($[53] !== t27 || $[54] !== t28) {
      t29 = /* @__PURE__ */ jsxs(Box, { marginTop: 1, children: [
        t27,
        t28
      ] });
      $[53] = t27;
      $[54] = t28;
      $[55] = t29;
    } else {
      t29 = $[55];
    }
    let t30;
    if ($[56] !== t26 || $[57] !== t29) {
      t30 = /* @__PURE__ */ jsxs(Fragment, { children: [
        t26,
        t29
      ] });
      $[56] = t26;
      $[57] = t29;
      $[58] = t30;
    } else {
      t30 = $[58];
    }
    return t30;
  }
  return content;
}
function _temp2() {
}
function _temp(s) {
  return s.settings.syntaxHighlightingDisabled;
}
export {
  ThemePicker
};
