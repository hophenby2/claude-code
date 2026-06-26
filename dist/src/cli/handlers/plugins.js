import figures from "figures";
import { basename, dirname } from "path";
import { setUseCoworkPlugins } from "../../bootstrap/state.js";
import {
  logEvent
} from "../../services/analytics/index.js";
import {
  disableAllPlugins,
  disablePlugin,
  enablePlugin,
  installPlugin,
  uninstallPlugin,
  updatePluginCli,
  VALID_INSTALLABLE_SCOPES,
  VALID_UPDATE_SCOPES
} from "../../services/plugins/pluginCliCommands.js";
import { getPluginErrorMessage } from "../../types/plugin.js";
import { errorMessage } from "../../utils/errors.js";
import { logError } from "../../utils/log.js";
import { clearAllCaches } from "../../utils/plugins/cacheUtils.js";
import { getInstallCounts } from "../../utils/plugins/installCounts.js";
import {
  isPluginInstalled,
  loadInstalledPluginsV2
} from "../../utils/plugins/installedPluginsManager.js";
import {
  createPluginId,
  loadMarketplacesWithGracefulDegradation
} from "../../utils/plugins/marketplaceHelpers.js";
import {
  addMarketplaceSource,
  loadKnownMarketplacesConfig,
  refreshAllMarketplaces,
  refreshMarketplace,
  removeMarketplaceSource,
  saveMarketplaceToSettings
} from "../../utils/plugins/marketplaceManager.js";
import { loadPluginMcpServers } from "../../utils/plugins/mcpPluginIntegration.js";
import { parseMarketplaceInput } from "../../utils/plugins/parseMarketplaceInput.js";
import {
  parsePluginIdentifier,
  scopeToSettingSource
} from "../../utils/plugins/pluginIdentifier.js";
import { loadAllPlugins } from "../../utils/plugins/pluginLoader.js";
import {
  validateManifest,
  validatePluginContents
} from "../../utils/plugins/validatePlugin.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { plural } from "../../utils/stringUtils.js";
import { cliError, cliOk } from "../exit.js";
function handleMarketplaceError(error, action) {
  logError(error);
  cliError(`${figures.cross} Failed to ${action}: ${errorMessage(error)}`);
}
function printValidationResult(result) {
  if (result.errors.length > 0) {
    console.log(
      `${figures.cross} Found ${result.errors.length} ${plural(result.errors.length, "error")}:
`
    );
    result.errors.forEach((error) => {
      console.log(`  ${figures.pointer} ${error.path}: ${error.message}`);
    });
    console.log("");
  }
  if (result.warnings.length > 0) {
    console.log(
      `${figures.warning} Found ${result.warnings.length} ${plural(result.warnings.length, "warning")}:
`
    );
    result.warnings.forEach((warning) => {
      console.log(`  ${figures.pointer} ${warning.path}: ${warning.message}`);
    });
    console.log("");
  }
}
async function pluginValidateHandler(manifestPath, options) {
  if (options.cowork) setUseCoworkPlugins(true);
  try {
    const result = await validateManifest(manifestPath);
    console.log(`Validating ${result.fileType} manifest: ${result.filePath}
`);
    printValidationResult(result);
    let contentResults = [];
    if (result.fileType === "plugin") {
      const manifestDir = dirname(result.filePath);
      if (basename(manifestDir) === ".claude-plugin") {
        contentResults = await validatePluginContents(dirname(manifestDir));
        for (const r of contentResults) {
          console.log(`Validating ${r.fileType}: ${r.filePath}
`);
          printValidationResult(r);
        }
      }
    }
    const allSuccess = result.success && contentResults.every((r) => r.success);
    const hasWarnings = result.warnings.length > 0 || contentResults.some((r) => r.warnings.length > 0);
    if (allSuccess) {
      cliOk(
        hasWarnings ? `${figures.tick} Validation passed with warnings` : `${figures.tick} Validation passed`
      );
    } else {
      console.log(`${figures.cross} Validation failed`);
      process.exit(1);
    }
  } catch (error) {
    logError(error);
    console.error(
      `${figures.cross} Unexpected error during validation: ${errorMessage(error)}`
    );
    process.exit(2);
  }
}
async function pluginListHandler(options) {
  if (options.cowork) setUseCoworkPlugins(true);
  logEvent("tengu_plugin_list_command", {});
  const installedData = loadInstalledPluginsV2();
  const { getPluginEditableScopes } = await import("../../utils/plugins/pluginStartupCheck.js");
  const enabledPlugins = getPluginEditableScopes();
  const pluginIds = Object.keys(installedData.plugins);
  const {
    enabled: loadedEnabled,
    disabled: loadedDisabled,
    errors: loadErrors
  } = await loadAllPlugins();
  const allLoadedPlugins = [...loadedEnabled, ...loadedDisabled];
  const inlinePlugins = allLoadedPlugins.filter(
    (p) => p.source.endsWith("@inline")
  );
  const inlineLoadErrors = loadErrors.filter(
    (e) => e.source.endsWith("@inline") || e.source.startsWith("inline[")
  );
  if (options.json) {
    const loadedPluginMap = new Map(allLoadedPlugins.map((p) => [p.source, p]));
    const plugins = [];
    for (const pluginId of pluginIds.sort()) {
      const installations = installedData.plugins[pluginId];
      if (!installations || installations.length === 0) continue;
      const pluginName = parsePluginIdentifier(pluginId).name;
      const pluginErrors = loadErrors.filter(
        (e) => e.source === pluginId || "plugin" in e && e.plugin === pluginName
      ).map(getPluginErrorMessage);
      for (const installation of installations) {
        const loadedPlugin = loadedPluginMap.get(pluginId);
        let mcpServers;
        if (loadedPlugin) {
          const servers = loadedPlugin.mcpServers || await loadPluginMcpServers(loadedPlugin);
          if (servers && Object.keys(servers).length > 0) {
            mcpServers = servers;
          }
        }
        plugins.push({
          id: pluginId,
          version: installation.version || "unknown",
          scope: installation.scope,
          enabled: enabledPlugins.has(pluginId),
          installPath: installation.installPath,
          installedAt: installation.installedAt,
          lastUpdated: installation.lastUpdated,
          projectPath: installation.projectPath,
          mcpServers,
          errors: pluginErrors.length > 0 ? pluginErrors : void 0
        });
      }
    }
    for (const p of inlinePlugins) {
      const servers = p.mcpServers || await loadPluginMcpServers(p);
      const pErrors = inlineLoadErrors.filter(
        (e) => e.source === p.source || "plugin" in e && e.plugin === p.name
      ).map(getPluginErrorMessage);
      plugins.push({
        id: p.source,
        version: p.manifest.version ?? "unknown",
        scope: "session",
        enabled: p.enabled !== false,
        installPath: p.path,
        mcpServers: servers && Object.keys(servers).length > 0 ? servers : void 0,
        errors: pErrors.length > 0 ? pErrors : void 0
      });
    }
    for (const e of inlineLoadErrors.filter(
      (e2) => e2.source.startsWith("inline[")
    )) {
      plugins.push({
        id: e.source,
        version: "unknown",
        scope: "session",
        enabled: false,
        installPath: "path" in e ? e.path : "",
        errors: [getPluginErrorMessage(e)]
      });
    }
    if (options.available) {
      const available = [];
      try {
        const [config, installCounts] = await Promise.all([
          loadKnownMarketplacesConfig(),
          getInstallCounts()
        ]);
        const { marketplaces } = await loadMarketplacesWithGracefulDegradation(config);
        for (const {
          name: marketplaceName,
          data: marketplace
        } of marketplaces) {
          if (marketplace) {
            for (const entry of marketplace.plugins) {
              const pluginId = createPluginId(entry.name, marketplaceName);
              if (!isPluginInstalled(pluginId)) {
                available.push({
                  pluginId,
                  name: entry.name,
                  description: entry.description,
                  marketplaceName,
                  version: entry.version,
                  source: entry.source,
                  installCount: installCounts?.get(pluginId)
                });
              }
            }
          }
        }
      } catch {
      }
      cliOk(jsonStringify({ installed: plugins, available }, null, 2));
    } else {
      cliOk(jsonStringify(plugins, null, 2));
    }
  }
  if (pluginIds.length === 0 && inlinePlugins.length === 0) {
    if (inlineLoadErrors.length === 0) {
      cliOk(
        "No plugins installed. Use `claude plugin install` to install a plugin."
      );
    }
  }
  if (pluginIds.length > 0) {
    console.log("Installed plugins:\n");
  }
  for (const pluginId of pluginIds.sort()) {
    const installations = installedData.plugins[pluginId];
    if (!installations || installations.length === 0) continue;
    const pluginName = parsePluginIdentifier(pluginId).name;
    const pluginErrors = loadErrors.filter(
      (e) => e.source === pluginId || "plugin" in e && e.plugin === pluginName
    );
    for (const installation of installations) {
      const isEnabled = enabledPlugins.has(pluginId);
      const status = pluginErrors.length > 0 ? `${figures.cross} failed to load` : isEnabled ? `${figures.tick} enabled` : `${figures.cross} disabled`;
      const version = installation.version || "unknown";
      const scope = installation.scope;
      console.log(`  ${figures.pointer} ${pluginId}`);
      console.log(`    Version: ${version}`);
      console.log(`    Scope: ${scope}`);
      console.log(`    Status: ${status}`);
      for (const error of pluginErrors) {
        console.log(`    Error: ${getPluginErrorMessage(error)}`);
      }
      console.log("");
    }
  }
  if (inlinePlugins.length > 0 || inlineLoadErrors.length > 0) {
    console.log("Session-only plugins (--plugin-dir):\n");
    for (const p of inlinePlugins) {
      const pErrors = inlineLoadErrors.filter(
        (e) => e.source === p.source || "plugin" in e && e.plugin === p.name
      );
      const status = pErrors.length > 0 ? `${figures.cross} loaded with errors` : `${figures.tick} loaded`;
      console.log(`  ${figures.pointer} ${p.source}`);
      console.log(`    Version: ${p.manifest.version ?? "unknown"}`);
      console.log(`    Path: ${p.path}`);
      console.log(`    Status: ${status}`);
      for (const e of pErrors) {
        console.log(`    Error: ${getPluginErrorMessage(e)}`);
      }
      console.log("");
    }
    for (const e of inlineLoadErrors.filter(
      (e2) => e2.source.startsWith("inline[")
    )) {
      console.log(
        `  ${figures.pointer} ${e.source}: ${figures.cross} ${getPluginErrorMessage(e)}
`
      );
    }
  }
  cliOk();
}
async function marketplaceAddHandler(source, options) {
  if (options.cowork) setUseCoworkPlugins(true);
  try {
    const parsed = await parseMarketplaceInput(source);
    if (!parsed) {
      cliError(
        `${figures.cross} Invalid marketplace source format. Try: owner/repo, https://..., or ./path`
      );
    }
    if ("error" in parsed) {
      cliError(`${figures.cross} ${parsed.error}`);
    }
    const scope = options.scope ?? "user";
    if (scope !== "user" && scope !== "project" && scope !== "local") {
      cliError(
        `${figures.cross} Invalid scope '${scope}'. Use: user, project, or local`
      );
    }
    const settingSource = scopeToSettingSource(scope);
    let marketplaceSource = parsed;
    if (options.sparse && options.sparse.length > 0) {
      if (marketplaceSource.source === "github" || marketplaceSource.source === "git") {
        marketplaceSource = {
          ...marketplaceSource,
          sparsePaths: options.sparse
        };
      } else {
        cliError(
          `${figures.cross} --sparse is only supported for github and git marketplace sources (got: ${marketplaceSource.source})`
        );
      }
    }
    console.log("Adding marketplace...");
    const { name, alreadyMaterialized, resolvedSource } = await addMarketplaceSource(marketplaceSource, (message) => {
      console.log(message);
    });
    saveMarketplaceToSettings(name, { source: resolvedSource }, settingSource);
    clearAllCaches();
    let sourceType = marketplaceSource.source;
    if (marketplaceSource.source === "github") {
      sourceType = marketplaceSource.repo;
    }
    logEvent("tengu_marketplace_added", {
      source_type: sourceType
    });
    cliOk(
      alreadyMaterialized ? `${figures.tick} Marketplace '${name}' already on disk \u2014 declared in ${scope} settings` : `${figures.tick} Successfully added marketplace: ${name} (declared in ${scope} settings)`
    );
  } catch (error) {
    handleMarketplaceError(error, "add marketplace");
  }
}
async function marketplaceListHandler(options) {
  if (options.cowork) setUseCoworkPlugins(true);
  try {
    const config = await loadKnownMarketplacesConfig();
    const names = Object.keys(config);
    if (options.json) {
      const marketplaces = names.sort().map((name) => {
        const marketplace = config[name];
        const source = marketplace?.source;
        return {
          name,
          source: source?.source,
          ...source?.source === "github" && { repo: source.repo },
          ...source?.source === "git" && { url: source.url },
          ...source?.source === "url" && { url: source.url },
          ...source?.source === "directory" && { path: source.path },
          ...source?.source === "file" && { path: source.path },
          installLocation: marketplace?.installLocation
        };
      });
      cliOk(jsonStringify(marketplaces, null, 2));
    }
    if (names.length === 0) {
      cliOk("No marketplaces configured");
    }
    console.log("Configured marketplaces:\n");
    names.forEach((name) => {
      const marketplace = config[name];
      console.log(`  ${figures.pointer} ${name}`);
      if (marketplace?.source) {
        const src = marketplace.source;
        if (src.source === "github") {
          console.log(`    Source: GitHub (${src.repo})`);
        } else if (src.source === "git") {
          console.log(`    Source: Git (${src.url})`);
        } else if (src.source === "url") {
          console.log(`    Source: URL (${src.url})`);
        } else if (src.source === "directory") {
          console.log(`    Source: Directory (${src.path})`);
        } else if (src.source === "file") {
          console.log(`    Source: File (${src.path})`);
        }
      }
      console.log("");
    });
    cliOk();
  } catch (error) {
    handleMarketplaceError(error, "list marketplaces");
  }
}
async function marketplaceRemoveHandler(name, options) {
  if (options.cowork) setUseCoworkPlugins(true);
  try {
    await removeMarketplaceSource(name);
    clearAllCaches();
    logEvent("tengu_marketplace_removed", {
      marketplace_name: name
    });
    cliOk(`${figures.tick} Successfully removed marketplace: ${name}`);
  } catch (error) {
    handleMarketplaceError(error, "remove marketplace");
  }
}
async function marketplaceUpdateHandler(name, options) {
  if (options.cowork) setUseCoworkPlugins(true);
  try {
    if (name) {
      console.log(`Updating marketplace: ${name}...`);
      await refreshMarketplace(name, (message) => {
        console.log(message);
      });
      clearAllCaches();
      logEvent("tengu_marketplace_updated", {
        marketplace_name: name
      });
      cliOk(`${figures.tick} Successfully updated marketplace: ${name}`);
    } else {
      const config = await loadKnownMarketplacesConfig();
      const marketplaceNames = Object.keys(config);
      if (marketplaceNames.length === 0) {
        cliOk("No marketplaces configured");
      }
      console.log(`Updating ${marketplaceNames.length} marketplace(s)...`);
      await refreshAllMarketplaces();
      clearAllCaches();
      logEvent("tengu_marketplace_updated_all", {
        count: marketplaceNames.length
      });
      cliOk(
        `${figures.tick} Successfully updated ${marketplaceNames.length} marketplace(s)`
      );
    }
  } catch (error) {
    handleMarketplaceError(error, "update marketplace(s)");
  }
}
async function pluginInstallHandler(plugin, options) {
  if (options.cowork) setUseCoworkPlugins(true);
  const scope = options.scope || "user";
  if (options.cowork && scope !== "user") {
    cliError("--cowork can only be used with user scope");
  }
  if (!VALID_INSTALLABLE_SCOPES.includes(
    scope
  )) {
    cliError(
      `Invalid scope: ${scope}. Must be one of: ${VALID_INSTALLABLE_SCOPES.join(", ")}.`
    );
  }
  const { name, marketplace } = parsePluginIdentifier(plugin);
  logEvent("tengu_plugin_install_command", {
    _PROTO_plugin_name: name,
    ...marketplace && {
      _PROTO_marketplace_name: marketplace
    },
    scope
  });
  await installPlugin(plugin, scope);
}
async function pluginUninstallHandler(plugin, options) {
  if (options.cowork) setUseCoworkPlugins(true);
  const scope = options.scope || "user";
  if (options.cowork && scope !== "user") {
    cliError("--cowork can only be used with user scope");
  }
  if (!VALID_INSTALLABLE_SCOPES.includes(
    scope
  )) {
    cliError(
      `Invalid scope: ${scope}. Must be one of: ${VALID_INSTALLABLE_SCOPES.join(", ")}.`
    );
  }
  const { name, marketplace } = parsePluginIdentifier(plugin);
  logEvent("tengu_plugin_uninstall_command", {
    _PROTO_plugin_name: name,
    ...marketplace && {
      _PROTO_marketplace_name: marketplace
    },
    scope
  });
  await uninstallPlugin(
    plugin,
    scope,
    options.keepData
  );
}
async function pluginEnableHandler(plugin, options) {
  if (options.cowork) setUseCoworkPlugins(true);
  let scope;
  if (options.scope) {
    if (!VALID_INSTALLABLE_SCOPES.includes(
      options.scope
    )) {
      cliError(
        `Invalid scope "${options.scope}". Valid scopes: ${VALID_INSTALLABLE_SCOPES.join(", ")}`
      );
    }
    scope = options.scope;
  }
  if (options.cowork && scope !== void 0 && scope !== "user") {
    cliError("--cowork can only be used with user scope");
  }
  if (options.cowork && scope === void 0) {
    scope = "user";
  }
  const { name, marketplace } = parsePluginIdentifier(plugin);
  logEvent("tengu_plugin_enable_command", {
    _PROTO_plugin_name: name,
    ...marketplace && {
      _PROTO_marketplace_name: marketplace
    },
    scope: scope ?? "auto"
  });
  await enablePlugin(plugin, scope);
}
async function pluginDisableHandler(plugin, options) {
  if (options.all && plugin) {
    cliError("Cannot use --all with a specific plugin");
  }
  if (!options.all && !plugin) {
    cliError("Please specify a plugin name or use --all to disable all plugins");
  }
  if (options.cowork) setUseCoworkPlugins(true);
  if (options.all) {
    if (options.scope) {
      cliError("Cannot use --scope with --all");
    }
    logEvent("tengu_plugin_disable_command", {});
    await disableAllPlugins();
    return;
  }
  let scope;
  if (options.scope) {
    if (!VALID_INSTALLABLE_SCOPES.includes(
      options.scope
    )) {
      cliError(
        `Invalid scope "${options.scope}". Valid scopes: ${VALID_INSTALLABLE_SCOPES.join(", ")}`
      );
    }
    scope = options.scope;
  }
  if (options.cowork && scope !== void 0 && scope !== "user") {
    cliError("--cowork can only be used with user scope");
  }
  if (options.cowork && scope === void 0) {
    scope = "user";
  }
  const { name, marketplace } = parsePluginIdentifier(plugin);
  logEvent("tengu_plugin_disable_command", {
    _PROTO_plugin_name: name,
    ...marketplace && {
      _PROTO_marketplace_name: marketplace
    },
    scope: scope ?? "auto"
  });
  await disablePlugin(plugin, scope);
}
async function pluginUpdateHandler(plugin, options) {
  if (options.cowork) setUseCoworkPlugins(true);
  const { name, marketplace } = parsePluginIdentifier(plugin);
  logEvent("tengu_plugin_update_command", {
    _PROTO_plugin_name: name,
    ...marketplace && {
      _PROTO_marketplace_name: marketplace
    }
  });
  let scope = "user";
  if (options.scope) {
    if (!VALID_UPDATE_SCOPES.includes(
      options.scope
    )) {
      cliError(
        `Invalid scope "${options.scope}". Valid scopes: ${VALID_UPDATE_SCOPES.join(", ")}`
      );
    }
    scope = options.scope;
  }
  if (options.cowork && scope !== "user") {
    cliError("--cowork can only be used with user scope");
  }
  await updatePluginCli(plugin, scope);
}
export {
  VALID_INSTALLABLE_SCOPES,
  VALID_UPDATE_SCOPES,
  handleMarketplaceError,
  marketplaceAddHandler,
  marketplaceListHandler,
  marketplaceRemoveHandler,
  marketplaceUpdateHandler,
  pluginDisableHandler,
  pluginEnableHandler,
  pluginInstallHandler,
  pluginListHandler,
  pluginUninstallHandler,
  pluginUpdateHandler,
  pluginValidateHandler
};
