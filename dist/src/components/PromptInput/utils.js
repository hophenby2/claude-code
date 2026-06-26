import {
  hasUsedBackslashReturn,
  isShiftEnterKeyBindingInstalled
} from "../../commands/terminalSetup/terminalSetup.js";
import { getGlobalConfig } from "../../utils/config.js";
import { env } from "../../utils/env.js";
function isVimModeEnabled() {
  const config = getGlobalConfig();
  return config.editorMode === "vim";
}
function getNewlineInstructions() {
  if (env.terminal === "Apple_Terminal" && process.platform === "darwin") {
    return "shift + \u23CE for newline";
  }
  if (isShiftEnterKeyBindingInstalled()) {
    return "shift + \u23CE for newline";
  }
  return hasUsedBackslashReturn() ? "\\\u23CE for newline" : "backslash (\\) + return (\u23CE) for newline";
}
function isNonSpacePrintable(input, key) {
  if (key.ctrl || key.meta || key.escape || key.return || key.tab || key.backspace || key.delete || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.pageUp || key.pageDown || key.home || key.end) {
    return false;
  }
  return input.length > 0 && !/^\s/.test(input) && !input.startsWith("\x1B");
}
export {
  getNewlineInstructions,
  isNonSpacePrintable,
  isVimModeEnabled
};
