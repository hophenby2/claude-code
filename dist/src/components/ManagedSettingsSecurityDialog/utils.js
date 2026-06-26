import {
  DANGEROUS_SHELL_SETTINGS,
  SAFE_ENV_VARS
} from "../../utils/managedEnvConstants.js";
import { jsonStringify } from "../../utils/slowOperations.js";
function extractDangerousSettings(settings) {
  if (!settings) {
    return {
      shellSettings: {},
      envVars: {},
      hasHooks: false
    };
  }
  const shellSettings = {};
  for (const key of DANGEROUS_SHELL_SETTINGS) {
    const value = settings[key];
    if (typeof value === "string" && value.length > 0) {
      shellSettings[key] = value;
    }
  }
  const envVars = {};
  if (settings.env && typeof settings.env === "object") {
    for (const [key, value] of Object.entries(settings.env)) {
      if (typeof value === "string" && value.length > 0) {
        if (!SAFE_ENV_VARS.has(key.toUpperCase())) {
          envVars[key] = value;
        }
      }
    }
  }
  const hasHooks = settings.hooks !== void 0 && settings.hooks !== null && typeof settings.hooks === "object" && Object.keys(settings.hooks).length > 0;
  return {
    shellSettings,
    envVars,
    hasHooks,
    hooks: hasHooks ? settings.hooks : void 0
  };
}
function hasDangerousSettings(dangerous) {
  return Object.keys(dangerous.shellSettings).length > 0 || Object.keys(dangerous.envVars).length > 0 || dangerous.hasHooks;
}
function hasDangerousSettingsChanged(oldSettings, newSettings) {
  const oldDangerous = extractDangerousSettings(oldSettings);
  const newDangerous = extractDangerousSettings(newSettings);
  if (!hasDangerousSettings(newDangerous)) {
    return false;
  }
  if (!hasDangerousSettings(oldDangerous)) {
    return true;
  }
  const oldJson = jsonStringify({
    shellSettings: oldDangerous.shellSettings,
    envVars: oldDangerous.envVars,
    hooks: oldDangerous.hooks
  });
  const newJson = jsonStringify({
    shellSettings: newDangerous.shellSettings,
    envVars: newDangerous.envVars,
    hooks: newDangerous.hooks
  });
  return oldJson !== newJson;
}
function formatDangerousSettingsList(dangerous) {
  const items = [];
  for (const key of Object.keys(dangerous.shellSettings)) {
    items.push(key);
  }
  for (const key of Object.keys(dangerous.envVars)) {
    items.push(key);
  }
  if (dangerous.hasHooks) {
    items.push("hooks");
  }
  return items;
}
export {
  extractDangerousSettings,
  formatDangerousSettingsList,
  hasDangerousSettings,
  hasDangerousSettingsChanged
};
