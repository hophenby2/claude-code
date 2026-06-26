import {
  SandboxManager as BaseSandboxManager,
  SandboxRuntimeConfigSchema,
  SandboxViolationStore
} from "@anthropic-ai/sandbox-runtime";
import { rmSync, statSync } from "fs";
import { readFile } from "fs/promises";
import { memoize } from "lodash-es";
import { join, resolve, sep } from "path";
import {
  getAdditionalDirectoriesForClaudeMd,
  getCwdState,
  getOriginalCwd
} from "../../bootstrap/state.js";
import { logForDebugging } from "../debug.js";
import { expandPath } from "../path.js";
import { getPlatform } from "../platform.js";
import { settingsChangeDetector } from "../settings/changeDetector.js";
import { SETTING_SOURCES } from "../settings/constants.js";
import { getManagedSettingsDropInDir } from "../settings/managedPath.js";
import {
  getInitialSettings,
  getSettings_DEPRECATED,
  getSettingsFilePathForSource,
  getSettingsForSource,
  getSettingsRootPathForSource,
  updateSettingsForSource
} from "../settings/settings.js";
import { BASH_TOOL_NAME } from "../../tools/BashTool/toolName.js";
import { FILE_EDIT_TOOL_NAME } from "../../tools/FileEditTool/constants.js";
import { FILE_READ_TOOL_NAME } from "../../tools/FileReadTool/prompt.js";
import { WEB_FETCH_TOOL_NAME } from "../../tools/WebFetchTool/prompt.js";
import { errorMessage } from "../errors.js";
import { getClaudeTempDir } from "../permissions/filesystem.js";
import { ripgrepCommand } from "../ripgrep.js";
function permissionRuleValueFromString(ruleString) {
  const matches = ruleString.match(/^([^(]+)\(([^)]+)\)$/);
  if (!matches) {
    return { toolName: ruleString };
  }
  const toolName = matches[1];
  const ruleContent = matches[2];
  if (!toolName || !ruleContent) {
    return { toolName: ruleString };
  }
  return { toolName, ruleContent };
}
function permissionRuleExtractPrefix(permissionRule) {
  const match = permissionRule.match(/^(.+):\*$/);
  return match?.[1] ?? null;
}
function resolvePathPatternForSandbox(pattern, source) {
  if (pattern.startsWith("//")) {
    return pattern.slice(1);
  }
  if (pattern.startsWith("/") && !pattern.startsWith("//")) {
    const root = getSettingsRootPathForSource(source);
    return resolve(root, pattern.slice(1));
  }
  return pattern;
}
function resolveSandboxFilesystemPath(pattern, source) {
  if (pattern.startsWith("//")) return pattern.slice(1);
  return expandPath(pattern, getSettingsRootPathForSource(source));
}
function shouldAllowManagedSandboxDomainsOnly() {
  return getSettingsForSource("policySettings")?.sandbox?.network?.allowManagedDomainsOnly === true;
}
function shouldAllowManagedReadPathsOnly() {
  return getSettingsForSource("policySettings")?.sandbox?.filesystem?.allowManagedReadPathsOnly === true;
}
function convertToSandboxRuntimeConfig(settings) {
  const permissions = settings.permissions || {};
  const allowedDomains = [];
  const deniedDomains = [];
  if (shouldAllowManagedSandboxDomainsOnly()) {
    const policySettings = getSettingsForSource("policySettings");
    for (const domain of policySettings?.sandbox?.network?.allowedDomains || []) {
      allowedDomains.push(domain);
    }
    for (const ruleString of policySettings?.permissions?.allow || []) {
      const rule = permissionRuleValueFromString(ruleString);
      if (rule.toolName === WEB_FETCH_TOOL_NAME && rule.ruleContent?.startsWith("domain:")) {
        allowedDomains.push(rule.ruleContent.substring("domain:".length));
      }
    }
  } else {
    for (const domain of settings.sandbox?.network?.allowedDomains || []) {
      allowedDomains.push(domain);
    }
    for (const ruleString of permissions.allow || []) {
      const rule = permissionRuleValueFromString(ruleString);
      if (rule.toolName === WEB_FETCH_TOOL_NAME && rule.ruleContent?.startsWith("domain:")) {
        allowedDomains.push(rule.ruleContent.substring("domain:".length));
      }
    }
  }
  for (const ruleString of permissions.deny || []) {
    const rule = permissionRuleValueFromString(ruleString);
    if (rule.toolName === WEB_FETCH_TOOL_NAME && rule.ruleContent?.startsWith("domain:")) {
      deniedDomains.push(rule.ruleContent.substring("domain:".length));
    }
  }
  const allowWrite = [".", getClaudeTempDir()];
  const denyWrite = [];
  const denyRead = [];
  const allowRead = [];
  const settingsPaths = SETTING_SOURCES.map(
    (source) => getSettingsFilePathForSource(source)
  ).filter((p) => p !== void 0);
  denyWrite.push(...settingsPaths);
  denyWrite.push(getManagedSettingsDropInDir());
  const cwd = getCwdState();
  const originalCwd = getOriginalCwd();
  if (cwd !== originalCwd) {
    denyWrite.push(resolve(cwd, ".claude", "settings.json"));
    denyWrite.push(resolve(cwd, ".claude", "settings.local.json"));
  }
  denyWrite.push(resolve(originalCwd, ".claude", "skills"));
  if (cwd !== originalCwd) {
    denyWrite.push(resolve(cwd, ".claude", "skills"));
  }
  bareGitRepoScrubPaths.length = 0;
  const bareGitRepoFiles = ["HEAD", "objects", "refs", "hooks", "config"];
  for (const dir of cwd === originalCwd ? [originalCwd] : [originalCwd, cwd]) {
    for (const gitFile of bareGitRepoFiles) {
      const p = resolve(dir, gitFile);
      try {
        statSync(p);
        denyWrite.push(p);
      } catch {
        bareGitRepoScrubPaths.push(p);
      }
    }
  }
  if (worktreeMainRepoPath && worktreeMainRepoPath !== cwd) {
    allowWrite.push(worktreeMainRepoPath);
  }
  const additionalDirs = /* @__PURE__ */ new Set([
    ...settings.permissions?.additionalDirectories || [],
    ...getAdditionalDirectoriesForClaudeMd()
  ]);
  allowWrite.push(...additionalDirs);
  for (const source of SETTING_SOURCES) {
    const sourceSettings = getSettingsForSource(source);
    if (sourceSettings?.permissions) {
      for (const ruleString of sourceSettings.permissions.allow || []) {
        const rule = permissionRuleValueFromString(ruleString);
        if (rule.toolName === FILE_EDIT_TOOL_NAME && rule.ruleContent) {
          allowWrite.push(
            resolvePathPatternForSandbox(rule.ruleContent, source)
          );
        }
      }
      for (const ruleString of sourceSettings.permissions.deny || []) {
        const rule = permissionRuleValueFromString(ruleString);
        if (rule.toolName === FILE_EDIT_TOOL_NAME && rule.ruleContent) {
          denyWrite.push(resolvePathPatternForSandbox(rule.ruleContent, source));
        }
        if (rule.toolName === FILE_READ_TOOL_NAME && rule.ruleContent) {
          denyRead.push(resolvePathPatternForSandbox(rule.ruleContent, source));
        }
      }
    }
    const fs = sourceSettings?.sandbox?.filesystem;
    if (fs) {
      for (const p of fs.allowWrite || []) {
        allowWrite.push(resolveSandboxFilesystemPath(p, source));
      }
      for (const p of fs.denyWrite || []) {
        denyWrite.push(resolveSandboxFilesystemPath(p, source));
      }
      for (const p of fs.denyRead || []) {
        denyRead.push(resolveSandboxFilesystemPath(p, source));
      }
      if (!shouldAllowManagedReadPathsOnly() || source === "policySettings") {
        for (const p of fs.allowRead || []) {
          allowRead.push(resolveSandboxFilesystemPath(p, source));
        }
      }
    }
  }
  const { rgPath, rgArgs, argv0 } = ripgrepCommand();
  const ripgrepConfig = settings.sandbox?.ripgrep ?? {
    command: rgPath,
    args: rgArgs,
    argv0
  };
  return {
    network: {
      allowedDomains,
      deniedDomains,
      allowUnixSockets: settings.sandbox?.network?.allowUnixSockets,
      allowAllUnixSockets: settings.sandbox?.network?.allowAllUnixSockets,
      allowLocalBinding: settings.sandbox?.network?.allowLocalBinding,
      httpProxyPort: settings.sandbox?.network?.httpProxyPort,
      socksProxyPort: settings.sandbox?.network?.socksProxyPort
    },
    filesystem: {
      denyRead,
      allowRead,
      allowWrite,
      denyWrite
    },
    ignoreViolations: settings.sandbox?.ignoreViolations,
    enableWeakerNestedSandbox: settings.sandbox?.enableWeakerNestedSandbox,
    enableWeakerNetworkIsolation: settings.sandbox?.enableWeakerNetworkIsolation,
    ripgrep: ripgrepConfig
  };
}
let initializationPromise;
let settingsSubscriptionCleanup;
let worktreeMainRepoPath;
const bareGitRepoScrubPaths = [];
function scrubBareGitRepoFiles() {
  for (const p of bareGitRepoScrubPaths) {
    try {
      rmSync(p, { recursive: true });
      logForDebugging(`[Sandbox] scrubbed planted bare-repo file: ${p}`);
    } catch {
    }
  }
}
async function detectWorktreeMainRepoPath(cwd) {
  const gitPath = join(cwd, ".git");
  try {
    const gitContent = await readFile(gitPath, { encoding: "utf8" });
    const gitdirMatch = gitContent.match(/^gitdir:\s*(.+)$/m);
    if (!gitdirMatch?.[1]) {
      return null;
    }
    const gitdir = resolve(cwd, gitdirMatch[1].trim());
    const marker = `${sep}.git${sep}worktrees${sep}`;
    const markerIndex = gitdir.lastIndexOf(marker);
    if (markerIndex > 0) {
      return gitdir.substring(0, markerIndex);
    }
    return null;
  } catch {
    return null;
  }
}
const checkDependencies = memoize(() => {
  const { rgPath, rgArgs } = ripgrepCommand();
  return BaseSandboxManager.checkDependencies({
    command: rgPath,
    args: rgArgs
  });
});
function getSandboxEnabledSetting() {
  try {
    const settings = getSettings_DEPRECATED();
    return settings?.sandbox?.enabled ?? false;
  } catch (error) {
    logForDebugging(`Failed to get settings for sandbox check: ${error}`);
    return false;
  }
}
function isAutoAllowBashIfSandboxedEnabled() {
  const settings = getSettings_DEPRECATED();
  return settings?.sandbox?.autoAllowBashIfSandboxed ?? true;
}
function areUnsandboxedCommandsAllowed() {
  const settings = getSettings_DEPRECATED();
  return settings?.sandbox?.allowUnsandboxedCommands ?? true;
}
function isSandboxRequired() {
  const settings = getSettings_DEPRECATED();
  return getSandboxEnabledSetting() && (settings?.sandbox?.failIfUnavailable ?? false);
}
const isSupportedPlatform = memoize(() => {
  return BaseSandboxManager.isSupportedPlatform();
});
function isPlatformInEnabledList() {
  try {
    const settings = getInitialSettings();
    const enabledPlatforms = settings?.sandbox?.enabledPlatforms;
    if (enabledPlatforms === void 0) {
      return true;
    }
    if (enabledPlatforms.length === 0) {
      return false;
    }
    const currentPlatform = getPlatform();
    return enabledPlatforms.includes(currentPlatform);
  } catch (error) {
    logForDebugging(`Failed to check enabledPlatforms: ${error}`);
    return true;
  }
}
function isSandboxingEnabled() {
  if (!isSupportedPlatform()) {
    return false;
  }
  if (checkDependencies().errors.length > 0) {
    return false;
  }
  if (!isPlatformInEnabledList()) {
    return false;
  }
  return getSandboxEnabledSetting();
}
function getSandboxUnavailableReason() {
  if (!getSandboxEnabledSetting()) {
    return void 0;
  }
  if (!isSupportedPlatform()) {
    const platform = getPlatform();
    if (platform === "wsl") {
      return "sandbox.enabled is set but WSL1 is not supported (requires WSL2)";
    }
    return `sandbox.enabled is set but ${platform} is not supported (requires macOS, Linux, or WSL2)`;
  }
  if (!isPlatformInEnabledList()) {
    return `sandbox.enabled is set but ${getPlatform()} is not in sandbox.enabledPlatforms`;
  }
  const deps = checkDependencies();
  if (deps.errors.length > 0) {
    const platform = getPlatform();
    const hint = platform === "macos" ? "run /sandbox or /doctor for details" : "install missing tools (e.g. apt install bubblewrap socat) or run /sandbox for details";
    return `sandbox.enabled is set but dependencies are missing: ${deps.errors.join(", ")} \xB7 ${hint}`;
  }
  return void 0;
}
function getLinuxGlobPatternWarnings() {
  const platform = getPlatform();
  if (platform !== "linux" && platform !== "wsl") {
    return [];
  }
  try {
    const settings = getSettings_DEPRECATED();
    if (!settings?.sandbox?.enabled) {
      return [];
    }
    const permissions = settings?.permissions || {};
    const warnings = [];
    const hasGlobs = (path) => {
      const stripped = path.replace(/\/\*\*$/, "");
      return /[*?[\]]/.test(stripped);
    };
    for (const ruleString of [
      ...permissions.allow || [],
      ...permissions.deny || []
    ]) {
      const rule = permissionRuleValueFromString(ruleString);
      if ((rule.toolName === FILE_EDIT_TOOL_NAME || rule.toolName === FILE_READ_TOOL_NAME) && rule.ruleContent && hasGlobs(rule.ruleContent)) {
        warnings.push(ruleString);
      }
    }
    return warnings;
  } catch (error) {
    logForDebugging(`Failed to get Linux glob pattern warnings: ${error}`);
    return [];
  }
}
function areSandboxSettingsLockedByPolicy() {
  const overridingSources = ["flagSettings", "policySettings"];
  for (const source of overridingSources) {
    const settings = getSettingsForSource(source);
    if (settings?.sandbox?.enabled !== void 0 || settings?.sandbox?.autoAllowBashIfSandboxed !== void 0 || settings?.sandbox?.allowUnsandboxedCommands !== void 0) {
      return true;
    }
  }
  return false;
}
async function setSandboxSettings(options) {
  const existingSettings = getSettingsForSource("localSettings");
  updateSettingsForSource("localSettings", {
    sandbox: {
      ...existingSettings?.sandbox,
      ...options.enabled !== void 0 && { enabled: options.enabled },
      ...options.autoAllowBashIfSandboxed !== void 0 && {
        autoAllowBashIfSandboxed: options.autoAllowBashIfSandboxed
      },
      ...options.allowUnsandboxedCommands !== void 0 && {
        allowUnsandboxedCommands: options.allowUnsandboxedCommands
      }
    }
  });
}
function getExcludedCommands() {
  const settings = getSettings_DEPRECATED();
  return settings?.sandbox?.excludedCommands ?? [];
}
async function wrapWithSandbox(command, binShell, customConfig, abortSignal) {
  if (isSandboxingEnabled()) {
    if (initializationPromise) {
      await initializationPromise;
    } else {
      throw new Error("Sandbox failed to initialize. ");
    }
  }
  return BaseSandboxManager.wrapWithSandbox(
    command,
    binShell,
    customConfig,
    abortSignal
  );
}
async function initialize(sandboxAskCallback) {
  if (initializationPromise) {
    return initializationPromise;
  }
  if (!isSandboxingEnabled()) {
    return;
  }
  const wrappedCallback = sandboxAskCallback ? async (hostPattern) => {
    if (shouldAllowManagedSandboxDomainsOnly()) {
      logForDebugging(
        `[sandbox] Blocked network request to ${hostPattern.host} (allowManagedDomainsOnly)`
      );
      return false;
    }
    return sandboxAskCallback(hostPattern);
  } : void 0;
  initializationPromise = (async () => {
    try {
      if (worktreeMainRepoPath === void 0) {
        worktreeMainRepoPath = await detectWorktreeMainRepoPath(getCwdState());
      }
      const settings = getSettings_DEPRECATED();
      const runtimeConfig = convertToSandboxRuntimeConfig(settings);
      await BaseSandboxManager.initialize(runtimeConfig, wrappedCallback);
      settingsSubscriptionCleanup = settingsChangeDetector.subscribe(() => {
        const settings2 = getSettings_DEPRECATED();
        const newConfig = convertToSandboxRuntimeConfig(settings2);
        BaseSandboxManager.updateConfig(newConfig);
        logForDebugging("Sandbox configuration updated from settings change");
      });
    } catch (error) {
      initializationPromise = void 0;
      logForDebugging(`Failed to initialize sandbox: ${errorMessage(error)}`);
    }
  })();
  return initializationPromise;
}
function refreshConfig() {
  if (!isSandboxingEnabled()) return;
  const settings = getSettings_DEPRECATED();
  const newConfig = convertToSandboxRuntimeConfig(settings);
  BaseSandboxManager.updateConfig(newConfig);
}
async function reset() {
  settingsSubscriptionCleanup?.();
  settingsSubscriptionCleanup = void 0;
  worktreeMainRepoPath = void 0;
  bareGitRepoScrubPaths.length = 0;
  checkDependencies.cache.clear?.();
  isSupportedPlatform.cache.clear?.();
  initializationPromise = void 0;
  return BaseSandboxManager.reset();
}
function addToExcludedCommands(command, permissionUpdates) {
  const existingSettings = getSettingsForSource("localSettings");
  const existingExcludedCommands = existingSettings?.sandbox?.excludedCommands || [];
  let commandPattern = command;
  if (permissionUpdates) {
    const bashSuggestions = permissionUpdates.filter(
      (update) => update.type === "addRules" && update.rules.some((rule) => rule.toolName === BASH_TOOL_NAME)
    );
    if (bashSuggestions.length > 0 && bashSuggestions[0].type === "addRules") {
      const firstBashRule = bashSuggestions[0].rules.find(
        (rule) => rule.toolName === BASH_TOOL_NAME
      );
      if (firstBashRule?.ruleContent) {
        const prefix = permissionRuleExtractPrefix(firstBashRule.ruleContent);
        commandPattern = prefix || firstBashRule.ruleContent;
      }
    }
  }
  if (!existingExcludedCommands.includes(commandPattern)) {
    updateSettingsForSource("localSettings", {
      sandbox: {
        ...existingSettings?.sandbox,
        excludedCommands: [...existingExcludedCommands, commandPattern]
      }
    });
  }
  return commandPattern;
}
const SandboxManager = {
  // Custom implementations
  initialize,
  isSandboxingEnabled,
  isSandboxEnabledInSettings: getSandboxEnabledSetting,
  isPlatformInEnabledList,
  getSandboxUnavailableReason,
  isAutoAllowBashIfSandboxedEnabled,
  areUnsandboxedCommandsAllowed,
  isSandboxRequired,
  areSandboxSettingsLockedByPolicy,
  setSandboxSettings,
  getExcludedCommands,
  wrapWithSandbox,
  refreshConfig,
  reset,
  checkDependencies,
  // Forward to base sandbox manager
  getFsReadConfig: BaseSandboxManager.getFsReadConfig,
  getFsWriteConfig: BaseSandboxManager.getFsWriteConfig,
  getNetworkRestrictionConfig: BaseSandboxManager.getNetworkRestrictionConfig,
  getIgnoreViolations: BaseSandboxManager.getIgnoreViolations,
  getLinuxGlobPatternWarnings,
  isSupportedPlatform,
  getAllowUnixSockets: BaseSandboxManager.getAllowUnixSockets,
  getAllowLocalBinding: BaseSandboxManager.getAllowLocalBinding,
  getEnableWeakerNestedSandbox: BaseSandboxManager.getEnableWeakerNestedSandbox,
  getProxyPort: BaseSandboxManager.getProxyPort,
  getSocksProxyPort: BaseSandboxManager.getSocksProxyPort,
  getLinuxHttpSocketPath: BaseSandboxManager.getLinuxHttpSocketPath,
  getLinuxSocksSocketPath: BaseSandboxManager.getLinuxSocksSocketPath,
  waitForNetworkInitialization: BaseSandboxManager.waitForNetworkInitialization,
  getSandboxViolationStore: BaseSandboxManager.getSandboxViolationStore,
  annotateStderrWithSandboxFailures: BaseSandboxManager.annotateStderrWithSandboxFailures,
  cleanupAfterCommand: () => {
    BaseSandboxManager.cleanupAfterCommand();
    scrubBareGitRepoFiles();
  }
};
export {
  SandboxManager,
  SandboxRuntimeConfigSchema,
  SandboxViolationStore,
  addToExcludedCommands,
  convertToSandboxRuntimeConfig,
  resolvePathPatternForSandbox,
  resolveSandboxFilesystemPath,
  shouldAllowManagedSandboxDomainsOnly
};
