import { homedir } from "os";
import { join } from "path";
import { logForDebugging } from "./debug.js";
import { getPlatform } from "./platform.js";
function getSystemDirectories(options) {
  const platform = options?.platform ?? getPlatform();
  const homeDir = options?.homedir ?? homedir();
  const env = options?.env ?? process.env;
  const defaults = {
    HOME: homeDir,
    DESKTOP: join(homeDir, "Desktop"),
    DOCUMENTS: join(homeDir, "Documents"),
    DOWNLOADS: join(homeDir, "Downloads")
  };
  switch (platform) {
    case "windows": {
      const userProfile = env.USERPROFILE || homeDir;
      return {
        HOME: homeDir,
        DESKTOP: join(userProfile, "Desktop"),
        DOCUMENTS: join(userProfile, "Documents"),
        DOWNLOADS: join(userProfile, "Downloads")
      };
    }
    case "linux":
    case "wsl": {
      return {
        HOME: homeDir,
        DESKTOP: env.XDG_DESKTOP_DIR || defaults.DESKTOP,
        DOCUMENTS: env.XDG_DOCUMENTS_DIR || defaults.DOCUMENTS,
        DOWNLOADS: env.XDG_DOWNLOAD_DIR || defaults.DOWNLOADS
      };
    }
    case "macos":
    default: {
      if (platform === "unknown") {
        logForDebugging(`Unknown platform detected, using default paths`);
      }
      return defaults;
    }
  }
}
export {
  getSystemDirectories
};
