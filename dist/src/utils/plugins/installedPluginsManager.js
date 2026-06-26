import { dirname, join } from "path";
import { logForDebugging } from "../debug.js";
import { errorMessage, isENOENT, toError } from "../errors.js";
import { getFsImplementation } from "../fsOperations.js";
import { logError } from "../log.js";
import {
  jsonParse,
  jsonStringify,
  writeFileSync_DEPRECATED
} from "../slowOperations.js";
import { getPluginsDirectory } from "./pluginDirectories.js";
import {
  InstalledPluginsFileSchemaV1,
  InstalledPluginsFileSchemaV2
} from "./schemas.js";
import { getOriginalCwd } from "../../bootstrap/state.js";
import { getCwd } from "../cwd.js";
import { getHeadForDir } from "../git/gitFilesystem.js";
import {
  getSettings_DEPRECATED,
  getSettingsForSource
} from "../settings/settings.js";
import { getPluginById } from "./marketplaceManager.js";
import {
  parsePluginIdentifier,
  settingSourceToScope
} from "./pluginIdentifier.js";
import { getPluginCachePath, getVersionedCachePath } from "./pluginLoader.js";
let migrationCompleted = false;
let installedPluginsCacheV2 = null;
let inMemoryInstalledPlugins = null;
function getInstalledPluginsFilePath() {
  return join(getPluginsDirectory(), "installed_plugins.json");
}
function getInstalledPluginsV2FilePath() {
  return join(getPluginsDirectory(), "installed_plugins_v2.json");
}
function clearInstalledPluginsCache() {
  installedPluginsCacheV2 = null;
  inMemoryInstalledPlugins = null;
  logForDebugging("Cleared installed plugins cache");
}
function migrateToSinglePluginFile() {
  if (migrationCompleted) {
    return;
  }
  const fs = getFsImplementation();
  const mainFilePath = getInstalledPluginsFilePath();
  const v2FilePath = getInstalledPluginsV2FilePath();
  try {
    try {
      fs.renameSync(v2FilePath, mainFilePath);
      logForDebugging(
        `Renamed installed_plugins_v2.json to installed_plugins.json`
      );
      const v2Data = loadInstalledPluginsV2();
      cleanupLegacyCache(v2Data);
      migrationCompleted = true;
      return;
    } catch (e) {
      if (!isENOENT(e)) throw e;
    }
    let mainContent;
    try {
      mainContent = fs.readFileSync(mainFilePath, { encoding: "utf-8" });
    } catch (e) {
      if (!isENOENT(e)) throw e;
      migrationCompleted = true;
      return;
    }
    const mainData = jsonParse(mainContent);
    const version = typeof mainData?.version === "number" ? mainData.version : 1;
    if (version === 1) {
      const v1Data = InstalledPluginsFileSchemaV1().parse(mainData);
      const v2Data = migrateV1ToV2(v1Data);
      writeFileSync_DEPRECATED(mainFilePath, jsonStringify(v2Data, null, 2), {
        encoding: "utf-8",
        flush: true
      });
      logForDebugging(
        `Converted installed_plugins.json from V1 to V2 format (${Object.keys(v1Data.plugins).length} plugins)`
      );
      cleanupLegacyCache(v2Data);
    }
    migrationCompleted = true;
  } catch (error) {
    const errorMsg = errorMessage(error);
    logForDebugging(`Failed to migrate plugin files: ${errorMsg}`, {
      level: "error"
    });
    logError(toError(error));
    migrationCompleted = true;
  }
}
function cleanupLegacyCache(v2Data) {
  const fs = getFsImplementation();
  const cachePath = getPluginCachePath();
  try {
    const referencedPaths = /* @__PURE__ */ new Set();
    for (const installations of Object.values(v2Data.plugins)) {
      for (const entry of installations) {
        referencedPaths.add(entry.installPath);
      }
    }
    const entries = fs.readdirSync(cachePath);
    for (const dirent of entries) {
      if (!dirent.isDirectory()) {
        continue;
      }
      const entry = dirent.name;
      const entryPath = join(cachePath, entry);
      const subEntries = fs.readdirSync(entryPath);
      const hasVersionedStructure = subEntries.some((subDirent) => {
        if (!subDirent.isDirectory()) return false;
        const subPath = join(entryPath, subDirent.name);
        const versionEntries = fs.readdirSync(subPath);
        return versionEntries.some((vDirent) => vDirent.isDirectory());
      });
      if (hasVersionedStructure) {
        continue;
      }
      if (!referencedPaths.has(entryPath)) {
        fs.rmSync(entryPath, { recursive: true, force: true });
        logForDebugging(`Cleaned up legacy cache directory: ${entry}`);
      }
    }
  } catch (error) {
    const errorMsg = errorMessage(error);
    logForDebugging(`Failed to clean up legacy cache: ${errorMsg}`, {
      level: "warn"
    });
  }
}
function resetMigrationState() {
  migrationCompleted = false;
}
function readInstalledPluginsFileRaw() {
  const fs = getFsImplementation();
  const filePath = getInstalledPluginsFilePath();
  let fileContent;
  try {
    fileContent = fs.readFileSync(filePath, { encoding: "utf-8" });
  } catch (e) {
    if (isENOENT(e)) {
      return null;
    }
    throw e;
  }
  const data = jsonParse(fileContent);
  const version = typeof data?.version === "number" ? data.version : 1;
  return { version, data };
}
function migrateV1ToV2(v1Data) {
  const v2Plugins = {};
  for (const [pluginId, plugin] of Object.entries(v1Data.plugins)) {
    const versionedCachePath = getVersionedCachePath(pluginId, plugin.version);
    v2Plugins[pluginId] = [
      {
        scope: "user",
        // Default all existing installs to user scope
        installPath: versionedCachePath,
        version: plugin.version,
        installedAt: plugin.installedAt,
        lastUpdated: plugin.lastUpdated,
        gitCommitSha: plugin.gitCommitSha
      }
    ];
  }
  return { version: 2, plugins: v2Plugins };
}
function loadInstalledPluginsV2() {
  if (installedPluginsCacheV2 !== null) {
    return installedPluginsCacheV2;
  }
  const filePath = getInstalledPluginsFilePath();
  try {
    const rawData = readInstalledPluginsFileRaw();
    if (rawData) {
      if (rawData.version === 2) {
        const validated = InstalledPluginsFileSchemaV2().parse(rawData.data);
        installedPluginsCacheV2 = validated;
        logForDebugging(
          `Loaded ${Object.keys(validated.plugins).length} installed plugins from ${filePath}`
        );
        return validated;
      }
      const v1Validated = InstalledPluginsFileSchemaV1().parse(rawData.data);
      const v2Data = migrateV1ToV2(v1Validated);
      installedPluginsCacheV2 = v2Data;
      logForDebugging(
        `Loaded and converted ${Object.keys(v1Validated.plugins).length} plugins from V1 format`
      );
      return v2Data;
    }
    logForDebugging(
      `installed_plugins.json doesn't exist, returning empty V2 object`
    );
    installedPluginsCacheV2 = { version: 2, plugins: {} };
    return installedPluginsCacheV2;
  } catch (error) {
    const errorMsg = errorMessage(error);
    logForDebugging(
      `Failed to load installed_plugins.json: ${errorMsg}. Starting with empty state.`,
      { level: "error" }
    );
    logError(toError(error));
    installedPluginsCacheV2 = { version: 2, plugins: {} };
    return installedPluginsCacheV2;
  }
}
function saveInstalledPluginsV2(data) {
  const fs = getFsImplementation();
  const filePath = getInstalledPluginsFilePath();
  try {
    fs.mkdirSync(getPluginsDirectory());
    const jsonContent = jsonStringify(data, null, 2);
    writeFileSync_DEPRECATED(filePath, jsonContent, {
      encoding: "utf-8",
      flush: true
    });
    installedPluginsCacheV2 = data;
    logForDebugging(
      `Saved ${Object.keys(data.plugins).length} installed plugins to ${filePath}`
    );
  } catch (error) {
    const _errorMsg = errorMessage(error);
    logError(toError(error));
    throw error;
  }
}
function addPluginInstallation(pluginId, scope, installPath, metadata, projectPath) {
  const data = loadInstalledPluginsFromDisk();
  const installations = data.plugins[pluginId] || [];
  const existingIndex = installations.findIndex(
    (entry) => entry.scope === scope && entry.projectPath === projectPath
  );
  const newEntry = {
    scope,
    installPath,
    version: metadata.version,
    installedAt: metadata.installedAt || (/* @__PURE__ */ new Date()).toISOString(),
    lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
    gitCommitSha: metadata.gitCommitSha,
    ...projectPath && { projectPath }
  };
  if (existingIndex >= 0) {
    installations[existingIndex] = newEntry;
    logForDebugging(`Updated installation for ${pluginId} at scope ${scope}`);
  } else {
    installations.push(newEntry);
    logForDebugging(`Added installation for ${pluginId} at scope ${scope}`);
  }
  data.plugins[pluginId] = installations;
  saveInstalledPluginsV2(data);
}
function removePluginInstallation(pluginId, scope, projectPath) {
  const data = loadInstalledPluginsFromDisk();
  const installations = data.plugins[pluginId];
  if (!installations) {
    return;
  }
  data.plugins[pluginId] = installations.filter(
    (entry) => !(entry.scope === scope && entry.projectPath === projectPath)
  );
  if (data.plugins[pluginId].length === 0) {
    delete data.plugins[pluginId];
  }
  saveInstalledPluginsV2(data);
  logForDebugging(`Removed installation for ${pluginId} at scope ${scope}`);
}
function getInMemoryInstalledPlugins() {
  if (inMemoryInstalledPlugins === null) {
    inMemoryInstalledPlugins = loadInstalledPluginsV2();
  }
  return inMemoryInstalledPlugins;
}
function loadInstalledPluginsFromDisk() {
  try {
    const rawData = readInstalledPluginsFileRaw();
    if (rawData) {
      if (rawData.version === 2) {
        return InstalledPluginsFileSchemaV2().parse(rawData.data);
      }
      const v1Data = InstalledPluginsFileSchemaV1().parse(rawData.data);
      return migrateV1ToV2(v1Data);
    }
    return { version: 2, plugins: {} };
  } catch (error) {
    const errorMsg = errorMessage(error);
    logForDebugging(`Failed to load installed plugins from disk: ${errorMsg}`, {
      level: "error"
    });
    return { version: 2, plugins: {} };
  }
}
function updateInstallationPathOnDisk(pluginId, scope, projectPath, newPath, newVersion, gitCommitSha) {
  const diskData = loadInstalledPluginsFromDisk();
  const installations = diskData.plugins[pluginId];
  if (!installations) {
    logForDebugging(
      `Cannot update ${pluginId} on disk: plugin not found in installed plugins`
    );
    return;
  }
  const entry = installations.find(
    (e) => e.scope === scope && e.projectPath === projectPath
  );
  if (entry) {
    entry.installPath = newPath;
    entry.version = newVersion;
    entry.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
    if (gitCommitSha !== void 0) {
      entry.gitCommitSha = gitCommitSha;
    }
    const filePath = getInstalledPluginsFilePath();
    writeFileSync_DEPRECATED(filePath, jsonStringify(diskData, null, 2), {
      encoding: "utf-8",
      flush: true
    });
    installedPluginsCacheV2 = null;
    logForDebugging(
      `Updated ${pluginId} on disk to version ${newVersion} at ${newPath}`
    );
  } else {
    logForDebugging(
      `Cannot update ${pluginId} on disk: no installation for scope ${scope}`
    );
  }
}
function hasPendingUpdates() {
  const memoryState = getInMemoryInstalledPlugins();
  const diskState = loadInstalledPluginsFromDisk();
  for (const [pluginId, diskInstallations] of Object.entries(
    diskState.plugins
  )) {
    const memoryInstallations = memoryState.plugins[pluginId];
    if (!memoryInstallations) continue;
    for (const diskEntry of diskInstallations) {
      const memoryEntry = memoryInstallations.find(
        (m) => m.scope === diskEntry.scope && m.projectPath === diskEntry.projectPath
      );
      if (memoryEntry && memoryEntry.installPath !== diskEntry.installPath) {
        return true;
      }
    }
  }
  return false;
}
function getPendingUpdateCount() {
  let count = 0;
  const memoryState = getInMemoryInstalledPlugins();
  const diskState = loadInstalledPluginsFromDisk();
  for (const [pluginId, diskInstallations] of Object.entries(
    diskState.plugins
  )) {
    const memoryInstallations = memoryState.plugins[pluginId];
    if (!memoryInstallations) continue;
    for (const diskEntry of diskInstallations) {
      const memoryEntry = memoryInstallations.find(
        (m) => m.scope === diskEntry.scope && m.projectPath === diskEntry.projectPath
      );
      if (memoryEntry && memoryEntry.installPath !== diskEntry.installPath) {
        count++;
      }
    }
  }
  return count;
}
function getPendingUpdatesDetails() {
  const updates = [];
  const memoryState = getInMemoryInstalledPlugins();
  const diskState = loadInstalledPluginsFromDisk();
  for (const [pluginId, diskInstallations] of Object.entries(
    diskState.plugins
  )) {
    const memoryInstallations = memoryState.plugins[pluginId];
    if (!memoryInstallations) continue;
    for (const diskEntry of diskInstallations) {
      const memoryEntry = memoryInstallations.find(
        (m) => m.scope === diskEntry.scope && m.projectPath === diskEntry.projectPath
      );
      if (memoryEntry && memoryEntry.installPath !== diskEntry.installPath) {
        updates.push({
          pluginId,
          scope: diskEntry.scope,
          oldVersion: memoryEntry.version || "unknown",
          newVersion: diskEntry.version || "unknown"
        });
      }
    }
  }
  return updates;
}
function resetInMemoryState() {
  inMemoryInstalledPlugins = null;
}
async function initializeVersionedPlugins() {
  migrateToSinglePluginFile();
  try {
    await migrateFromEnabledPlugins();
  } catch (error) {
    logError(error);
  }
  const data = getInMemoryInstalledPlugins();
  logForDebugging(
    `Initialized versioned plugins system with ${Object.keys(data.plugins).length} plugins`
  );
}
function removeAllPluginsForMarketplace(marketplaceName) {
  if (!marketplaceName) {
    return { orphanedPaths: [], removedPluginIds: [] };
  }
  const data = loadInstalledPluginsFromDisk();
  const suffix = `@${marketplaceName}`;
  const orphanedPaths = /* @__PURE__ */ new Set();
  const removedPluginIds = [];
  for (const pluginId of Object.keys(data.plugins)) {
    if (!pluginId.endsWith(suffix)) {
      continue;
    }
    for (const entry of data.plugins[pluginId] ?? []) {
      if (entry.installPath) {
        orphanedPaths.add(entry.installPath);
      }
    }
    delete data.plugins[pluginId];
    removedPluginIds.push(pluginId);
    logForDebugging(
      `Removed installed plugin for marketplace removal: ${pluginId}`
    );
  }
  if (removedPluginIds.length > 0) {
    saveInstalledPluginsV2(data);
  }
  return { orphanedPaths: Array.from(orphanedPaths), removedPluginIds };
}
function isInstallationRelevantToCurrentProject(inst) {
  return inst.scope === "user" || inst.scope === "managed" || inst.projectPath === getOriginalCwd();
}
function isPluginInstalled(pluginId) {
  const v2Data = loadInstalledPluginsV2();
  const installations = v2Data.plugins[pluginId];
  if (!installations || installations.length === 0) {
    return false;
  }
  if (!installations.some(isInstallationRelevantToCurrentProject)) {
    return false;
  }
  return getSettings_DEPRECATED().enabledPlugins?.[pluginId] !== void 0;
}
function isPluginGloballyInstalled(pluginId) {
  const v2Data = loadInstalledPluginsV2();
  const installations = v2Data.plugins[pluginId];
  if (!installations || installations.length === 0) {
    return false;
  }
  const hasGlobalEntry = installations.some(
    (entry) => entry.scope === "user" || entry.scope === "managed"
  );
  if (!hasGlobalEntry) return false;
  return getSettings_DEPRECATED().enabledPlugins?.[pluginId] !== void 0;
}
function addInstalledPlugin(pluginId, metadata, scope = "user", projectPath) {
  const v2Data = loadInstalledPluginsFromDisk();
  const v2Entry = {
    scope,
    installPath: metadata.installPath,
    version: metadata.version,
    installedAt: metadata.installedAt,
    lastUpdated: metadata.lastUpdated,
    gitCommitSha: metadata.gitCommitSha,
    ...projectPath && { projectPath }
  };
  const installations = v2Data.plugins[pluginId] || [];
  const existingIndex = installations.findIndex(
    (entry) => entry.scope === scope && entry.projectPath === projectPath
  );
  const isUpdate = existingIndex >= 0;
  if (isUpdate) {
    installations[existingIndex] = v2Entry;
  } else {
    installations.push(v2Entry);
  }
  v2Data.plugins[pluginId] = installations;
  saveInstalledPluginsV2(v2Data);
  logForDebugging(
    `${isUpdate ? "Updated" : "Added"} installed plugin: ${pluginId} (scope: ${scope})`
  );
}
function removeInstalledPlugin(pluginId) {
  const v2Data = loadInstalledPluginsFromDisk();
  const installations = v2Data.plugins[pluginId];
  if (!installations || installations.length === 0) {
    return void 0;
  }
  const firstInstall = installations[0];
  const metadata = firstInstall ? {
    version: firstInstall.version || "unknown",
    installedAt: firstInstall.installedAt || (/* @__PURE__ */ new Date()).toISOString(),
    lastUpdated: firstInstall.lastUpdated,
    installPath: firstInstall.installPath,
    gitCommitSha: firstInstall.gitCommitSha
  } : void 0;
  delete v2Data.plugins[pluginId];
  saveInstalledPluginsV2(v2Data);
  logForDebugging(`Removed installed plugin: ${pluginId}`);
  return metadata;
}
function deletePluginCache(installPath) {
  const fs = getFsImplementation();
  try {
    fs.rmSync(installPath, { recursive: true, force: true });
    logForDebugging(`Deleted plugin cache at ${installPath}`);
    const cachePath = getPluginCachePath();
    if (installPath.includes("/cache/") && installPath.startsWith(cachePath)) {
      const pluginDir = dirname(installPath);
      if (pluginDir !== cachePath && pluginDir.startsWith(cachePath)) {
        try {
          const contents = fs.readdirSync(pluginDir);
          if (contents.length === 0) {
            fs.rmdirSync(pluginDir);
            logForDebugging(`Deleted empty plugin directory at ${pluginDir}`);
          }
        } catch {
        }
      }
    }
  } catch (error) {
    const errorMsg = errorMessage(error);
    logError(toError(error));
    throw new Error(
      `Failed to delete plugin cache at ${installPath}: ${errorMsg}`
    );
  }
}
async function getGitCommitSha(dirPath) {
  const sha = await getHeadForDir(dirPath);
  return sha ?? void 0;
}
function getPluginVersionFromManifest(pluginCachePath, pluginId) {
  const fs = getFsImplementation();
  const manifestPath = join(pluginCachePath, ".claude-plugin", "plugin.json");
  try {
    const manifestContent = fs.readFileSync(manifestPath, { encoding: "utf-8" });
    const manifest = jsonParse(manifestContent);
    return manifest.version || "unknown";
  } catch {
    logForDebugging(`Could not read version from manifest for ${pluginId}`);
    return "unknown";
  }
}
async function migrateFromEnabledPlugins() {
  const settings = getSettings_DEPRECATED();
  const enabledPlugins = settings.enabledPlugins || {};
  if (Object.keys(enabledPlugins).length === 0) {
    return;
  }
  const rawFileData = readInstalledPluginsFileRaw();
  const fileExists = rawFileData !== null;
  const isV2Format = fileExists && rawFileData?.version === 2;
  if (isV2Format && rawFileData) {
    const existingData = InstalledPluginsFileSchemaV2().safeParse(
      rawFileData.data
    );
    if (existingData?.success) {
      const plugins = existingData.data.plugins;
      const allPluginsExist = Object.keys(enabledPlugins).filter((id) => id.includes("@")).every((id) => {
        const installations = plugins[id];
        return installations && installations.length > 0;
      });
      if (allPluginsExist) {
        logForDebugging("All plugins already exist, skipping migration");
        return;
      }
    }
  }
  logForDebugging(
    fileExists ? "Syncing installed_plugins.json with enabledPlugins from all settings.json files" : "Creating installed_plugins.json from settings.json files"
  );
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const projectPath = getCwd();
  const pluginScopeFromSettings = /* @__PURE__ */ new Map();
  const settingSources = [
    "userSettings",
    "projectSettings",
    "localSettings"
  ];
  for (const source of settingSources) {
    const sourceSettings = getSettingsForSource(source);
    const sourceEnabledPlugins = sourceSettings?.enabledPlugins || {};
    for (const pluginId of Object.keys(sourceEnabledPlugins)) {
      if (!pluginId.includes("@")) continue;
      const scope = settingSourceToScope(source);
      pluginScopeFromSettings.set(pluginId, {
        scope,
        projectPath: scope === "user" ? void 0 : projectPath
      });
    }
  }
  let v2Plugins = {};
  if (fileExists) {
    const existingData = loadInstalledPluginsV2();
    v2Plugins = { ...existingData.plugins };
  }
  let updatedCount = 0;
  let addedCount = 0;
  for (const [pluginId, scopeInfo] of pluginScopeFromSettings) {
    const existingInstallations = v2Plugins[pluginId];
    if (existingInstallations && existingInstallations.length > 0) {
      const existingEntry = existingInstallations[0];
      if (existingEntry && (existingEntry.scope !== scopeInfo.scope || existingEntry.projectPath !== scopeInfo.projectPath)) {
        existingEntry.scope = scopeInfo.scope;
        if (scopeInfo.projectPath) {
          existingEntry.projectPath = scopeInfo.projectPath;
        } else {
          delete existingEntry.projectPath;
        }
        existingEntry.lastUpdated = now;
        updatedCount++;
        logForDebugging(
          `Updated ${pluginId} scope to ${scopeInfo.scope} (settings.json is source of truth)`
        );
      }
    } else {
      const { name: pluginName, marketplace } = parsePluginIdentifier(pluginId);
      if (!pluginName || !marketplace) {
        continue;
      }
      try {
        logForDebugging(
          `Looking up plugin ${pluginId} in marketplace ${marketplace}`
        );
        const pluginInfo = await getPluginById(pluginId);
        if (!pluginInfo) {
          logForDebugging(
            `Plugin ${pluginId} not found in any marketplace, skipping`
          );
          continue;
        }
        const { entry, marketplaceInstallLocation } = pluginInfo;
        let installPath;
        let version = "unknown";
        let gitCommitSha = void 0;
        if (typeof entry.source === "string") {
          installPath = join(marketplaceInstallLocation, entry.source);
          version = getPluginVersionFromManifest(installPath, pluginId);
          gitCommitSha = await getGitCommitSha(installPath);
        } else {
          const cachePath = getPluginCachePath();
          const sanitizedName = pluginName.replace(/[^a-zA-Z0-9-_]/g, "-");
          const pluginCachePath = join(cachePath, sanitizedName);
          let dirEntries;
          try {
            dirEntries = (await getFsImplementation().readdir(pluginCachePath)).map((e) => typeof e === "string" ? e : e.name);
          } catch (e) {
            if (!isENOENT(e)) throw e;
            logForDebugging(
              `External plugin ${pluginId} not in cache, skipping`
            );
            continue;
          }
          installPath = pluginCachePath;
          if (dirEntries.includes(".claude-plugin")) {
            version = getPluginVersionFromManifest(pluginCachePath, pluginId);
          }
          gitCommitSha = await getGitCommitSha(pluginCachePath);
        }
        if (version === "unknown" && entry.version) {
          version = entry.version;
        }
        if (version === "unknown" && gitCommitSha) {
          version = gitCommitSha.substring(0, 12);
        }
        v2Plugins[pluginId] = [
          {
            scope: scopeInfo.scope,
            installPath: getVersionedCachePath(pluginId, version),
            version,
            installedAt: now,
            lastUpdated: now,
            gitCommitSha,
            ...scopeInfo.projectPath && {
              projectPath: scopeInfo.projectPath
            }
          }
        ];
        addedCount++;
        logForDebugging(`Added ${pluginId} with scope ${scopeInfo.scope}`);
      } catch (error) {
        logForDebugging(`Failed to add plugin ${pluginId}: ${error}`);
      }
    }
  }
  if (!fileExists || updatedCount > 0 || addedCount > 0) {
    const v2Data = { version: 2, plugins: v2Plugins };
    saveInstalledPluginsV2(v2Data);
    logForDebugging(
      `Sync completed: ${addedCount} added, ${updatedCount} updated in installed_plugins.json`
    );
  }
}
export {
  addInstalledPlugin,
  addPluginInstallation,
  clearInstalledPluginsCache,
  deletePluginCache,
  getGitCommitSha,
  getInMemoryInstalledPlugins,
  getInstalledPluginsFilePath,
  getInstalledPluginsV2FilePath,
  getPendingUpdateCount,
  getPendingUpdatesDetails,
  hasPendingUpdates,
  initializeVersionedPlugins,
  isInstallationRelevantToCurrentProject,
  isPluginGloballyInstalled,
  isPluginInstalled,
  loadInstalledPluginsFromDisk,
  loadInstalledPluginsV2,
  migrateFromEnabledPlugins,
  migrateToSinglePluginFile,
  removeAllPluginsForMarketplace,
  removeInstalledPlugin,
  removePluginInstallation,
  resetInMemoryState,
  resetMigrationState,
  updateInstallationPathOnDisk
};
