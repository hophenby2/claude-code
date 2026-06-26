import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import {
  logEvent
} from "../../services/analytics/index.js";
import { logForDebugging } from "../debug.js";
import { getClaudeConfigHomeDir } from "../envUtils.js";
import { getErrnoCode } from "../errors.js";
import { execFileNoThrow } from "../execFileNoThrow.js";
import { getInitialSettings } from "../settings/settings.js";
import { which } from "../which.js";
import { getUserBinDir, getXDGDataHome } from "../xdg.js";
import { DEEP_LINK_PROTOCOL } from "./parseDeepLink.js";
const MACOS_BUNDLE_ID = "com.anthropic.claude-code-url-handler";
const APP_NAME = "Claude Code URL Handler";
const DESKTOP_FILE_NAME = "claude-code-url-handler.desktop";
const MACOS_APP_NAME = "Claude Code URL Handler.app";
const MACOS_APP_DIR = path.join(os.homedir(), "Applications", MACOS_APP_NAME);
const MACOS_SYMLINK_PATH = path.join(
  MACOS_APP_DIR,
  "Contents",
  "MacOS",
  "claude"
);
function linuxDesktopPath() {
  return path.join(getXDGDataHome(), "applications", DESKTOP_FILE_NAME);
}
const WINDOWS_REG_KEY = `HKEY_CURRENT_USER\\Software\\Classes\\${DEEP_LINK_PROTOCOL}`;
const WINDOWS_COMMAND_KEY = `${WINDOWS_REG_KEY}\\shell\\open\\command`;
const FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1e3;
function linuxExecLine(claudePath) {
  return `Exec="${claudePath}" --handle-uri %u`;
}
function windowsCommandValue(claudePath) {
  return `"${claudePath}" --handle-uri "%1"`;
}
async function registerMacos(claudePath) {
  const contentsDir = path.join(MACOS_APP_DIR, "Contents");
  try {
    await fs.rm(MACOS_APP_DIR, { recursive: true });
  } catch (e) {
    const code = getErrnoCode(e);
    if (code !== "ENOENT") {
      throw e;
    }
  }
  await fs.mkdir(path.dirname(MACOS_SYMLINK_PATH), { recursive: true });
  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${MACOS_BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>claude</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSBackgroundOnly</key>
  <true/>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>Claude Code Deep Link</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>${DEEP_LINK_PROTOCOL}</string>
      </array>
    </dict>
  </array>
</dict>
</plist>`;
  await fs.writeFile(path.join(contentsDir, "Info.plist"), infoPlist);
  await fs.symlink(claudePath, MACOS_SYMLINK_PATH);
  const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
  await execFileNoThrow(lsregister, ["-R", MACOS_APP_DIR], { useCwd: false });
  logForDebugging(
    `Registered ${DEEP_LINK_PROTOCOL}:// protocol handler at ${MACOS_APP_DIR}`
  );
}
async function registerLinux(claudePath) {
  await fs.mkdir(path.dirname(linuxDesktopPath()), { recursive: true });
  const desktopEntry = `[Desktop Entry]
Name=${APP_NAME}
Comment=Handle ${DEEP_LINK_PROTOCOL}:// deep links for Claude Code
${linuxExecLine(claudePath)}
Type=Application
NoDisplay=true
MimeType=x-scheme-handler/${DEEP_LINK_PROTOCOL};
`;
  await fs.writeFile(linuxDesktopPath(), desktopEntry);
  const xdgMime = await which("xdg-mime");
  if (xdgMime) {
    const { code } = await execFileNoThrow(
      xdgMime,
      ["default", DESKTOP_FILE_NAME, `x-scheme-handler/${DEEP_LINK_PROTOCOL}`],
      { useCwd: false }
    );
    if (code !== 0) {
      throw Object.assign(new Error(`xdg-mime exited with code ${code}`), {
        code: "XDG_MIME_FAILED"
      });
    }
  }
  logForDebugging(
    `Registered ${DEEP_LINK_PROTOCOL}:// protocol handler at ${linuxDesktopPath()}`
  );
}
async function registerWindows(claudePath) {
  for (const args of [
    ["add", WINDOWS_REG_KEY, "/ve", "/d", `URL:${APP_NAME}`, "/f"],
    ["add", WINDOWS_REG_KEY, "/v", "URL Protocol", "/d", "", "/f"],
    [
      "add",
      WINDOWS_COMMAND_KEY,
      "/ve",
      "/d",
      windowsCommandValue(claudePath),
      "/f"
    ]
  ]) {
    const { code } = await execFileNoThrow("reg", args, { useCwd: false });
    if (code !== 0) {
      throw Object.assign(new Error(`reg add exited with code ${code}`), {
        code: "REG_FAILED"
      });
    }
  }
  logForDebugging(
    `Registered ${DEEP_LINK_PROTOCOL}:// protocol handler in Windows registry`
  );
}
async function registerProtocolHandler(claudePath) {
  const resolved = claudePath ?? await resolveClaudePath();
  switch (process.platform) {
    case "darwin":
      await registerMacos(resolved);
      break;
    case "linux":
      await registerLinux(resolved);
      break;
    case "win32":
      await registerWindows(resolved);
      break;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
async function resolveClaudePath() {
  const binaryName = process.platform === "win32" ? "claude.exe" : "claude";
  const stablePath = path.join(getUserBinDir(), binaryName);
  try {
    await fs.realpath(stablePath);
    return stablePath;
  } catch {
    return process.execPath;
  }
}
async function isProtocolHandlerCurrent(claudePath) {
  try {
    switch (process.platform) {
      case "darwin": {
        const target = await fs.readlink(MACOS_SYMLINK_PATH);
        return target === claudePath;
      }
      case "linux": {
        const content = await fs.readFile(linuxDesktopPath(), "utf8");
        return content.includes(linuxExecLine(claudePath));
      }
      case "win32": {
        const { stdout, code } = await execFileNoThrow(
          "reg",
          ["query", WINDOWS_COMMAND_KEY, "/ve"],
          { useCwd: false }
        );
        return code === 0 && stdout.includes(windowsCommandValue(claudePath));
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}
async function ensureDeepLinkProtocolRegistered() {
  if (getInitialSettings().disableDeepLinkRegistration === "disable") {
    return;
  }
  if (!getFeatureValue_CACHED_MAY_BE_STALE("tengu_lodestone_enabled", false)) {
    return;
  }
  const claudePath = await resolveClaudePath();
  if (await isProtocolHandlerCurrent(claudePath)) {
    return;
  }
  const failureMarkerPath = path.join(
    getClaudeConfigHomeDir(),
    ".deep-link-register-failed"
  );
  try {
    const stat = await fs.stat(failureMarkerPath);
    if (Date.now() - stat.mtimeMs < FAILURE_BACKOFF_MS) {
      return;
    }
  } catch {
  }
  try {
    await registerProtocolHandler(claudePath);
    logEvent("tengu_deep_link_registered", { success: true });
    logForDebugging("Auto-registered claude-cli:// deep link protocol handler");
    await fs.rm(failureMarkerPath, { force: true }).catch(() => {
    });
  } catch (error) {
    const code = getErrnoCode(error);
    logEvent("tengu_deep_link_registered", {
      success: false,
      error_code: code
    });
    logForDebugging(
      `Failed to auto-register deep link protocol handler: ${error instanceof Error ? error.message : String(error)}`,
      { level: "warn" }
    );
    if (code === "EACCES" || code === "ENOSPC") {
      await fs.writeFile(failureMarkerPath, "").catch(() => {
      });
    }
  }
}
export {
  MACOS_BUNDLE_ID,
  ensureDeepLinkProtocolRegistered,
  isProtocolHandlerCurrent,
  registerProtocolHandler
};
