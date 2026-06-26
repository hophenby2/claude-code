import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box } from "../../../../ink.js";
import { ConfigurableShortcutHint } from "../../../ConfigurableShortcutHint.js";
import { Select } from "../../../CustomSelect/select.js";
import { Byline } from "../../../design-system/Byline.js";
import { KeyboardShortcutHint } from "../../../design-system/KeyboardShortcutHint.js";
import { useWizard } from "../../../wizard/index.js";
import { WizardDialogLayout } from "../../../wizard/WizardDialogLayout.js";
function LocationStep() {
  const $ = _c(11);
  const {
    goNext,
    updateWizardData,
    cancel
  } = useWizard();
  let t0;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t0 = {
      label: "Project (.claude/agents/)",
      value: "projectSettings"
    };
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  let t1;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = [t0, {
      label: "Personal (~/.claude/agents/)",
      value: "userSettings"
    }];
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const locationOptions = t1;
  let t2;
  if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2191\u2193", action: "navigate" }),
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "select" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" })
    ] });
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== goNext || $[4] !== updateWizardData) {
    t3 = (value) => {
      updateWizardData({
        location: value
      });
      goNext();
    };
    $[3] = goNext;
    $[4] = updateWizardData;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== cancel) {
    t4 = () => cancel();
    $[6] = cancel;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== t3 || $[9] !== t4) {
    t5 = /* @__PURE__ */ jsx(WizardDialogLayout, { subtitle: "Choose location", footerText: t2, children: /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Select, { options: locationOptions, onChange: t3, onCancel: t4 }, "location-select") }) });
    $[8] = t3;
    $[9] = t4;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  return t5;
}
export {
  LocationStep
};
