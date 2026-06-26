import { readFileSync } from "../fileRead.js";
import { getFsImplementation, safeResolvePath } from "../fsOperations.js";
import { safeParseJSON } from "../json.js";
import { logError } from "../log.js";
import {
  getEnabledSettingSources
} from "../settings/constants.js";
import {
  getSettingsFilePathForSource,
  getSettingsForSource,
  updateSettingsForSource
} from "../settings/settings.js";
import {
  permissionRuleValueFromString,
  permissionRuleValueToString
} from "./permissionRuleParser.js";
function shouldAllowManagedPermissionRulesOnly() {
  return getSettingsForSource("policySettings")?.allowManagedPermissionRulesOnly === true;
}
function shouldShowAlwaysAllowOptions() {
  return !shouldAllowManagedPermissionRulesOnly();
}
const SUPPORTED_RULE_BEHAVIORS = [
  "allow",
  "deny",
  "ask"
];
function getSettingsForSourceLenient_FOR_EDITING_ONLY_NOT_FOR_READING(source) {
  const filePath = getSettingsFilePathForSource(source);
  if (!filePath) {
    return null;
  }
  try {
    const { resolvedPath } = safeResolvePath(getFsImplementation(), filePath);
    const content = readFileSync(resolvedPath);
    if (content.trim() === "") {
      return {};
    }
    const data = safeParseJSON(content, false);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}
function settingsJsonToRules(data, source) {
  if (!data || !data.permissions) {
    return [];
  }
  const { permissions } = data;
  const rules = [];
  for (const behavior of SUPPORTED_RULE_BEHAVIORS) {
    const behaviorArray = permissions[behavior];
    if (behaviorArray) {
      for (const ruleString of behaviorArray) {
        rules.push({
          source,
          ruleBehavior: behavior,
          ruleValue: permissionRuleValueFromString(ruleString)
        });
      }
    }
  }
  return rules;
}
function loadAllPermissionRulesFromDisk() {
  if (shouldAllowManagedPermissionRulesOnly()) {
    return getPermissionRulesForSource("policySettings");
  }
  const rules = [];
  for (const source of getEnabledSettingSources()) {
    rules.push(...getPermissionRulesForSource(source));
  }
  return rules;
}
function getPermissionRulesForSource(source) {
  const settingsData = getSettingsForSource(source);
  return settingsJsonToRules(settingsData, source);
}
const EDITABLE_SOURCES = [
  "userSettings",
  "projectSettings",
  "localSettings"
];
function deletePermissionRuleFromSettings(rule) {
  if (!EDITABLE_SOURCES.includes(rule.source)) {
    return false;
  }
  const ruleString = permissionRuleValueToString(rule.ruleValue);
  const settingsData = getSettingsForSource(rule.source);
  if (!settingsData || !settingsData.permissions) {
    return false;
  }
  const behaviorArray = settingsData.permissions[rule.ruleBehavior];
  if (!behaviorArray) {
    return false;
  }
  const normalizeEntry = (raw) => permissionRuleValueToString(permissionRuleValueFromString(raw));
  if (!behaviorArray.some((raw) => normalizeEntry(raw) === ruleString)) {
    return false;
  }
  try {
    const updatedSettingsData = {
      ...settingsData,
      permissions: {
        ...settingsData.permissions,
        [rule.ruleBehavior]: behaviorArray.filter(
          (raw) => normalizeEntry(raw) !== ruleString
        )
      }
    };
    const { error } = updateSettingsForSource(rule.source, updatedSettingsData);
    if (error) {
      return false;
    }
    return true;
  } catch (error) {
    logError(error);
    return false;
  }
}
function getEmptyPermissionSettingsJson() {
  return {
    permissions: {}
  };
}
function addPermissionRulesToSettings({
  ruleValues,
  ruleBehavior
}, source) {
  if (shouldAllowManagedPermissionRulesOnly()) {
    return false;
  }
  if (ruleValues.length < 1) {
    return true;
  }
  const ruleStrings = ruleValues.map(permissionRuleValueToString);
  const settingsData = getSettingsForSource(source) || getSettingsForSourceLenient_FOR_EDITING_ONLY_NOT_FOR_READING(source) || getEmptyPermissionSettingsJson();
  try {
    const existingPermissions = settingsData.permissions || {};
    const existingRules = existingPermissions[ruleBehavior] || [];
    const existingRulesSet = new Set(
      existingRules.map(
        (raw) => permissionRuleValueToString(permissionRuleValueFromString(raw))
      )
    );
    const newRules = ruleStrings.filter((rule) => !existingRulesSet.has(rule));
    if (newRules.length === 0) {
      return true;
    }
    const updatedSettingsData = {
      ...settingsData,
      permissions: {
        ...existingPermissions,
        [ruleBehavior]: [...existingRules, ...newRules]
      }
    };
    const result = updateSettingsForSource(source, updatedSettingsData);
    if (result.error) {
      throw result.error;
    }
    return true;
  } catch (error) {
    logError(error);
    return false;
  }
}
export {
  addPermissionRulesToSettings,
  deletePermissionRuleFromSettings,
  getPermissionRulesForSource,
  loadAllPermissionRulesFromDisk,
  shouldAllowManagedPermissionRulesOnly,
  shouldShowAlwaysAllowOptions
};
