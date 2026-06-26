import { jsx, jsxs } from "react/jsx-runtime";
import figures from "figures";
import * as fs from "fs/promises";
import * as path from "path";
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfigurableShortcutHint } from "../../components/ConfigurableShortcutHint.js";
import { Byline } from "../../components/design-system/Byline.js";
import { MCPRemoteServerMenu } from "../../components/mcp/MCPRemoteServerMenu.js";
import { MCPStdioServerMenu } from "../../components/mcp/MCPStdioServerMenu.js";
import { MCPToolDetailView } from "../../components/mcp/MCPToolDetailView.js";
import { MCPToolListView } from "../../components/mcp/MCPToolListView.js";
import { SearchBox } from "../../components/SearchBox.js";
import { useSearchInput } from "../../hooks/useSearchInput.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { Box, Text, useInput, useTerminalFocus } from "../../ink.js";
import { useKeybinding, useKeybindings } from "../../keybindings/useKeybinding.js";
import { getBuiltinPluginDefinition } from "../../plugins/builtinPlugins.js";
import { useMcpToggleEnabled } from "../../services/mcp/MCPConnectionManager.js";
import { filterToolsByServer } from "../../services/mcp/utils.js";
import { disablePluginOp, enablePluginOp, getPluginInstallationFromV2, isInstallableScope, isPluginEnabledAtProjectScope, uninstallPluginOp, updatePluginOp } from "../../services/plugins/pluginOperations.js";
import { useAppState } from "../../state/AppState.js";
import { count } from "../../utils/array.js";
import { openBrowser } from "../../utils/browser.js";
import { logForDebugging } from "../../utils/debug.js";
import { errorMessage, toError } from "../../utils/errors.js";
import { logError } from "../../utils/log.js";
import { clearAllCaches } from "../../utils/plugins/cacheUtils.js";
import { loadInstalledPluginsV2 } from "../../utils/plugins/installedPluginsManager.js";
import { getMarketplace } from "../../utils/plugins/marketplaceManager.js";
import { isMcpbSource, loadMcpbFile } from "../../utils/plugins/mcpbHandler.js";
import { getPluginDataDirSize, pluginDataDirPath } from "../../utils/plugins/pluginDirectories.js";
import { getFlaggedPlugins, markFlaggedPluginsSeen, removeFlaggedPlugin } from "../../utils/plugins/pluginFlagging.js";
import { parsePluginIdentifier } from "../../utils/plugins/pluginIdentifier.js";
import { loadAllPlugins } from "../../utils/plugins/pluginLoader.js";
import { loadPluginOptions, savePluginOptions } from "../../utils/plugins/pluginOptionsStorage.js";
import { isPluginBlockedByPolicy } from "../../utils/plugins/pluginPolicy.js";
import { getPluginEditableScopes } from "../../utils/plugins/pluginStartupCheck.js";
import { getSettings_DEPRECATED, getSettingsForSource, updateSettingsForSource } from "../../utils/settings/settings.js";
import { jsonParse } from "../../utils/slowOperations.js";
import { plural } from "../../utils/stringUtils.js";
import { formatErrorMessage, getErrorGuidance } from "./PluginErrors.js";
import { PluginOptionsDialog } from "./PluginOptionsDialog.js";
import { PluginOptionsFlow } from "./PluginOptionsFlow.js";
import { UnifiedInstalledCell } from "./UnifiedInstalledCell.js";
import { usePagination } from "./usePagination.js";
async function getBaseFileNames(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, {
      withFileTypes: true
    });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => {
      const baseName = path.basename(entry.name, ".md");
      return baseName;
    });
  } catch (error) {
    const errorMsg = errorMessage(error);
    logForDebugging(`Failed to read plugin components from ${dirPath}: ${errorMsg}`, {
      level: "error"
    });
    logError(toError(error));
    return [];
  }
}
async function getSkillDirNames(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, {
      withFileTypes: true
    });
    const skillNames = [];
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const skillFilePath = path.join(dirPath, entry.name, "SKILL.md");
        try {
          const st = await fs.stat(skillFilePath);
          if (st.isFile()) {
            skillNames.push(entry.name);
          }
        } catch {
        }
      }
    }
    return skillNames;
  } catch (error) {
    const errorMsg = errorMessage(error);
    logForDebugging(`Failed to read skill directories from ${dirPath}: ${errorMsg}`, {
      level: "error"
    });
    logError(toError(error));
    return [];
  }
}
function PluginComponentsDisplay({
  plugin,
  marketplace
}) {
  const [components, setComponents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    async function loadComponents() {
      try {
        if (marketplace === "builtin") {
          const builtinDef = getBuiltinPluginDefinition(plugin.name);
          if (builtinDef) {
            const skillNames = builtinDef.skills?.map((s) => s.name) ?? [];
            const hookEvents = builtinDef.hooks ? Object.keys(builtinDef.hooks) : [];
            const mcpServerNames = builtinDef.mcpServers ? Object.keys(builtinDef.mcpServers) : [];
            setComponents({
              commands: null,
              agents: null,
              skills: skillNames.length > 0 ? skillNames : null,
              hooks: hookEvents.length > 0 ? hookEvents : null,
              mcpServers: mcpServerNames.length > 0 ? mcpServerNames : null
            });
          } else {
            setError(`Built-in plugin ${plugin.name} not found`);
          }
          setLoading(false);
          return;
        }
        const marketplaceData = await getMarketplace(marketplace);
        const pluginEntry = marketplaceData.plugins.find((p) => p.name === plugin.name);
        if (pluginEntry) {
          const commandPathList = [];
          if (plugin.commandsPath) {
            commandPathList.push(plugin.commandsPath);
          }
          if (plugin.commandsPaths) {
            commandPathList.push(...plugin.commandsPaths);
          }
          const commandList = [];
          for (const commandPath of commandPathList) {
            if (typeof commandPath === "string") {
              const baseNames = await getBaseFileNames(commandPath);
              commandList.push(...baseNames);
            }
          }
          const agentPathList = [];
          if (plugin.agentsPath) {
            agentPathList.push(plugin.agentsPath);
          }
          if (plugin.agentsPaths) {
            agentPathList.push(...plugin.agentsPaths);
          }
          const agentList = [];
          for (const agentPath of agentPathList) {
            if (typeof agentPath === "string") {
              const baseNames_0 = await getBaseFileNames(agentPath);
              agentList.push(...baseNames_0);
            }
          }
          const skillPathList = [];
          if (plugin.skillsPath) {
            skillPathList.push(plugin.skillsPath);
          }
          if (plugin.skillsPaths) {
            skillPathList.push(...plugin.skillsPaths);
          }
          const skillList = [];
          for (const skillPath of skillPathList) {
            if (typeof skillPath === "string") {
              const skillDirNames = await getSkillDirNames(skillPath);
              skillList.push(...skillDirNames);
            }
          }
          const hooksList = [];
          if (plugin.hooksConfig) {
            hooksList.push(Object.keys(plugin.hooksConfig));
          }
          if (pluginEntry.hooks) {
            hooksList.push(pluginEntry.hooks);
          }
          const mcpServersList = [];
          if (plugin.mcpServers) {
            mcpServersList.push(Object.keys(plugin.mcpServers));
          }
          if (pluginEntry.mcpServers) {
            mcpServersList.push(pluginEntry.mcpServers);
          }
          setComponents({
            commands: commandList.length > 0 ? commandList : null,
            agents: agentList.length > 0 ? agentList : null,
            skills: skillList.length > 0 ? skillList : null,
            hooks: hooksList.length > 0 ? hooksList : null,
            mcpServers: mcpServersList.length > 0 ? mcpServersList : null
          });
        } else {
          setError(`Plugin ${plugin.name} not found in marketplace`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load components");
      } finally {
        setLoading(false);
      }
    }
    void loadComponents();
  }, [plugin.name, plugin.commandsPath, plugin.commandsPaths, plugin.agentsPath, plugin.agentsPaths, plugin.skillsPath, plugin.skillsPaths, plugin.hooksConfig, plugin.mcpServers, marketplace]);
  if (loading) {
    return null;
  }
  if (error) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsx(Text, { bold: true, children: "Components:" }),
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Error: ",
        error
      ] })
    ] });
  }
  if (!components) {
    return null;
  }
  const hasComponents = components.commands || components.agents || components.skills || components.hooks || components.mcpServers;
  if (!hasComponents) {
    return null;
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsx(Text, { bold: true, children: "Installed components:" }),
    components.commands ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "\u2022 Commands:",
      " ",
      typeof components.commands === "string" ? components.commands : Array.isArray(components.commands) ? components.commands.join(", ") : Object.keys(components.commands).join(", ")
    ] }) : null,
    components.agents ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "\u2022 Agents:",
      " ",
      typeof components.agents === "string" ? components.agents : Array.isArray(components.agents) ? components.agents.join(", ") : Object.keys(components.agents).join(", ")
    ] }) : null,
    components.skills ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "\u2022 Skills:",
      " ",
      typeof components.skills === "string" ? components.skills : Array.isArray(components.skills) ? components.skills.join(", ") : Object.keys(components.skills).join(", ")
    ] }) : null,
    components.hooks ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "\u2022 Hooks:",
      " ",
      typeof components.hooks === "string" ? components.hooks : Array.isArray(components.hooks) ? components.hooks.map(String).join(", ") : typeof components.hooks === "object" && components.hooks !== null ? Object.keys(components.hooks).join(", ") : String(components.hooks)
    ] }) : null,
    components.mcpServers ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "\u2022 MCP Servers:",
      " ",
      typeof components.mcpServers === "string" ? components.mcpServers : Array.isArray(components.mcpServers) ? components.mcpServers.map(String).join(", ") : typeof components.mcpServers === "object" && components.mcpServers !== null ? Object.keys(components.mcpServers).join(", ") : String(components.mcpServers)
    ] }) : null
  ] });
}
async function checkIfLocalPlugin(pluginName, marketplaceName) {
  const marketplace = await getMarketplace(marketplaceName);
  const entry = marketplace?.plugins.find((p) => p.name === pluginName);
  if (entry && typeof entry.source === "string") {
    return `Local plugins cannot be updated remotely. To update, modify the source at: ${entry.source}`;
  }
  return null;
}
function filterManagedDisabledPlugins(plugins) {
  return plugins.filter((plugin) => {
    const marketplace = plugin.source.split("@")[1] || "local";
    return !isPluginBlockedByPolicy(`${plugin.name}@${marketplace}`);
  });
}
function ManagePlugins({
  setViewState: setParentViewState,
  setResult,
  onManageComplete,
  onSearchModeChange,
  targetPlugin,
  targetMarketplace,
  action
}) {
  const mcpClients = useAppState((s) => s.mcp.clients);
  const mcpTools = useAppState((s_0) => s_0.mcp.tools);
  const pluginErrors = useAppState((s_1) => s_1.plugins.errors);
  const flaggedPlugins = getFlaggedPlugins();
  const [isSearchMode, setIsSearchModeRaw] = useState(false);
  const setIsSearchMode = useCallback((active) => {
    setIsSearchModeRaw(active);
    onSearchModeChange?.(active);
  }, [onSearchModeChange]);
  const isTerminalFocused = useTerminalFocus();
  const {
    columns: terminalWidth
  } = useTerminalSize();
  const [viewState, setViewState] = useState("plugin-list");
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    cursorOffset: searchCursorOffset
  } = useSearchInput({
    isActive: viewState === "plugin-list" && isSearchMode,
    onExit: () => {
      setIsSearchMode(false);
    }
  });
  const [selectedPlugin, setSelectedPlugin] = useState(null);
  const [marketplaces, setMarketplaces] = useState([]);
  const [pluginStates, setPluginStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingToggles, setPendingToggles] = useState(/* @__PURE__ */ new Map());
  const hasAutoNavigated = useRef(false);
  const pendingAutoActionRef = useRef(void 0);
  const toggleMcpServer = useMcpToggleEnabled();
  const handleBack = React.useCallback(() => {
    if (viewState === "plugin-details") {
      setViewState("plugin-list");
      setSelectedPlugin(null);
      setProcessError(null);
    } else if (typeof viewState === "object" && viewState.type === "failed-plugin-details") {
      setViewState("plugin-list");
      setProcessError(null);
    } else if (viewState === "configuring") {
      setViewState("plugin-details");
      setConfigNeeded(null);
    } else if (typeof viewState === "object" && (viewState.type === "plugin-options" || viewState.type === "configuring-options")) {
      setViewState("plugin-list");
      setSelectedPlugin(null);
      setResult("Plugin enabled. Configuration skipped \u2014 run /reload-plugins to apply.");
      if (onManageComplete) {
        void onManageComplete();
      }
    } else if (typeof viewState === "object" && viewState.type === "flagged-detail") {
      setViewState("plugin-list");
      setProcessError(null);
    } else if (typeof viewState === "object" && viewState.type === "mcp-detail") {
      setViewState("plugin-list");
      setProcessError(null);
    } else if (typeof viewState === "object" && viewState.type === "mcp-tools") {
      setViewState({
        type: "mcp-detail",
        client: viewState.client
      });
    } else if (typeof viewState === "object" && viewState.type === "mcp-tool-detail") {
      setViewState({
        type: "mcp-tools",
        client: viewState.client
      });
    } else {
      if (pendingToggles.size > 0) {
        setResult("Run /reload-plugins to apply plugin changes.");
        return;
      }
      setParentViewState({
        type: "menu"
      });
    }
  }, [viewState, setParentViewState, pendingToggles, setResult]);
  useKeybinding("confirm:no", handleBack, {
    context: "Confirmation",
    isActive: (viewState !== "plugin-list" || !isSearchMode) && viewState !== "confirm-project-uninstall" && !(typeof viewState === "object" && viewState.type === "confirm-data-cleanup")
  });
  const getMcpStatus = (client) => {
    if (client.type === "connected") return "connected";
    if (client.type === "disabled") return "disabled";
    if (client.type === "pending") return "pending";
    if (client.type === "needs-auth") return "needs-auth";
    return "failed";
  };
  const unifiedItems = useMemo(() => {
    const mergedSettings = getSettings_DEPRECATED();
    const pluginMcpMap = /* @__PURE__ */ new Map();
    for (const client_0 of mcpClients) {
      if (client_0.name.startsWith("plugin:")) {
        const parts = client_0.name.split(":");
        if (parts.length >= 3) {
          const pluginName = parts[1];
          const serverName = parts.slice(2).join(":");
          const existing = pluginMcpMap.get(pluginName) || [];
          existing.push({
            displayName: serverName,
            client: client_0
          });
          pluginMcpMap.set(pluginName, existing);
        }
      }
    }
    const pluginsWithChildren = [];
    for (const state of pluginStates) {
      const pluginId = `${state.plugin.name}@${state.marketplace}`;
      const isEnabled = mergedSettings?.enabledPlugins?.[pluginId] !== false;
      const errors = pluginErrors.filter((e) => "plugin" in e && e.plugin === state.plugin.name || e.source === pluginId || e.source.startsWith(`${state.plugin.name}@`));
      const originalScope = state.plugin.isBuiltin ? "builtin" : state.scope || "user";
      pluginsWithChildren.push({
        item: {
          type: "plugin",
          id: pluginId,
          name: state.plugin.name,
          description: state.plugin.manifest.description,
          marketplace: state.marketplace,
          scope: originalScope,
          isEnabled,
          errorCount: errors.length,
          errors,
          plugin: state.plugin,
          pendingEnable: state.pendingEnable,
          pendingUpdate: state.pendingUpdate,
          pendingToggle: pendingToggles.get(pluginId)
        },
        originalScope,
        childMcps: pluginMcpMap.get(state.plugin.name) || []
      });
    }
    const matchedPluginIds = new Set(pluginsWithChildren.map(({
      item
    }) => item.id));
    const matchedPluginNames = new Set(pluginsWithChildren.map(({
      item: item_0
    }) => item_0.name));
    const orphanErrorsBySource = /* @__PURE__ */ new Map();
    for (const error of pluginErrors) {
      if (matchedPluginIds.has(error.source) || "plugin" in error && typeof error.plugin === "string" && matchedPluginNames.has(error.plugin)) {
        continue;
      }
      const existing_0 = orphanErrorsBySource.get(error.source) || [];
      existing_0.push(error);
      orphanErrorsBySource.set(error.source, existing_0);
    }
    const pluginScopes = getPluginEditableScopes();
    const failedPluginItems = [];
    for (const [pluginId_0, errors_0] of orphanErrorsBySource) {
      if (pluginId_0 in flaggedPlugins) continue;
      const parsed = parsePluginIdentifier(pluginId_0);
      const pluginName_0 = parsed.name || pluginId_0;
      const marketplace = parsed.marketplace || "unknown";
      const rawScope = pluginScopes.get(pluginId_0);
      const scope = rawScope === "flag" || rawScope === void 0 ? "user" : rawScope;
      failedPluginItems.push({
        type: "failed-plugin",
        id: pluginId_0,
        name: pluginName_0,
        marketplace,
        scope,
        errorCount: errors_0.length,
        errors: errors_0
      });
    }
    const standaloneMcps = [];
    for (const client_1 of mcpClients) {
      if (client_1.name === "ide") continue;
      if (client_1.name.startsWith("plugin:")) continue;
      standaloneMcps.push({
        type: "mcp",
        id: `mcp:${client_1.name}`,
        name: client_1.name,
        description: void 0,
        scope: client_1.config.scope,
        status: getMcpStatus(client_1),
        client: client_1
      });
    }
    const scopeOrder = {
      flagged: -1,
      project: 0,
      local: 1,
      user: 2,
      enterprise: 3,
      managed: 4,
      dynamic: 5,
      builtin: 6
    };
    const unified = [];
    const itemsByScope = /* @__PURE__ */ new Map();
    for (const {
      item: item_1,
      originalScope: originalScope_0,
      childMcps
    } of pluginsWithChildren) {
      const scope_0 = item_1.scope;
      if (!itemsByScope.has(scope_0)) {
        itemsByScope.set(scope_0, []);
      }
      itemsByScope.get(scope_0).push(item_1);
      for (const {
        displayName,
        client: client_2
      } of childMcps) {
        const displayScope = originalScope_0 === "builtin" ? "user" : originalScope_0;
        if (!itemsByScope.has(displayScope)) {
          itemsByScope.set(displayScope, []);
        }
        itemsByScope.get(displayScope).push({
          type: "mcp",
          id: `mcp:${client_2.name}`,
          name: displayName,
          description: void 0,
          scope: displayScope,
          status: getMcpStatus(client_2),
          client: client_2,
          indented: true
        });
      }
    }
    for (const mcp of standaloneMcps) {
      const scope_1 = mcp.scope;
      if (!itemsByScope.has(scope_1)) {
        itemsByScope.set(scope_1, []);
      }
      itemsByScope.get(scope_1).push(mcp);
    }
    for (const failedPlugin of failedPluginItems) {
      const scope_2 = failedPlugin.scope;
      if (!itemsByScope.has(scope_2)) {
        itemsByScope.set(scope_2, []);
      }
      itemsByScope.get(scope_2).push(failedPlugin);
    }
    for (const [pluginId_1, entry] of Object.entries(flaggedPlugins)) {
      const parsed_0 = parsePluginIdentifier(pluginId_1);
      const pluginName_1 = parsed_0.name || pluginId_1;
      const marketplace_0 = parsed_0.marketplace || "unknown";
      if (!itemsByScope.has("flagged")) {
        itemsByScope.set("flagged", []);
      }
      itemsByScope.get("flagged").push({
        type: "flagged-plugin",
        id: pluginId_1,
        name: pluginName_1,
        marketplace: marketplace_0,
        scope: "flagged",
        reason: "delisted",
        text: "Removed from marketplace",
        flaggedAt: entry.flaggedAt
      });
    }
    const sortedScopes = [...itemsByScope.keys()].sort((a, b) => (scopeOrder[a] ?? 99) - (scopeOrder[b] ?? 99));
    for (const scope_3 of sortedScopes) {
      const items = itemsByScope.get(scope_3);
      const pluginGroups = [];
      const standaloneMcpsInScope = [];
      let i = 0;
      while (i < items.length) {
        const item_2 = items[i];
        if (item_2.type === "plugin" || item_2.type === "failed-plugin" || item_2.type === "flagged-plugin") {
          const group = [item_2];
          i++;
          let nextItem = items[i];
          while (nextItem?.type === "mcp" && nextItem.indented) {
            group.push(nextItem);
            i++;
            nextItem = items[i];
          }
          pluginGroups.push(group);
        } else if (item_2.type === "mcp" && !item_2.indented) {
          standaloneMcpsInScope.push(item_2);
          i++;
        } else {
          i++;
        }
      }
      pluginGroups.sort((a_0, b_0) => a_0[0].name.localeCompare(b_0[0].name));
      standaloneMcpsInScope.sort((a_1, b_1) => a_1.name.localeCompare(b_1.name));
      for (const group_0 of pluginGroups) {
        unified.push(...group_0);
      }
      unified.push(...standaloneMcpsInScope);
    }
    return unified;
  }, [pluginStates, mcpClients, pluginErrors, pendingToggles, flaggedPlugins]);
  const flaggedIds = useMemo(() => unifiedItems.filter((item_3) => item_3.type === "flagged-plugin").map((item_4) => item_4.id), [unifiedItems]);
  useEffect(() => {
    if (flaggedIds.length > 0) {
      void markFlaggedPluginsSeen(flaggedIds);
    }
  }, [flaggedIds]);
  const filteredItems = useMemo(() => {
    if (!searchQuery) return unifiedItems;
    const lowerQuery = searchQuery.toLowerCase();
    return unifiedItems.filter((item_5) => item_5.name.toLowerCase().includes(lowerQuery) || "description" in item_5 && item_5.description?.toLowerCase().includes(lowerQuery));
  }, [unifiedItems, searchQuery]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const pagination = usePagination({
    totalItems: filteredItems.length,
    selectedIndex,
    maxVisible: 8
  });
  const [detailsMenuIndex, setDetailsMenuIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState(null);
  const [configNeeded, setConfigNeeded] = useState(null);
  const [_isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [selectedPluginHasMcpb, setSelectedPluginHasMcpb] = useState(false);
  useEffect(() => {
    if (!selectedPlugin) {
      setSelectedPluginHasMcpb(false);
      return;
    }
    async function detectMcpb() {
      const mcpServersSpec = selectedPlugin.plugin.manifest.mcpServers;
      let hasMcpb = false;
      if (mcpServersSpec) {
        hasMcpb = typeof mcpServersSpec === "string" && isMcpbSource(mcpServersSpec) || Array.isArray(mcpServersSpec) && mcpServersSpec.some((s_2) => typeof s_2 === "string" && isMcpbSource(s_2));
      }
      if (!hasMcpb) {
        try {
          const marketplaceDir = path.join(selectedPlugin.plugin.path, "..");
          const marketplaceJsonPath = path.join(marketplaceDir, ".claude-plugin", "marketplace.json");
          const content = await fs.readFile(marketplaceJsonPath, "utf-8");
          const marketplace_1 = jsonParse(content);
          const entry_0 = marketplace_1.plugins?.find((p) => p.name === selectedPlugin.plugin.name);
          if (entry_0?.mcpServers) {
            const spec = entry_0.mcpServers;
            hasMcpb = typeof spec === "string" && isMcpbSource(spec) || Array.isArray(spec) && spec.some((s_3) => typeof s_3 === "string" && isMcpbSource(s_3));
          }
        } catch (err) {
          logForDebugging(`Failed to read raw marketplace.json: ${err}`);
        }
      }
      setSelectedPluginHasMcpb(hasMcpb);
    }
    void detectMcpb();
  }, [selectedPlugin]);
  useEffect(() => {
    async function loadInstalledPlugins() {
      setLoading(true);
      try {
        const {
          enabled,
          disabled
        } = await loadAllPlugins();
        const mergedSettings = getSettings_DEPRECATED();
        const allPlugins = filterManagedDisabledPlugins([...enabled, ...disabled]);
        const pluginsByMarketplace = {};
        for (const plugin of allPlugins) {
          const marketplace = plugin.source.split("@")[1] || "local";
          if (!pluginsByMarketplace[marketplace]) {
            pluginsByMarketplace[marketplace] = [];
          }
          pluginsByMarketplace[marketplace].push(plugin);
        }
        const marketplaceInfos = [];
        for (const [name, plugins] of Object.entries(pluginsByMarketplace)) {
          const enabledCount = count(plugins, (p) => {
            const pluginId = `${p.name}@${name}`;
            return mergedSettings?.enabledPlugins?.[pluginId] !== false;
          });
          const disabledCount = plugins.length - enabledCount;
          marketplaceInfos.push({
            name,
            installedPlugins: plugins,
            enabledCount,
            disabledCount
          });
        }
        marketplaceInfos.sort((a, b) => {
          if (a.name === "claude-plugin-directory") return -1;
          if (b.name === "claude-plugin-directory") return 1;
          return a.name.localeCompare(b.name);
        });
        setMarketplaces(marketplaceInfos);
        const allStates = [];
        for (const marketplace of marketplaceInfos) {
          for (const plugin of marketplace.installedPlugins) {
            const pluginId = `${plugin.name}@${marketplace.name}`;
            const scope = plugin.isBuiltin ? "builtin" : getPluginInstallationFromV2(pluginId).scope;
            allStates.push({
              plugin,
              marketplace: marketplace.name,
              scope,
              pendingEnable: void 0,
              pendingUpdate: false
            });
          }
        }
        setPluginStates(allStates);
        setSelectedIndex(0);
      } finally {
        setLoading(false);
      }
    }
    void loadInstalledPlugins();
  }, []);
  useEffect(() => {
    if (hasAutoNavigated.current) return;
    if (targetPlugin && marketplaces.length > 0 && !loading) {
      const {
        name: targetName,
        marketplace: targetMktFromId
      } = parsePluginIdentifier(targetPlugin);
      const effectiveTargetMarketplace = targetMarketplace ?? targetMktFromId;
      const marketplacesToSearch = effectiveTargetMarketplace ? marketplaces.filter((m) => m.name === effectiveTargetMarketplace) : marketplaces;
      for (const marketplace_2 of marketplacesToSearch) {
        const plugin = marketplace_2.installedPlugins.find((p_0) => p_0.name === targetName);
        if (plugin) {
          const pluginId_2 = `${plugin.name}@${marketplace_2.name}`;
          const {
            scope: scope_4
          } = getPluginInstallationFromV2(pluginId_2);
          const pluginState = {
            plugin,
            marketplace: marketplace_2.name,
            scope: scope_4,
            pendingEnable: void 0,
            pendingUpdate: false
          };
          setSelectedPlugin(pluginState);
          setViewState("plugin-details");
          pendingAutoActionRef.current = action;
          hasAutoNavigated.current = true;
          return;
        }
      }
      const failedItem = unifiedItems.find((item_6) => item_6.type === "failed-plugin" && item_6.name === targetName);
      if (failedItem && failedItem.type === "failed-plugin") {
        setViewState({
          type: "failed-plugin-details",
          plugin: {
            id: failedItem.id,
            name: failedItem.name,
            marketplace: failedItem.marketplace,
            errors: failedItem.errors,
            scope: failedItem.scope
          }
        });
        hasAutoNavigated.current = true;
      }
      if (!hasAutoNavigated.current && action) {
        hasAutoNavigated.current = true;
        setResult(`Plugin "${targetPlugin}" is not installed in this project`);
      }
    }
  }, [targetPlugin, targetMarketplace, marketplaces, loading, unifiedItems, action, setResult]);
  const handleSingleOperation = async (operation) => {
    if (!selectedPlugin) return;
    const pluginScope = selectedPlugin.scope || "user";
    const isBuiltin = pluginScope === "builtin";
    if (isBuiltin && (operation === "update" || operation === "uninstall")) {
      setProcessError("Built-in plugins cannot be updated or uninstalled.");
      return;
    }
    if (!isBuiltin && !isInstallableScope(pluginScope) && operation !== "update") {
      setProcessError("This plugin is managed by your organization. Contact your admin to disable it.");
      return;
    }
    setIsProcessing(true);
    setProcessError(null);
    try {
      const pluginId_3 = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
      let reverseDependents;
      switch (operation) {
        case "enable": {
          const enableResult = await enablePluginOp(pluginId_3);
          if (!enableResult.success) {
            throw new Error(enableResult.message);
          }
          break;
        }
        case "disable": {
          const disableResult = await disablePluginOp(pluginId_3);
          if (!disableResult.success) {
            throw new Error(disableResult.message);
          }
          reverseDependents = disableResult.reverseDependents;
          break;
        }
        case "uninstall": {
          if (isBuiltin) break;
          if (!isInstallableScope(pluginScope)) break;
          if (isPluginEnabledAtProjectScope(pluginId_3)) {
            setIsProcessing(false);
            setViewState("confirm-project-uninstall");
            return;
          }
          const installs = loadInstalledPluginsV2().plugins[pluginId_3];
          const isLastScope = !installs || installs.length <= 1;
          const dataSize = isLastScope ? await getPluginDataDirSize(pluginId_3) : null;
          if (dataSize) {
            setIsProcessing(false);
            setViewState({
              type: "confirm-data-cleanup",
              size: dataSize
            });
            return;
          }
          const result_0 = await uninstallPluginOp(pluginId_3, pluginScope);
          if (!result_0.success) {
            throw new Error(result_0.message);
          }
          reverseDependents = result_0.reverseDependents;
          break;
        }
        case "update": {
          if (isBuiltin) break;
          const result = await updatePluginOp(pluginId_3, pluginScope);
          if (!result.success) {
            throw new Error(result.message);
          }
          if (result.alreadyUpToDate) {
            setResult(`${selectedPlugin.plugin.name} is already at the latest version (${result.newVersion}).`);
            if (onManageComplete) {
              await onManageComplete();
            }
            setParentViewState({
              type: "menu"
            });
            return;
          }
          break;
        }
      }
      clearAllCaches();
      const pluginIdNow = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
      const settingsAfter = getSettings_DEPRECATED();
      const enabledAfter = settingsAfter?.enabledPlugins?.[pluginIdNow] !== false;
      if (enabledAfter) {
        setIsProcessing(false);
        setViewState({
          type: "plugin-options"
        });
        return;
      }
      const operationName = operation === "enable" ? "Enabled" : operation === "disable" ? "Disabled" : operation === "update" ? "Updated" : "Uninstalled";
      const depWarn = reverseDependents && reverseDependents.length > 0 ? ` \xB7 required by ${reverseDependents.join(", ")}` : "";
      const message = `\u2713 ${operationName} ${selectedPlugin.plugin.name}${depWarn}. Run /reload-plugins to apply.`;
      setResult(message);
      if (onManageComplete) {
        await onManageComplete();
      }
      setParentViewState({
        type: "menu"
      });
    } catch (error_0) {
      setIsProcessing(false);
      const errorMessage2 = error_0 instanceof Error ? error_0.message : String(error_0);
      setProcessError(`Failed to ${operation}: ${errorMessage2}`);
      logError(toError(error_0));
    }
  };
  const handleSingleOperationRef = useRef(handleSingleOperation);
  handleSingleOperationRef.current = handleSingleOperation;
  useEffect(() => {
    if (viewState === "plugin-details" && selectedPlugin && pendingAutoActionRef.current) {
      const pending = pendingAutoActionRef.current;
      pendingAutoActionRef.current = void 0;
      void handleSingleOperationRef.current(pending);
    }
  }, [viewState, selectedPlugin]);
  const handleToggle = React.useCallback(() => {
    if (selectedIndex >= filteredItems.length) return;
    const item_7 = filteredItems[selectedIndex];
    if (item_7?.type === "flagged-plugin") return;
    if (item_7?.type === "plugin") {
      const pluginId_4 = `${item_7.plugin.name}@${item_7.marketplace}`;
      const mergedSettings_0 = getSettings_DEPRECATED();
      const currentPending = pendingToggles.get(pluginId_4);
      const isEnabled_0 = mergedSettings_0?.enabledPlugins?.[pluginId_4] !== false;
      const pluginScope_0 = item_7.scope;
      const isBuiltin_0 = pluginScope_0 === "builtin";
      if (isBuiltin_0 || isInstallableScope(pluginScope_0)) {
        const newPending = new Map(pendingToggles);
        if (currentPending) {
          newPending.delete(pluginId_4);
          void (async () => {
            try {
              if (currentPending === "will-disable") {
                await enablePluginOp(pluginId_4);
              } else {
                await disablePluginOp(pluginId_4);
              }
              clearAllCaches();
            } catch (err_0) {
              logError(err_0);
            }
          })();
        } else {
          newPending.set(pluginId_4, isEnabled_0 ? "will-disable" : "will-enable");
          void (async () => {
            try {
              if (isEnabled_0) {
                await disablePluginOp(pluginId_4);
              } else {
                await enablePluginOp(pluginId_4);
              }
              clearAllCaches();
            } catch (err_1) {
              logError(err_1);
            }
          })();
        }
        setPendingToggles(newPending);
      }
    } else if (item_7?.type === "mcp") {
      void toggleMcpServer(item_7.client.name);
    }
  }, [selectedIndex, filteredItems, pendingToggles, pluginStates, toggleMcpServer]);
  const handleAccept = React.useCallback(() => {
    if (selectedIndex >= filteredItems.length) return;
    const item_8 = filteredItems[selectedIndex];
    if (item_8?.type === "plugin") {
      const state_0 = pluginStates.find((s_4) => s_4.plugin.name === item_8.plugin.name && s_4.marketplace === item_8.marketplace);
      if (state_0) {
        setSelectedPlugin(state_0);
        setViewState("plugin-details");
        setDetailsMenuIndex(0);
        setProcessError(null);
      }
    } else if (item_8?.type === "flagged-plugin") {
      setViewState({
        type: "flagged-detail",
        plugin: {
          id: item_8.id,
          name: item_8.name,
          marketplace: item_8.marketplace,
          reason: item_8.reason,
          text: item_8.text,
          flaggedAt: item_8.flaggedAt
        }
      });
      setProcessError(null);
    } else if (item_8?.type === "failed-plugin") {
      setViewState({
        type: "failed-plugin-details",
        plugin: {
          id: item_8.id,
          name: item_8.name,
          marketplace: item_8.marketplace,
          errors: item_8.errors,
          scope: item_8.scope
        }
      });
      setDetailsMenuIndex(0);
      setProcessError(null);
    } else if (item_8?.type === "mcp") {
      setViewState({
        type: "mcp-detail",
        client: item_8.client
      });
      setProcessError(null);
    }
  }, [selectedIndex, filteredItems, pluginStates]);
  useKeybindings({
    "select:previous": () => {
      if (selectedIndex === 0) {
        setIsSearchMode(true);
      } else {
        pagination.handleSelectionChange(selectedIndex - 1, setSelectedIndex);
      }
    },
    "select:next": () => {
      if (selectedIndex < filteredItems.length - 1) {
        pagination.handleSelectionChange(selectedIndex + 1, setSelectedIndex);
      }
    },
    "select:accept": handleAccept
  }, {
    context: "Select",
    isActive: viewState === "plugin-list" && !isSearchMode
  });
  useKeybindings({
    "plugin:toggle": handleToggle
  }, {
    context: "Plugin",
    isActive: viewState === "plugin-list" && !isSearchMode
  });
  const handleFlaggedDismiss = React.useCallback(() => {
    if (typeof viewState !== "object" || viewState.type !== "flagged-detail") return;
    void removeFlaggedPlugin(viewState.plugin.id);
    setViewState("plugin-list");
  }, [viewState]);
  useKeybindings({
    "select:accept": handleFlaggedDismiss
  }, {
    context: "Select",
    isActive: typeof viewState === "object" && viewState.type === "flagged-detail"
  });
  const detailsMenuItems = React.useMemo(() => {
    if (viewState !== "plugin-details" || !selectedPlugin) return [];
    const mergedSettings_1 = getSettings_DEPRECATED();
    const pluginId_5 = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
    const isEnabled_1 = mergedSettings_1?.enabledPlugins?.[pluginId_5] !== false;
    const isBuiltin_1 = selectedPlugin.marketplace === "builtin";
    const menuItems = [];
    menuItems.push({
      label: isEnabled_1 ? "Disable plugin" : "Enable plugin",
      action: () => void handleSingleOperation(isEnabled_1 ? "disable" : "enable")
    });
    if (!isBuiltin_1) {
      menuItems.push({
        label: selectedPlugin.pendingUpdate ? "Unmark for update" : "Mark for update",
        action: async () => {
          try {
            const localError = await checkIfLocalPlugin(selectedPlugin.plugin.name, selectedPlugin.marketplace);
            if (localError) {
              setProcessError(localError);
              return;
            }
            const newStates = [...pluginStates];
            const index = newStates.findIndex((s_5) => s_5.plugin.name === selectedPlugin.plugin.name && s_5.marketplace === selectedPlugin.marketplace);
            if (index !== -1) {
              newStates[index].pendingUpdate = !selectedPlugin.pendingUpdate;
              setPluginStates(newStates);
              setSelectedPlugin({
                ...selectedPlugin,
                pendingUpdate: !selectedPlugin.pendingUpdate
              });
            }
          } catch (error_1) {
            setProcessError(error_1 instanceof Error ? error_1.message : "Failed to check plugin update availability");
          }
        }
      });
      if (selectedPluginHasMcpb) {
        menuItems.push({
          label: "Configure",
          action: async () => {
            setIsLoadingConfig(true);
            try {
              const mcpServersSpec_0 = selectedPlugin.plugin.manifest.mcpServers;
              let mcpbPath = null;
              if (typeof mcpServersSpec_0 === "string" && isMcpbSource(mcpServersSpec_0)) {
                mcpbPath = mcpServersSpec_0;
              } else if (Array.isArray(mcpServersSpec_0)) {
                for (const spec_0 of mcpServersSpec_0) {
                  if (typeof spec_0 === "string" && isMcpbSource(spec_0)) {
                    mcpbPath = spec_0;
                    break;
                  }
                }
              }
              if (!mcpbPath) {
                setProcessError("No MCPB file found in plugin");
                setIsLoadingConfig(false);
                return;
              }
              const pluginId_6 = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
              const result_1 = await loadMcpbFile(mcpbPath, selectedPlugin.plugin.path, pluginId_6, void 0, void 0, true);
              if ("status" in result_1 && result_1.status === "needs-config") {
                setConfigNeeded(result_1);
                setViewState("configuring");
              } else {
                setProcessError("Failed to load MCPB for configuration");
              }
            } catch (err_2) {
              const errorMsg = errorMessage(err_2);
              setProcessError(`Failed to load configuration: ${errorMsg}`);
            } finally {
              setIsLoadingConfig(false);
            }
          }
        });
      }
      if (selectedPlugin.plugin.manifest.userConfig && Object.keys(selectedPlugin.plugin.manifest.userConfig).length > 0) {
        menuItems.push({
          label: "Configure options",
          action: () => {
            setViewState({
              type: "configuring-options",
              schema: selectedPlugin.plugin.manifest.userConfig
            });
          }
        });
      }
      menuItems.push({
        label: "Update now",
        action: () => void handleSingleOperation("update")
      });
      menuItems.push({
        label: "Uninstall",
        action: () => void handleSingleOperation("uninstall")
      });
    }
    if (selectedPlugin.plugin.manifest.homepage) {
      menuItems.push({
        label: "Open homepage",
        action: () => void openBrowser(selectedPlugin.plugin.manifest.homepage)
      });
    }
    if (selectedPlugin.plugin.manifest.repository) {
      menuItems.push({
        // Generic label — manifest.repository can be GitLab, Bitbucket,
        // Azure DevOps, etc. (gh-31598). pluginDetailsHelpers.tsx:74 keeps
        // 'View on GitHub' because that path has an explicit isGitHub check.
        label: "View repository",
        action: () => void openBrowser(selectedPlugin.plugin.manifest.repository)
      });
    }
    menuItems.push({
      label: "Back to plugin list",
      action: () => {
        setViewState("plugin-list");
        setSelectedPlugin(null);
        setProcessError(null);
      }
    });
    return menuItems;
  }, [viewState, selectedPlugin, selectedPluginHasMcpb, pluginStates]);
  useKeybindings({
    "select:previous": () => {
      if (detailsMenuIndex > 0) {
        setDetailsMenuIndex(detailsMenuIndex - 1);
      }
    },
    "select:next": () => {
      if (detailsMenuIndex < detailsMenuItems.length - 1) {
        setDetailsMenuIndex(detailsMenuIndex + 1);
      }
    },
    "select:accept": () => {
      if (detailsMenuItems[detailsMenuIndex]) {
        detailsMenuItems[detailsMenuIndex].action();
      }
    }
  }, {
    context: "Select",
    isActive: viewState === "plugin-details" && !!selectedPlugin
  });
  useKeybindings({
    "select:accept": () => {
      if (typeof viewState === "object" && viewState.type === "failed-plugin-details") {
        void (async () => {
          setIsProcessing(true);
          setProcessError(null);
          const pluginId_7 = viewState.plugin.id;
          const pluginScope_1 = viewState.plugin.scope;
          const result_2 = isInstallableScope(pluginScope_1) ? await uninstallPluginOp(pluginId_7, pluginScope_1, false) : await uninstallPluginOp(pluginId_7, "user", false);
          let success = result_2.success;
          if (!success) {
            const editableSources = ["userSettings", "projectSettings", "localSettings"];
            for (const source of editableSources) {
              const settings = getSettingsForSource(source);
              if (settings?.enabledPlugins?.[pluginId_7] !== void 0) {
                updateSettingsForSource(source, {
                  enabledPlugins: {
                    ...settings.enabledPlugins,
                    [pluginId_7]: void 0
                  }
                });
                success = true;
              }
            }
            clearAllCaches();
          }
          if (success) {
            if (onManageComplete) {
              await onManageComplete();
            }
            setIsProcessing(false);
            setViewState("plugin-list");
          } else {
            setIsProcessing(false);
            setProcessError(result_2.message);
          }
        })();
      }
    }
  }, {
    context: "Select",
    isActive: typeof viewState === "object" && viewState.type === "failed-plugin-details" && viewState.plugin.scope !== "managed"
  });
  useKeybindings({
    "confirm:yes": () => {
      if (!selectedPlugin) return;
      setIsProcessing(true);
      setProcessError(null);
      const pluginId_8 = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
      const {
        error: error_2
      } = updateSettingsForSource("localSettings", {
        enabledPlugins: {
          ...getSettingsForSource("localSettings")?.enabledPlugins,
          [pluginId_8]: false
        }
      });
      if (error_2) {
        setIsProcessing(false);
        setProcessError(`Failed to write settings: ${error_2.message}`);
        return;
      }
      clearAllCaches();
      setResult(`\u2713 Disabled ${selectedPlugin.plugin.name} in .claude/settings.local.json. Run /reload-plugins to apply.`);
      if (onManageComplete) void onManageComplete();
      setParentViewState({
        type: "menu"
      });
    },
    "confirm:no": () => {
      setViewState("plugin-details");
      setProcessError(null);
    }
  }, {
    context: "Confirmation",
    isActive: viewState === "confirm-project-uninstall" && !!selectedPlugin && !isProcessing
  });
  useInput((input, key) => {
    if (!selectedPlugin) return;
    const pluginId_9 = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
    const pluginScope_2 = selectedPlugin.scope;
    if (!pluginScope_2 || pluginScope_2 === "builtin" || !isInstallableScope(pluginScope_2)) return;
    const doUninstall = async (deleteDataDir) => {
      setIsProcessing(true);
      setProcessError(null);
      try {
        const result_3 = await uninstallPluginOp(pluginId_9, pluginScope_2, deleteDataDir);
        if (!result_3.success) throw new Error(result_3.message);
        clearAllCaches();
        const suffix = deleteDataDir ? "" : " \xB7 data preserved";
        setResult(`${figures.tick} ${result_3.message}${suffix}`);
        if (onManageComplete) void onManageComplete();
        setParentViewState({
          type: "menu"
        });
      } catch (e_0) {
        setIsProcessing(false);
        setProcessError(e_0 instanceof Error ? e_0.message : String(e_0));
      }
    };
    if (input === "y" || input === "Y") {
      void doUninstall(true);
    } else if (input === "n" || input === "N") {
      void doUninstall(false);
    } else if (key.escape) {
      setViewState("plugin-details");
      setProcessError(null);
    }
  }, {
    isActive: typeof viewState === "object" && viewState.type === "confirm-data-cleanup" && !!selectedPlugin && !isProcessing
  });
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);
  useInput((input_0, key_0) => {
    const keyIsNotCtrlOrMeta = !key_0.ctrl && !key_0.meta;
    if (isSearchMode) {
      return;
    }
    if (input_0 === "/" && keyIsNotCtrlOrMeta) {
      setIsSearchMode(true);
      setSearchQuery("");
      setSelectedIndex(0);
    } else if (keyIsNotCtrlOrMeta && input_0.length > 0 && !/^\s+$/.test(input_0) && input_0 !== "j" && input_0 !== "k" && input_0 !== " ") {
      setIsSearchMode(true);
      setSearchQuery(input_0);
      setSelectedIndex(0);
    }
  }, {
    isActive: viewState === "plugin-list"
  });
  if (loading) {
    return /* @__PURE__ */ jsx(Text, { children: "Loading installed plugins\u2026" });
  }
  if (unifiedItems.length === 0) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Manage plugins" }) }),
      /* @__PURE__ */ jsx(Text, { children: "No plugins or MCP servers installed." }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Esc to go back" }) })
    ] });
  }
  if (typeof viewState === "object" && viewState.type === "plugin-options" && selectedPlugin) {
    let finish = function(msg) {
      setResult(msg);
      if (onManageComplete) {
        void onManageComplete();
      }
      setParentViewState({
        type: "menu"
      });
    };
    const pluginId_10 = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
    return /* @__PURE__ */ jsx(PluginOptionsFlow, { plugin: selectedPlugin.plugin, pluginId: pluginId_10, onDone: (outcome, detail) => {
      switch (outcome) {
        case "configured":
          finish(`\u2713 Enabled and configured ${selectedPlugin.plugin.name}. Run /reload-plugins to apply.`);
          break;
        case "skipped":
          finish(`\u2713 Enabled ${selectedPlugin.plugin.name}. Run /reload-plugins to apply.`);
          break;
        case "error":
          finish(`Failed to save configuration: ${detail}`);
          break;
      }
    } });
  }
  if (typeof viewState === "object" && viewState.type === "configuring-options" && selectedPlugin) {
    const pluginId_11 = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
    return /* @__PURE__ */ jsx(PluginOptionsDialog, { title: `Configure ${selectedPlugin.plugin.name}`, subtitle: "Plugin options", configSchema: viewState.schema, initialValues: loadPluginOptions(pluginId_11), onSave: (values) => {
      try {
        savePluginOptions(pluginId_11, values, viewState.schema);
        clearAllCaches();
        setResult("Configuration saved. Run /reload-plugins for changes to take effect.");
      } catch (err_3) {
        setProcessError(`Failed to save configuration: ${errorMessage(err_3)}`);
      }
      setViewState("plugin-details");
    }, onCancel: () => setViewState("plugin-details") });
  }
  if (viewState === "configuring" && configNeeded && selectedPlugin) {
    let handleCancel = function() {
      setConfigNeeded(null);
      setViewState("plugin-details");
    };
    const pluginId_12 = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
    async function handleSave(config) {
      if (!configNeeded || !selectedPlugin) return;
      try {
        const mcpServersSpec_1 = selectedPlugin.plugin.manifest.mcpServers;
        let mcpbPath_0 = null;
        if (typeof mcpServersSpec_1 === "string" && isMcpbSource(mcpServersSpec_1)) {
          mcpbPath_0 = mcpServersSpec_1;
        } else if (Array.isArray(mcpServersSpec_1)) {
          for (const spec_1 of mcpServersSpec_1) {
            if (typeof spec_1 === "string" && isMcpbSource(spec_1)) {
              mcpbPath_0 = spec_1;
              break;
            }
          }
        }
        if (!mcpbPath_0) {
          setProcessError("No MCPB file found");
          setViewState("plugin-details");
          return;
        }
        await loadMcpbFile(mcpbPath_0, selectedPlugin.plugin.path, pluginId_12, void 0, config);
        setProcessError(null);
        setConfigNeeded(null);
        setViewState("plugin-details");
        setResult("Configuration saved. Run /reload-plugins for changes to take effect.");
      } catch (err_4) {
        const errorMsg_0 = errorMessage(err_4);
        setProcessError(`Failed to save configuration: ${errorMsg_0}`);
        setViewState("plugin-details");
      }
    }
    return /* @__PURE__ */ jsx(PluginOptionsDialog, { title: `Configure ${configNeeded.manifest.name}`, subtitle: `Plugin: ${selectedPlugin.plugin.name}`, configSchema: configNeeded.configSchema, initialValues: configNeeded.existingConfig, onSave: handleSave, onCancel: handleCancel });
  }
  if (typeof viewState === "object" && viewState.type === "flagged-detail") {
    const fp = viewState.plugin;
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        fp.name,
        " @ ",
        fp.marketplace
      ] }) }),
      /* @__PURE__ */ jsxs(Box, { marginBottom: 1, children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Status: " }),
        /* @__PURE__ */ jsx(Text, { color: "error", children: "Removed" })
      ] }),
      /* @__PURE__ */ jsxs(Box, { marginBottom: 1, flexDirection: "column", children: [
        /* @__PURE__ */ jsxs(Text, { color: "error", children: [
          "Removed from marketplace \xB7 reason: ",
          fp.reason
        ] }),
        /* @__PURE__ */ jsx(Text, { children: fp.text }),
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Flagged on ",
          new Date(fp.flaggedAt).toLocaleDateString()
        ] })
      ] }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, flexDirection: "column", children: /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsxs(Text, { children: [
          figures.pointer,
          " "
        ] }),
        /* @__PURE__ */ jsx(Text, { color: "suggestion", children: "Dismiss" })
      ] }) }),
      /* @__PURE__ */ jsxs(Byline, { children: [
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Select", fallback: "Enter", description: "dismiss" }),
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "back" })
      ] })
    ] });
  }
  if (viewState === "confirm-project-uninstall" && selectedPlugin) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs(Text, { bold: true, color: "warning", children: [
        selectedPlugin.plugin.name,
        " is enabled in .claude/settings.json (shared with your team)"
      ] }),
      /* @__PURE__ */ jsxs(Box, { marginTop: 1, flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { children: "Disable it just for you in .claude/settings.local.json?" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "This has the same effect as uninstalling, without affecting other contributors." })
      ] }),
      processError && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "error", children: processError }) }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: isProcessing ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Disabling\u2026" }) : /* @__PURE__ */ jsxs(Byline, { children: [
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:yes", context: "Confirmation", fallback: "y", description: "disable" }),
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" })
      ] }) })
    ] });
  }
  if (typeof viewState === "object" && viewState.type === "confirm-data-cleanup" && selectedPlugin) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        selectedPlugin.plugin.name,
        " has ",
        viewState.size.human,
        " of persistent data"
      ] }),
      /* @__PURE__ */ jsxs(Box, { marginTop: 1, flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { children: "Delete it along with the plugin?" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: pluginDataDirPath(`${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`) })
      ] }),
      processError && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "error", children: processError }) }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: isProcessing ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Uninstalling\u2026" }) : /* @__PURE__ */ jsxs(Text, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "y" }),
        " to delete \xB7 ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: "n" }),
        " to keep \xB7",
        " ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: "esc" }),
        " to cancel"
      ] }) })
    ] });
  }
  if (viewState === "plugin-details" && selectedPlugin) {
    const mergedSettings_2 = getSettings_DEPRECATED();
    const pluginId_13 = `${selectedPlugin.plugin.name}@${selectedPlugin.marketplace}`;
    const isEnabled_2 = mergedSettings_2?.enabledPlugins?.[pluginId_13] !== false;
    const filteredPluginErrors = pluginErrors.filter((e_1) => "plugin" in e_1 && e_1.plugin === selectedPlugin.plugin.name || e_1.source === pluginId_13 || e_1.source.startsWith(`${selectedPlugin.plugin.name}@`));
    const pluginErrorsSection = filteredPluginErrors.length === 0 ? null : /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsxs(Text, { bold: true, color: "error", children: [
        filteredPluginErrors.length,
        " ",
        plural(filteredPluginErrors.length, "error"),
        ":"
      ] }),
      filteredPluginErrors.map((error_3, i_0) => {
        const guidance = getErrorGuidance(error_3);
        return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [
          /* @__PURE__ */ jsx(Text, { color: "error", children: formatErrorMessage(error_3) }),
          guidance && /* @__PURE__ */ jsxs(Text, { dimColor: true, italic: true, children: [
            figures.arrowRight,
            " ",
            guidance
          ] })
        ] }, i_0);
      })
    ] });
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        selectedPlugin.plugin.name,
        " @ ",
        selectedPlugin.marketplace
      ] }) }),
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Scope: " }),
        /* @__PURE__ */ jsx(Text, { children: selectedPlugin.scope || "user" })
      ] }),
      selectedPlugin.plugin.manifest.version && /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Version: " }),
        /* @__PURE__ */ jsx(Text, { children: selectedPlugin.plugin.manifest.version })
      ] }),
      selectedPlugin.plugin.manifest.description && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { children: selectedPlugin.plugin.manifest.description }) }),
      selectedPlugin.plugin.manifest.author && /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Author: " }),
        /* @__PURE__ */ jsx(Text, { children: selectedPlugin.plugin.manifest.author.name })
      ] }),
      /* @__PURE__ */ jsxs(Box, { marginBottom: 1, children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Status: " }),
        /* @__PURE__ */ jsx(Text, { color: isEnabled_2 ? "success" : "warning", children: isEnabled_2 ? "Enabled" : "Disabled" }),
        selectedPlugin.pendingUpdate && /* @__PURE__ */ jsx(Text, { color: "suggestion", children: " \xB7 Marked for update" })
      ] }),
      /* @__PURE__ */ jsx(PluginComponentsDisplay, { plugin: selectedPlugin.plugin, marketplace: selectedPlugin.marketplace }),
      pluginErrorsSection,
      /* @__PURE__ */ jsx(Box, { marginTop: 1, flexDirection: "column", children: detailsMenuItems.map((item_9, index_0) => {
        const isSelected = index_0 === detailsMenuIndex;
        return /* @__PURE__ */ jsxs(Box, { children: [
          isSelected && /* @__PURE__ */ jsxs(Text, { children: [
            figures.pointer,
            " "
          ] }),
          !isSelected && /* @__PURE__ */ jsx(Text, { children: "  " }),
          /* @__PURE__ */ jsx(Text, { bold: isSelected, color: item_9.label.includes("Uninstall") ? "error" : item_9.label.includes("Update") ? "suggestion" : void 0, children: item_9.label })
        ] }, index_0);
      }) }),
      isProcessing && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { children: "Processing\u2026" }) }),
      processError && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "error", children: processError }) }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:previous", context: "Select", fallback: "\u2191", description: "navigate" }),
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Select", fallback: "Enter", description: "select" }),
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "back" })
      ] }) }) })
    ] });
  }
  if (typeof viewState === "object" && viewState.type === "failed-plugin-details") {
    const failedPlugin_0 = viewState.plugin;
    const firstError = failedPlugin_0.errors[0];
    const errorMessage_0 = firstError ? formatErrorMessage(firstError) : "Failed to load";
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs(Text, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: failedPlugin_0.name }),
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          " @ ",
          failedPlugin_0.marketplace
        ] }),
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          " (",
          failedPlugin_0.scope,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsx(Text, { color: "error", children: errorMessage_0 }),
      failedPlugin_0.scope === "managed" ? /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Managed by your organization \u2014 contact your admin" }) }) : /* @__PURE__ */ jsxs(Box, { marginTop: 1, children: [
        /* @__PURE__ */ jsxs(Text, { color: "suggestion", children: [
          figures.pointer,
          " "
        ] }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Remove" })
      ] }),
      isProcessing && /* @__PURE__ */ jsx(Text, { children: "Processing\u2026" }),
      processError && /* @__PURE__ */ jsx(Text, { color: "error", children: processError }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
        failedPlugin_0.scope !== "managed" && /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Select", fallback: "Enter", description: "remove" }),
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "back" })
      ] }) }) })
    ] });
  }
  if (typeof viewState === "object" && viewState.type === "mcp-detail") {
    const client_3 = viewState.client;
    const serverToolsCount = filterToolsByServer(mcpTools, client_3.name).length;
    const handleMcpViewTools = () => {
      setViewState({
        type: "mcp-tools",
        client: client_3
      });
    };
    const handleMcpCancel = () => {
      setViewState("plugin-list");
    };
    const handleMcpComplete = (result_4) => {
      if (result_4) {
        setResult(result_4);
      }
      setViewState("plugin-list");
    };
    const scope_5 = client_3.config.scope;
    const configType = client_3.config.type;
    if (configType === "stdio") {
      const server = {
        name: client_3.name,
        client: client_3,
        scope: scope_5,
        transport: "stdio",
        config: client_3.config
      };
      return /* @__PURE__ */ jsx(MCPStdioServerMenu, { server, serverToolsCount, onViewTools: handleMcpViewTools, onCancel: handleMcpCancel, onComplete: handleMcpComplete, borderless: true });
    } else if (configType === "sse") {
      const server_0 = {
        name: client_3.name,
        client: client_3,
        scope: scope_5,
        transport: "sse",
        isAuthenticated: void 0,
        config: client_3.config
      };
      return /* @__PURE__ */ jsx(MCPRemoteServerMenu, { server: server_0, serverToolsCount, onViewTools: handleMcpViewTools, onCancel: handleMcpCancel, onComplete: handleMcpComplete, borderless: true });
    } else if (configType === "http") {
      const server_1 = {
        name: client_3.name,
        client: client_3,
        scope: scope_5,
        transport: "http",
        isAuthenticated: void 0,
        config: client_3.config
      };
      return /* @__PURE__ */ jsx(MCPRemoteServerMenu, { server: server_1, serverToolsCount, onViewTools: handleMcpViewTools, onCancel: handleMcpCancel, onComplete: handleMcpComplete, borderless: true });
    } else if (configType === "claudeai-proxy") {
      const server_2 = {
        name: client_3.name,
        client: client_3,
        scope: scope_5,
        transport: "claudeai-proxy",
        isAuthenticated: void 0,
        config: client_3.config
      };
      return /* @__PURE__ */ jsx(MCPRemoteServerMenu, { server: server_2, serverToolsCount, onViewTools: handleMcpViewTools, onCancel: handleMcpCancel, onComplete: handleMcpComplete, borderless: true });
    }
    setViewState("plugin-list");
    return null;
  }
  if (typeof viewState === "object" && viewState.type === "mcp-tools") {
    const client_4 = viewState.client;
    const scope_6 = client_4.config.scope;
    const configType_0 = client_4.config.type;
    let server_3;
    if (configType_0 === "stdio") {
      server_3 = {
        name: client_4.name,
        client: client_4,
        scope: scope_6,
        transport: "stdio",
        config: client_4.config
      };
    } else if (configType_0 === "sse") {
      server_3 = {
        name: client_4.name,
        client: client_4,
        scope: scope_6,
        transport: "sse",
        isAuthenticated: void 0,
        config: client_4.config
      };
    } else if (configType_0 === "http") {
      server_3 = {
        name: client_4.name,
        client: client_4,
        scope: scope_6,
        transport: "http",
        isAuthenticated: void 0,
        config: client_4.config
      };
    } else {
      server_3 = {
        name: client_4.name,
        client: client_4,
        scope: scope_6,
        transport: "claudeai-proxy",
        isAuthenticated: void 0,
        config: client_4.config
      };
    }
    return /* @__PURE__ */ jsx(MCPToolListView, { server: server_3, onSelectTool: (tool) => {
      setViewState({
        type: "mcp-tool-detail",
        client: client_4,
        tool
      });
    }, onBack: () => setViewState({
      type: "mcp-detail",
      client: client_4
    }) });
  }
  if (typeof viewState === "object" && viewState.type === "mcp-tool-detail") {
    const {
      client: client_5,
      tool: tool_0
    } = viewState;
    const scope_7 = client_5.config.scope;
    const configType_1 = client_5.config.type;
    let server_4;
    if (configType_1 === "stdio") {
      server_4 = {
        name: client_5.name,
        client: client_5,
        scope: scope_7,
        transport: "stdio",
        config: client_5.config
      };
    } else if (configType_1 === "sse") {
      server_4 = {
        name: client_5.name,
        client: client_5,
        scope: scope_7,
        transport: "sse",
        isAuthenticated: void 0,
        config: client_5.config
      };
    } else if (configType_1 === "http") {
      server_4 = {
        name: client_5.name,
        client: client_5,
        scope: scope_7,
        transport: "http",
        isAuthenticated: void 0,
        config: client_5.config
      };
    } else {
      server_4 = {
        name: client_5.name,
        client: client_5,
        scope: scope_7,
        transport: "claudeai-proxy",
        isAuthenticated: void 0,
        config: client_5.config
      };
    }
    return /* @__PURE__ */ jsx(MCPToolDetailView, { tool: tool_0, server: server_4, onBack: () => setViewState({
      type: "mcp-tools",
      client: client_5
    }) });
  }
  const visibleItems = pagination.getVisibleItems(filteredItems);
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(SearchBox, { query: searchQuery, isFocused: isSearchMode, isTerminalFocused, width: terminalWidth - 4, cursorOffset: searchCursorOffset }) }),
    filteredItems.length === 0 && searchQuery && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      'No items match "',
      searchQuery,
      '"'
    ] }) }),
    pagination.scrollPosition.canScrollUp && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " ",
      figures.arrowUp,
      " more above"
    ] }) }),
    visibleItems.map((item_10, visibleIndex) => {
      const actualIndex = pagination.toActualIndex(visibleIndex);
      const isSelected_0 = actualIndex === selectedIndex && !isSearchMode;
      const prevItem = visibleIndex > 0 ? visibleItems[visibleIndex - 1] : null;
      const showScopeHeader = !prevItem || prevItem.scope !== item_10.scope;
      const getScopeLabel = (scope_8) => {
        switch (scope_8) {
          case "flagged":
            return "Flagged";
          case "project":
            return "Project";
          case "local":
            return "Local";
          case "user":
            return "User";
          case "enterprise":
            return "Enterprise";
          case "managed":
            return "Managed";
          case "builtin":
            return "Built-in";
          case "dynamic":
            return "Built-in";
          default:
            return scope_8;
        }
      };
      return /* @__PURE__ */ jsxs(React.Fragment, { children: [
        showScopeHeader && /* @__PURE__ */ jsx(Box, { marginTop: visibleIndex > 0 ? 1 : 0, paddingLeft: 2, children: /* @__PURE__ */ jsx(Text, { dimColor: item_10.scope !== "flagged", color: item_10.scope === "flagged" ? "warning" : void 0, bold: item_10.scope === "flagged", children: getScopeLabel(item_10.scope) }) }),
        /* @__PURE__ */ jsx(UnifiedInstalledCell, { item: item_10, isSelected: isSelected_0 })
      ] }, item_10.id);
    }),
    pagination.scrollPosition.canScrollDown && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " ",
      figures.arrowDown,
      " more below"
    ] }) }),
    /* @__PURE__ */ jsx(Box, { marginTop: 1, marginLeft: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(Text, { children: "type to search" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "plugin:toggle", context: "Plugin", fallback: "Space", description: "toggle" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Select", fallback: "Enter", description: "details" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "back" })
    ] }) }) }),
    pendingToggles.size > 0 && /* @__PURE__ */ jsx(Box, { marginLeft: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: "Run /reload-plugins to apply changes" }) })
  ] });
}
export {
  ManagePlugins,
  filterManagedDisabledPlugins
};
