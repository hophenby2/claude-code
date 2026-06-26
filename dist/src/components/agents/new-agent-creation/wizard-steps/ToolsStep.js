import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { ConfigurableShortcutHint } from "../../../ConfigurableShortcutHint.js";
import { Byline } from "../../../design-system/Byline.js";
import { KeyboardShortcutHint } from "../../../design-system/KeyboardShortcutHint.js";
import { useWizard } from "../../../wizard/index.js";
import { WizardDialogLayout } from "../../../wizard/WizardDialogLayout.js";
import { ToolSelector } from "../../ToolSelector.js";
function ToolsStep(t0) {
  const $ = _c(9);
  const {
    tools
  } = t0;
  const {
    goNext,
    goBack,
    updateWizardData,
    wizardData
  } = useWizard();
  let t1;
  if ($[0] !== goNext || $[1] !== updateWizardData) {
    t1 = (selectedTools) => {
      updateWizardData({
        selectedTools
      });
      goNext();
    };
    $[0] = goNext;
    $[1] = updateWizardData;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const handleComplete = t1;
  const initialTools = wizardData.selectedTools;
  let t2;
  if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "toggle selection" }),
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2191\u2193", action: "navigate" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "go back" })
    ] });
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== goBack || $[5] !== handleComplete || $[6] !== initialTools || $[7] !== tools) {
    t3 = /* @__PURE__ */ jsx(WizardDialogLayout, { subtitle: "Select tools", footerText: t2, children: /* @__PURE__ */ jsx(ToolSelector, { tools, initialTools, onComplete: handleComplete, onCancel: goBack }) });
    $[4] = goBack;
    $[5] = handleComplete;
    $[6] = initialTools;
    $[7] = tools;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  return t3;
}
export {
  ToolsStep
};
