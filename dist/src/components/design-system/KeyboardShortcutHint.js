import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import Text from "../../ink/components/Text.js";
function KeyboardShortcutHint(t0) {
  const $ = _c(9);
  const {
    shortcut,
    action,
    parens: t1,
    bold: t2
  } = t0;
  const parens = t1 === void 0 ? false : t1;
  const bold = t2 === void 0 ? false : t2;
  let t3;
  if ($[0] !== bold || $[1] !== shortcut) {
    t3 = bold ? /* @__PURE__ */ jsx(Text, { bold: true, children: shortcut }) : shortcut;
    $[0] = bold;
    $[1] = shortcut;
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  const shortcutText = t3;
  if (parens) {
    let t42;
    if ($[3] !== action || $[4] !== shortcutText) {
      t42 = /* @__PURE__ */ jsxs(Text, { children: [
        "(",
        shortcutText,
        " to ",
        action,
        ")"
      ] });
      $[3] = action;
      $[4] = shortcutText;
      $[5] = t42;
    } else {
      t42 = $[5];
    }
    return t42;
  }
  let t4;
  if ($[6] !== action || $[7] !== shortcutText) {
    t4 = /* @__PURE__ */ jsxs(Text, { children: [
      shortcutText,
      " to ",
      action
    ] });
    $[6] = action;
    $[7] = shortcutText;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  return t4;
}
export {
  KeyboardShortcutHint
};
