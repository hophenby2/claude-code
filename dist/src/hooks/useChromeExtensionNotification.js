import { jsx } from "react/jsx-runtime";
import { Text } from "../ink.js";
import { isClaudeAISubscriber } from "../utils/auth.js";
import { isChromeExtensionInstalled, shouldEnableClaudeInChrome } from "../utils/claudeInChrome/setup.js";
import { isRunningOnHomespace } from "../utils/envUtils.js";
import { useStartupNotification } from "./notifs/useStartupNotification.js";
function getChromeFlag() {
  if (process.argv.includes("--chrome")) {
    return true;
  }
  if (process.argv.includes("--no-chrome")) {
    return false;
  }
  return void 0;
}
function useChromeExtensionNotification() {
  useStartupNotification(_temp);
}
async function _temp() {
  const chromeFlag = getChromeFlag();
  if (!shouldEnableClaudeInChrome(chromeFlag)) {
    return null;
  }
  if (!isClaudeAISubscriber()) {
    return {
      key: "chrome-requires-subscription",
      jsx: /* @__PURE__ */ jsx(Text, { color: "error", children: "Claude in Chrome requires a claude.ai subscription" }),
      priority: "immediate",
      timeoutMs: 5e3
    };
  }
  const installed = await isChromeExtensionInstalled();
  if (!installed && !isRunningOnHomespace()) {
    return {
      key: "chrome-extension-not-detected",
      jsx: /* @__PURE__ */ jsx(Text, { color: "warning", children: "Chrome extension not detected \xB7 https://claude.ai/chrome to install" }),
      priority: "immediate",
      timeoutMs: 3e3
    };
  }
  if (chromeFlag === void 0) {
    return {
      key: "claude-in-chrome-default-enabled",
      text: "Claude in Chrome enabled \xB7 /chrome",
      priority: "low"
    };
  }
  return null;
}
export {
  useChromeExtensionNotification
};
