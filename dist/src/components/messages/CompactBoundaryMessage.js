import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../../ink.js";
import { useShortcutDisplay } from "../../keybindings/useShortcutDisplay.js";
function CompactBoundaryMessage() {
  const $ = _c(2);
  const historyShortcut = useShortcutDisplay("app:toggleTranscript", "Global", "ctrl+o");
  let t0;
  if ($[0] !== historyShortcut) {
    t0 = /* @__PURE__ */ jsx(Box, { marginY: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "\u273B Conversation compacted (",
      historyShortcut,
      " for history)"
    ] }) });
    $[0] = historyShortcut;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return t0;
}
export {
  CompactBoundaryMessage
};
