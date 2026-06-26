import { getSettingsForSource } from "../../utils/settings/settings.js";
import { BASH_TOOL_NAME } from "../../tools/BashTool/toolName.js";
import { SAFE_ENV_VARS } from "../../utils/managedEnvConstants.js";
import { getPermissionRulesForSource } from "../../utils/permissions/permissionsLoader.js";
function hasHooks(settings) {
  if (settings === null || settings.disableAllHooks) {
    return false;
  }
  if (settings.statusLine) {
    return true;
  }
  if (settings.fileSuggestion) {
    return true;
  }
  if (!settings.hooks) {
    return false;
  }
  for (const hookConfig of Object.values(settings.hooks)) {
    if (hookConfig.length > 0) {
      return true;
    }
  }
  return false;
}
function getHooksSources() {
  const sources = [];
  const projectSettings = getSettingsForSource("projectSettings");
  if (hasHooks(projectSettings)) {
    sources.push(".claude/settings.json");
  }
  const localSettings = getSettingsForSource("localSettings");
  if (hasHooks(localSettings)) {
    sources.push(".claude/settings.local.json");
  }
  return sources;
}
function hasBashPermission(rules) {
  return rules.some(
    (rule) => rule.ruleBehavior === "allow" && (rule.ruleValue.toolName === BASH_TOOL_NAME || rule.ruleValue.toolName.startsWith(BASH_TOOL_NAME + "("))
  );
}
function getBashPermissionSources() {
  const sources = [];
  const projectRules = getPermissionRulesForSource("projectSettings");
  if (hasBashPermission(projectRules)) {
    sources.push(".claude/settings.json");
  }
  const localRules = getPermissionRulesForSource("localSettings");
  if (hasBashPermission(localRules)) {
    sources.push(".claude/settings.local.json");
  }
  return sources;
}
function formatListWithAnd(items, limit) {
  if (items.length === 0) return "";
  const effectiveLimit = limit === 0 ? void 0 : limit;
  if (!effectiveLimit || items.length <= effectiveLimit) {
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    const lastItem = items[items.length - 1];
    const allButLast = items.slice(0, -1);
    return `${allButLast.join(", ")}, and ${lastItem}`;
  }
  const shown = items.slice(0, effectiveLimit);
  const remaining = items.length - effectiveLimit;
  if (shown.length === 1) {
    return `${shown[0]} and ${remaining} more`;
  }
  return `${shown.join(", ")}, and ${remaining} more`;
}
function hasOtelHeadersHelper(settings) {
  return !!settings?.otelHeadersHelper;
}
function getOtelHeadersHelperSources() {
  const sources = [];
  const projectSettings = getSettingsForSource("projectSettings");
  if (hasOtelHeadersHelper(projectSettings)) {
    sources.push(".claude/settings.json");
  }
  const localSettings = getSettingsForSource("localSettings");
  if (hasOtelHeadersHelper(localSettings)) {
    sources.push(".claude/settings.local.json");
  }
  return sources;
}
function hasApiKeyHelper(settings) {
  return !!settings?.apiKeyHelper;
}
function getApiKeyHelperSources() {
  const sources = [];
  const projectSettings = getSettingsForSource("projectSettings");
  if (hasApiKeyHelper(projectSettings)) {
    sources.push(".claude/settings.json");
  }
  const localSettings = getSettingsForSource("localSettings");
  if (hasApiKeyHelper(localSettings)) {
    sources.push(".claude/settings.local.json");
  }
  return sources;
}
function hasAwsCommands(settings) {
  return !!(settings?.awsAuthRefresh || settings?.awsCredentialExport);
}
function getAwsCommandsSources() {
  const sources = [];
  const projectSettings = getSettingsForSource("projectSettings");
  if (hasAwsCommands(projectSettings)) {
    sources.push(".claude/settings.json");
  }
  const localSettings = getSettingsForSource("localSettings");
  if (hasAwsCommands(localSettings)) {
    sources.push(".claude/settings.local.json");
  }
  return sources;
}
function hasGcpCommands(settings) {
  return !!settings?.gcpAuthRefresh;
}
function getGcpCommandsSources() {
  const sources = [];
  const projectSettings = getSettingsForSource("projectSettings");
  if (hasGcpCommands(projectSettings)) {
    sources.push(".claude/settings.json");
  }
  const localSettings = getSettingsForSource("localSettings");
  if (hasGcpCommands(localSettings)) {
    sources.push(".claude/settings.local.json");
  }
  return sources;
}
function hasDangerousEnvVars(settings) {
  if (!settings?.env) {
    return false;
  }
  return Object.keys(settings.env).some(
    (key) => !SAFE_ENV_VARS.has(key.toUpperCase())
  );
}
function getDangerousEnvVarsSources() {
  const sources = [];
  const projectSettings = getSettingsForSource("projectSettings");
  if (hasDangerousEnvVars(projectSettings)) {
    sources.push(".claude/settings.json");
  }
  const localSettings = getSettingsForSource("localSettings");
  if (hasDangerousEnvVars(localSettings)) {
    sources.push(".claude/settings.local.json");
  }
  return sources;
}
export {
  formatListWithAnd,
  getApiKeyHelperSources,
  getAwsCommandsSources,
  getBashPermissionSources,
  getDangerousEnvVarsSources,
  getGcpCommandsSources,
  getHooksSources,
  getOtelHeadersHelperSources
};
