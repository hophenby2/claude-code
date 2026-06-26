import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import figures from "figures";
import * as React from "react";
import { useEffect, useState } from "react";
import { ConfigurableShortcutHint } from "../../components/ConfigurableShortcutHint.js";
import { Byline } from "../../components/design-system/Byline.js";
import { Box, Text } from "../../ink.js";
import { useKeybinding, useKeybindings } from "../../keybindings/useKeybinding.js";
import { count } from "../../utils/array.js";
import { openBrowser } from "../../utils/browser.js";
import { logForDebugging } from "../../utils/debug.js";
import { errorMessage } from "../../utils/errors.js";
import { clearAllCaches } from "../../utils/plugins/cacheUtils.js";
import { formatInstallCount, getInstallCounts } from "../../utils/plugins/installCounts.js";
import { isPluginGloballyInstalled, isPluginInstalled } from "../../utils/plugins/installedPluginsManager.js";
import { createPluginId, formatFailureDetails, formatMarketplaceLoadingErrors, getMarketplaceSourceDisplay, loadMarketplacesWithGracefulDegradation } from "../../utils/plugins/marketplaceHelpers.js";
import { getMarketplace, loadKnownMarketplacesConfig } from "../../utils/plugins/marketplaceManager.js";
import { OFFICIAL_MARKETPLACE_NAME } from "../../utils/plugins/officialMarketplace.js";
import { installPluginFromMarketplace } from "../../utils/plugins/pluginInstallationHelpers.js";
import { isPluginBlockedByPolicy } from "../../utils/plugins/pluginPolicy.js";
import { plural } from "../../utils/stringUtils.js";
import { truncateToWidth } from "../../utils/truncate.js";
import { findPluginOptionsTarget, PluginOptionsFlow } from "./PluginOptionsFlow.js";
import { PluginTrustWarning } from "./PluginTrustWarning.js";
import { buildPluginDetailsMenuOptions, extractGitHubRepo, PluginSelectionKeyHint } from "./pluginDetailsHelpers.js";
import { usePagination } from "./usePagination.js";
function BrowseMarketplace({
  error,
  setError,
  result: _result,
  setResult,
  setViewState: setParentViewState,
  onInstallComplete,
  targetMarketplace,
  targetPlugin
}) {
  const [viewState, setViewState] = useState("marketplace-list");
  const [selectedMarketplace, setSelectedMarketplace] = useState(null);
  const [selectedPlugin, setSelectedPlugin] = useState(null);
  const [marketplaces, setMarketplaces] = useState([]);
  const [availablePlugins, setAvailablePlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installCounts, setInstallCounts] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedForInstall, setSelectedForInstall] = useState(/* @__PURE__ */ new Set());
  const [installingPlugins, setInstallingPlugins] = useState(/* @__PURE__ */ new Set());
  const pagination = usePagination({
    totalItems: availablePlugins.length,
    selectedIndex
  });
  const [detailsMenuIndex, setDetailsMenuIndex] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState(null);
  const [warning, setWarning] = useState(null);
  const handleBack = React.useCallback(() => {
    if (viewState === "plugin-list") {
      if (targetMarketplace) {
        setParentViewState({
          type: "manage-marketplaces",
          targetMarketplace
        });
      } else if (marketplaces.length === 1) {
        setParentViewState({
          type: "menu"
        });
      } else {
        setViewState("marketplace-list");
        setSelectedMarketplace(null);
        setSelectedForInstall(/* @__PURE__ */ new Set());
      }
    } else if (viewState === "plugin-details") {
      setViewState("plugin-list");
      setSelectedPlugin(null);
    } else {
      setParentViewState({
        type: "menu"
      });
    }
  }, [viewState, targetMarketplace, setParentViewState, marketplaces.length]);
  useKeybinding("confirm:no", handleBack, {
    context: "Confirmation"
  });
  useEffect(() => {
    async function loadMarketplaceData() {
      try {
        const config = await loadKnownMarketplacesConfig();
        const {
          marketplaces: marketplaces_0,
          failures
        } = await loadMarketplacesWithGracefulDegradation(config);
        const marketplaceInfos = [];
        for (const {
          name,
          config: marketplaceConfig,
          data: marketplace
        } of marketplaces_0) {
          if (marketplace) {
            const installedFromThisMarketplace = count(marketplace.plugins, (plugin) => isPluginInstalled(createPluginId(plugin.name, name)));
            marketplaceInfos.push({
              name,
              totalPlugins: marketplace.plugins.length,
              installedCount: installedFromThisMarketplace,
              source: getMarketplaceSourceDisplay(marketplaceConfig.source)
            });
          }
        }
        marketplaceInfos.sort((a, b) => {
          if (a.name === "claude-plugin-directory") return -1;
          if (b.name === "claude-plugin-directory") return 1;
          return 0;
        });
        setMarketplaces(marketplaceInfos);
        const successCount = count(marketplaces_0, (m) => m.data !== null);
        const errorResult = formatMarketplaceLoadingErrors(failures, successCount);
        if (errorResult) {
          if (errorResult.type === "warning") {
            setWarning(errorResult.message + ". Showing available marketplaces.");
          } else {
            throw new Error(errorResult.message);
          }
        }
        if (marketplaceInfos.length === 1 && !targetMarketplace && !targetPlugin) {
          const singleMarketplace = marketplaceInfos[0];
          if (singleMarketplace) {
            setSelectedMarketplace(singleMarketplace.name);
            setViewState("plugin-list");
          }
        }
        if (targetPlugin) {
          let foundPlugin = null;
          let foundMarketplace = null;
          for (const [name_0] of Object.entries(config)) {
            const marketplace_0 = await getMarketplace(name_0);
            if (marketplace_0) {
              const plugin_0 = marketplace_0.plugins.find((p) => p.name === targetPlugin);
              if (plugin_0) {
                const pluginId = createPluginId(plugin_0.name, name_0);
                foundPlugin = {
                  entry: plugin_0,
                  marketplaceName: name_0,
                  pluginId,
                  // isPluginGloballyInstalled: only block when user/managed scope
                  // exists (nothing to add). Project/local-scope installs don't
                  // block — user may want to promote to user scope (gh-29997).
                  isInstalled: isPluginGloballyInstalled(pluginId)
                };
                foundMarketplace = name_0;
                break;
              }
            }
          }
          if (foundPlugin && foundMarketplace) {
            const pluginId_0 = foundPlugin.pluginId;
            const globallyInstalled = isPluginGloballyInstalled(pluginId_0);
            if (globallyInstalled) {
              setError(`Plugin '${pluginId_0}' is already installed globally. Use '/plugin' to manage existing plugins.`);
            } else {
              setSelectedMarketplace(foundMarketplace);
              setSelectedPlugin(foundPlugin);
              setViewState("plugin-details");
            }
          } else {
            setError(`Plugin "${targetPlugin}" not found in any marketplace`);
          }
        } else if (targetMarketplace) {
          const marketplaceExists = marketplaceInfos.some((m_0) => m_0.name === targetMarketplace);
          if (marketplaceExists) {
            setSelectedMarketplace(targetMarketplace);
            setViewState("plugin-list");
          } else {
            setError(`Marketplace "${targetMarketplace}" not found`);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load marketplaces");
      } finally {
        setLoading(false);
      }
    }
    void loadMarketplaceData();
  }, [setError, targetMarketplace, targetPlugin]);
  useEffect(() => {
    if (!selectedMarketplace) return;
    let cancelled = false;
    async function loadPluginsForMarketplace(marketplaceName) {
      setLoading(true);
      try {
        const marketplace_1 = await getMarketplace(marketplaceName);
        if (cancelled) return;
        if (!marketplace_1) {
          throw new Error(`Failed to load marketplace: ${marketplaceName}`);
        }
        const installablePlugins = [];
        for (const entry of marketplace_1.plugins) {
          const pluginId_1 = createPluginId(entry.name, marketplaceName);
          if (isPluginBlockedByPolicy(pluginId_1)) continue;
          installablePlugins.push({
            entry,
            marketplaceName,
            pluginId: pluginId_1,
            // Only mark as "installed" when globally scoped (user/managed).
            // Project/local installs don't block — user can add user scope
            // via the plugin-details view (gh-29997).
            isInstalled: isPluginGloballyInstalled(pluginId_1)
          });
        }
        try {
          const counts = await getInstallCounts();
          if (cancelled) return;
          setInstallCounts(counts);
          if (counts) {
            installablePlugins.sort((a_1, b_1) => {
              const countA = counts.get(a_1.pluginId) ?? 0;
              const countB = counts.get(b_1.pluginId) ?? 0;
              if (countA !== countB) return countB - countA;
              return a_1.entry.name.localeCompare(b_1.entry.name);
            });
          } else {
            installablePlugins.sort((a_2, b_2) => a_2.entry.name.localeCompare(b_2.entry.name));
          }
        } catch (error_0) {
          if (cancelled) return;
          logForDebugging(`Failed to fetch install counts: ${errorMessage(error_0)}`);
          installablePlugins.sort((a_0, b_0) => a_0.entry.name.localeCompare(b_0.entry.name));
        }
        setAvailablePlugins(installablePlugins);
        setSelectedIndex(0);
        setSelectedForInstall(/* @__PURE__ */ new Set());
      } catch (err_0) {
        if (cancelled) return;
        setError(err_0 instanceof Error ? err_0.message : "Failed to load plugins");
      } finally {
        setLoading(false);
      }
    }
    void loadPluginsForMarketplace(selectedMarketplace);
    return () => {
      cancelled = true;
    };
  }, [selectedMarketplace, setError]);
  const installSelectedPlugins = async () => {
    if (selectedForInstall.size === 0) return;
    const pluginsToInstall = availablePlugins.filter((p_0) => selectedForInstall.has(p_0.pluginId));
    setInstallingPlugins(new Set(pluginsToInstall.map((p_1) => p_1.pluginId)));
    let successCount_0 = 0;
    let failureCount = 0;
    const newFailedPlugins = [];
    for (const plugin_1 of pluginsToInstall) {
      const result = await installPluginFromMarketplace({
        pluginId: plugin_1.pluginId,
        entry: plugin_1.entry,
        marketplaceName: plugin_1.marketplaceName,
        scope: "user"
      });
      if (result.success) {
        successCount_0++;
      } else {
        failureCount++;
        newFailedPlugins.push({
          name: plugin_1.entry.name,
          reason: result.error
        });
      }
    }
    setInstallingPlugins(/* @__PURE__ */ new Set());
    setSelectedForInstall(/* @__PURE__ */ new Set());
    clearAllCaches();
    if (failureCount === 0) {
      const message = `\u2713 Installed ${successCount_0} ${plural(successCount_0, "plugin")}. Run /reload-plugins to activate.`;
      setResult(message);
    } else if (successCount_0 === 0) {
      setError(`Failed to install: ${formatFailureDetails(newFailedPlugins, true)}`);
    } else {
      const message_0 = `\u2713 Installed ${successCount_0} of ${successCount_0 + failureCount} plugins. Failed: ${formatFailureDetails(newFailedPlugins, false)}. Run /reload-plugins to activate successfully installed plugins.`;
      setResult(message_0);
    }
    if (successCount_0 > 0) {
      if (onInstallComplete) {
        await onInstallComplete();
      }
    }
    setParentViewState({
      type: "menu"
    });
  };
  const handleSinglePluginInstall = async (plugin_2, scope = "user") => {
    setIsInstalling(true);
    setInstallError(null);
    const result_0 = await installPluginFromMarketplace({
      pluginId: plugin_2.pluginId,
      entry: plugin_2.entry,
      marketplaceName: plugin_2.marketplaceName,
      scope
    });
    if (result_0.success) {
      const loaded = await findPluginOptionsTarget(plugin_2.pluginId);
      if (loaded) {
        setIsInstalling(false);
        setViewState({
          type: "plugin-options",
          plugin: loaded,
          pluginId: plugin_2.pluginId
        });
        return;
      }
      setResult(result_0.message);
      if (onInstallComplete) {
        await onInstallComplete();
      }
      setParentViewState({
        type: "menu"
      });
    } else {
      setIsInstalling(false);
      setInstallError(result_0.error);
    }
  };
  useEffect(() => {
    if (error) {
      setResult(error);
    }
  }, [error, setResult]);
  useKeybindings({
    "select:previous": () => {
      if (selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      }
    },
    "select:next": () => {
      if (selectedIndex < marketplaces.length - 1) {
        setSelectedIndex(selectedIndex + 1);
      }
    },
    "select:accept": () => {
      const marketplace_2 = marketplaces[selectedIndex];
      if (marketplace_2) {
        setSelectedMarketplace(marketplace_2.name);
        setViewState("plugin-list");
      }
    }
  }, {
    context: "Select",
    isActive: viewState === "marketplace-list"
  });
  useKeybindings({
    "select:previous": () => {
      if (selectedIndex > 0) {
        pagination.handleSelectionChange(selectedIndex - 1, setSelectedIndex);
      }
    },
    "select:next": () => {
      if (selectedIndex < availablePlugins.length - 1) {
        pagination.handleSelectionChange(selectedIndex + 1, setSelectedIndex);
      }
    },
    "select:accept": () => {
      if (selectedIndex === availablePlugins.length && selectedForInstall.size > 0) {
        void installSelectedPlugins();
      } else if (selectedIndex < availablePlugins.length) {
        const plugin_3 = availablePlugins[selectedIndex];
        if (plugin_3) {
          if (plugin_3.isInstalled) {
            setParentViewState({
              type: "manage-plugins",
              targetPlugin: plugin_3.entry.name,
              targetMarketplace: plugin_3.marketplaceName
            });
          } else {
            setSelectedPlugin(plugin_3);
            setViewState("plugin-details");
            setDetailsMenuIndex(0);
            setInstallError(null);
          }
        }
      }
    }
  }, {
    context: "Select",
    isActive: viewState === "plugin-list"
  });
  useKeybindings({
    "plugin:toggle": () => {
      if (selectedIndex < availablePlugins.length) {
        const plugin_4 = availablePlugins[selectedIndex];
        if (plugin_4 && !plugin_4.isInstalled) {
          const newSelection = new Set(selectedForInstall);
          if (newSelection.has(plugin_4.pluginId)) {
            newSelection.delete(plugin_4.pluginId);
          } else {
            newSelection.add(plugin_4.pluginId);
          }
          setSelectedForInstall(newSelection);
        }
      }
    },
    "plugin:install": () => {
      if (selectedForInstall.size > 0) {
        void installSelectedPlugins();
      }
    }
  }, {
    context: "Plugin",
    isActive: viewState === "plugin-list"
  });
  const detailsMenuOptions = React.useMemo(() => {
    if (!selectedPlugin) return [];
    const hasHomepage = selectedPlugin.entry.homepage;
    const githubRepo = extractGitHubRepo(selectedPlugin);
    return buildPluginDetailsMenuOptions(hasHomepage, githubRepo);
  }, [selectedPlugin]);
  useKeybindings({
    "select:previous": () => {
      if (detailsMenuIndex > 0) {
        setDetailsMenuIndex(detailsMenuIndex - 1);
      }
    },
    "select:next": () => {
      if (detailsMenuIndex < detailsMenuOptions.length - 1) {
        setDetailsMenuIndex(detailsMenuIndex + 1);
      }
    },
    "select:accept": () => {
      if (!selectedPlugin) return;
      const action = detailsMenuOptions[detailsMenuIndex]?.action;
      const hasHomepage_0 = selectedPlugin.entry.homepage;
      const githubRepo_0 = extractGitHubRepo(selectedPlugin);
      if (action === "install-user") {
        void handleSinglePluginInstall(selectedPlugin, "user");
      } else if (action === "install-project") {
        void handleSinglePluginInstall(selectedPlugin, "project");
      } else if (action === "install-local") {
        void handleSinglePluginInstall(selectedPlugin, "local");
      } else if (action === "homepage" && hasHomepage_0) {
        void openBrowser(hasHomepage_0);
      } else if (action === "github" && githubRepo_0) {
        void openBrowser(`https://github.com/${githubRepo_0}`);
      } else if (action === "back") {
        setViewState("plugin-list");
        setSelectedPlugin(null);
      }
    }
  }, {
    context: "Select",
    isActive: viewState === "plugin-details" && !!selectedPlugin
  });
  if (typeof viewState === "object" && viewState.type === "plugin-options") {
    let finish = function(msg) {
      setResult(msg);
      if (onInstallComplete) {
        void onInstallComplete();
      }
      setParentViewState({
        type: "menu"
      });
    };
    const {
      plugin: plugin_5,
      pluginId: pluginId_2
    } = viewState;
    return /* @__PURE__ */ jsx(PluginOptionsFlow, { plugin: plugin_5, pluginId: pluginId_2, onDone: (outcome, detail) => {
      switch (outcome) {
        case "configured":
          finish(`\u2713 Installed and configured ${plugin_5.name}. Run /reload-plugins to apply.`);
          break;
        case "skipped":
          finish(`\u2713 Installed ${plugin_5.name}. Run /reload-plugins to apply.`);
          break;
        case "error":
          finish(`Installed but failed to save config: ${detail}`);
          break;
      }
    } });
  }
  if (loading) {
    return /* @__PURE__ */ jsx(Text, { children: "Loading\u2026" });
  }
  if (error) {
    return /* @__PURE__ */ jsx(Text, { color: "error", children: error });
  }
  if (viewState === "marketplace-list") {
    if (marketplaces.length === 0) {
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Select marketplace" }) }),
        /* @__PURE__ */ jsx(Text, { children: "No marketplaces configured." }),
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Add a marketplace first using ",
          "'Add marketplace'",
          "."
        ] }),
        /* @__PURE__ */ jsx(Box, { marginTop: 1, paddingLeft: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "go back" }) }) })
      ] });
    }
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Select marketplace" }) }),
      warning && /* @__PURE__ */ jsx(Box, { marginBottom: 1, flexDirection: "column", children: /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
        figures.warning,
        " ",
        warning
      ] }) }),
      marketplaces.map((marketplace_3, index) => /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: index < marketplaces.length - 1 ? 1 : 0, children: [
        /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { color: selectedIndex === index ? "suggestion" : void 0, children: [
          selectedIndex === index ? figures.pointer : " ",
          " ",
          marketplace_3.name
        ] }) }),
        /* @__PURE__ */ jsx(Box, { marginLeft: 2, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          marketplace_3.totalPlugins,
          " ",
          plural(marketplace_3.totalPlugins, "plugin"),
          " available",
          marketplace_3.installedCount > 0 && ` \xB7 ${marketplace_3.installedCount} already installed`,
          marketplace_3.source && ` \xB7 ${marketplace_3.source}`
        ] }) })
      ] }, marketplace_3.name)),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Select", fallback: "Enter", description: "select" }),
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "go back" })
      ] }) }) })
    ] });
  }
  if (viewState === "plugin-details" && selectedPlugin) {
    const hasHomepage_1 = selectedPlugin.entry.homepage;
    const githubRepo_1 = extractGitHubRepo(selectedPlugin);
    const menuOptions = buildPluginDetailsMenuOptions(hasHomepage_1, githubRepo_1);
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Plugin Details" }) }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: selectedPlugin.entry.name }),
        selectedPlugin.entry.version && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Version: ",
          selectedPlugin.entry.version
        ] }),
        selectedPlugin.entry.description && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { children: selectedPlugin.entry.description }) }),
        selectedPlugin.entry.author && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "By:",
          " ",
          typeof selectedPlugin.entry.author === "string" ? selectedPlugin.entry.author : selectedPlugin.entry.author.name
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Will install:" }),
        selectedPlugin.entry.commands && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "\xB7 Commands:",
          " ",
          Array.isArray(selectedPlugin.entry.commands) ? selectedPlugin.entry.commands.join(", ") : Object.keys(selectedPlugin.entry.commands).join(", ")
        ] }),
        selectedPlugin.entry.agents && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "\xB7 Agents:",
          " ",
          Array.isArray(selectedPlugin.entry.agents) ? selectedPlugin.entry.agents.join(", ") : Object.keys(selectedPlugin.entry.agents).join(", ")
        ] }),
        selectedPlugin.entry.hooks && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "\xB7 Hooks: ",
          Object.keys(selectedPlugin.entry.hooks).join(", ")
        ] }),
        selectedPlugin.entry.mcpServers && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "\xB7 MCP Servers:",
          " ",
          Array.isArray(selectedPlugin.entry.mcpServers) ? selectedPlugin.entry.mcpServers.join(", ") : typeof selectedPlugin.entry.mcpServers === "object" ? Object.keys(selectedPlugin.entry.mcpServers).join(", ") : "configured"
        ] }),
        !selectedPlugin.entry.commands && !selectedPlugin.entry.agents && !selectedPlugin.entry.hooks && !selectedPlugin.entry.mcpServers && /* @__PURE__ */ jsx(Fragment, { children: typeof selectedPlugin.entry.source === "object" && "source" in selectedPlugin.entry.source && (selectedPlugin.entry.source.source === "github" || selectedPlugin.entry.source.source === "url" || selectedPlugin.entry.source.source === "npm" || selectedPlugin.entry.source.source === "pip") ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\xB7 Component summary not available for remote plugin" }) : (
          // TODO: Actually scan local plugin directories to show real components
          // This would require accessing the filesystem to check for:
          // - commands/ directory and list files
          // - agents/ directory and list files
          // - hooks/ directory and list files
          // - .mcp.json or mcp-servers.json files
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\xB7 Components will be discovered at installation" })
        ) })
      ] }),
      /* @__PURE__ */ jsx(PluginTrustWarning, {}),
      installError && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { color: "error", children: [
        "Error: ",
        installError
      ] }) }),
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: menuOptions.map((option, index_0) => /* @__PURE__ */ jsxs(Box, { children: [
        detailsMenuIndex === index_0 && /* @__PURE__ */ jsx(Text, { children: "> " }),
        detailsMenuIndex !== index_0 && /* @__PURE__ */ jsx(Text, { children: "  " }),
        /* @__PURE__ */ jsx(Text, { bold: detailsMenuIndex === index_0, children: isInstalling && option.action === "install" ? "Installing\u2026" : option.label })
      ] }, option.action)) }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, paddingLeft: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Select", fallback: "Enter", description: "select" }),
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "back" })
      ] }) }) })
    ] });
  }
  if (availablePlugins.length === 0) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Install plugins" }) }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "No new plugins available to install." }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "All plugins from this marketplace are already installed." }),
      /* @__PURE__ */ jsx(Box, { marginLeft: 3, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "go back" }) }) })
    ] });
  }
  const visiblePlugins = pagination.getVisibleItems(availablePlugins);
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Install Plugins" }) }),
    pagination.scrollPosition.canScrollUp && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " ",
      figures.arrowUp,
      " more above"
    ] }) }),
    visiblePlugins.map((plugin_6, visibleIndex) => {
      const actualIndex = pagination.toActualIndex(visibleIndex);
      const isSelected = selectedIndex === actualIndex;
      const isSelectedForInstall = selectedForInstall.has(plugin_6.pluginId);
      const isInstalling_0 = installingPlugins.has(plugin_6.pluginId);
      const isLast = visibleIndex === visiblePlugins.length - 1;
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: isLast && !error ? 0 : 1, children: [
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsxs(Text, { color: isSelected ? "suggestion" : void 0, children: [
            isSelected ? figures.pointer : " ",
            " "
          ] }),
          /* @__PURE__ */ jsxs(Text, { color: plugin_6.isInstalled ? "success" : void 0, children: [
            plugin_6.isInstalled ? figures.tick : isInstalling_0 ? figures.ellipsis : isSelectedForInstall ? figures.radioOn : figures.radioOff,
            " ",
            plugin_6.entry.name,
            plugin_6.entry.category && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
              " [",
              plugin_6.entry.category,
              "]"
            ] }),
            plugin_6.entry.tags?.includes("community-managed") && /* @__PURE__ */ jsx(Text, { dimColor: true, children: " [Community Managed]" }),
            plugin_6.isInstalled && /* @__PURE__ */ jsx(Text, { dimColor: true, children: " (installed)" }),
            installCounts && selectedMarketplace === OFFICIAL_MARKETPLACE_NAME && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
              " \xB7 ",
              formatInstallCount(installCounts.get(plugin_6.pluginId) ?? 0),
              " ",
              "installs"
            ] })
          ] })
        ] }),
        plugin_6.entry.description && /* @__PURE__ */ jsxs(Box, { marginLeft: 4, children: [
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: truncateToWidth(plugin_6.entry.description, 60) }),
          plugin_6.entry.version && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            " \xB7 v",
            plugin_6.entry.version
          ] })
        ] })
      ] }, plugin_6.pluginId);
    }),
    pagination.scrollPosition.canScrollDown && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " ",
      figures.arrowDown,
      " more below"
    ] }) }),
    error && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { color: "error", children: [
      figures.cross,
      " ",
      error
    ] }) }),
    /* @__PURE__ */ jsx(PluginSelectionKeyHint, { hasSelection: selectedForInstall.size > 0 })
  ] });
}
export {
  BrowseMarketplace
};
