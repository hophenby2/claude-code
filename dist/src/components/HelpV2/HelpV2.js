import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useExitOnCtrlCDWithKeybindings } from "../../hooks/useExitOnCtrlCDWithKeybindings.js";
import { useShortcutDisplay } from "../../keybindings/useShortcutDisplay.js";
import { builtInCommandNames } from "../../commands.js";
import { useIsInsideModal } from "../../context/modalContext.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { Box, Link, Text } from "../../ink.js";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
import { Pane } from "../design-system/Pane.js";
import { Tab, Tabs } from "../design-system/Tabs.js";
import { Commands } from "./Commands.js";
import { General } from "./General.js";
function HelpV2(t0) {
  const $ = _c(44);
  const {
    onClose,
    commands
  } = t0;
  const {
    rows,
    columns
  } = useTerminalSize();
  const maxHeight = Math.floor(rows / 2);
  const insideModal = useIsInsideModal();
  let t1;
  if ($[0] !== onClose) {
    t1 = () => onClose("Help dialog dismissed", {
      display: "system"
    });
    $[0] = onClose;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const close = t1;
  let t2;
  if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = {
      context: "Help"
    };
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  useKeybinding("help:dismiss", close, t2);
  const exitState = useExitOnCtrlCDWithKeybindings(close);
  const dismissShortcut = useShortcutDisplay("help:dismiss", "Help", "esc");
  let antOnlyCommands;
  let builtinCommands;
  let t3;
  if ($[3] !== commands) {
    const builtinNames = builtInCommandNames();
    builtinCommands = commands.filter((cmd) => builtinNames.has(cmd.name) && !cmd.isHidden);
    let t42;
    if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t42 = [];
      $[7] = t42;
    } else {
      t42 = $[7];
    }
    antOnlyCommands = t42;
    t3 = commands.filter((cmd_2) => !builtinNames.has(cmd_2.name) && !cmd_2.isHidden);
    $[3] = commands;
    $[4] = antOnlyCommands;
    $[5] = builtinCommands;
    $[6] = t3;
  } else {
    antOnlyCommands = $[4];
    builtinCommands = $[5];
    t3 = $[6];
  }
  const customCommands = t3;
  let t4;
  if ($[8] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = /* @__PURE__ */ jsx(Tab, { title: "general", children: /* @__PURE__ */ jsx(General, {}) }, "general");
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  let tabs;
  if ($[9] !== antOnlyCommands || $[10] !== builtinCommands || $[11] !== close || $[12] !== columns || $[13] !== customCommands || $[14] !== maxHeight) {
    tabs = [t4];
    let t52;
    if ($[16] !== builtinCommands || $[17] !== close || $[18] !== columns || $[19] !== maxHeight) {
      t52 = /* @__PURE__ */ jsx(Tab, { title: "commands", children: /* @__PURE__ */ jsx(Commands, { commands: builtinCommands, maxHeight, columns, title: "Browse default commands:", onCancel: close }) }, "commands");
      $[16] = builtinCommands;
      $[17] = close;
      $[18] = columns;
      $[19] = maxHeight;
      $[20] = t52;
    } else {
      t52 = $[20];
    }
    tabs.push(t52);
    let t62;
    if ($[21] !== close || $[22] !== columns || $[23] !== customCommands || $[24] !== maxHeight) {
      t62 = /* @__PURE__ */ jsx(Tab, { title: "custom-commands", children: /* @__PURE__ */ jsx(Commands, { commands: customCommands, maxHeight, columns, title: "Browse custom commands:", emptyMessage: "No custom commands found", onCancel: close }) }, "custom");
      $[21] = close;
      $[22] = columns;
      $[23] = customCommands;
      $[24] = maxHeight;
      $[25] = t62;
    } else {
      t62 = $[25];
    }
    tabs.push(t62);
    if (false) {
      let t72;
      if ($[26] !== antOnlyCommands || $[27] !== close || $[28] !== columns || $[29] !== maxHeight) {
        t72 = /* @__PURE__ */ jsx(Tab, { title: "[ant-only]", children: /* @__PURE__ */ jsx(Commands, { commands: antOnlyCommands, maxHeight, columns, title: "Browse ant-only commands:", onCancel: close }) }, "ant-only");
        $[26] = antOnlyCommands;
        $[27] = close;
        $[28] = columns;
        $[29] = maxHeight;
        $[30] = t72;
      } else {
        t72 = $[30];
      }
      tabs.push(t72);
    }
    $[9] = antOnlyCommands;
    $[10] = builtinCommands;
    $[11] = close;
    $[12] = columns;
    $[13] = customCommands;
    $[14] = maxHeight;
    $[15] = tabs;
  } else {
    tabs = $[15];
  }
  const t5 = insideModal ? void 0 : maxHeight;
  let t6;
  if ($[31] !== tabs) {
    t6 = /* @__PURE__ */ jsx(Tabs, { title: false ? "/help" : `Claude Code v${"0.0.0-dev"}`, color: "professionalBlue", defaultTab: "general", children: tabs });
    $[31] = tabs;
    $[32] = t6;
  } else {
    t6 = $[32];
  }
  let t7;
  if ($[33] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t7 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
      "For more help:",
      " ",
      /* @__PURE__ */ jsx(Link, { url: "https://code.claude.com/docs/en/overview" })
    ] }) });
    $[33] = t7;
  } else {
    t7 = $[33];
  }
  let t8;
  if ($[34] !== dismissShortcut || $[35] !== exitState.keyName || $[36] !== exitState.pending) {
    t8 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: exitState.pending ? /* @__PURE__ */ jsxs(Fragment, { children: [
      "Press ",
      exitState.keyName,
      " again to exit"
    ] }) : /* @__PURE__ */ jsxs(Text, { italic: true, children: [
      dismissShortcut,
      " to cancel"
    ] }) }) });
    $[34] = dismissShortcut;
    $[35] = exitState.keyName;
    $[36] = exitState.pending;
    $[37] = t8;
  } else {
    t8 = $[37];
  }
  let t9;
  if ($[38] !== t6 || $[39] !== t8) {
    t9 = /* @__PURE__ */ jsxs(Pane, { color: "professionalBlue", children: [
      t6,
      t7,
      t8
    ] });
    $[38] = t6;
    $[39] = t8;
    $[40] = t9;
  } else {
    t9 = $[40];
  }
  let t10;
  if ($[41] !== t5 || $[42] !== t9) {
    t10 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", height: t5, children: t9 });
    $[41] = t5;
    $[42] = t9;
    $[43] = t10;
  } else {
    t10 = $[43];
  }
  return t10;
}
export {
  HelpV2
};
