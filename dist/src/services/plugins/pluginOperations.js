import { dirname, join } from "path";
import { getOriginalCwd } from "../../bootstrap/state.js";
import { isBuiltinPluginId } from "../../plugins/builtinPlugins.js";
import { isENOENT, toError } from "../../utils/errors.js";
import { getFsImplementation } from "../../utils/fsOperations.js";
import { logError } from "../../utils/log.js";
import {
  clearAllCaches,
  markPluginVersionOrphaned
} from "../../utils/plugins/cacheUtils.js";
import {
  findReverseDependents,
  formatReverseDependentsSuffix
} from "../../utils/plugins/dependencyResolver.js";
import {
  loadInstalledPluginsFromDisk,
  loadInstalledPluginsV2,
  removePluginInstallation,
  updateInstallationPathOnDisk
} from "../../utils/plugins/installedPluginsManager.js";
import {
  getMarketplace,
  getPluginById,
  loadKnownMarketplacesConfig
} from "../../utils/plugins/marketplaceManager.js";
import { deletePluginDataDir } from "../../utils/plugins/pluginDirectories.js";
import {
  parsePluginIdentifier,
  scopeToSettingSource
} from "../../utils/plugins/pluginIdentifier.js";
import {
  formatResolutionError,
  installResolvedPlugin
} from "../../utils/plugins/pluginInstallationHelpers.js";
import {
  cachePlugin,
  copyPluginToVersionedCache,
  getVersionedCachePath,
  getVersionedZipCachePath,
  loadAllPlugins,
  loadPluginManifest
} from "../../utils/plugins/pluginLoader.js";
import { deletePluginOptions } from "../../utils/plugins/pluginOptionsStorage.js";
import { isPluginBlockedByPolicy } from "../../utils/plugins/pluginPolicy.js";
import { getPluginEditableScopes } from "../../utils/plugins/pluginStartupCheck.js";
import { calculatePluginVersion } from "../../utils/plugins/pluginVersioning.js";
import {
  getSettingsForSource,
  updateSettingsForSource
} from "../../utils/settings/settings.js";
import { plural } from "../../utils/stringUtils.js";
const VALID_INSTALLABLE_SCOPES = ["user", "project", "local"];
const VALID_UPDATE_SCOPES = [
  "user",
  "project",
  "local",
  "managed"
];
function assertInstallableScope(scope) {
  if (!VALID_INSTALLABLE_SCOPES.includes(scope)) {
    throw new Error(
      `Invalid scope "${scope}". Must be one of: ${VALID_INSTALLABLE_SCOPES.join(", ")}`
    );
  }
}
function isInstallableScope(scope) {
  return VALID_INSTALLABLE_SCOPES.includes(scope);
}
function getProjectPathForScope(scope) {
  return scope === "project" || scope === "local" ? getOriginalCwd() : void 0;
}
function isPluginEnabledAtProjectScope(pluginId) {
  return getSettingsForSource("projectSettings")?.enabledPlugins?.[pluginId] === true;
}
function findPluginInSettings(plugin) {
  const hasMarketplace = plugin.includes("@");
  const searchOrder = ["local", "project", "user"];
  for (const scope of searchOrder) {
    const enabledPlugins = getSettingsForSource(
      scopeToSettingSource(scope)
    )?.enabledPlugins;
    if (!enabledPlugins) continue;
    for (const key of Object.keys(enabledPlugins)) {
      if (hasMarketplace ? key === plugin : key.startsWith(`${plugin}@`)) {
        return { pluginId: key, scope };
      }
    }
  }
  return null;
}
function findPluginByIdentifier(plugin, plugins) {
  const { name, marketplace } = parsePluginIdentifier(plugin);
  return plugins.find((p) => {
    if (p.name === plugin || p.name === name) return true;
    if (marketplace && p.source) {
      return p.name === name && p.source.includes(`@${marketplace}`);
    }
    return false;
  });
}
function resolveDelistedPluginId(plugin) {
  const { name } = parsePluginIdentifier(plugin);
  const installedData = loadInstalledPluginsV2();
  if (installedData.plugins[plugin]?.length) {
    return { pluginId: plugin, pluginName: name };
  }
  const matchingKey = Object.keys(installedData.plugins).find((key) => {
    const { name: keyName } = parsePluginIdentifier(key);
    return keyName === name && (installedData.plugins[key]?.length ?? 0) > 0;
  });
  if (matchingKey) {
    return { pluginId: matchingKey, pluginName: name };
  }
  return null;
}
function getPluginInstallationFromV2(pluginId) {
  const installedData = loadInstalledPluginsV2();
  const installations = installedData.plugins[pluginId];
  if (!installations || installations.length === 0) {
    return { scope: "user" };
  }
  const currentProjectPath = getOriginalCwd();
  const localInstall = installations.find(
    (inst) => inst.scope === "local" && inst.projectPath === currentProjectPath
  );
  if (localInstall) {
    return { scope: localInstall.scope, projectPath: localInstall.projectPath };
  }
  const projectInstall = installations.find(
    (inst) => inst.scope === "project" && inst.projectPath === currentProjectPath
  );
  if (projectInstall) {
    return {
      scope: projectInstall.scope,
      projectPath: projectInstall.projectPath
    };
  }
  const userInstall = installations.find((inst) => inst.scope === "user");
  if (userInstall) {
    return { scope: userInstall.scope };
  }
  return {
    scope: installations[0].scope,
    projectPath: installations[0].projectPath
  };
}
async function installPluginOp(plugin, scope = "user") {
  assertInstallableScope(scope);
  const { name: pluginName, marketplace: marketplaceName } = parsePluginIdentifier(plugin);
  let foundPlugin;
  let foundMarketplace;
  let marketplaceInstallLocation;
  if (marketplaceName) {
    const pluginInfo = await getPluginById(plugin);
    if (pluginInfo) {
      foundPlugin = pluginInfo.entry;
      foundMarketplace = marketplaceName;
      marketplaceInstallLocation = pluginInfo.marketplaceInstallLocation;
    }
  } else {
    const marketplaces = await loadKnownMarketplacesConfig();
    for (const [mktName, mktConfig] of Object.entries(marketplaces)) {
      try {
        const marketplace = await getMarketplace(mktName);
        const pluginEntry = marketplace.plugins.find((p) => p.name === pluginName);
        if (pluginEntry) {
          foundPlugin = pluginEntry;
          foundMarketplace = mktName;
          marketplaceInstallLocation = mktConfig.installLocation;
          break;
        }
      } catch (error) {
        logError(toError(error));
        continue;
      }
    }
  }
  if (!foundPlugin || !foundMarketplace) {
    const location = marketplaceName ? `marketplace "${marketplaceName}"` : "any configured marketplace";
    return {
      success: false,
      message: `Plugin "${pluginName}" not found in ${location}`
    };
  }
  const entry = foundPlugin;
  const pluginId = `${entry.name}@${foundMarketplace}`;
  const result = await installResolvedPlugin({
    pluginId,
    entry,
    scope,
    marketplaceInstallLocation
  });
  if (!result.ok) {
    switch (result.reason) {
      case "local-source-no-location":
        return {
          success: false,
          message: `Cannot install local plugin "${result.pluginName}" without marketplace install location`
        };
      case "settings-write-failed":
        return {
          success: false,
          message: `Failed to update settings: ${result.message}`
        };
      case "resolution-failed":
        return {
          success: false,
          message: formatResolutionError(result.resolution)
        };
      case "blocked-by-policy":
        return {
          success: false,
          message: `Plugin "${result.pluginName}" is blocked by your organization's policy and cannot be installed`
        };
      case "dependency-blocked-by-policy":
        return {
          success: false,
          message: `Plugin "${result.pluginName}" depends on "${result.blockedDependency}", which is blocked by your organization's policy`
        };
    }
  }
  return {
    success: true,
    message: `Successfully installed plugin: ${pluginId} (scope: ${scope})${result.depNote}`,
    pluginId,
    pluginName: entry.name,
    scope
  };
}
async function uninstallPluginOp(plugin, scope = "user", deleteDataDir = true) {
  assertInstallableScope(scope);
  const { enabled, disabled } = await loadAllPlugins();
  const allPlugins = [...enabled, ...disabled];
  const foundPlugin = findPluginByIdentifier(plugin, allPlugins);
  const settingSource = scopeToSettingSource(scope);
  const settings = getSettingsForSource(settingSource);
  let pluginId;
  let pluginName;
  if (foundPlugin) {
    pluginId = Object.keys(settings?.enabledPlugins ?? {}).find(
      (k) => k === plugin || k === foundPlugin.name || k.startsWith(`${foundPlugin.name}@`)
    ) ?? (plugin.includes("@") ? plugin : foundPlugin.name);
    pluginName = foundPlugin.name;
  } else {
    const resolved = resolveDelistedPluginId(plugin);
    if (!resolved) {
      return {
        success: false,
        message: `Plugin "${plugin}" not found in installed plugins`
      };
    }
    pluginId = resolved.pluginId;
    pluginName = resolved.pluginName;
  }
  const projectPath = getProjectPathForScope(scope);
  const installedData = loadInstalledPluginsV2();
  const installations = installedData.plugins[pluginId];
  const scopeInstallation = installations?.find(
    (i) => i.scope === scope && i.projectPath === projectPath
  );
  if (!scopeInstallation) {
    const { scope: actualScope } = getPluginInstallationFromV2(pluginId);
    if (actualScope !== scope && installations && installations.length > 0) {
      if (actualScope === "project") {
        return {
          success: false,
          message: `Plugin "${plugin}" is enabled at project scope (.claude/settings.json, shared with your team). To disable just for you: claude plugin disable ${plugin} --scope local`
        };
      }
      return {
        success: false,
        message: `Plugin "${plugin}" is installed in ${actualScope} scope, not ${scope}. Use --scope ${actualScope} to uninstall.`
      };
    }
    return {
      success: false,
      message: `Plugin "${plugin}" is not installed in ${scope} scope. Use --scope to specify the correct scope.`
    };
  }
  const installPath = scopeInstallation.installPath;
  const newEnabledPlugins = {
    ...settings?.enabledPlugins
  };
  newEnabledPlugins[pluginId] = void 0;
  updateSettingsForSource(settingSource, {
    enabledPlugins: newEnabledPlugins
  });
  clearAllCaches();
  removePluginInstallation(pluginId, scope, projectPath);
  const updatedData = loadInstalledPluginsV2();
  const remainingInstallations = updatedData.plugins[pluginId];
  const isLastScope = !remainingInstallations || remainingInstallations.length === 0;
  if (isLastScope && installPath) {
    await markPluginVersionOrphaned(installPath);
  }
  if (isLastScope) {
    deletePluginOptions(pluginId);
    if (deleteDataDir) {
      await deletePluginDataDir(pluginId);
    }
  }
  const reverseDependents = findReverseDependents(pluginId, allPlugins);
  const depWarn = formatReverseDependentsSuffix(reverseDependents);
  return {
    success: true,
    message: `Successfully uninstalled plugin: ${pluginName} (scope: ${scope})${depWarn}`,
    pluginId,
    pluginName,
    scope,
    reverseDependents: reverseDependents.length > 0 ? reverseDependents : void 0
  };
}
async function setPluginEnabledOp(plugin, enabled, scope) {
  const operation = enabled ? "enable" : "disable";
  if (isBuiltinPluginId(plugin)) {
    const { error: error2 } = updateSettingsForSource("userSettings", {
      enabledPlugins: {
        ...getSettingsForSource("userSettings")?.enabledPlugins,
        [plugin]: enabled
      }
    });
    if (error2) {
      return {
        success: false,
        message: `Failed to ${operation} built-in plugin: ${error2.message}`
      };
    }
    clearAllCaches();
    const { name: pluginName2 } = parsePluginIdentifier(plugin);
    return {
      success: true,
      message: `Successfully ${operation}d built-in plugin: ${pluginName2}`,
      pluginId: plugin,
      pluginName: pluginName2,
      scope: "user"
    };
  }
  if (scope) {
    assertInstallableScope(scope);
  }
  let pluginId;
  let resolvedScope;
  const found = findPluginInSettings(plugin);
  if (scope) {
    resolvedScope = scope;
    if (found) {
      pluginId = found.pluginId;
    } else if (plugin.includes("@")) {
      pluginId = plugin;
    } else {
      return {
        success: false,
        message: `Plugin "${plugin}" not found in settings. Use plugin@marketplace format.`
      };
    }
  } else if (found) {
    pluginId = found.pluginId;
    resolvedScope = found.scope;
  } else if (plugin.includes("@")) {
    pluginId = plugin;
    resolvedScope = "user";
  } else {
    return {
      success: false,
      message: `Plugin "${plugin}" not found in any editable settings scope. Use plugin@marketplace format.`
    };
  }
  if (enabled && isPluginBlockedByPolicy(pluginId)) {
    return {
      success: false,
      message: `Plugin "${pluginId}" is blocked by your organization's policy and cannot be enabled`
    };
  }
  const settingSource = scopeToSettingSource(resolvedScope);
  const scopeSettingsValue = getSettingsForSource(settingSource)?.enabledPlugins?.[pluginId];
  const SCOPE_PRECEDENCE = {
    user: 0,
    project: 1,
    local: 2
  };
  const isOverride = scope && found && SCOPE_PRECEDENCE[scope] > SCOPE_PRECEDENCE[found.scope];
  if (scope && scopeSettingsValue === void 0 && found && found.scope !== scope && !isOverride) {
    return {
      success: false,
      message: `Plugin "${plugin}" is installed at ${found.scope} scope, not ${scope}. Use --scope ${found.scope} or omit --scope to auto-detect.`
    };
  }
  const isCurrentlyEnabled = scope && !isOverride ? scopeSettingsValue === true : getPluginEditableScopes().has(pluginId);
  if (enabled === isCurrentlyEnabled) {
    return {
      success: false,
      message: `Plugin "${plugin}" is already ${enabled ? "enabled" : "disabled"}${scope ? ` at ${scope} scope` : ""}`
    };
  }
  let reverseDependents;
  if (!enabled) {
    const { enabled: loadedEnabled, disabled } = await loadAllPlugins();
    const rdeps = findReverseDependents(pluginId, [
      ...loadedEnabled,
      ...disabled
    ]);
    if (rdeps.length > 0) reverseDependents = rdeps;
  }
  const { error } = updateSettingsForSource(settingSource, {
    enabledPlugins: {
      ...getSettingsForSource(settingSource)?.enabledPlugins,
      [pluginId]: enabled
    }
  });
  if (error) {
    return {
      success: false,
      message: `Failed to ${operation} plugin: ${error.message}`
    };
  }
  clearAllCaches();
  const { name: pluginName } = parsePluginIdentifier(pluginId);
  const depWarn = formatReverseDependentsSuffix(reverseDependents);
  return {
    success: true,
    message: `Successfully ${operation}d plugin: ${pluginName} (scope: ${resolvedScope})${depWarn}`,
    pluginId,
    pluginName,
    scope: resolvedScope,
    reverseDependents
  };
}
async function enablePluginOp(plugin, scope) {
  return setPluginEnabledOp(plugin, true, scope);
}
async function disablePluginOp(plugin, scope) {
  return setPluginEnabledOp(plugin, false, scope);
}
async function disableAllPluginsOp() {
  const enabledPlugins = getPluginEditableScopes();
  if (enabledPlugins.size === 0) {
    return { success: true, message: "No enabled plugins to disable" };
  }
  const disabled = [];
  const errors = [];
  for (const [pluginId] of enabledPlugins) {
    const result = await setPluginEnabledOp(pluginId, false);
    if (result.success) {
      disabled.push(pluginId);
    } else {
      errors.push(`${pluginId}: ${result.message}`);
    }
  }
  if (errors.length > 0) {
    return {
      success: false,
      message: `Disabled ${disabled.length} ${plural(disabled.length, "plugin")}, ${errors.length} failed:
${errors.join("\n")}`
    };
  }
  return {
    success: true,
    message: `Disabled ${disabled.length} ${plural(disabled.length, "plugin")}`
  };
}
async function updatePluginOp(plugin, scope) {
  const { name: pluginName, marketplace: marketplaceName } = parsePluginIdentifier(plugin);
  const pluginId = marketplaceName ? `${pluginName}@${marketplaceName}` : plugin;
  const pluginInfo = await getPluginById(plugin);
  if (!pluginInfo) {
    return {
      success: false,
      message: `Plugin "${pluginName}" not found`,
      pluginId,
      scope
    };
  }
  const { entry, marketplaceInstallLocation } = pluginInfo;
  const diskData = loadInstalledPluginsFromDisk();
  const installations = diskData.plugins[pluginId];
  if (!installations || installations.length === 0) {
    return {
      success: false,
      message: `Plugin "${pluginName}" is not installed`,
      pluginId,
      scope
    };
  }
  const projectPath = getProjectPathForScope(scope);
  const installation = installations.find(
    (inst) => inst.scope === scope && inst.projectPath === projectPath
  );
  if (!installation) {
    const scopeDesc = projectPath ? `${scope} (${projectPath})` : scope;
    return {
      success: false,
      message: `Plugin "${pluginName}" is not installed at scope ${scopeDesc}`,
      pluginId,
      scope
    };
  }
  return performPluginUpdate({
    pluginId,
    pluginName,
    entry,
    marketplaceInstallLocation,
    installation,
    scope,
    projectPath
  });
}
async function performPluginUpdate({
  pluginId,
  pluginName,
  entry,
  marketplaceInstallLocation,
  installation,
  scope,
  projectPath
}) {
  const fs = getFsImplementation();
  const oldVersion = installation.version;
  let sourcePath;
  let newVersion;
  let shouldCleanupSource = false;
  let gitCommitSha;
  if (typeof entry.source !== "string") {
    const cacheResult = await cachePlugin(entry.source, {
      manifest: { name: entry.name }
    });
    sourcePath = cacheResult.path;
    shouldCleanupSource = true;
    gitCommitSha = cacheResult.gitCommitSha;
    newVersion = await calculatePluginVersion(
      pluginId,
      entry.source,
      cacheResult.manifest,
      cacheResult.path,
      entry.version,
      cacheResult.gitCommitSha
    );
  } else {
    let marketplaceStats;
    try {
      marketplaceStats = await fs.stat(marketplaceInstallLocation);
    } catch (e) {
      if (isENOENT(e)) {
        return {
          success: false,
          message: `Marketplace directory not found at ${marketplaceInstallLocation}`,
          pluginId,
          scope
        };
      }
      throw e;
    }
    const marketplaceDir = marketplaceStats.isDirectory() ? marketplaceInstallLocation : dirname(marketplaceInstallLocation);
    sourcePath = join(marketplaceDir, entry.source);
    try {
      await fs.stat(sourcePath);
    } catch (e) {
      if (isENOENT(e)) {
        return {
          success: false,
          message: `Plugin source not found at ${sourcePath}`,
          pluginId,
          scope
        };
      }
      throw e;
    }
    let pluginManifest;
    const manifestPath = join(sourcePath, ".claude-plugin", "plugin.json");
    try {
      pluginManifest = await loadPluginManifest(
        manifestPath,
        entry.name,
        entry.source
      );
    } catch {
    }
    newVersion = await calculatePluginVersion(
      pluginId,
      entry.source,
      pluginManifest,
      sourcePath,
      entry.version
    );
  }
  try {
    let versionedPath = getVersionedCachePath(pluginId, newVersion);
    const zipPath = getVersionedZipCachePath(pluginId, newVersion);
    const isUpToDate = installation.version === newVersion || installation.installPath === versionedPath || installation.installPath === zipPath;
    if (isUpToDate) {
      return {
        success: true,
        message: `${pluginName} is already at the latest version (${newVersion}).`,
        pluginId,
        newVersion,
        oldVersion,
        alreadyUpToDate: true,
        scope
      };
    }
    versionedPath = await copyPluginToVersionedCache(
      sourcePath,
      pluginId,
      newVersion,
      entry
    );
    const oldVersionPath = installation.installPath;
    updateInstallationPathOnDisk(
      pluginId,
      scope,
      projectPath,
      versionedPath,
      newVersion,
      gitCommitSha
    );
    if (oldVersionPath && oldVersionPath !== versionedPath) {
      const updatedDiskData = loadInstalledPluginsFromDisk();
      const isOldVersionStillReferenced = Object.values(
        updatedDiskData.plugins
      ).some(
        (pluginInstallations) => pluginInstallations.some((inst) => inst.installPath === oldVersionPath)
      );
      if (!isOldVersionStillReferenced) {
        await markPluginVersionOrphaned(oldVersionPath);
      }
    }
    const scopeDesc = projectPath ? `${scope} (${projectPath})` : scope;
    const message = `Plugin "${pluginName}" updated from ${oldVersion || "unknown"} to ${newVersion} for scope ${scopeDesc}. Restart to apply changes.`;
    return {
      success: true,
      message,
      pluginId,
      newVersion,
      oldVersion,
      scope
    };
  } finally {
    if (shouldCleanupSource && sourcePath !== getVersionedCachePath(pluginId, newVersion)) {
      await fs.rm(sourcePath, { recursive: true, force: true });
    }
  }
}
export {
  VALID_INSTALLABLE_SCOPES,
  VALID_UPDATE_SCOPES,
  assertInstallableScope,
  disableAllPluginsOp,
  disablePluginOp,
  enablePluginOp,
  getPluginInstallationFromV2,
  getProjectPathForScope,
  installPluginOp,
  isInstallableScope,
  isPluginEnabledAtProjectScope,
  setPluginEnabledOp,
  uninstallPluginOp,
  updatePluginOp
};
