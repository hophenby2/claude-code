import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import chalk from "chalk";
import React, { useContext } from "react";
import { Text } from "../ink.js";
import { getShortcutDisplay } from "../keybindings/shortcutFormat.js";
import { useShortcutDisplay } from "../keybindings/useShortcutDisplay.js";
import { KeyboardShortcutHint } from "./design-system/KeyboardShortcutHint.js";
import { InVirtualListContext } from "./messageActions.js";
const SubAgentContext = React.createContext(false);
function SubAgentProvider(t0) {
  const $ = _c(2);
  const {
    children
  } = t0;
  let t1;
  if ($[0] !== children) {
    t1 = /* @__PURE__ */ jsx(SubAgentContext.Provider, { value: true, children });
    $[0] = children;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function CtrlOToExpand() {
  const $ = _c(2);
  const isInSubAgent = useContext(SubAgentContext);
  const inVirtualList = useContext(InVirtualListContext);
  const expandShortcut = useShortcutDisplay("app:toggleTranscript", "Global", "ctrl+o");
  if (isInSubAgent || inVirtualList) {
    return null;
  }
  let t0;
  if ($[0] !== expandShortcut) {
    t0 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: expandShortcut, action: "expand", parens: true }) });
    $[0] = expandShortcut;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return t0;
}
function ctrlOToExpand() {
  const shortcut = getShortcutDisplay("app:toggleTranscript", "Global", "ctrl+o");
  return chalk.dim(`(${shortcut} to expand)`);
}
export {
  CtrlOToExpand,
  SubAgentProvider,
  ctrlOToExpand
};
