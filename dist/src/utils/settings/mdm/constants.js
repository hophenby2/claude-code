import { homedir, userInfo } from "os";
import { join } from "path";
const MACOS_PREFERENCE_DOMAIN = "com.anthropic.claudecode";
const WINDOWS_REGISTRY_KEY_PATH_HKLM = "HKLM\\SOFTWARE\\Policies\\ClaudeCode";
const WINDOWS_REGISTRY_KEY_PATH_HKCU = "HKCU\\SOFTWARE\\Policies\\ClaudeCode";
const WINDOWS_REGISTRY_VALUE_NAME = "Settings";
const PLUTIL_PATH = "/usr/bin/plutil";
const PLUTIL_ARGS_PREFIX = ["-convert", "json", "-o", "-", "--"];
const MDM_SUBPROCESS_TIMEOUT_MS = 5e3;
function getMacOSPlistPaths() {
  let username = "";
  try {
    username = userInfo().username;
  } catch {
  }
  const paths = [];
  if (username) {
    paths.push({
      path: `/Library/Managed Preferences/${username}/${MACOS_PREFERENCE_DOMAIN}.plist`,
      label: "per-user managed preferences"
    });
  }
  paths.push({
    path: `/Library/Managed Preferences/${MACOS_PREFERENCE_DOMAIN}.plist`,
    label: "device-level managed preferences"
  });
  if (process.env.USER_TYPE === "ant") {
    paths.push({
      path: join(
        homedir(),
        "Library",
        "Preferences",
        `${MACOS_PREFERENCE_DOMAIN}.plist`
      ),
      label: "user preferences (ant-only)"
    });
  }
  return paths;
}
export {
  MACOS_PREFERENCE_DOMAIN,
  MDM_SUBPROCESS_TIMEOUT_MS,
  PLUTIL_ARGS_PREFIX,
  PLUTIL_PATH,
  WINDOWS_REGISTRY_KEY_PATH_HKCU,
  WINDOWS_REGISTRY_KEY_PATH_HKLM,
  WINDOWS_REGISTRY_VALUE_NAME,
  getMacOSPlistPaths
};
