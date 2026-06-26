import axios from "axios";
import { constants as fsConstants } from "fs";
import { access, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { getDynamicConfig_BLOCKS_ON_INIT } from "../services/analytics/growthbook.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { saveGlobalConfig } from "./config.js";
import { logForDebugging } from "./debug.js";
import { env } from "./env.js";
import { getClaudeConfigHomeDir } from "./envUtils.js";
import { ClaudeError, getErrnoCode, isENOENT } from "./errors.js";
import { execFileNoThrowWithCwd } from "./execFileNoThrow.js";
import { getFsImplementation } from "./fsOperations.js";
import { gracefulShutdownSync } from "./gracefulShutdown.js";
import { logError } from "./log.js";
import { gte, lt } from "./semver.js";
import { getInitialSettings } from "./settings/settings.js";
import {
  filterClaudeAliases,
  getShellConfigPaths,
  readFileLines,
  writeFileLines
} from "./shellConfig.js";
import { jsonParse } from "./slowOperations.js";
const GCS_BUCKET_URL = "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases";
class AutoUpdaterError extends ClaudeError {
}
async function assertMinVersion() {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  try {
    const versionConfig = await getDynamicConfig_BLOCKS_ON_INIT("tengu_version_config", { minVersion: "0.0.0" });
    if (versionConfig.minVersion && lt("0.0.0", versionConfig.minVersion)) {
      console.error(`
It looks like your version of Claude Code (${"0.0.0"}) needs an update.
A newer version (${versionConfig.minVersion} or higher) is required to continue.

To update, please run:
    claude update

This will ensure you have access to the latest features and improvements.
`);
      gracefulShutdownSync(1);
    }
  } catch (error) {
    logError(error);
  }
}
async function getMaxVersion() {
  const config = await getMaxVersionConfig();
  if (process.env.USER_TYPE === "ant") {
    return config.ant || void 0;
  }
  return config.external || void 0;
}
async function getMaxVersionMessage() {
  const config = await getMaxVersionConfig();
  if (process.env.USER_TYPE === "ant") {
    return config.ant_message || void 0;
  }
  return config.external_message || void 0;
}
async function getMaxVersionConfig() {
  try {
    return await getDynamicConfig_BLOCKS_ON_INIT(
      "tengu_max_version_config",
      {}
    );
  } catch (error) {
    logError(error);
    return {};
  }
}
function shouldSkipVersion(targetVersion) {
  const settings = getInitialSettings();
  const minimumVersion = settings?.minimumVersion;
  if (!minimumVersion) {
    return false;
  }
  const shouldSkip = !gte(targetVersion, minimumVersion);
  if (shouldSkip) {
    logForDebugging(
      `Skipping update to ${targetVersion} - below minimumVersion ${minimumVersion}`
    );
  }
  return shouldSkip;
}
const LOCK_TIMEOUT_MS = 5 * 60 * 1e3;
function getLockFilePath() {
  return join(getClaudeConfigHomeDir(), ".update.lock");
}
async function acquireLock() {
  const fs = getFsImplementation();
  const lockPath = getLockFilePath();
  try {
    const stats = await fs.stat(lockPath);
    const age = Date.now() - stats.mtimeMs;
    if (age < LOCK_TIMEOUT_MS) {
      return false;
    }
    try {
      const recheck = await fs.stat(lockPath);
      if (Date.now() - recheck.mtimeMs < LOCK_TIMEOUT_MS) {
        return false;
      }
      await fs.unlink(lockPath);
    } catch (err) {
      if (!isENOENT(err)) {
        logError(err);
        return false;
      }
    }
  } catch (err) {
    if (!isENOENT(err)) {
      logError(err);
      return false;
    }
  }
  try {
    await writeFile(lockPath, `${process.pid}`, {
      encoding: "utf8",
      flag: "wx"
    });
    return true;
  } catch (err) {
    const code = getErrnoCode(err);
    if (code === "EEXIST") {
      return false;
    }
    if (code === "ENOENT") {
      try {
        await fs.mkdir(getClaudeConfigHomeDir());
        await writeFile(lockPath, `${process.pid}`, {
          encoding: "utf8",
          flag: "wx"
        });
        return true;
      } catch (mkdirErr) {
        if (getErrnoCode(mkdirErr) === "EEXIST") {
          return false;
        }
        logError(mkdirErr);
        return false;
      }
    }
    logError(err);
    return false;
  }
}
async function releaseLock() {
  const fs = getFsImplementation();
  const lockPath = getLockFilePath();
  try {
    const lockData = await fs.readFile(lockPath, { encoding: "utf8" });
    if (lockData === `${process.pid}`) {
      await fs.unlink(lockPath);
    }
  } catch (err) {
    if (isENOENT(err)) {
      return;
    }
    logError(err);
  }
}
async function getInstallationPrefix() {
  const isBun = env.isRunningWithBun();
  let prefixResult = null;
  if (isBun) {
    prefixResult = await execFileNoThrowWithCwd("bun", ["pm", "bin", "-g"], {
      cwd: homedir()
    });
  } else {
    prefixResult = await execFileNoThrowWithCwd(
      "npm",
      ["-g", "config", "get", "prefix"],
      { cwd: homedir() }
    );
  }
  if (prefixResult.code !== 0) {
    logError(new Error(`Failed to check ${isBun ? "bun" : "npm"} permissions`));
    return null;
  }
  return prefixResult.stdout.trim();
}
async function checkGlobalInstallPermissions() {
  try {
    const prefix = await getInstallationPrefix();
    if (!prefix) {
      return { hasPermissions: false, npmPrefix: null };
    }
    try {
      await access(prefix, fsConstants.W_OK);
      return { hasPermissions: true, npmPrefix: prefix };
    } catch {
      logError(
        new AutoUpdaterError(
          "Insufficient permissions for global npm install."
        )
      );
      return { hasPermissions: false, npmPrefix: prefix };
    }
  } catch (error) {
    logError(error);
    return { hasPermissions: false, npmPrefix: null };
  }
}
async function getLatestVersion(channel) {
  const npmTag = channel === "stable" ? "stable" : "latest";
  const result = await execFileNoThrowWithCwd(
    "npm",
    ["view", `${"claude-code-reconstructed"}@${npmTag}`, "version", "--prefer-online"],
    { abortSignal: AbortSignal.timeout(5e3), cwd: homedir() }
  );
  if (result.code !== 0) {
    logForDebugging(`npm view failed with code ${result.code}`);
    if (result.stderr) {
      logForDebugging(`npm stderr: ${result.stderr.trim()}`);
    } else {
      logForDebugging("npm stderr: (empty)");
    }
    if (result.stdout) {
      logForDebugging(`npm stdout: ${result.stdout.trim()}`);
    }
    return null;
  }
  return result.stdout.trim();
}
async function getNpmDistTags() {
  const result = await execFileNoThrowWithCwd(
    "npm",
    ["view", "claude-code-reconstructed", "dist-tags", "--json", "--prefer-online"],
    { abortSignal: AbortSignal.timeout(5e3), cwd: homedir() }
  );
  if (result.code !== 0) {
    logForDebugging(`npm view dist-tags failed with code ${result.code}`);
    return { latest: null, stable: null };
  }
  try {
    const parsed = jsonParse(result.stdout.trim());
    return {
      latest: typeof parsed.latest === "string" ? parsed.latest : null,
      stable: typeof parsed.stable === "string" ? parsed.stable : null
    };
  } catch (error) {
    logForDebugging(`Failed to parse dist-tags: ${error}`);
    return { latest: null, stable: null };
  }
}
async function getLatestVersionFromGcs(channel) {
  try {
    const response = await axios.get(`${GCS_BUCKET_URL}/${channel}`, {
      timeout: 5e3,
      responseType: "text"
    });
    return response.data.trim();
  } catch (error) {
    logForDebugging(`Failed to fetch ${channel} from GCS: ${error}`);
    return null;
  }
}
async function getGcsDistTags() {
  const [latest, stable] = await Promise.all([
    getLatestVersionFromGcs("latest"),
    getLatestVersionFromGcs("stable")
  ]);
  return { latest, stable };
}
async function getVersionHistory(limit) {
  if (process.env.USER_TYPE !== "ant") {
    return [];
  }
  const packageUrl = "claude-code-reconstructed-native";
  const result = await execFileNoThrowWithCwd(
    "npm",
    ["view", packageUrl, "versions", "--json", "--prefer-online"],
    // Longer timeout for version list
    { abortSignal: AbortSignal.timeout(3e4), cwd: homedir() }
  );
  if (result.code !== 0) {
    logForDebugging(`npm view versions failed with code ${result.code}`);
    if (result.stderr) {
      logForDebugging(`npm stderr: ${result.stderr.trim()}`);
    }
    return [];
  }
  try {
    const versions = jsonParse(result.stdout.trim());
    return versions.slice(-limit).reverse();
  } catch (error) {
    logForDebugging(`Failed to parse version history: ${error}`);
    return [];
  }
}
async function installGlobalPackage(specificVersion) {
  if (!await acquireLock()) {
    logError(
      new AutoUpdaterError("Another process is currently installing an update")
    );
    logEvent("tengu_auto_updater_lock_contention", {
      pid: process.pid,
      currentVersion: "0.0.0"
    });
    return "in_progress";
  }
  try {
    await removeClaudeAliasesFromShellConfigs();
    if (!env.isRunningWithBun() && env.isNpmFromWindowsPath()) {
      logError(new Error("Windows NPM detected in WSL environment"));
      logEvent("tengu_auto_updater_windows_npm_in_wsl", {
        currentVersion: "0.0.0"
      });
      console.error(`
Error: Windows NPM detected in WSL

You're running Claude Code in WSL but using the Windows NPM installation from /mnt/c/.
This configuration is not supported for updates.

To fix this issue:
  1. Install Node.js within your Linux distribution: e.g. sudo apt install nodejs npm
  2. Make sure Linux NPM is in your PATH before the Windows version
  3. Try updating again with 'claude update'
`);
      return "install_failed";
    }
    const { hasPermissions } = await checkGlobalInstallPermissions();
    if (!hasPermissions) {
      return "no_permissions";
    }
    const packageSpec = specificVersion ? `${"claude-code-reconstructed"}@${specificVersion}` : "claude-code-reconstructed";
    const packageManager = env.isRunningWithBun() ? "bun" : "npm";
    const installResult = await execFileNoThrowWithCwd(
      packageManager,
      ["install", "-g", packageSpec],
      { cwd: homedir() }
    );
    if (installResult.code !== 0) {
      const error = new AutoUpdaterError(
        `Failed to install new version of claude: ${installResult.stdout} ${installResult.stderr}`
      );
      logError(error);
      return "install_failed";
    }
    saveGlobalConfig((current) => ({
      ...current,
      installMethod: "global"
    }));
    return "success";
  } finally {
    await releaseLock();
  }
}
async function removeClaudeAliasesFromShellConfigs() {
  const configMap = getShellConfigPaths();
  for (const [, configFile] of Object.entries(configMap)) {
    try {
      const lines = await readFileLines(configFile);
      if (!lines) continue;
      const { filtered, hadAlias } = filterClaudeAliases(lines);
      if (hadAlias) {
        await writeFileLines(configFile, filtered);
        logForDebugging(`Removed claude alias from ${configFile}`);
      }
    } catch (error) {
      logForDebugging(`Failed to remove alias from ${configFile}: ${error}`, {
        level: "error"
      });
    }
  }
}
export {
  assertMinVersion,
  checkGlobalInstallPermissions,
  getGcsDistTags,
  getLatestVersion,
  getLatestVersionFromGcs,
  getLockFilePath,
  getMaxVersion,
  getMaxVersionMessage,
  getNpmDistTags,
  getVersionHistory,
  installGlobalPackage,
  shouldSkipVersion
};
