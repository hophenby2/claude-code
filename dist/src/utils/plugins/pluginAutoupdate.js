import { updatePluginOp } from "../../services/plugins/pluginOperations.js";
import { shouldSkipPluginAutoupdate } from "../config.js";
import { logForDebugging } from "../debug.js";
import { errorMessage } from "../errors.js";
import { logError } from "../log.js";
import {
  getPendingUpdatesDetails,
  hasPendingUpdates,
  isInstallationRelevantToCurrentProject,
  loadInstalledPluginsFromDisk
} from "./installedPluginsManager.js";
import {
  getDeclaredMarketplaces,
  loadKnownMarketplacesConfig,
  refreshMarketplace
} from "./marketplaceManager.js";
import { parsePluginIdentifier } from "./pluginIdentifier.js";
import { isMarketplaceAutoUpdate } from "./schemas.js";
let pluginUpdateCallback = null;
let pendingNotification = null;
function onPluginsAutoUpdated(callback) {
  pluginUpdateCallback = callback;
  if (pendingNotification !== null && pendingNotification.length > 0) {
    callback(pendingNotification);
    pendingNotification = null;
  }
  return () => {
    pluginUpdateCallback = null;
  };
}
function getAutoUpdatedPluginNames() {
  if (!hasPendingUpdates()) {
    return [];
  }
  return getPendingUpdatesDetails().map(
    (d) => parsePluginIdentifier(d.pluginId).name
  );
}
async function getAutoUpdateEnabledMarketplaces() {
  const config = await loadKnownMarketplacesConfig();
  const declared = getDeclaredMarketplaces();
  const enabled = /* @__PURE__ */ new Set();
  for (const [name, entry] of Object.entries(config)) {
    const declaredAutoUpdate = declared[name]?.autoUpdate;
    const autoUpdate = declaredAutoUpdate !== void 0 ? declaredAutoUpdate : isMarketplaceAutoUpdate(name, entry);
    if (autoUpdate) {
      enabled.add(name.toLowerCase());
    }
  }
  return enabled;
}
async function updatePlugin(pluginId, installations) {
  let wasUpdated = false;
  for (const { scope } of installations) {
    try {
      const result = await updatePluginOp(pluginId, scope);
      if (result.success && !result.alreadyUpToDate) {
        wasUpdated = true;
        logForDebugging(
          `Plugin autoupdate: updated ${pluginId} from ${result.oldVersion} to ${result.newVersion}`
        );
      } else if (!result.alreadyUpToDate) {
        logForDebugging(
          `Plugin autoupdate: failed to update ${pluginId}: ${result.message}`,
          { level: "warn" }
        );
      }
    } catch (error) {
      logForDebugging(
        `Plugin autoupdate: error updating ${pluginId}: ${errorMessage(error)}`,
        { level: "warn" }
      );
    }
  }
  return wasUpdated ? pluginId : null;
}
async function updatePluginsForMarketplaces(marketplaceNames) {
  const installedPlugins = loadInstalledPluginsFromDisk();
  const pluginIds = Object.keys(installedPlugins.plugins);
  if (pluginIds.length === 0) {
    return [];
  }
  const results = await Promise.allSettled(
    pluginIds.map(async (pluginId) => {
      const { marketplace } = parsePluginIdentifier(pluginId);
      if (!marketplace || !marketplaceNames.has(marketplace.toLowerCase())) {
        return null;
      }
      const allInstallations = installedPlugins.plugins[pluginId];
      if (!allInstallations || allInstallations.length === 0) {
        return null;
      }
      const relevantInstallations = allInstallations.filter(
        isInstallationRelevantToCurrentProject
      );
      if (relevantInstallations.length === 0) {
        return null;
      }
      return updatePlugin(pluginId, relevantInstallations);
    })
  );
  return results.filter(
    (r) => r.status === "fulfilled" && r.value !== null
  ).map((r) => r.value);
}
async function updatePlugins(autoUpdateEnabledMarketplaces) {
  return updatePluginsForMarketplaces(autoUpdateEnabledMarketplaces);
}
function autoUpdateMarketplacesAndPluginsInBackground() {
  void (async () => {
    if (shouldSkipPluginAutoupdate()) {
      logForDebugging("Plugin autoupdate: skipped (auto-updater disabled)");
      return;
    }
    try {
      const autoUpdateEnabledMarketplaces = await getAutoUpdateEnabledMarketplaces();
      if (autoUpdateEnabledMarketplaces.size === 0) {
        return;
      }
      const refreshResults = await Promise.allSettled(
        Array.from(autoUpdateEnabledMarketplaces).map(async (name) => {
          try {
            await refreshMarketplace(name, void 0, {
              disableCredentialHelper: true
            });
          } catch (error) {
            logForDebugging(
              `Plugin autoupdate: failed to refresh marketplace ${name}: ${errorMessage(error)}`,
              { level: "warn" }
            );
          }
        })
      );
      const failures = refreshResults.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        logForDebugging(
          `Plugin autoupdate: ${failures.length} marketplace refresh(es) failed`,
          { level: "warn" }
        );
      }
      logForDebugging("Plugin autoupdate: checking installed plugins");
      const updatedPlugins = await updatePlugins(autoUpdateEnabledMarketplaces);
      if (updatedPlugins.length > 0) {
        if (pluginUpdateCallback) {
          pluginUpdateCallback(updatedPlugins);
        } else {
          pendingNotification = updatedPlugins;
        }
      }
    } catch (error) {
      logError(error);
    }
  })();
}
export {
  autoUpdateMarketplacesAndPluginsInBackground,
  getAutoUpdatedPluginNames,
  onPluginsAutoUpdated,
  updatePluginsForMarketplaces
};
