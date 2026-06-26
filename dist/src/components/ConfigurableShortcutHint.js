import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useShortcutDisplay } from "../keybindings/useShortcutDisplay.js";
import { KeyboardShortcutHint } from "./design-system/KeyboardShortcutHint.js";
function ConfigurableShortcutHint(t0) {
  const $ = _c(5);
  const {
    action,
    context,
    fallback,
    description,
    parens,
    bold
  } = t0;
  const shortcut = useShortcutDisplay(action, context, fallback);
  let t1;
  if ($[0] !== bold || $[1] !== description || $[2] !== parens || $[3] !== shortcut) {
    t1 = /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut, action: description, parens, bold });
    $[0] = bold;
    $[1] = description;
    $[2] = parens;
    $[3] = shortcut;
    $[4] = t1;
  } else {
    t1 = $[4];
  }
  return t1;
}
export {
  ConfigurableShortcutHint
};
