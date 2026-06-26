import memoize from "lodash-es/memoize.js";
import { logForDebugging } from "../debug.js";
import { logError } from "../log.js";
import { getSecureStorage } from "../secureStorage/index.js";
import {
  getSettings_DEPRECATED,
  updateSettingsForSource
} from "../settings/settings.js";
import {
  validateUserConfig
} from "./mcpbHandler.js";
import { getPluginDataDir } from "./pluginDirectories.js";
function getPluginStorageId(plugin) {
  return plugin.source;
}
const loadPluginOptions = memoize(
  (pluginId) => {
    const settings = getSettings_DEPRECATED();
    const nonSensitive = settings.pluginConfigs?.[pluginId]?.options ?? {};
    const storage = getSecureStorage();
    const sensitive = storage.read()?.pluginSecrets?.[pluginId] ?? {};
    return { ...nonSensitive, ...sensitive };
  }
);
function clearPluginOptionsCache() {
  loadPluginOptions.cache?.clear?.();
}
function savePluginOptions(pluginId, values, schema) {
  const nonSensitive = {};
  const sensitive = {};
  for (const [key, value] of Object.entries(values)) {
    if (schema[key]?.sensitive === true) {
      sensitive[key] = String(value);
    } else {
      nonSensitive[key] = value;
    }
  }
  const sensitiveKeysInThisSave = new Set(Object.keys(sensitive));
  const nonSensitiveKeysInThisSave = new Set(Object.keys(nonSensitive));
  const storage = getSecureStorage();
  const existingInSecureStorage = storage.read()?.pluginSecrets?.[pluginId] ?? void 0;
  const secureScrubbed = existingInSecureStorage ? Object.fromEntries(
    Object.entries(existingInSecureStorage).filter(
      ([k]) => !nonSensitiveKeysInThisSave.has(k)
    )
  ) : void 0;
  const needSecureScrub = secureScrubbed && existingInSecureStorage && Object.keys(secureScrubbed).length !== Object.keys(existingInSecureStorage).length;
  if (Object.keys(sensitive).length > 0 || needSecureScrub) {
    const existing = storage.read() ?? {};
    if (!existing.pluginSecrets) {
      existing.pluginSecrets = {};
    }
    existing.pluginSecrets[pluginId] = {
      ...secureScrubbed,
      ...sensitive
    };
    const result = storage.update(existing);
    if (!result.success) {
      const err = new Error(
        `Failed to save sensitive plugin options for ${pluginId} to secure storage`
      );
      logError(err);
      throw err;
    }
    if (result.warning) {
      logForDebugging(`Plugin secrets save warning: ${result.warning}`, {
        level: "warn"
      });
    }
  }
  const settings = getSettings_DEPRECATED();
  const existingInSettings = settings.pluginConfigs?.[pluginId]?.options ?? {};
  const keysToScrubFromSettings = Object.keys(existingInSettings).filter(
    (k) => sensitiveKeysInThisSave.has(k)
  );
  if (Object.keys(nonSensitive).length > 0 || keysToScrubFromSettings.length > 0) {
    if (!settings.pluginConfigs) {
      settings.pluginConfigs = {};
    }
    if (!settings.pluginConfigs[pluginId]) {
      settings.pluginConfigs[pluginId] = {};
    }
    const scrubbed = Object.fromEntries(
      keysToScrubFromSettings.map((k) => [k, void 0])
    );
    settings.pluginConfigs[pluginId].options = {
      ...nonSensitive,
      ...scrubbed
    };
    const result = updateSettingsForSource("userSettings", settings);
    if (result.error) {
      logError(result.error);
      throw new Error(
        `Failed to save plugin options for ${pluginId}: ${result.error.message}`
      );
    }
  }
  clearPluginOptionsCache();
}
function deletePluginOptions(pluginId) {
  const settings = getSettings_DEPRECATED();
  if (settings.pluginConfigs?.[pluginId]) {
    const pluginConfigs = { [pluginId]: void 0 };
    const { error } = updateSettingsForSource("userSettings", {
      pluginConfigs
    });
    if (error) {
      logForDebugging(
        `deletePluginOptions: failed to clear settings.pluginConfigs[${pluginId}]: ${error.message}`,
        { level: "warn" }
      );
    }
  }
  const storage = getSecureStorage();
  const existing = storage.read();
  if (existing?.pluginSecrets) {
    const prefix = `${pluginId}/`;
    const survivingEntries = Object.entries(existing.pluginSecrets).filter(
      ([k]) => k !== pluginId && !k.startsWith(prefix)
    );
    if (survivingEntries.length !== Object.keys(existing.pluginSecrets).length) {
      const result = storage.update({
        ...existing,
        pluginSecrets: survivingEntries.length > 0 ? Object.fromEntries(survivingEntries) : void 0
      });
      if (!result.success) {
        logForDebugging(
          `deletePluginOptions: failed to clear pluginSecrets for ${pluginId} from keychain`,
          { level: "warn" }
        );
      }
    }
  }
  clearPluginOptionsCache();
}
function getUnconfiguredOptions(plugin) {
  const manifestSchema = plugin.manifest.userConfig;
  if (!manifestSchema || Object.keys(manifestSchema).length === 0) {
    return {};
  }
  const saved = loadPluginOptions(getPluginStorageId(plugin));
  const validation = validateUserConfig(saved, manifestSchema);
  if (validation.valid) {
    return {};
  }
  const unconfigured = {};
  for (const [key, fieldSchema] of Object.entries(manifestSchema)) {
    const single = validateUserConfig(
      { [key]: saved[key] },
      { [key]: fieldSchema }
    );
    if (!single.valid) {
      unconfigured[key] = fieldSchema;
    }
  }
  return unconfigured;
}
function substitutePluginVariables(value, plugin) {
  const normalize = (p) => process.platform === "win32" ? p.replace(/\\/g, "/") : p;
  let out = value.replace(
    /\$\{CLAUDE_PLUGIN_ROOT\}/g,
    () => normalize(plugin.path)
  );
  if (plugin.source) {
    const source = plugin.source;
    out = out.replace(
      /\$\{CLAUDE_PLUGIN_DATA\}/g,
      () => normalize(getPluginDataDir(source))
    );
  }
  return out;
}
function substituteUserConfigVariables(value, userConfig) {
  return value.replace(/\$\{user_config\.([^}]+)\}/g, (_match, key) => {
    const configValue = userConfig[key];
    if (configValue === void 0) {
      throw new Error(
        `Missing required user configuration value: ${key}. This should have been validated before variable substitution.`
      );
    }
    return String(configValue);
  });
}
function substituteUserConfigInContent(content, options, schema) {
  return content.replace(/\$\{user_config\.([^}]+)\}/g, (match, key) => {
    if (schema[key]?.sensitive === true) {
      return `[sensitive option '${key}' not available in skill content]`;
    }
    const value = options[key];
    if (value === void 0) {
      return match;
    }
    return String(value);
  });
}
export {
  clearPluginOptionsCache,
  deletePluginOptions,
  getPluginStorageId,
  getUnconfiguredOptions,
  loadPluginOptions,
  savePluginOptions,
  substitutePluginVariables,
  substituteUserConfigInContent,
  substituteUserConfigVariables
};
