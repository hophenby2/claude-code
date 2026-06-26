const feature = (_name) => false;
import mergeWith from "lodash-es/mergeWith.js";
import { dirname, join, resolve } from "path";
import "zod/v4";
import {
  getFlagSettingsInline,
  getFlagSettingsPath,
  getOriginalCwd,
  getUseCoworkPlugins
} from "../../bootstrap/state.js";
import { getRemoteManagedSettingsSyncFromCache } from "../../services/remoteManagedSettings/syncCacheState.js";
import { uniq } from "../array.js";
import { logForDebugging } from "../debug.js";
import { logForDiagnosticsNoPII } from "../diagLogs.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "../envUtils.js";
import { getErrnoCode, isENOENT } from "../errors.js";
import { writeFileSyncAndFlush_DEPRECATED } from "../file.js";
import { readFileSync } from "../fileRead.js";
import { getFsImplementation, safeResolvePath } from "../fsOperations.js";
import { addFileGlobRuleToGitignore } from "../git/gitignore.js";
import { safeParseJSON } from "../json.js";
import { logError } from "../log.js";
import { getPlatform } from "../platform.js";
import { clone, jsonStringify } from "../slowOperations.js";
import { profileCheckpoint } from "../startupProfiler.js";
import {
  getEnabledSettingSources
} from "./constants.js";
import { markInternalWrite } from "./internalWrites.js";
import {
  getManagedFilePath,
  getManagedSettingsDropInDir
} from "./managedPath.js";
import { getHkcuSettings, getMdmSettings } from "./mdm/settings.js";
import {
  getCachedParsedFile,
  getCachedSettingsForSource,
  getPluginSettingsBase,
  getSessionSettingsCache,
  resetSettingsCache,
  setCachedParsedFile,
  setCachedSettingsForSource,
  setSessionSettingsCache
} from "./settingsCache.js";
import { SettingsSchema } from "./types.js";
import {
  filterInvalidPermissionRules,
  formatZodError
} from "./validation.js";
function getManagedSettingsFilePath() {
  return join(getManagedFilePath(), "managed-settings.json");
}
function loadManagedFileSettings() {
  const errors = [];
  let merged = {};
  let found = false;
  const { settings, errors: baseErrors } = parseSettingsFile(
    getManagedSettingsFilePath()
  );
  errors.push(...baseErrors);
  if (settings && Object.keys(settings).length > 0) {
    merged = mergeWith(merged, settings, settingsMergeCustomizer);
    found = true;
  }
  const dropInDir = getManagedSettingsDropInDir();
  try {
    const entries = getFsImplementation().readdirSync(dropInDir).filter(
      (d) => (d.isFile() || d.isSymbolicLink()) && d.name.endsWith(".json") && !d.name.startsWith(".")
    ).map((d) => d.name).sort();
    for (const name of entries) {
      const { settings: settings2, errors: fileErrors } = parseSettingsFile(
        join(dropInDir, name)
      );
      errors.push(...fileErrors);
      if (settings2 && Object.keys(settings2).length > 0) {
        merged = mergeWith(merged, settings2, settingsMergeCustomizer);
        found = true;
      }
    }
  } catch (e) {
    const code = getErrnoCode(e);
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      logError(e);
    }
  }
  return { settings: found ? merged : null, errors };
}
function getManagedFileSettingsPresence() {
  const { settings: base } = parseSettingsFile(getManagedSettingsFilePath());
  const hasBase = !!base && Object.keys(base).length > 0;
  let hasDropIns = false;
  const dropInDir = getManagedSettingsDropInDir();
  try {
    hasDropIns = getFsImplementation().readdirSync(dropInDir).some(
      (d) => (d.isFile() || d.isSymbolicLink()) && d.name.endsWith(".json") && !d.name.startsWith(".")
    );
  } catch {
  }
  return { hasBase, hasDropIns };
}
function handleFileSystemError(error, path) {
  if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
    logForDebugging(
      `Broken symlink or missing file encountered for settings.json at path: ${path}`
    );
  } else {
    logError(error);
  }
}
function parseSettingsFile(path) {
  const cached = getCachedParsedFile(path);
  if (cached) {
    return {
      settings: cached.settings ? clone(cached.settings) : null,
      errors: cached.errors
    };
  }
  const result = parseSettingsFileUncached(path);
  setCachedParsedFile(path, result);
  return {
    settings: result.settings ? clone(result.settings) : null,
    errors: result.errors
  };
}
function parseSettingsFileUncached(path) {
  try {
    const { resolvedPath } = safeResolvePath(getFsImplementation(), path);
    const content = readFileSync(resolvedPath);
    if (content.trim() === "") {
      return { settings: {}, errors: [] };
    }
    const data = safeParseJSON(content, false);
    const ruleWarnings = filterInvalidPermissionRules(data, path);
    const result = SettingsSchema().safeParse(data);
    if (!result.success) {
      const errors = formatZodError(result.error, path);
      return { settings: null, errors: [...ruleWarnings, ...errors] };
    }
    return { settings: result.data, errors: ruleWarnings };
  } catch (error) {
    handleFileSystemError(error, path);
    return { settings: null, errors: [] };
  }
}
function getSettingsRootPathForSource(source) {
  switch (source) {
    case "userSettings":
      return resolve(getClaudeConfigHomeDir());
    case "policySettings":
    case "projectSettings":
    case "localSettings": {
      return resolve(getOriginalCwd());
    }
    case "flagSettings": {
      const path = getFlagSettingsPath();
      return path ? dirname(resolve(path)) : resolve(getOriginalCwd());
    }
  }
}
function getUserSettingsFilePath() {
  if (getUseCoworkPlugins() || isEnvTruthy(process.env.CLAUDE_CODE_USE_COWORK_PLUGINS)) {
    return "cowork_settings.json";
  }
  return "settings.json";
}
function getSettingsFilePathForSource(source) {
  switch (source) {
    case "userSettings":
      return join(
        getSettingsRootPathForSource(source),
        getUserSettingsFilePath()
      );
    case "projectSettings":
    case "localSettings": {
      return join(
        getSettingsRootPathForSource(source),
        getRelativeSettingsFilePathForSource(source)
      );
    }
    case "policySettings":
      return getManagedSettingsFilePath();
    case "flagSettings": {
      return getFlagSettingsPath();
    }
  }
}
function getRelativeSettingsFilePathForSource(source) {
  switch (source) {
    case "projectSettings":
      return join(".claude", "settings.json");
    case "localSettings":
      return join(".claude", "settings.local.json");
  }
}
function getSettingsForSource(source) {
  const cached = getCachedSettingsForSource(source);
  if (cached !== void 0) return cached;
  const result = getSettingsForSourceUncached(source);
  setCachedSettingsForSource(source, result);
  return result;
}
function getSettingsForSourceUncached(source) {
  if (source === "policySettings") {
    const remoteSettings = getRemoteManagedSettingsSyncFromCache();
    if (remoteSettings && Object.keys(remoteSettings).length > 0) {
      return remoteSettings;
    }
    const mdmResult = getMdmSettings();
    if (Object.keys(mdmResult.settings).length > 0) {
      return mdmResult.settings;
    }
    const { settings: fileSettings2 } = loadManagedFileSettings();
    if (fileSettings2) {
      return fileSettings2;
    }
    const hkcu = getHkcuSettings();
    if (Object.keys(hkcu.settings).length > 0) {
      return hkcu.settings;
    }
    return null;
  }
  const settingsFilePath = getSettingsFilePathForSource(source);
  const { settings: fileSettings } = settingsFilePath ? parseSettingsFile(settingsFilePath) : { settings: null };
  if (source === "flagSettings") {
    const inlineSettings = getFlagSettingsInline();
    if (inlineSettings) {
      const parsed = SettingsSchema().safeParse(inlineSettings);
      if (parsed.success) {
        return mergeWith(
          fileSettings || {},
          parsed.data,
          settingsMergeCustomizer
        );
      }
    }
  }
  return fileSettings;
}
function getPolicySettingsOrigin() {
  const remoteSettings = getRemoteManagedSettingsSyncFromCache();
  if (remoteSettings && Object.keys(remoteSettings).length > 0) {
    return "remote";
  }
  const mdmResult = getMdmSettings();
  if (Object.keys(mdmResult.settings).length > 0) {
    return getPlatform() === "macos" ? "plist" : "hklm";
  }
  const { settings: fileSettings } = loadManagedFileSettings();
  if (fileSettings) {
    return "file";
  }
  const hkcu = getHkcuSettings();
  if (Object.keys(hkcu.settings).length > 0) {
    return "hkcu";
  }
  return null;
}
function updateSettingsForSource(source, settings) {
  if (source === "policySettings" || source === "flagSettings") {
    return { error: null };
  }
  const filePath = getSettingsFilePathForSource(source);
  if (!filePath) {
    return { error: null };
  }
  try {
    getFsImplementation().mkdirSync(dirname(filePath));
    let existingSettings = getSettingsForSourceUncached(source);
    if (!existingSettings) {
      let content = null;
      try {
        content = readFileSync(filePath);
      } catch (e) {
        if (!isENOENT(e)) {
          throw e;
        }
      }
      if (content !== null) {
        const rawData = safeParseJSON(content);
        if (rawData === null) {
          return {
            error: new Error(
              `Invalid JSON syntax in settings file at ${filePath}`
            )
          };
        }
        if (rawData && typeof rawData === "object") {
          existingSettings = rawData;
          logForDebugging(
            `Using raw settings from ${filePath} due to validation failure`
          );
        }
      }
    }
    const updatedSettings = mergeWith(
      existingSettings || {},
      settings,
      (_objValue, srcValue, key, object) => {
        if (srcValue === void 0 && object && typeof key === "string") {
          delete object[key];
          return void 0;
        }
        if (Array.isArray(srcValue)) {
          return srcValue;
        }
        return void 0;
      }
    );
    markInternalWrite(filePath);
    writeFileSyncAndFlush_DEPRECATED(
      filePath,
      jsonStringify(updatedSettings, null, 2) + "\n"
    );
    resetSettingsCache();
    if (source === "localSettings") {
      void addFileGlobRuleToGitignore(
        getRelativeSettingsFilePathForSource("localSettings"),
        getOriginalCwd()
      );
    }
  } catch (e) {
    const error = new Error(
      `Failed to read raw settings from ${filePath}: ${e}`
    );
    logError(error);
    return { error };
  }
  return { error: null };
}
function mergeArrays(targetArray, sourceArray) {
  return uniq([...targetArray, ...sourceArray]);
}
function settingsMergeCustomizer(objValue, srcValue) {
  if (Array.isArray(objValue) && Array.isArray(srcValue)) {
    return mergeArrays(objValue, srcValue);
  }
  return void 0;
}
function getManagedSettingsKeysForLogging(settings) {
  const validSettings = SettingsSchema().strip().parse(settings);
  const keysToExpand = ["permissions", "sandbox", "hooks"];
  const allKeys = [];
  const validNestedKeys = {
    permissions: /* @__PURE__ */ new Set([
      "allow",
      "deny",
      "ask",
      "defaultMode",
      "disableBypassPermissionsMode",
      ...false ? ["disableAutoMode"] : [],
      "additionalDirectories"
    ]),
    sandbox: /* @__PURE__ */ new Set([
      "enabled",
      "failIfUnavailable",
      "allowUnsandboxedCommands",
      "network",
      "filesystem",
      "ignoreViolations",
      "excludedCommands",
      "autoAllowBashIfSandboxed",
      "enableWeakerNestedSandbox",
      "enableWeakerNetworkIsolation",
      "ripgrep"
    ]),
    // For hooks, we use z.record with enum keys, so we validate separately
    hooks: /* @__PURE__ */ new Set([
      "PreToolUse",
      "PostToolUse",
      "Notification",
      "UserPromptSubmit",
      "SessionStart",
      "SessionEnd",
      "Stop",
      "SubagentStop",
      "PreCompact",
      "PostCompact",
      "TeammateIdle",
      "TaskCreated",
      "TaskCompleted"
    ])
  };
  for (const key of Object.keys(validSettings)) {
    if (keysToExpand.includes(key) && validSettings[key] && typeof validSettings[key] === "object") {
      const nestedObj = validSettings[key];
      const validKeys = validNestedKeys[key];
      if (validKeys) {
        for (const nestedKey of Object.keys(nestedObj)) {
          if (validKeys.has(nestedKey)) {
            allKeys.push(`${key}.${nestedKey}`);
          }
        }
      }
    } else {
      allKeys.push(key);
    }
  }
  return allKeys.sort();
}
let isLoadingSettings = false;
function loadSettingsFromDisk() {
  if (isLoadingSettings) {
    return { settings: {}, errors: [] };
  }
  const startTime = Date.now();
  profileCheckpoint("loadSettingsFromDisk_start");
  logForDiagnosticsNoPII("info", "settings_load_started");
  isLoadingSettings = true;
  try {
    const pluginSettings = getPluginSettingsBase();
    let mergedSettings = {};
    if (pluginSettings) {
      mergedSettings = mergeWith(
        mergedSettings,
        pluginSettings,
        settingsMergeCustomizer
      );
    }
    const allErrors = [];
    const seenErrors = /* @__PURE__ */ new Set();
    const seenFiles = /* @__PURE__ */ new Set();
    for (const source of getEnabledSettingSources()) {
      if (source === "policySettings") {
        let policySettings = null;
        const policyErrors = [];
        const remoteSettings = getRemoteManagedSettingsSyncFromCache();
        if (remoteSettings && Object.keys(remoteSettings).length > 0) {
          const result = SettingsSchema().safeParse(remoteSettings);
          if (result.success) {
            policySettings = result.data;
          } else {
            policyErrors.push(
              ...formatZodError(result.error, "remote managed settings")
            );
          }
        }
        if (!policySettings) {
          const mdmResult = getMdmSettings();
          if (Object.keys(mdmResult.settings).length > 0) {
            policySettings = mdmResult.settings;
          }
          policyErrors.push(...mdmResult.errors);
        }
        if (!policySettings) {
          const { settings, errors } = loadManagedFileSettings();
          if (settings) {
            policySettings = settings;
          }
          policyErrors.push(...errors);
        }
        if (!policySettings) {
          const hkcu = getHkcuSettings();
          if (Object.keys(hkcu.settings).length > 0) {
            policySettings = hkcu.settings;
          }
          policyErrors.push(...hkcu.errors);
        }
        if (policySettings) {
          mergedSettings = mergeWith(
            mergedSettings,
            policySettings,
            settingsMergeCustomizer
          );
        }
        for (const error of policyErrors) {
          const errorKey = `${error.file}:${error.path}:${error.message}`;
          if (!seenErrors.has(errorKey)) {
            seenErrors.add(errorKey);
            allErrors.push(error);
          }
        }
        continue;
      }
      const filePath = getSettingsFilePathForSource(source);
      if (filePath) {
        const resolvedPath = resolve(filePath);
        if (!seenFiles.has(resolvedPath)) {
          seenFiles.add(resolvedPath);
          const { settings, errors } = parseSettingsFile(filePath);
          for (const error of errors) {
            const errorKey = `${error.file}:${error.path}:${error.message}`;
            if (!seenErrors.has(errorKey)) {
              seenErrors.add(errorKey);
              allErrors.push(error);
            }
          }
          if (settings) {
            mergedSettings = mergeWith(
              mergedSettings,
              settings,
              settingsMergeCustomizer
            );
          }
        }
      }
      if (source === "flagSettings") {
        const inlineSettings = getFlagSettingsInline();
        if (inlineSettings) {
          const parsed = SettingsSchema().safeParse(inlineSettings);
          if (parsed.success) {
            mergedSettings = mergeWith(
              mergedSettings,
              parsed.data,
              settingsMergeCustomizer
            );
          }
        }
      }
    }
    logForDiagnosticsNoPII("info", "settings_load_completed", {
      duration_ms: Date.now() - startTime,
      source_count: seenFiles.size,
      error_count: allErrors.length
    });
    return { settings: mergedSettings, errors: allErrors };
  } finally {
    isLoadingSettings = false;
  }
}
function getInitialSettings() {
  const { settings } = getSettingsWithErrors();
  return settings || {};
}
const getSettings_DEPRECATED = getInitialSettings;
function getSettingsWithSources() {
  resetSettingsCache();
  const sources = [];
  for (const source of getEnabledSettingSources()) {
    const settings = getSettingsForSource(source);
    if (settings && Object.keys(settings).length > 0) {
      sources.push({ source, settings });
    }
  }
  return { effective: getInitialSettings(), sources };
}
function getSettingsWithErrors() {
  const cached = getSessionSettingsCache();
  if (cached !== null) {
    return cached;
  }
  const result = loadSettingsFromDisk();
  profileCheckpoint("loadSettingsFromDisk_end");
  setSessionSettingsCache(result);
  return result;
}
function hasSkipDangerousModePermissionPrompt() {
  return !!(getSettingsForSource("userSettings")?.skipDangerousModePermissionPrompt || getSettingsForSource("localSettings")?.skipDangerousModePermissionPrompt || getSettingsForSource("flagSettings")?.skipDangerousModePermissionPrompt || getSettingsForSource("policySettings")?.skipDangerousModePermissionPrompt);
}
function hasAutoModeOptIn() {
  if (false) {
    const user = getSettingsForSource("userSettings")?.skipAutoPermissionPrompt;
    const local = getSettingsForSource("localSettings")?.skipAutoPermissionPrompt;
    const flag = getSettingsForSource("flagSettings")?.skipAutoPermissionPrompt;
    const policy = getSettingsForSource("policySettings")?.skipAutoPermissionPrompt;
    const result = !!(user || local || flag || policy);
    logForDebugging(
      `[auto-mode] hasAutoModeOptIn=${result} skipAutoPermissionPrompt: user=${user} local=${local} flag=${flag} policy=${policy}`
    );
    return result;
  }
  return false;
}
function getUseAutoModeDuringPlan() {
  if (false) {
    return getSettingsForSource("policySettings")?.useAutoModeDuringPlan !== false && getSettingsForSource("flagSettings")?.useAutoModeDuringPlan !== false && getSettingsForSource("userSettings")?.useAutoModeDuringPlan !== false && getSettingsForSource("localSettings")?.useAutoModeDuringPlan !== false;
  }
  return true;
}
function getAutoModeConfig() {
  if (false) {
    const schema = z.object({
      allow: z.array(z.string()).optional(),
      soft_deny: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
      environment: z.array(z.string()).optional()
    });
    const allow = [];
    const soft_deny = [];
    const environment = [];
    for (const source of [
      "userSettings",
      "localSettings",
      "flagSettings",
      "policySettings"
    ]) {
      const settings = getSettingsForSource(source);
      if (!settings) continue;
      const result = schema.safeParse(
        settings.autoMode
      );
      if (result.success) {
        if (result.data.allow) allow.push(...result.data.allow);
        if (result.data.soft_deny) soft_deny.push(...result.data.soft_deny);
        if (process.env.USER_TYPE === "ant") {
          if (result.data.deny) soft_deny.push(...result.data.deny);
        }
        if (result.data.environment)
          environment.push(...result.data.environment);
      }
    }
    if (allow.length > 0 || soft_deny.length > 0 || environment.length > 0) {
      return {
        ...allow.length > 0 && { allow },
        ...soft_deny.length > 0 && { soft_deny },
        ...environment.length > 0 && { environment }
      };
    }
  }
  return void 0;
}
function rawSettingsContainsKey(key) {
  for (const source of getEnabledSettingSources()) {
    if (source === "policySettings") {
      continue;
    }
    const filePath = getSettingsFilePathForSource(source);
    if (!filePath) {
      continue;
    }
    try {
      const { resolvedPath } = safeResolvePath(getFsImplementation(), filePath);
      const content = readFileSync(resolvedPath);
      if (!content.trim()) {
        continue;
      }
      const rawData = safeParseJSON(content, false);
      if (rawData && typeof rawData === "object" && key in rawData) {
        return true;
      }
    } catch (error) {
      handleFileSystemError(error, filePath);
    }
  }
  return false;
}
export {
  getAutoModeConfig,
  getInitialSettings,
  getManagedFileSettingsPresence,
  getManagedSettingsKeysForLogging,
  getPolicySettingsOrigin,
  getRelativeSettingsFilePathForSource,
  getSettingsFilePathForSource,
  getSettingsForSource,
  getSettingsRootPathForSource,
  getSettingsWithErrors,
  getSettingsWithSources,
  getSettings_DEPRECATED,
  getUseAutoModeDuringPlan,
  hasAutoModeOptIn,
  hasSkipDangerousModePermissionPrompt,
  loadManagedFileSettings,
  parseSettingsFile,
  rawSettingsContainsKey,
  settingsMergeCustomizer,
  updateSettingsForSource
};
