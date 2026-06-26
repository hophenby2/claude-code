const feature = (_name) => false;
import { randomBytes } from "crypto";
import { unwatchFile, watchFile } from "fs";
import memoize from "lodash-es/memoize.js";
import pickBy from "lodash-es/pickBy.js";
import { basename, dirname, join, resolve } from "path";
import { getOriginalCwd, getSessionTrustAccepted } from "../bootstrap/state.js";
import { getAutoMemEntrypoint } from "../memdir/paths.js";
import { logEvent } from "../services/analytics/index.js";
import { getCwd } from "../utils/cwd.js";
import { registerCleanup } from "./cleanupRegistry.js";
import { logForDebugging } from "./debug.js";
import { logForDiagnosticsNoPII } from "./diagLogs.js";
import { getGlobalClaudeFile } from "./env.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "./envUtils.js";
import { ConfigParseError, getErrnoCode } from "./errors.js";
import { writeFileSyncAndFlush_DEPRECATED } from "./file.js";
import { getFsImplementation } from "./fsOperations.js";
import { findCanonicalGitRoot } from "./git.js";
import { safeParseJSON } from "./json.js";
import { stripBOM } from "./jsonRead.js";
import * as lockfile from "./lockfile.js";
import { logError } from "./log.js";
import { normalizePathForConfigKey } from "./path.js";
import { getEssentialTrafficOnlyReason } from "./privacyLevel.js";
import { getManagedFilePath } from "./settings/managedPath.js";
const teamMemPaths = false ? null : null;
const ccrAutoConnect = false ? null : null;
import { jsonParse, jsonStringify } from "./slowOperations.js";
let insideGetConfig = false;
const DEFAULT_PROJECT_CONFIG = {
  allowedTools: [],
  mcpContextUris: [],
  mcpServers: {},
  enabledMcpjsonServers: [],
  disabledMcpjsonServers: [],
  hasTrustDialogAccepted: false,
  projectOnboardingSeenCount: 0,
  hasClaudeMdExternalIncludesApproved: false,
  hasClaudeMdExternalIncludesWarningShown: false
};
import {
  EDITOR_MODES,
  NOTIFICATION_CHANNELS
} from "./configConstants.js";
function createDefaultGlobalConfig() {
  return {
    numStartups: 0,
    installMethod: void 0,
    autoUpdates: void 0,
    theme: "dark",
    preferredNotifChannel: "auto",
    verbose: false,
    editorMode: "normal",
    autoCompactEnabled: true,
    showTurnDuration: true,
    hasSeenTasksHint: false,
    hasUsedStash: false,
    hasUsedBackgroundTask: false,
    queuedCommandUpHintCount: 0,
    diffTool: "auto",
    customApiKeyResponses: {
      approved: [],
      rejected: []
    },
    env: {},
    tipsHistory: {},
    memoryUsageCount: 0,
    promptQueueUseCount: 0,
    btwUseCount: 0,
    todoFeatureEnabled: true,
    showExpandedTodos: false,
    messageIdleNotifThresholdMs: 6e4,
    autoConnectIde: false,
    autoInstallIdeExtension: true,
    fileCheckpointingEnabled: true,
    terminalProgressBarEnabled: true,
    cachedStatsigGates: {},
    cachedDynamicConfigs: {},
    cachedGrowthBookFeatures: {},
    respectGitignore: true,
    copyFullResponse: false
  };
}
const DEFAULT_GLOBAL_CONFIG = createDefaultGlobalConfig();
const GLOBAL_CONFIG_KEYS = [
  "apiKeyHelper",
  "installMethod",
  "autoUpdates",
  "autoUpdatesProtectedForNative",
  "theme",
  "verbose",
  "preferredNotifChannel",
  "shiftEnterKeyBindingInstalled",
  "editorMode",
  "hasUsedBackslashReturn",
  "autoCompactEnabled",
  "showTurnDuration",
  "diffTool",
  "env",
  "tipsHistory",
  "todoFeatureEnabled",
  "showExpandedTodos",
  "messageIdleNotifThresholdMs",
  "autoConnectIde",
  "autoInstallIdeExtension",
  "fileCheckpointingEnabled",
  "terminalProgressBarEnabled",
  "showStatusInTerminalTab",
  "taskCompleteNotifEnabled",
  "inputNeededNotifEnabled",
  "agentPushNotifEnabled",
  "respectGitignore",
  "claudeInChromeDefaultEnabled",
  "hasCompletedClaudeInChromeOnboarding",
  "lspRecommendationDisabled",
  "lspRecommendationNeverPlugins",
  "lspRecommendationIgnoredCount",
  "copyFullResponse",
  "copyOnSelect",
  "permissionExplainerEnabled",
  "prStatusFooterEnabled",
  "remoteControlAtStartup",
  "remoteDialogSeen"
];
function isGlobalConfigKey(key) {
  return GLOBAL_CONFIG_KEYS.includes(key);
}
const PROJECT_CONFIG_KEYS = [
  "allowedTools",
  "hasTrustDialogAccepted",
  "hasCompletedProjectOnboarding"
];
let _trustAccepted = false;
function resetTrustDialogAcceptedCacheForTesting() {
  _trustAccepted = false;
}
function checkHasTrustDialogAccepted() {
  return _trustAccepted ||= computeTrustDialogAccepted();
}
function computeTrustDialogAccepted() {
  if (getSessionTrustAccepted()) {
    return true;
  }
  const config = getGlobalConfig();
  const projectPath = getProjectPathForConfig();
  const projectConfig = config.projects?.[projectPath];
  if (projectConfig?.hasTrustDialogAccepted) {
    return true;
  }
  let currentPath = normalizePathForConfigKey(getCwd());
  while (true) {
    const pathConfig = config.projects?.[currentPath];
    if (pathConfig?.hasTrustDialogAccepted) {
      return true;
    }
    const parentPath = normalizePathForConfigKey(resolve(currentPath, ".."));
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }
  return false;
}
function isPathTrusted(dir) {
  const config = getGlobalConfig();
  let currentPath = normalizePathForConfigKey(resolve(dir));
  while (true) {
    if (config.projects?.[currentPath]?.hasTrustDialogAccepted) return true;
    const parentPath = normalizePathForConfigKey(resolve(currentPath, ".."));
    if (parentPath === currentPath) return false;
    currentPath = parentPath;
  }
}
const TEST_GLOBAL_CONFIG_FOR_TESTING = {
  ...DEFAULT_GLOBAL_CONFIG,
  autoUpdates: false
};
const TEST_PROJECT_CONFIG_FOR_TESTING = {
  ...DEFAULT_PROJECT_CONFIG
};
function isProjectConfigKey(key) {
  return PROJECT_CONFIG_KEYS.includes(key);
}
function wouldLoseAuthState(fresh) {
  const cached = globalConfigCache.config;
  if (!cached) return false;
  const lostOauth = cached.oauthAccount !== void 0 && fresh.oauthAccount === void 0;
  const lostOnboarding = cached.hasCompletedOnboarding === true && fresh.hasCompletedOnboarding !== true;
  return lostOauth || lostOnboarding;
}
function saveGlobalConfig(updater) {
  if (process.env.NODE_ENV === "test") {
    const config = updater(TEST_GLOBAL_CONFIG_FOR_TESTING);
    if (config === TEST_GLOBAL_CONFIG_FOR_TESTING) {
      return;
    }
    Object.assign(TEST_GLOBAL_CONFIG_FOR_TESTING, config);
    return;
  }
  let written = null;
  try {
    const didWrite = saveConfigWithLock(
      getGlobalClaudeFile(),
      createDefaultGlobalConfig,
      (current) => {
        const config = updater(current);
        if (config === current) {
          return current;
        }
        written = {
          ...config,
          projects: removeProjectHistory(current.projects)
        };
        return written;
      }
    );
    if (didWrite && written) {
      writeThroughGlobalConfigCache(written);
    }
  } catch (error) {
    logForDebugging(`Failed to save config with lock: ${error}`, {
      level: "error"
    });
    const currentConfig = getConfig(
      getGlobalClaudeFile(),
      createDefaultGlobalConfig
    );
    if (wouldLoseAuthState(currentConfig)) {
      logForDebugging(
        "saveGlobalConfig fallback: re-read config is missing auth that cache has; refusing to write. See GH #3117.",
        { level: "error" }
      );
      logEvent("tengu_config_auth_loss_prevented", {});
      return;
    }
    const config = updater(currentConfig);
    if (config === currentConfig) {
      return;
    }
    written = {
      ...config,
      projects: removeProjectHistory(currentConfig.projects)
    };
    saveConfig(getGlobalClaudeFile(), written, DEFAULT_GLOBAL_CONFIG);
    writeThroughGlobalConfigCache(written);
  }
}
let globalConfigCache = {
  config: null,
  mtime: 0
};
let lastReadFileStats = null;
let configCacheHits = 0;
let configCacheMisses = 0;
let globalConfigWriteCount = 0;
function getGlobalConfigWriteCount() {
  return globalConfigWriteCount;
}
const CONFIG_WRITE_DISPLAY_THRESHOLD = 20;
function reportConfigCacheStats() {
  const total = configCacheHits + configCacheMisses;
  if (total > 0) {
    logEvent("tengu_config_cache_stats", {
      cache_hits: configCacheHits,
      cache_misses: configCacheMisses,
      hit_rate: configCacheHits / total
    });
  }
  configCacheHits = 0;
  configCacheMisses = 0;
}
registerCleanup(async () => {
  reportConfigCacheStats();
});
function migrateConfigFields(config) {
  if (config.installMethod !== void 0) {
    return config;
  }
  const legacy = config;
  let installMethod = "unknown";
  let autoUpdates = config.autoUpdates ?? true;
  switch (legacy.autoUpdaterStatus) {
    case "migrated":
      installMethod = "local";
      break;
    case "installed":
      installMethod = "native";
      break;
    case "disabled":
      autoUpdates = false;
      break;
    case "enabled":
    case "no_permissions":
    case "not_configured":
      installMethod = "global";
      break;
    case void 0:
      break;
  }
  return {
    ...config,
    installMethod,
    autoUpdates
  };
}
function removeProjectHistory(projects) {
  if (!projects) {
    return projects;
  }
  const cleanedProjects = {};
  let needsCleaning = false;
  for (const [path, projectConfig] of Object.entries(projects)) {
    const legacy = projectConfig;
    if (legacy.history !== void 0) {
      needsCleaning = true;
      const { history, ...cleanedConfig } = legacy;
      cleanedProjects[path] = cleanedConfig;
    } else {
      cleanedProjects[path] = projectConfig;
    }
  }
  return needsCleaning ? cleanedProjects : projects;
}
const CONFIG_FRESHNESS_POLL_MS = 1e3;
let freshnessWatcherStarted = false;
function startGlobalConfigFreshnessWatcher() {
  if (freshnessWatcherStarted || process.env.NODE_ENV === "test") return;
  freshnessWatcherStarted = true;
  const file = getGlobalClaudeFile();
  watchFile(
    file,
    { interval: CONFIG_FRESHNESS_POLL_MS, persistent: false },
    (curr) => {
      if (curr.mtimeMs <= globalConfigCache.mtime) return;
      void getFsImplementation().readFile(file, { encoding: "utf-8" }).then((content) => {
        if (curr.mtimeMs <= globalConfigCache.mtime) return;
        const parsed = safeParseJSON(stripBOM(content));
        if (parsed === null || typeof parsed !== "object") return;
        globalConfigCache = {
          config: migrateConfigFields({
            ...createDefaultGlobalConfig(),
            ...parsed
          }),
          mtime: curr.mtimeMs
        };
        lastReadFileStats = { mtime: curr.mtimeMs, size: curr.size };
      }).catch(() => {
      });
    }
  );
  registerCleanup(async () => {
    unwatchFile(file);
    freshnessWatcherStarted = false;
  });
}
function writeThroughGlobalConfigCache(config) {
  globalConfigCache = { config, mtime: Date.now() };
  lastReadFileStats = null;
}
function getGlobalConfig() {
  if (process.env.NODE_ENV === "test") {
    return TEST_GLOBAL_CONFIG_FOR_TESTING;
  }
  if (globalConfigCache.config) {
    configCacheHits++;
    return globalConfigCache.config;
  }
  configCacheMisses++;
  try {
    let stats = null;
    try {
      stats = getFsImplementation().statSync(getGlobalClaudeFile());
    } catch {
    }
    const config = migrateConfigFields(
      getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig)
    );
    globalConfigCache = {
      config,
      mtime: stats?.mtimeMs ?? Date.now()
    };
    lastReadFileStats = stats ? { mtime: stats.mtimeMs, size: stats.size } : null;
    startGlobalConfigFreshnessWatcher();
    return config;
  } catch {
    return migrateConfigFields(
      getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig)
    );
  }
}
function getRemoteControlAtStartup() {
  const explicit = getGlobalConfig().remoteControlAtStartup;
  if (explicit !== void 0) return explicit;
  if (false) {
    if (ccrAutoConnect?.getCcrAutoConnectDefault()) return true;
  }
  return false;
}
function getCustomApiKeyStatus(truncatedApiKey) {
  const config = getGlobalConfig();
  if (config.customApiKeyResponses?.approved?.includes(truncatedApiKey)) {
    return "approved";
  }
  if (config.customApiKeyResponses?.rejected?.includes(truncatedApiKey)) {
    return "rejected";
  }
  return "new";
}
function saveConfig(file, config, defaultConfig) {
  const dir = dirname(file);
  const fs = getFsImplementation();
  fs.mkdirSync(dir);
  const filteredConfig = pickBy(
    config,
    (value, key) => jsonStringify(value) !== jsonStringify(defaultConfig[key])
  );
  writeFileSyncAndFlush_DEPRECATED(
    file,
    jsonStringify(filteredConfig, null, 2),
    {
      encoding: "utf-8",
      mode: 384
    }
  );
  if (file === getGlobalClaudeFile()) {
    globalConfigWriteCount++;
  }
}
function saveConfigWithLock(file, createDefault, mergeFn) {
  const defaultConfig = createDefault();
  const dir = dirname(file);
  const fs = getFsImplementation();
  fs.mkdirSync(dir);
  let release;
  try {
    const lockFilePath = `${file}.lock`;
    const startTime = Date.now();
    release = lockfile.lockSync(file, {
      lockfilePath: lockFilePath,
      onCompromised: (err) => {
        logForDebugging(`Config lock compromised: ${err}`, { level: "error" });
      }
    });
    const lockTime = Date.now() - startTime;
    if (lockTime > 100) {
      logForDebugging(
        "Lock acquisition took longer than expected - another Claude instance may be running"
      );
      logEvent("tengu_config_lock_contention", {
        lock_time_ms: lockTime
      });
    }
    if (lastReadFileStats && file === getGlobalClaudeFile()) {
      try {
        const currentStats = fs.statSync(file);
        if (currentStats.mtimeMs !== lastReadFileStats.mtime || currentStats.size !== lastReadFileStats.size) {
          logEvent("tengu_config_stale_write", {
            read_mtime: lastReadFileStats.mtime,
            write_mtime: currentStats.mtimeMs,
            read_size: lastReadFileStats.size,
            write_size: currentStats.size
          });
        }
      } catch (e) {
        const code = getErrnoCode(e);
        if (code !== "ENOENT") {
          throw e;
        }
      }
    }
    const currentConfig = getConfig(file, createDefault);
    if (file === getGlobalClaudeFile() && wouldLoseAuthState(currentConfig)) {
      logForDebugging(
        "saveConfigWithLock: re-read config is missing auth that cache has; refusing to write to avoid wiping ~/.claude.json. See GH #3117.",
        { level: "error" }
      );
      logEvent("tengu_config_auth_loss_prevented", {});
      return false;
    }
    const mergedConfig = mergeFn(currentConfig);
    if (mergedConfig === currentConfig) {
      return false;
    }
    const filteredConfig = pickBy(
      mergedConfig,
      (value, key) => jsonStringify(value) !== jsonStringify(defaultConfig[key])
    );
    try {
      const fileBase = basename(file);
      const backupDir = getConfigBackupDir();
      try {
        fs.mkdirSync(backupDir);
      } catch (mkdirErr) {
        const mkdirCode = getErrnoCode(mkdirErr);
        if (mkdirCode !== "EEXIST") {
          throw mkdirErr;
        }
      }
      const MIN_BACKUP_INTERVAL_MS = 6e4;
      const existingBackups = fs.readdirStringSync(backupDir).filter((f) => f.startsWith(`${fileBase}.backup.`)).sort().reverse();
      const mostRecentBackup = existingBackups[0];
      const mostRecentTimestamp = mostRecentBackup ? Number(mostRecentBackup.split(".backup.").pop()) : 0;
      const shouldCreateBackup = Number.isNaN(mostRecentTimestamp) || Date.now() - mostRecentTimestamp >= MIN_BACKUP_INTERVAL_MS;
      if (shouldCreateBackup) {
        const backupPath = join(backupDir, `${fileBase}.backup.${Date.now()}`);
        fs.copyFileSync(file, backupPath);
      }
      const MAX_BACKUPS = 5;
      const backupsForCleanup = shouldCreateBackup ? fs.readdirStringSync(backupDir).filter((f) => f.startsWith(`${fileBase}.backup.`)).sort().reverse() : existingBackups;
      for (const oldBackup of backupsForCleanup.slice(MAX_BACKUPS)) {
        try {
          fs.unlinkSync(join(backupDir, oldBackup));
        } catch {
        }
      }
    } catch (e) {
      const code = getErrnoCode(e);
      if (code !== "ENOENT") {
        logForDebugging(`Failed to backup config: ${e}`, {
          level: "error"
        });
      }
    }
    writeFileSyncAndFlush_DEPRECATED(
      file,
      jsonStringify(filteredConfig, null, 2),
      {
        encoding: "utf-8",
        mode: 384
      }
    );
    if (file === getGlobalClaudeFile()) {
      globalConfigWriteCount++;
    }
    return true;
  } finally {
    if (release) {
      release();
    }
  }
}
let configReadingAllowed = false;
function enableConfigs() {
  if (configReadingAllowed) {
    return;
  }
  const startTime = Date.now();
  logForDiagnosticsNoPII("info", "enable_configs_started");
  configReadingAllowed = true;
  getConfig(
    getGlobalClaudeFile(),
    createDefaultGlobalConfig,
    true
  );
  logForDiagnosticsNoPII("info", "enable_configs_completed", {
    duration_ms: Date.now() - startTime
  });
}
function getConfigBackupDir() {
  return join(getClaudeConfigHomeDir(), "backups");
}
function findMostRecentBackup(file) {
  const fs = getFsImplementation();
  const fileBase = basename(file);
  const backupDir = getConfigBackupDir();
  try {
    const backups = fs.readdirStringSync(backupDir).filter((f) => f.startsWith(`${fileBase}.backup.`)).sort();
    const mostRecent = backups.at(-1);
    if (mostRecent) {
      return join(backupDir, mostRecent);
    }
  } catch {
  }
  const fileDir = dirname(file);
  try {
    const backups = fs.readdirStringSync(fileDir).filter((f) => f.startsWith(`${fileBase}.backup.`)).sort();
    const mostRecent = backups.at(-1);
    if (mostRecent) {
      return join(fileDir, mostRecent);
    }
    const legacyBackup = `${file}.backup`;
    try {
      fs.statSync(legacyBackup);
      return legacyBackup;
    } catch {
    }
  } catch {
  }
  return null;
}
function getConfig(file, createDefault, throwOnInvalid) {
  if (!configReadingAllowed && process.env.NODE_ENV !== "test") {
    throw new Error("Config accessed before allowed.");
  }
  const fs = getFsImplementation();
  try {
    const fileContent = fs.readFileSync(file, {
      encoding: "utf-8"
    });
    try {
      const parsedConfig = jsonParse(stripBOM(fileContent));
      return {
        ...createDefault(),
        ...parsedConfig
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ConfigParseError(errorMessage, file, createDefault());
    }
  } catch (error) {
    const errCode = getErrnoCode(error);
    if (errCode === "ENOENT") {
      const backupPath = findMostRecentBackup(file);
      if (backupPath) {
        process.stderr.write(
          `
Claude configuration file not found at: ${file}
A backup file exists at: ${backupPath}
You can manually restore it by running: cp "${backupPath}" "${file}"

`
        );
      }
      return createDefault();
    }
    if (error instanceof ConfigParseError && throwOnInvalid) {
      throw error;
    }
    if (error instanceof ConfigParseError) {
      logForDebugging(
        `Config file corrupted, resetting to defaults: ${error.message}`,
        { level: "error" }
      );
      if (!insideGetConfig) {
        insideGetConfig = true;
        try {
          logError(error);
          let hasBackup = false;
          try {
            fs.statSync(`${file}.backup`);
            hasBackup = true;
          } catch {
          }
          logEvent("tengu_config_parse_error", {
            has_backup: hasBackup
          });
        } finally {
          insideGetConfig = false;
        }
      }
      process.stderr.write(
        `
Claude configuration file at ${file} is corrupted: ${error.message}
`
      );
      const fileBase = basename(file);
      const corruptedBackupDir = getConfigBackupDir();
      try {
        fs.mkdirSync(corruptedBackupDir);
      } catch (mkdirErr) {
        const mkdirCode = getErrnoCode(mkdirErr);
        if (mkdirCode !== "EEXIST") {
          throw mkdirErr;
        }
      }
      const existingCorruptedBackups = fs.readdirStringSync(corruptedBackupDir).filter((f) => f.startsWith(`${fileBase}.corrupted.`));
      let corruptedBackupPath;
      let alreadyBackedUp = false;
      const currentContent = fs.readFileSync(file, { encoding: "utf-8" });
      for (const backup of existingCorruptedBackups) {
        try {
          const backupContent = fs.readFileSync(
            join(corruptedBackupDir, backup),
            { encoding: "utf-8" }
          );
          if (currentContent === backupContent) {
            alreadyBackedUp = true;
            break;
          }
        } catch {
        }
      }
      if (!alreadyBackedUp) {
        corruptedBackupPath = join(
          corruptedBackupDir,
          `${fileBase}.corrupted.${Date.now()}`
        );
        try {
          fs.copyFileSync(file, corruptedBackupPath);
          logForDebugging(
            `Corrupted config backed up to: ${corruptedBackupPath}`,
            {
              level: "error"
            }
          );
        } catch {
        }
      }
      const backupPath = findMostRecentBackup(file);
      if (corruptedBackupPath) {
        process.stderr.write(
          `The corrupted file has been backed up to: ${corruptedBackupPath}
`
        );
      } else if (alreadyBackedUp) {
        process.stderr.write(`The corrupted file has already been backed up.
`);
      }
      if (backupPath) {
        process.stderr.write(
          `A backup file exists at: ${backupPath}
You can manually restore it by running: cp "${backupPath}" "${file}"

`
        );
      } else {
        process.stderr.write(`
`);
      }
    }
    return createDefault();
  }
}
const getProjectPathForConfig = memoize(() => {
  const originalCwd = getOriginalCwd();
  const gitRoot = findCanonicalGitRoot(originalCwd);
  if (gitRoot) {
    return normalizePathForConfigKey(gitRoot);
  }
  return normalizePathForConfigKey(resolve(originalCwd));
});
function getCurrentProjectConfig() {
  if (process.env.NODE_ENV === "test") {
    return TEST_PROJECT_CONFIG_FOR_TESTING;
  }
  const absolutePath = getProjectPathForConfig();
  const config = getGlobalConfig();
  if (!config.projects) {
    return DEFAULT_PROJECT_CONFIG;
  }
  const projectConfig = config.projects[absolutePath] ?? DEFAULT_PROJECT_CONFIG;
  if (typeof projectConfig.allowedTools === "string") {
    projectConfig.allowedTools = safeParseJSON(projectConfig.allowedTools) ?? [];
  }
  return projectConfig;
}
function saveCurrentProjectConfig(updater) {
  if (process.env.NODE_ENV === "test") {
    const config = updater(TEST_PROJECT_CONFIG_FOR_TESTING);
    if (config === TEST_PROJECT_CONFIG_FOR_TESTING) {
      return;
    }
    Object.assign(TEST_PROJECT_CONFIG_FOR_TESTING, config);
    return;
  }
  const absolutePath = getProjectPathForConfig();
  let written = null;
  try {
    const didWrite = saveConfigWithLock(
      getGlobalClaudeFile(),
      createDefaultGlobalConfig,
      (current) => {
        const currentProjectConfig = current.projects?.[absolutePath] ?? DEFAULT_PROJECT_CONFIG;
        const newProjectConfig = updater(currentProjectConfig);
        if (newProjectConfig === currentProjectConfig) {
          return current;
        }
        written = {
          ...current,
          projects: {
            ...current.projects,
            [absolutePath]: newProjectConfig
          }
        };
        return written;
      }
    );
    if (didWrite && written) {
      writeThroughGlobalConfigCache(written);
    }
  } catch (error) {
    logForDebugging(`Failed to save config with lock: ${error}`, {
      level: "error"
    });
    const config = getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig);
    if (wouldLoseAuthState(config)) {
      logForDebugging(
        "saveCurrentProjectConfig fallback: re-read config is missing auth that cache has; refusing to write. See GH #3117.",
        { level: "error" }
      );
      logEvent("tengu_config_auth_loss_prevented", {});
      return;
    }
    const currentProjectConfig = config.projects?.[absolutePath] ?? DEFAULT_PROJECT_CONFIG;
    const newProjectConfig = updater(currentProjectConfig);
    if (newProjectConfig === currentProjectConfig) {
      return;
    }
    written = {
      ...config,
      projects: {
        ...config.projects,
        [absolutePath]: newProjectConfig
      }
    };
    saveConfig(getGlobalClaudeFile(), written, DEFAULT_GLOBAL_CONFIG);
    writeThroughGlobalConfigCache(written);
  }
}
function isAutoUpdaterDisabled() {
  return getAutoUpdaterDisabledReason() !== null;
}
function shouldSkipPluginAutoupdate() {
  return isAutoUpdaterDisabled() && !isEnvTruthy(process.env.FORCE_AUTOUPDATE_PLUGINS);
}
function formatAutoUpdaterDisabledReason(reason) {
  switch (reason.type) {
    case "development":
      return "development build";
    case "env":
      return `${reason.envVar} set`;
    case "config":
      return "config";
  }
}
function getAutoUpdaterDisabledReason() {
  if (process.env.NODE_ENV === "development") {
    return { type: "development" };
  }
  if (isEnvTruthy(process.env.DISABLE_AUTOUPDATER)) {
    return { type: "env", envVar: "DISABLE_AUTOUPDATER" };
  }
  const essentialTrafficEnvVar = getEssentialTrafficOnlyReason();
  if (essentialTrafficEnvVar) {
    return { type: "env", envVar: essentialTrafficEnvVar };
  }
  const config = getGlobalConfig();
  if (config.autoUpdates === false && (config.installMethod !== "native" || config.autoUpdatesProtectedForNative !== true)) {
    return { type: "config" };
  }
  return null;
}
function getOrCreateUserID() {
  const config = getGlobalConfig();
  if (config.userID) {
    return config.userID;
  }
  const userID = randomBytes(32).toString("hex");
  saveGlobalConfig((current) => ({ ...current, userID }));
  return userID;
}
function recordFirstStartTime() {
  const config = getGlobalConfig();
  if (!config.firstStartTime) {
    const firstStartTime = (/* @__PURE__ */ new Date()).toISOString();
    saveGlobalConfig((current) => ({
      ...current,
      firstStartTime: current.firstStartTime ?? firstStartTime
    }));
  }
}
function getMemoryPath(memoryType) {
  const cwd = getOriginalCwd();
  switch (memoryType) {
    case "User":
      return join(getClaudeConfigHomeDir(), "CLAUDE.md");
    case "Local":
      return join(cwd, "CLAUDE.local.md");
    case "Project":
      return join(cwd, "CLAUDE.md");
    case "Managed":
      return join(getManagedFilePath(), "CLAUDE.md");
    case "AutoMem":
      return getAutoMemEntrypoint();
  }
  if (false) {
    return teamMemPaths.getTeamMemEntrypoint();
  }
  return "";
}
function getManagedClaudeRulesDir() {
  return join(getManagedFilePath(), ".claude", "rules");
}
function getUserClaudeRulesDir() {
  return join(getClaudeConfigHomeDir(), "rules");
}
const _getConfigForTesting = getConfig;
const _wouldLoseAuthStateForTesting = wouldLoseAuthState;
function _setGlobalConfigCacheForTesting(config) {
  globalConfigCache.config = config;
  globalConfigCache.mtime = config ? Date.now() : 0;
}
export {
  CONFIG_WRITE_DISPLAY_THRESHOLD,
  DEFAULT_GLOBAL_CONFIG,
  EDITOR_MODES,
  GLOBAL_CONFIG_KEYS,
  NOTIFICATION_CHANNELS,
  PROJECT_CONFIG_KEYS,
  _getConfigForTesting,
  _setGlobalConfigCacheForTesting,
  _wouldLoseAuthStateForTesting,
  checkHasTrustDialogAccepted,
  enableConfigs,
  formatAutoUpdaterDisabledReason,
  getAutoUpdaterDisabledReason,
  getCurrentProjectConfig,
  getCustomApiKeyStatus,
  getGlobalConfig,
  getGlobalConfigWriteCount,
  getManagedClaudeRulesDir,
  getMemoryPath,
  getOrCreateUserID,
  getProjectPathForConfig,
  getRemoteControlAtStartup,
  getUserClaudeRulesDir,
  isAutoUpdaterDisabled,
  isGlobalConfigKey,
  isPathTrusted,
  isProjectConfigKey,
  recordFirstStartTime,
  resetTrustDialogAcceptedCacheForTesting,
  saveCurrentProjectConfig,
  saveGlobalConfig,
  shouldSkipPluginAutoupdate
};
