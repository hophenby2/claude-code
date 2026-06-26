import { join } from "path";
import { getCwd } from "../cwd.js";
import { logForDebugging } from "../debug.js";
import { logError } from "../log.js";
import {
  getInitialSettings,
  getSettingsForSource,
  updateSettingsForSource
} from "../settings/settings.js";
import { getAddDirEnabledPlugins } from "./addDirPluginSettings.js";
import {
  getInMemoryInstalledPlugins,
  migrateFromEnabledPlugins
} from "./installedPluginsManager.js";
import { getPluginById } from "./marketplaceManager.js";
import {
  SETTING_SOURCE_TO_SCOPE,
  scopeToSettingSource
} from "./pluginIdentifier.js";
import {
  cacheAndRegisterPlugin,
  registerPluginInstallation
} from "./pluginInstallationHelpers.js";
import { isLocalPluginSource } from "./schemas.js";
async function checkEnabledPlugins() {
  const settings = getInitialSettings();
  const enabledPlugins = [];
  const addDirPlugins = getAddDirEnabledPlugins();
  for (const [pluginId, value] of Object.entries(addDirPlugins)) {
    if (pluginId.includes("@") && value) {
      enabledPlugins.push(pluginId);
    }
  }
  if (settings.enabledPlugins) {
    for (const [pluginId, value] of Object.entries(settings.enabledPlugins)) {
      if (!pluginId.includes("@")) {
        continue;
      }
      const idx = enabledPlugins.indexOf(pluginId);
      if (value) {
        if (idx === -1) {
          enabledPlugins.push(pluginId);
        }
      } else {
        if (idx !== -1) {
          enabledPlugins.splice(idx, 1);
        }
      }
    }
  }
  return enabledPlugins;
}
function getPluginEditableScopes() {
  const result = /* @__PURE__ */ new Map();
  const addDirPlugins = getAddDirEnabledPlugins();
  for (const [pluginId, value] of Object.entries(addDirPlugins)) {
    if (!pluginId.includes("@")) {
      continue;
    }
    if (value === true) {
      result.set(pluginId, "flag");
    } else if (value === false) {
      result.delete(pluginId);
    }
  }
  const scopeSources = [
    { scope: "managed", source: "policySettings" },
    { scope: "user", source: "userSettings" },
    { scope: "project", source: "projectSettings" },
    { scope: "local", source: "localSettings" },
    { scope: "flag", source: "flagSettings" }
  ];
  for (const { scope, source } of scopeSources) {
    const settings = getSettingsForSource(source);
    if (!settings?.enabledPlugins) {
      continue;
    }
    for (const [pluginId, value] of Object.entries(settings.enabledPlugins)) {
      if (!pluginId.includes("@")) {
        continue;
      }
      if (pluginId in addDirPlugins && addDirPlugins[pluginId] !== value) {
        logForDebugging(
          `Plugin ${pluginId} from --add-dir (${addDirPlugins[pluginId]}) overridden by ${source} (${value})`
        );
      }
      if (value === true) {
        result.set(pluginId, scope);
      } else if (value === false) {
        result.delete(pluginId);
      }
    }
  }
  logForDebugging(
    `Found ${result.size} enabled plugins with scopes: ${Array.from(
      result.entries()
    ).map(([id, scope]) => `${id}(${scope})`).join(", ")}`
  );
  return result;
}
function isPersistableScope(scope) {
  return scope !== "flag";
}
function settingSourceToScope(source) {
  return SETTING_SOURCE_TO_SCOPE[source];
}
async function getInstalledPlugins() {
  void migrateFromEnabledPlugins().catch((error) => {
    logError(error);
  });
  const v2Data = getInMemoryInstalledPlugins();
  const installed = Object.keys(v2Data.plugins);
  logForDebugging(`Found ${installed.length} installed plugins`);
  return installed;
}
async function findMissingPlugins(enabledPlugins) {
  try {
    const installedPlugins = await getInstalledPlugins();
    const notInstalled = enabledPlugins.filter(
      (id) => !installedPlugins.includes(id)
    );
    const lookups = await Promise.all(
      notInstalled.map(async (pluginId) => {
        try {
          const plugin = await getPluginById(pluginId);
          return { pluginId, found: plugin !== null && plugin !== void 0 };
        } catch (error) {
          logForDebugging(
            `Failed to check plugin ${pluginId} in marketplace: ${error}`
          );
          return { pluginId, found: false };
        }
      })
    );
    const missing = lookups.filter(({ found }) => found).map(({ pluginId }) => pluginId);
    return missing;
  } catch (error) {
    logError(error);
    return [];
  }
}
async function installSelectedPlugins(pluginsToInstall, onProgress, scope = "user") {
  const projectPath = scope !== "user" ? getCwd() : void 0;
  const settingSource = scopeToSettingSource(scope);
  const settings = getSettingsForSource(settingSource);
  const updatedEnabledPlugins = { ...settings?.enabledPlugins };
  const installed = [];
  const failed = [];
  for (let i = 0; i < pluginsToInstall.length; i++) {
    const pluginId = pluginsToInstall[i];
    if (!pluginId) continue;
    if (onProgress) {
      onProgress(pluginId, i + 1, pluginsToInstall.length);
    }
    try {
      const pluginInfo = await getPluginById(pluginId);
      if (!pluginInfo) {
        failed.push({
          name: pluginId,
          error: "Plugin not found in any marketplace"
        });
        continue;
      }
      const { entry, marketplaceInstallLocation } = pluginInfo;
      if (!isLocalPluginSource(entry.source)) {
        await cacheAndRegisterPlugin(pluginId, entry, scope, projectPath);
      } else {
        registerPluginInstallation(
          {
            pluginId,
            installPath: join(marketplaceInstallLocation, entry.source),
            version: entry.version
          },
          scope,
          projectPath
        );
      }
      updatedEnabledPlugins[pluginId] = true;
      installed.push(pluginId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      failed.push({ name: pluginId, error: errorMessage });
      logError(error);
    }
  }
  updateSettingsForSource(settingSource, {
    ...settings,
    enabledPlugins: updatedEnabledPlugins
  });
  return { installed, failed };
}
export {
  checkEnabledPlugins,
  findMissingPlugins,
  getInstalledPlugins,
  getPluginEditableScopes,
  installSelectedPlugins,
  isPersistableScope,
  settingSourceToScope
};
