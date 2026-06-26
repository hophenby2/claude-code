import memoize from "lodash-es/memoize.js";
import { join } from "path";
import { getPlatform } from "../platform.js";
const getManagedFilePath = memoize(function() {
  if (process.env.USER_TYPE === "ant" && process.env.CLAUDE_CODE_MANAGED_SETTINGS_PATH) {
    return process.env.CLAUDE_CODE_MANAGED_SETTINGS_PATH;
  }
  switch (getPlatform()) {
    case "macos":
      return "/Library/Application Support/ClaudeCode";
    case "windows":
      return "C:\\Program Files\\ClaudeCode";
    default:
      return "/etc/claude-code";
  }
});
const getManagedSettingsDropInDir = memoize(function() {
  return join(getManagedFilePath(), "managed-settings.d");
});
export {
  getManagedFilePath,
  getManagedSettingsDropInDir
};
