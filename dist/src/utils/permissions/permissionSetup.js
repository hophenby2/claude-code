import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import { relative } from "path";
import {
  getOriginalCwd,
  handleAutoModeTransition,
  handlePlanModeTransition,
  setHasExitedPlanMode,
  setNeedsAutoModeExitAttachment
} from "../../bootstrap/state.js";
import { getCwd } from "../cwd.js";
import { isEnvTruthy } from "../envUtils.js";
import { SETTING_SOURCES } from "../settings/constants.js";
import {
  getSettings_DEPRECATED,
  getSettingsFilePathForSource,
  hasAutoModeOptIn
} from "../settings/settings.js";
import {
  permissionModeFromString
} from "./PermissionMode.js";
import { applyPermissionRulesToPermissionContext } from "./permissions.js";
import { loadAllPermissionRulesFromDisk } from "./permissionsLoader.js";
const autoModeStateModule = false ? require2("./autoModeState.js") : null;
import { resolve } from "path";
import {
  checkSecurityRestrictionGate,
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE,
  getDynamicConfig_BLOCKS_ON_INIT,
  getFeatureValue_CACHED_MAY_BE_STALE
} from "../../services/analytics/growthbook.js";
import {
  addDirHelpMessage,
  validateDirectoryForWorkspace
} from "../../commands/add-dir/validation.js";
import {
  logEvent
} from "../../services/analytics/index.js";
import { AGENT_TOOL_NAME } from "../../tools/AgentTool/constants.js";
import { BASH_TOOL_NAME } from "../../tools/BashTool/toolName.js";
import { POWERSHELL_TOOL_NAME } from "../../tools/PowerShellTool/toolName.js";
import { getToolsForDefaultPreset, parseToolPreset } from "../../tools.js";
import {
  getFsImplementation,
  safeResolvePath
} from "../../utils/fsOperations.js";
import { modelSupportsAutoMode } from "../betas.js";
import { logForDebugging } from "../debug.js";
import { gracefulShutdown } from "../gracefulShutdown.js";
import { getMainLoopModel } from "../model/model.js";
import {
  CROSS_PLATFORM_CODE_EXEC,
  DANGEROUS_BASH_PATTERNS
} from "./dangerousPatterns.js";
import {
  applyPermissionUpdate
} from "./PermissionUpdate.js";
import {
  normalizeLegacyToolName,
  permissionRuleValueFromString,
  permissionRuleValueToString
} from "./permissionRuleParser.js";
function isDangerousBashPermission(toolName, ruleContent) {
  if (toolName !== BASH_TOOL_NAME) {
    return false;
  }
  if (ruleContent === void 0 || ruleContent === "") {
    return true;
  }
  const content = ruleContent.trim().toLowerCase();
  if (content === "*") {
    return true;
  }
  for (const pattern of DANGEROUS_BASH_PATTERNS) {
    const lowerPattern = pattern.toLowerCase();
    if (content === lowerPattern) {
      return true;
    }
    if (content === `${lowerPattern}:*`) {
      return true;
    }
    if (content === `${lowerPattern}*`) {
      return true;
    }
    if (content === `${lowerPattern} *`) {
      return true;
    }
    if (content.startsWith(`${lowerPattern} -`) && content.endsWith("*")) {
      return true;
    }
  }
  return false;
}
function isDangerousPowerShellPermission(toolName, ruleContent) {
  if (toolName !== POWERSHELL_TOOL_NAME) {
    return false;
  }
  if (ruleContent === void 0 || ruleContent === "") {
    return true;
  }
  const content = ruleContent.trim().toLowerCase();
  if (content === "*") {
    return true;
  }
  const patterns = [
    ...CROSS_PLATFORM_CODE_EXEC,
    // Nested PS + shells launchable from PS
    "pwsh",
    "powershell",
    "cmd",
    "wsl",
    // String/scriptblock evaluators
    "iex",
    "invoke-expression",
    "icm",
    "invoke-command",
    // Process spawners
    "start-process",
    "saps",
    "start",
    "start-job",
    "sajb",
    "start-threadjob",
    // bundled PS 6.1+; takes -ScriptBlock like Start-Job
    // Event/session code exec
    "register-objectevent",
    "register-engineevent",
    "register-wmievent",
    "register-scheduledjob",
    "new-pssession",
    "nsn",
    // alias
    "enter-pssession",
    "etsn",
    // alias
    // .NET escape hatches
    "add-type",
    // Add-Type -TypeDefinition '<C#>' → P/Invoke
    "new-object"
    // New-Object -ComObject WScript.Shell → .Run()
  ];
  for (const pattern of patterns) {
    if (content === pattern) return true;
    if (content === `${pattern}:*`) return true;
    if (content === `${pattern}*`) return true;
    if (content === `${pattern} *`) return true;
    if (content.startsWith(`${pattern} -`) && content.endsWith("*")) return true;
    const sp = pattern.indexOf(" ");
    const exe = sp === -1 ? `${pattern}.exe` : `${pattern.slice(0, sp)}.exe${pattern.slice(sp)}`;
    if (content === exe) return true;
    if (content === `${exe}:*`) return true;
    if (content === `${exe}*`) return true;
    if (content === `${exe} *`) return true;
    if (content.startsWith(`${exe} -`) && content.endsWith("*")) return true;
  }
  return false;
}
function isDangerousTaskPermission(toolName, _ruleContent) {
  return normalizeLegacyToolName(toolName) === AGENT_TOOL_NAME;
}
function formatPermissionSource(source) {
  if (SETTING_SOURCES.includes(source)) {
    const filePath = getSettingsFilePathForSource(source);
    if (filePath) {
      const relativePath = relative(getCwd(), filePath);
      return relativePath.length < filePath.length ? relativePath : filePath;
    }
  }
  return source;
}
function isDangerousClassifierPermission(toolName, ruleContent) {
  if (process.env.USER_TYPE === "ant") {
    if (toolName === "Tmux") return true;
  }
  return isDangerousBashPermission(toolName, ruleContent) || isDangerousPowerShellPermission(toolName, ruleContent) || isDangerousTaskPermission(toolName, ruleContent);
}
function findDangerousClassifierPermissions(rules, cliAllowedTools) {
  const dangerous = [];
  for (const rule of rules) {
    if (rule.ruleBehavior === "allow" && isDangerousClassifierPermission(
      rule.ruleValue.toolName,
      rule.ruleValue.ruleContent
    )) {
      const ruleString = rule.ruleValue.ruleContent ? `${rule.ruleValue.toolName}(${rule.ruleValue.ruleContent})` : `${rule.ruleValue.toolName}(*)`;
      dangerous.push({
        ruleValue: rule.ruleValue,
        source: rule.source,
        ruleDisplay: ruleString,
        sourceDisplay: formatPermissionSource(rule.source)
      });
    }
  }
  for (const toolSpec of cliAllowedTools) {
    const match = toolSpec.match(/^([^(]+)(?:\(([^)]*)\))?$/);
    if (match) {
      const toolName = match[1].trim();
      const ruleContent = match[2]?.trim();
      if (isDangerousClassifierPermission(toolName, ruleContent)) {
        dangerous.push({
          ruleValue: { toolName, ruleContent },
          source: "cliArg",
          ruleDisplay: ruleContent ? toolSpec : `${toolName}(*)`,
          sourceDisplay: "--allowed-tools"
        });
      }
    }
  }
  return dangerous;
}
function isOverlyBroadBashAllowRule(ruleValue) {
  return ruleValue.toolName === BASH_TOOL_NAME && ruleValue.ruleContent === void 0;
}
function isOverlyBroadPowerShellAllowRule(ruleValue) {
  return ruleValue.toolName === POWERSHELL_TOOL_NAME && ruleValue.ruleContent === void 0;
}
function findOverlyBroadBashPermissions(rules, cliAllowedTools) {
  const overlyBroad = [];
  for (const rule of rules) {
    if (rule.ruleBehavior === "allow" && isOverlyBroadBashAllowRule(rule.ruleValue)) {
      overlyBroad.push({
        ruleValue: rule.ruleValue,
        source: rule.source,
        ruleDisplay: `${BASH_TOOL_NAME}(*)`,
        sourceDisplay: formatPermissionSource(rule.source)
      });
    }
  }
  for (const toolSpec of cliAllowedTools) {
    const parsed = permissionRuleValueFromString(toolSpec);
    if (isOverlyBroadBashAllowRule(parsed)) {
      overlyBroad.push({
        ruleValue: parsed,
        source: "cliArg",
        ruleDisplay: `${BASH_TOOL_NAME}(*)`,
        sourceDisplay: "--allowed-tools"
      });
    }
  }
  return overlyBroad;
}
function findOverlyBroadPowerShellPermissions(rules, cliAllowedTools) {
  const overlyBroad = [];
  for (const rule of rules) {
    if (rule.ruleBehavior === "allow" && isOverlyBroadPowerShellAllowRule(rule.ruleValue)) {
      overlyBroad.push({
        ruleValue: rule.ruleValue,
        source: rule.source,
        ruleDisplay: `${POWERSHELL_TOOL_NAME}(*)`,
        sourceDisplay: formatPermissionSource(rule.source)
      });
    }
  }
  for (const toolSpec of cliAllowedTools) {
    const parsed = permissionRuleValueFromString(toolSpec);
    if (isOverlyBroadPowerShellAllowRule(parsed)) {
      overlyBroad.push({
        ruleValue: parsed,
        source: "cliArg",
        ruleDisplay: `${POWERSHELL_TOOL_NAME}(*)`,
        sourceDisplay: "--allowed-tools"
      });
    }
  }
  return overlyBroad;
}
function isPermissionUpdateDestination(source) {
  return [
    "userSettings",
    "projectSettings",
    "localSettings",
    "session",
    "cliArg"
  ].includes(source);
}
function removeDangerousPermissions(context, dangerousPermissions) {
  const rulesBySource = /* @__PURE__ */ new Map();
  for (const perm of dangerousPermissions) {
    if (!isPermissionUpdateDestination(perm.source)) {
      continue;
    }
    const destination = perm.source;
    const existing = rulesBySource.get(destination) || [];
    existing.push(perm.ruleValue);
    rulesBySource.set(destination, existing);
  }
  let updatedContext = context;
  for (const [destination, rules] of rulesBySource) {
    updatedContext = applyPermissionUpdate(updatedContext, {
      type: "removeRules",
      rules,
      behavior: "allow",
      destination
    });
  }
  return updatedContext;
}
function stripDangerousPermissionsForAutoMode(context) {
  const rules = [];
  for (const [source, ruleStrings] of Object.entries(
    context.alwaysAllowRules
  )) {
    if (!ruleStrings) {
      continue;
    }
    for (const ruleString of ruleStrings) {
      const ruleValue = permissionRuleValueFromString(ruleString);
      rules.push({
        source,
        ruleBehavior: "allow",
        ruleValue
      });
    }
  }
  const dangerousPermissions = findDangerousClassifierPermissions(rules, []);
  if (dangerousPermissions.length === 0) {
    return {
      ...context,
      strippedDangerousRules: context.strippedDangerousRules ?? {}
    };
  }
  for (const permission of dangerousPermissions) {
    logForDebugging(
      `Ignoring dangerous permission ${permission.ruleDisplay} from ${permission.sourceDisplay} (bypasses classifier)`
    );
  }
  const stripped = {};
  for (const perm of dangerousPermissions) {
    if (!isPermissionUpdateDestination(perm.source)) continue;
    (stripped[perm.source] ??= []).push(
      permissionRuleValueToString(perm.ruleValue)
    );
  }
  return {
    ...removeDangerousPermissions(context, dangerousPermissions),
    strippedDangerousRules: stripped
  };
}
function restoreDangerousPermissions(context) {
  const stash = context.strippedDangerousRules;
  if (!stash) {
    return context;
  }
  let result = context;
  for (const [source, ruleStrings] of Object.entries(stash)) {
    if (!ruleStrings || ruleStrings.length === 0) continue;
    result = applyPermissionUpdate(result, {
      type: "addRules",
      rules: ruleStrings.map(permissionRuleValueFromString),
      behavior: "allow",
      destination: source
    });
  }
  return { ...result, strippedDangerousRules: void 0 };
}
function transitionPermissionMode(fromMode, toMode, context) {
  if (fromMode === toMode) return context;
  handlePlanModeTransition(fromMode, toMode);
  handleAutoModeTransition(fromMode, toMode);
  if (fromMode === "plan" && toMode !== "plan") {
    setHasExitedPlanMode(true);
  }
  if (false) {
    if (toMode === "plan" && fromMode !== "plan") {
      return prepareContextForPlanMode(context);
    }
    const fromUsesClassifier = fromMode === "auto" || fromMode === "plan" && (autoModeStateModule?.isAutoModeActive() ?? false);
    const toUsesClassifier = toMode === "auto";
    if (toUsesClassifier && !fromUsesClassifier) {
      if (!isAutoModeGateEnabled()) {
        throw new Error("Cannot transition to auto mode: gate is not enabled");
      }
      autoModeStateModule?.setAutoModeActive(true);
      context = stripDangerousPermissionsForAutoMode(context);
    } else if (fromUsesClassifier && !toUsesClassifier) {
      autoModeStateModule?.setAutoModeActive(false);
      setNeedsAutoModeExitAttachment(true);
      context = restoreDangerousPermissions(context);
    }
  }
  if (fromMode === "plan" && toMode !== "plan" && context.prePlanMode) {
    return { ...context, prePlanMode: void 0 };
  }
  return context;
}
function parseBaseToolsFromCLI(baseTools) {
  const joinedInput = baseTools.join(" ").trim();
  const preset = parseToolPreset(joinedInput);
  if (preset) {
    return getToolsForDefaultPreset();
  }
  const parsedTools = parseToolListFromCLI(baseTools);
  return parsedTools;
}
function isSymlinkTo({
  processPwd,
  originalCwd
}) {
  const { resolvedPath: resolvedProcessPwd, isSymlink: isProcessPwdSymlink } = safeResolvePath(getFsImplementation(), processPwd);
  return isProcessPwdSymlink ? resolvedProcessPwd === resolve(originalCwd) : false;
}
function initialPermissionModeFromCLI({
  permissionModeCli,
  dangerouslySkipPermissions
}) {
  const settings = getSettings_DEPRECATED() || {};
  const growthBookDisableBypassPermissionsMode = checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
    "tengu_disable_bypass_permissions_mode"
  );
  const settingsDisableBypassPermissionsMode = settings.permissions?.disableBypassPermissionsMode === "disable";
  const disableBypassPermissionsMode = growthBookDisableBypassPermissionsMode || settingsDisableBypassPermissionsMode;
  const autoModeCircuitBrokenSync = false ? getAutoModeEnabledStateIfCached() === "disabled" : false;
  const orderedModes = [];
  let notification;
  if (dangerouslySkipPermissions) {
    orderedModes.push("bypassPermissions");
  }
  if (permissionModeCli) {
    const parsedMode = permissionModeFromString(permissionModeCli);
    if (false) {
      if (autoModeCircuitBrokenSync) {
        logForDebugging(
          "auto mode circuit breaker active (cached) \u2014 falling back to default",
          { level: "warn" }
        );
      } else {
        orderedModes.push("auto");
      }
    } else {
      orderedModes.push(parsedMode);
    }
  }
  if (settings.permissions?.defaultMode) {
    const settingsMode = settings.permissions.defaultMode;
    if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) && !["acceptEdits", "plan", "default"].includes(settingsMode)) {
      logForDebugging(
        `settings defaultMode "${settingsMode}" is not supported in CLAUDE_CODE_REMOTE \u2014 only acceptEdits and plan are allowed`,
        { level: "warn" }
      );
      logEvent("tengu_ccr_unsupported_default_mode_ignored", {
        mode: settingsMode
      });
    } else if (false) {
      if (autoModeCircuitBrokenSync) {
        logForDebugging(
          "auto mode circuit breaker active (cached) \u2014 falling back to default",
          { level: "warn" }
        );
      } else {
        orderedModes.push("auto");
      }
    } else {
      orderedModes.push(settingsMode);
    }
  }
  let result;
  for (const mode of orderedModes) {
    if (mode === "bypassPermissions" && disableBypassPermissionsMode) {
      if (growthBookDisableBypassPermissionsMode) {
        logForDebugging("bypassPermissions mode is disabled by Statsig gate", {
          level: "warn"
        });
        notification = "Bypass permissions mode was disabled by your organization policy";
      } else {
        logForDebugging("bypassPermissions mode is disabled by settings", {
          level: "warn"
        });
        notification = "Bypass permissions mode was disabled by settings";
      }
      continue;
    }
    result = { mode, notification };
    break;
  }
  if (!result) {
    result = { mode: "default", notification };
  }
  if (!result) {
    result = { mode: "default", notification };
  }
  if (false) {
    autoModeStateModule?.setAutoModeActive(true);
  }
  return result;
}
function parseToolListFromCLI(tools) {
  if (tools.length === 0) {
    return [];
  }
  const result = [];
  for (const toolString of tools) {
    if (!toolString) continue;
    let current = "";
    let isInParens = false;
    for (const char of toolString) {
      switch (char) {
        case "(":
          isInParens = true;
          current += char;
          break;
        case ")":
          isInParens = false;
          current += char;
          break;
        case ",":
          if (isInParens) {
            current += char;
          } else {
            if (current.trim()) {
              result.push(current.trim());
            }
            current = "";
          }
          break;
        case " ":
          if (isInParens) {
            current += char;
          } else if (current.trim()) {
            result.push(current.trim());
            current = "";
          }
          break;
        default:
          current += char;
      }
    }
    if (current.trim()) {
      result.push(current.trim());
    }
  }
  return result;
}
async function initializeToolPermissionContext({
  allowedToolsCli,
  disallowedToolsCli,
  baseToolsCli,
  permissionMode,
  allowDangerouslySkipPermissions,
  addDirs
}) {
  const parsedAllowedToolsCli = parseToolListFromCLI(allowedToolsCli).map(
    (rule) => permissionRuleValueToString(permissionRuleValueFromString(rule))
  );
  let parsedDisallowedToolsCli = parseToolListFromCLI(disallowedToolsCli);
  if (baseToolsCli && baseToolsCli.length > 0) {
    const baseToolsResult = parseBaseToolsFromCLI(baseToolsCli);
    const baseToolsSet = new Set(baseToolsResult.map(normalizeLegacyToolName));
    const allToolNames = getToolsForDefaultPreset();
    const toolsToDisallow = allToolNames.filter((tool) => !baseToolsSet.has(tool));
    parsedDisallowedToolsCli = [...parsedDisallowedToolsCli, ...toolsToDisallow];
  }
  const warnings = [];
  const additionalWorkingDirectories = /* @__PURE__ */ new Map();
  const processPwd = process.env.PWD;
  if (processPwd && processPwd !== getOriginalCwd() && isSymlinkTo({ originalCwd: getOriginalCwd(), processPwd })) {
    additionalWorkingDirectories.set(processPwd, {
      path: processPwd,
      source: "session"
    });
  }
  const growthBookDisableBypassPermissionsMode = checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
    "tengu_disable_bypass_permissions_mode"
  );
  const settings = getSettings_DEPRECATED() || {};
  const settingsDisableBypassPermissionsMode = settings.permissions?.disableBypassPermissionsMode === "disable";
  const isBypassPermissionsModeAvailable = (permissionMode === "bypassPermissions" || allowDangerouslySkipPermissions) && !growthBookDisableBypassPermissionsMode && !settingsDisableBypassPermissionsMode;
  const rulesFromDisk = loadAllPermissionRulesFromDisk();
  let overlyBroadBashPermissions = [];
  if (process.env.USER_TYPE === "ant" && !isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) && process.env.CLAUDE_CODE_ENTRYPOINT !== "local-agent") {
    overlyBroadBashPermissions = [
      ...findOverlyBroadBashPermissions(rulesFromDisk, parsedAllowedToolsCli),
      ...findOverlyBroadPowerShellPermissions(
        rulesFromDisk,
        parsedAllowedToolsCli
      )
    ];
  }
  let dangerousPermissions = [];
  if (false) {
    dangerousPermissions = findDangerousClassifierPermissions(
      rulesFromDisk,
      parsedAllowedToolsCli
    );
  }
  let toolPermissionContext = applyPermissionRulesToPermissionContext(
    {
      mode: permissionMode,
      additionalWorkingDirectories,
      alwaysAllowRules: { cliArg: parsedAllowedToolsCli },
      alwaysDenyRules: { cliArg: parsedDisallowedToolsCli },
      alwaysAskRules: {},
      isBypassPermissionsModeAvailable,
      ...false ? { isAutoModeAvailable: isAutoModeGateEnabled() } : {}
    },
    rulesFromDisk
  );
  const allAdditionalDirectories = [
    ...settings.permissions?.additionalDirectories || [],
    ...addDirs
  ];
  const validationResults = await Promise.all(
    allAdditionalDirectories.map(
      (dir) => validateDirectoryForWorkspace(dir, toolPermissionContext)
    )
  );
  for (const result of validationResults) {
    if (result.resultType === "success") {
      toolPermissionContext = applyPermissionUpdate(toolPermissionContext, {
        type: "addDirectories",
        directories: [result.absolutePath],
        destination: "cliArg"
      });
    } else if (result.resultType !== "alreadyInWorkingDirectory" && result.resultType !== "pathNotFound") {
      warnings.push(addDirHelpMessage(result));
    }
  }
  return {
    toolPermissionContext,
    warnings,
    dangerousPermissions,
    overlyBroadBashPermissions
  };
}
function getAutoModeUnavailableNotification(reason) {
  let base;
  switch (reason) {
    case "settings":
      base = "auto mode disabled by settings";
      break;
    case "circuit-breaker":
      base = "auto mode is unavailable for your plan";
      break;
    case "model":
      base = "auto mode unavailable for this model";
      break;
  }
  return process.env.USER_TYPE === "ant" ? `${base} \xB7 #claude-code-feedback` : base;
}
async function verifyAutoModeGateAccess(currentContext, fastMode) {
  const autoModeConfig = await getDynamicConfig_BLOCKS_ON_INIT("tengu_auto_mode_config", {});
  const enabledState = parseAutoModeEnabledState(autoModeConfig?.enabled);
  const disabledBySettings = isAutoModeDisabledBySettings();
  autoModeStateModule?.setAutoModeCircuitBroken(
    enabledState === "disabled" || disabledBySettings
  );
  const mainModel = getMainLoopModel();
  const disableFastModeBreakerFires = !!autoModeConfig?.disableFastMode && (!!fastMode || process.env.USER_TYPE === "ant" && mainModel.toLowerCase().includes("-fast"));
  const modelSupported = modelSupportsAutoMode(mainModel) && !disableFastModeBreakerFires;
  let carouselAvailable = false;
  if (enabledState !== "disabled" && !disabledBySettings && modelSupported) {
    carouselAvailable = enabledState === "enabled" || hasAutoModeOptInAnySource();
  }
  const canEnterAuto = enabledState !== "disabled" && !disabledBySettings && modelSupported;
  logForDebugging(
    `[auto-mode] verifyAutoModeGateAccess: enabledState=${enabledState} disabledBySettings=${disabledBySettings} model=${mainModel} modelSupported=${modelSupported} disableFastModeBreakerFires=${disableFastModeBreakerFires} carouselAvailable=${carouselAvailable} canEnterAuto=${canEnterAuto}`
  );
  const autoModeFlagCli = autoModeStateModule?.getAutoModeFlagCli() ?? false;
  const setAvailable = (ctx, available) => {
    if (ctx.isAutoModeAvailable !== available) {
      logForDebugging(
        `[auto-mode] verifyAutoModeGateAccess setAvailable: ${ctx.isAutoModeAvailable} -> ${available}`
      );
    }
    return ctx.isAutoModeAvailable === available ? ctx : { ...ctx, isAutoModeAvailable: available };
  };
  if (canEnterAuto) {
    return { updateContext: (ctx) => setAvailable(ctx, carouselAvailable) };
  }
  let reason;
  if (disabledBySettings) {
    reason = "settings";
    logForDebugging("auto mode disabled: disableAutoMode in settings", {
      level: "warn"
    });
  } else if (enabledState === "disabled") {
    reason = "circuit-breaker";
    logForDebugging(
      'auto mode disabled: tengu_auto_mode_config.enabled === "disabled" (circuit breaker)',
      { level: "warn" }
    );
  } else {
    reason = "model";
    logForDebugging(
      `auto mode disabled: model ${getMainLoopModel()} does not support auto mode`,
      { level: "warn" }
    );
  }
  const notification = getAutoModeUnavailableNotification(reason);
  const kickOutOfAutoIfNeeded = (ctx) => {
    const inAuto = ctx.mode === "auto";
    logForDebugging(
      `[auto-mode] kickOutOfAutoIfNeeded applying: ctx.mode=${ctx.mode} ctx.prePlanMode=${ctx.prePlanMode} reason=${reason}`
    );
    const inPlanWithAutoActive = ctx.mode === "plan" && (ctx.prePlanMode === "auto" || !!ctx.strippedDangerousRules);
    if (!inAuto && !inPlanWithAutoActive) {
      return setAvailable(ctx, false);
    }
    if (inAuto) {
      autoModeStateModule?.setAutoModeActive(false);
      setNeedsAutoModeExitAttachment(true);
      return {
        ...applyPermissionUpdate(restoreDangerousPermissions(ctx), {
          type: "setMode",
          mode: "default",
          destination: "session"
        }),
        isAutoModeAvailable: false
      };
    }
    autoModeStateModule?.setAutoModeActive(false);
    setNeedsAutoModeExitAttachment(true);
    return {
      ...restoreDangerousPermissions(ctx),
      prePlanMode: ctx.prePlanMode === "auto" ? "default" : ctx.prePlanMode,
      isAutoModeAvailable: false
    };
  };
  const wasInAuto = currentContext.mode === "auto";
  const autoActiveDuringPlan = currentContext.mode === "plan" && (currentContext.prePlanMode === "auto" || !!currentContext.strippedDangerousRules);
  const wantedAuto = wasInAuto || autoActiveDuringPlan || autoModeFlagCli;
  if (!wantedAuto) {
    return { updateContext: kickOutOfAutoIfNeeded };
  }
  if (wasInAuto || autoActiveDuringPlan) {
    return { updateContext: kickOutOfAutoIfNeeded, notification };
  }
  return {
    updateContext: kickOutOfAutoIfNeeded,
    notification: currentContext.isAutoModeAvailable ? notification : void 0
  };
}
function shouldDisableBypassPermissions() {
  return checkSecurityRestrictionGate("tengu_disable_bypass_permissions_mode");
}
function isAutoModeDisabledBySettings() {
  const settings = getSettings_DEPRECATED() || {};
  return settings.disableAutoMode === "disable" || settings.permissions?.disableAutoMode === "disable";
}
function isAutoModeGateEnabled() {
  if (autoModeStateModule?.isAutoModeCircuitBroken() ?? false) return false;
  if (isAutoModeDisabledBySettings()) return false;
  if (!modelSupportsAutoMode(getMainLoopModel())) return false;
  return true;
}
function getAutoModeUnavailableReason() {
  if (isAutoModeDisabledBySettings()) return "settings";
  if (autoModeStateModule?.isAutoModeCircuitBroken() ?? false) {
    return "circuit-breaker";
  }
  if (!modelSupportsAutoMode(getMainLoopModel())) return "model";
  return null;
}
const AUTO_MODE_ENABLED_DEFAULT = "disabled";
function parseAutoModeEnabledState(value) {
  if (value === "enabled" || value === "disabled" || value === "opt-in") {
    return value;
  }
  return AUTO_MODE_ENABLED_DEFAULT;
}
function getAutoModeEnabledState() {
  const config = getFeatureValue_CACHED_MAY_BE_STALE("tengu_auto_mode_config", {});
  return parseAutoModeEnabledState(config?.enabled);
}
const NO_CACHED_AUTO_MODE_CONFIG = /* @__PURE__ */ Symbol("no-cached-auto-mode-config");
function getAutoModeEnabledStateIfCached() {
  const config = getFeatureValue_CACHED_MAY_BE_STALE("tengu_auto_mode_config", NO_CACHED_AUTO_MODE_CONFIG);
  if (config === NO_CACHED_AUTO_MODE_CONFIG) return void 0;
  return parseAutoModeEnabledState(config?.enabled);
}
function hasAutoModeOptInAnySource() {
  if (autoModeStateModule?.getAutoModeFlagCli() ?? false) return true;
  return hasAutoModeOptIn();
}
function isBypassPermissionsModeDisabled() {
  const growthBookDisableBypassPermissionsMode = checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
    "tengu_disable_bypass_permissions_mode"
  );
  const settings = getSettings_DEPRECATED() || {};
  const settingsDisableBypassPermissionsMode = settings.permissions?.disableBypassPermissionsMode === "disable";
  return growthBookDisableBypassPermissionsMode || settingsDisableBypassPermissionsMode;
}
function createDisabledBypassPermissionsContext(currentContext) {
  let updatedContext = currentContext;
  if (currentContext.mode === "bypassPermissions") {
    updatedContext = applyPermissionUpdate(currentContext, {
      type: "setMode",
      mode: "default",
      destination: "session"
    });
  }
  return {
    ...updatedContext,
    isBypassPermissionsModeAvailable: false
  };
}
async function checkAndDisableBypassPermissions(currentContext) {
  if (!currentContext.isBypassPermissionsModeAvailable) {
    return;
  }
  const shouldDisable = await shouldDisableBypassPermissions();
  if (!shouldDisable) {
    return;
  }
  logForDebugging(
    "bypassPermissions mode is being disabled by Statsig gate (async check)",
    { level: "warn" }
  );
  void gracefulShutdown(1, "bypass_permissions_disabled");
}
function isDefaultPermissionModeAuto() {
  if (false) {
    const settings = getSettings_DEPRECATED() || {};
    return settings.permissions?.defaultMode === "auto";
  }
  return false;
}
function shouldPlanUseAutoMode() {
  if (false) {
    return hasAutoModeOptIn() && isAutoModeGateEnabled() && getUseAutoModeDuringPlan();
  }
  return false;
}
function prepareContextForPlanMode(context) {
  const currentMode = context.mode;
  if (currentMode === "plan") return context;
  if (false) {
    const planAutoMode = shouldPlanUseAutoMode();
    if (currentMode === "auto") {
      if (planAutoMode) {
        return { ...context, prePlanMode: "auto" };
      }
      autoModeStateModule?.setAutoModeActive(false);
      setNeedsAutoModeExitAttachment(true);
      return {
        ...restoreDangerousPermissions(context),
        prePlanMode: "auto"
      };
    }
    if (planAutoMode && currentMode !== "bypassPermissions") {
      autoModeStateModule?.setAutoModeActive(true);
      return {
        ...stripDangerousPermissionsForAutoMode(context),
        prePlanMode: currentMode
      };
    }
  }
  logForDebugging(
    `[prepareContextForPlanMode] plain plan entry, prePlanMode=${currentMode}`,
    { level: "info" }
  );
  return { ...context, prePlanMode: currentMode };
}
function transitionPlanAutoMode(context) {
  if (true) return context;
  if (context.mode !== "plan") return context;
  if (context.prePlanMode === "bypassPermissions") {
    return context;
  }
  const want = shouldPlanUseAutoMode();
  const have = autoModeStateModule?.isAutoModeActive() ?? false;
  if (want && have) {
    return stripDangerousPermissionsForAutoMode(context);
  }
  if (!want && !have) return context;
  if (want) {
    autoModeStateModule?.setAutoModeActive(true);
    setNeedsAutoModeExitAttachment(false);
    return stripDangerousPermissionsForAutoMode(context);
  }
  autoModeStateModule?.setAutoModeActive(false);
  setNeedsAutoModeExitAttachment(true);
  return restoreDangerousPermissions(context);
}
export {
  checkAndDisableBypassPermissions,
  createDisabledBypassPermissionsContext,
  findDangerousClassifierPermissions,
  findOverlyBroadBashPermissions,
  findOverlyBroadPowerShellPermissions,
  getAutoModeEnabledState,
  getAutoModeEnabledStateIfCached,
  getAutoModeUnavailableNotification,
  getAutoModeUnavailableReason,
  hasAutoModeOptInAnySource,
  initialPermissionModeFromCLI,
  initializeToolPermissionContext,
  isAutoModeGateEnabled,
  isBypassPermissionsModeDisabled,
  isDangerousBashPermission,
  isDangerousPowerShellPermission,
  isDangerousTaskPermission,
  isDefaultPermissionModeAuto,
  isOverlyBroadBashAllowRule,
  isOverlyBroadPowerShellAllowRule,
  parseBaseToolsFromCLI,
  parseToolListFromCLI,
  prepareContextForPlanMode,
  removeDangerousPermissions,
  restoreDangerousPermissions,
  shouldDisableBypassPermissions,
  shouldPlanUseAutoMode,
  stripDangerousPermissionsForAutoMode,
  transitionPermissionMode,
  transitionPlanAutoMode,
  verifyAutoModeGateAccess
};
