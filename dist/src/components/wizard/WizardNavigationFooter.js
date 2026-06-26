import { jsx, jsxs } from "react/jsx-runtime";
import { useExitOnCtrlCDWithKeybindings } from "../../hooks/useExitOnCtrlCDWithKeybindings.js";
import { Box, Text } from "../../ink.js";
import { ConfigurableShortcutHint } from "../ConfigurableShortcutHint.js";
import { Byline } from "../design-system/Byline.js";
import { KeyboardShortcutHint } from "../design-system/KeyboardShortcutHint.js";
function WizardNavigationFooter({
  instructions = /* @__PURE__ */ jsxs(Byline, { children: [
    /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2191\u2193", action: "navigate" }),
    /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "select" }),
    /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "go back" })
  ] })
}) {
  const exitState = useExitOnCtrlCDWithKeybindings();
  return /* @__PURE__ */ jsx(Box, { marginLeft: 3, marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: exitState.pending ? `Press ${exitState.keyName} again to exit` : instructions }) });
}
export {
  WizardNavigationFooter
};
