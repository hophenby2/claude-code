import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { useEffect, useState } from "react";
import { ConfigurableShortcutHint } from "../../components/ConfigurableShortcutHint.js";
import { Byline } from "../../components/design-system/Byline.js";
import { Pane } from "../../components/design-system/Pane.js";
import { Tab, Tabs } from "../../components/design-system/Tabs.js";
import { useExitOnCtrlCDWithKeybindings } from "../../hooks/useExitOnCtrlCDWithKeybindings.js";
import { Box, Text } from "../../ink.js";
import { useKeybinding, useKeybindings } from "../../keybindings/useKeybinding.js";
import { useAppState, useSetAppState } from "../../state/AppState.js";
import { errorMessage } from "../../utils/errors.js";
import { clearAllCaches } from "../../utils/plugins/cacheUtils.js";
import { loadMarketplacesWithGracefulDegradation } from "../../utils/plugins/marketplaceHelpers.js";
import { loadKnownMarketplacesConfig, removeMarketplaceSource } from "../../utils/plugins/marketplaceManager.js";
import { getPluginEditableScopes } from "../../utils/plugins/pluginStartupCheck.js";
import { getSettingsForSource, updateSettingsForSource } from "../../utils/settings/settings.js";
import { AddMarketplace } from "./AddMarketplace.js";
import { BrowseMarketplace } from "./BrowseMarketplace.js";
import { DiscoverPlugins } from "./DiscoverPlugins.js";
import { ManageMarketplaces } from "./ManageMarketplaces.js";
import { ManagePlugins } from "./ManagePlugins.js";
import { formatErrorMessage, getErrorGuidance } from "./PluginErrors.js";
import { parsePluginArgs } from "./parseArgs.js";
import { ValidatePlugin } from "./ValidatePlugin.js";
function MarketplaceList(t0) {
  const $ = _c(4);
  const {
    onComplete
  } = t0;
  let t1;
  let t2;
  if ($[0] !== onComplete) {
    t1 = () => {
      const loadList = async function loadList2() {
        ;
        try {
          const config = await loadKnownMarketplacesConfig();
          const names = Object.keys(config);
          if (names.length === 0) {
            onComplete("No marketplaces configured");
          } else {
            onComplete(`Configured marketplaces:
${names.map(_temp).join("\n")}`);
          }
        } catch (t32) {
          const err = t32;
          onComplete(`Error loading marketplaces: ${errorMessage(err)}`);
        }
      };
      loadList();
    };
    t2 = [onComplete];
    $[0] = onComplete;
    $[1] = t1;
    $[2] = t2;
  } else {
    t1 = $[1];
    t2 = $[2];
  }
  useEffect(t1, t2);
  let t3;
  if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = /* @__PURE__ */ jsx(Text, { children: "Loading marketplaces..." });
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  return t3;
}
function _temp(n) {
  return `  \u2022 ${n}`;
}
function McpRedirectBanner() {
  return null;
}
function getExtraMarketplaceSourceInfo(name) {
  const editableSources = [];
  const sourcesToCheck = [{
    source: "userSettings",
    scope: "user"
  }, {
    source: "projectSettings",
    scope: "project"
  }, {
    source: "localSettings",
    scope: "local"
  }];
  for (const {
    source,
    scope
  } of sourcesToCheck) {
    const settings = getSettingsForSource(source);
    if (settings?.extraKnownMarketplaces?.[name]) {
      editableSources.push({
        source,
        scope
      });
    }
  }
  const policySettings = getSettingsForSource("policySettings");
  const isInPolicy = Boolean(policySettings?.extraKnownMarketplaces?.[name]);
  return {
    editableSources,
    isInPolicy
  };
}
function buildMarketplaceAction(name) {
  const {
    editableSources,
    isInPolicy
  } = getExtraMarketplaceSourceInfo(name);
  if (editableSources.length > 0) {
    return {
      kind: "remove-extra-marketplace",
      name,
      sources: editableSources
    };
  }
  if (isInPolicy) {
    return {
      kind: "managed-only",
      name
    };
  }
  return {
    kind: "navigate",
    tab: "marketplaces",
    viewState: {
      type: "manage-marketplaces",
      targetMarketplace: name,
      action: "remove"
    }
  };
}
function buildPluginAction(pluginName) {
  return {
    kind: "navigate",
    tab: "installed",
    viewState: {
      type: "manage-plugins",
      targetPlugin: pluginName,
      action: "uninstall"
    }
  };
}
const TRANSIENT_ERROR_TYPES = /* @__PURE__ */ new Set(["git-auth-failed", "git-timeout", "network-error"]);
function isTransientError(error) {
  return TRANSIENT_ERROR_TYPES.has(error.type);
}
function getPluginNameFromError(error) {
  if ("pluginId" in error && error.pluginId) return error.pluginId;
  if ("plugin" in error && error.plugin) return error.plugin;
  if (error.source.includes("@")) return error.source.split("@")[0];
  return void 0;
}
function buildErrorRows(failedMarketplaces, extraMarketplaceErrors, pluginLoadingErrors, otherErrors, brokenInstalledMarketplaces, transientErrors, pluginScopes) {
  const rows = [];
  for (const error of transientErrors) {
    const pluginName = "pluginId" in error ? error.pluginId : "plugin" in error ? error.plugin : void 0;
    rows.push({
      label: pluginName ?? error.source,
      message: formatErrorMessage(error),
      guidance: "Restart to retry loading plugins",
      action: {
        kind: "none"
      }
    });
  }
  const shownMarketplaceNames = /* @__PURE__ */ new Set();
  for (const m of failedMarketplaces) {
    shownMarketplaceNames.add(m.name);
    const action = buildMarketplaceAction(m.name);
    const sourceInfo = getExtraMarketplaceSourceInfo(m.name);
    const scope = sourceInfo.isInPolicy ? "managed" : sourceInfo.editableSources[0]?.scope;
    rows.push({
      label: m.name,
      message: m.error ?? "Installation failed",
      guidance: action.kind === "managed-only" ? "Managed by your organization \u2014 contact your admin" : void 0,
      action,
      scope
    });
  }
  for (const e of extraMarketplaceErrors) {
    const marketplace = "marketplace" in e ? e.marketplace : e.source;
    if (shownMarketplaceNames.has(marketplace)) continue;
    shownMarketplaceNames.add(marketplace);
    const action = buildMarketplaceAction(marketplace);
    const sourceInfo = getExtraMarketplaceSourceInfo(marketplace);
    const scope = sourceInfo.isInPolicy ? "managed" : sourceInfo.editableSources[0]?.scope;
    rows.push({
      label: marketplace,
      message: formatErrorMessage(e),
      guidance: action.kind === "managed-only" ? "Managed by your organization \u2014 contact your admin" : getErrorGuidance(e),
      action,
      scope
    });
  }
  for (const m of brokenInstalledMarketplaces) {
    if (shownMarketplaceNames.has(m.name)) continue;
    shownMarketplaceNames.add(m.name);
    rows.push({
      label: m.name,
      message: m.error,
      action: {
        kind: "remove-installed-marketplace",
        name: m.name
      }
    });
  }
  const shownPluginNames = /* @__PURE__ */ new Set();
  for (const error of pluginLoadingErrors) {
    const pluginName = getPluginNameFromError(error);
    if (pluginName && shownPluginNames.has(pluginName)) continue;
    if (pluginName) shownPluginNames.add(pluginName);
    const marketplace = "marketplace" in error ? error.marketplace : void 0;
    const scope = pluginName ? pluginScopes.get(error.source) ?? pluginScopes.get(pluginName) : void 0;
    rows.push({
      label: pluginName ? marketplace ? `${pluginName} @ ${marketplace}` : pluginName : error.source,
      message: formatErrorMessage(error),
      guidance: getErrorGuidance(error),
      action: pluginName ? buildPluginAction(pluginName) : {
        kind: "none"
      },
      scope
    });
  }
  for (const error of otherErrors) {
    rows.push({
      label: error.source,
      message: formatErrorMessage(error),
      guidance: getErrorGuidance(error),
      action: {
        kind: "none"
      }
    });
  }
  return rows;
}
function removeExtraMarketplace(name, sources) {
  for (const {
    source
  } of sources) {
    const settings = getSettingsForSource(source);
    if (!settings) continue;
    const updates = {};
    if (settings.extraKnownMarketplaces?.[name]) {
      updates.extraKnownMarketplaces = {
        ...settings.extraKnownMarketplaces,
        [name]: void 0
      };
    }
    if (settings.enabledPlugins) {
      const suffix = `@${name}`;
      let removedPlugins = false;
      const updatedPlugins = {
        ...settings.enabledPlugins
      };
      for (const pluginId in updatedPlugins) {
        if (pluginId.endsWith(suffix)) {
          updatedPlugins[pluginId] = void 0;
          removedPlugins = true;
        }
      }
      if (removedPlugins) {
        updates.enabledPlugins = updatedPlugins;
      }
    }
    if (Object.keys(updates).length > 0) {
      updateSettingsForSource(source, updates);
    }
  }
}
function ErrorsTabContent(t0) {
  const $ = _c(26);
  const {
    setViewState,
    setActiveTab,
    markPluginsChanged
  } = t0;
  const errors = useAppState(_temp2);
  const installationStatus = useAppState(_temp3);
  const setAppState = useSetAppState();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionMessage, setActionMessage] = useState(null);
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = [];
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [marketplaceLoadFailures, setMarketplaceLoadFailures] = useState(t1);
  let t2;
  let t3;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => {
      (async () => {
        try {
          const config = await loadKnownMarketplacesConfig();
          const {
            failures
          } = await loadMarketplacesWithGracefulDegradation(config);
          setMarketplaceLoadFailures(failures);
        } catch {
        }
      })();
    };
    t3 = [];
    $[1] = t2;
    $[2] = t3;
  } else {
    t2 = $[1];
    t3 = $[2];
  }
  useEffect(t2, t3);
  const failedMarketplaces = installationStatus.marketplaces.filter(_temp4);
  const failedMarketplaceNames = new Set(failedMarketplaces.map(_temp5));
  const transientErrors = errors.filter(isTransientError);
  const extraMarketplaceErrors = errors.filter((e) => (e.type === "marketplace-not-found" || e.type === "marketplace-load-failed" || e.type === "marketplace-blocked-by-policy") && !failedMarketplaceNames.has(e.marketplace));
  const pluginLoadingErrors = errors.filter(_temp6);
  const otherErrors = errors.filter(_temp7);
  const pluginScopes = getPluginEditableScopes();
  const rows = buildErrorRows(failedMarketplaces, extraMarketplaceErrors, pluginLoadingErrors, otherErrors, marketplaceLoadFailures, transientErrors, pluginScopes);
  let t4;
  if ($[3] !== setViewState) {
    t4 = () => {
      setViewState({
        type: "menu"
      });
    };
    $[3] = setViewState;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  let t5;
  if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = {
      context: "Confirmation"
    };
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  useKeybinding("confirm:no", t4, t5);
  const handleSelect = () => {
    const row = rows[selectedIndex];
    if (!row) {
      return;
    }
    const {
      action
    } = row;
    bb77: switch (action.kind) {
      case "navigate": {
        setActiveTab(action.tab);
        setViewState(action.viewState);
        break bb77;
      }
      case "remove-extra-marketplace": {
        const scopes = action.sources.map(_temp8).join(", ");
        removeExtraMarketplace(action.name, action.sources);
        clearAllCaches();
        setAppState((prev_0) => ({
          ...prev_0,
          plugins: {
            ...prev_0.plugins,
            errors: prev_0.plugins.errors.filter((e_2) => !("marketplace" in e_2 && e_2.marketplace === action.name)),
            installationStatus: {
              ...prev_0.plugins.installationStatus,
              marketplaces: prev_0.plugins.installationStatus.marketplaces.filter((m_1) => m_1.name !== action.name)
            }
          }
        }));
        setActionMessage(`${figures.tick} Removed "${action.name}" from ${scopes} settings`);
        markPluginsChanged();
        break bb77;
      }
      case "remove-installed-marketplace": {
        (async () => {
          ;
          try {
            await removeMarketplaceSource(action.name);
            clearAllCaches();
            setMarketplaceLoadFailures((prev) => prev.filter((f) => f.name !== action.name));
            setActionMessage(`${figures.tick} Removed marketplace "${action.name}"`);
            markPluginsChanged();
          } catch (t6) {
            const err = t6;
            setActionMessage(`Failed to remove "${action.name}": ${err instanceof Error ? err.message : String(err)}`);
          }
        })();
        break bb77;
      }
      case "managed-only": {
        break bb77;
      }
      case "none":
    }
  };
  let t7;
  if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t7 = () => setSelectedIndex(_temp9);
    $[6] = t7;
  } else {
    t7 = $[6];
  }
  const t8 = rows.length > 0;
  let t9;
  if ($[7] !== t8) {
    t9 = {
      context: "Select",
      isActive: t8
    };
    $[7] = t8;
    $[8] = t9;
  } else {
    t9 = $[8];
  }
  useKeybindings({
    "select:previous": t7,
    "select:next": () => setSelectedIndex((prev_2) => Math.min(rows.length - 1, prev_2 + 1)),
    "select:accept": handleSelect
  }, t9);
  const clampedIndex = Math.min(selectedIndex, Math.max(0, rows.length - 1));
  if (clampedIndex !== selectedIndex) {
    setSelectedIndex(clampedIndex);
  }
  const selectedAction = rows[clampedIndex]?.action;
  const hasAction = selectedAction && selectedAction.kind !== "none" && selectedAction.kind !== "managed-only";
  if (rows.length === 0) {
    let t102;
    if ($[9] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t102 = /* @__PURE__ */ jsx(Box, { marginLeft: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "No plugin errors" }) });
      $[9] = t102;
    } else {
      t102 = $[9];
    }
    let t112;
    if ($[10] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t112 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        t102,
        /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "back" }) }) })
      ] });
      $[10] = t112;
    } else {
      t112 = $[10];
    }
    return t112;
  }
  const T0 = Box;
  const t10 = "column";
  let t11;
  if ($[11] !== clampedIndex) {
    t11 = (row_0, idx) => {
      const isSelected = idx === clampedIndex;
      return /* @__PURE__ */ jsxs(Box, { marginLeft: 1, flexDirection: "column", marginBottom: 1, children: [
        /* @__PURE__ */ jsxs(Text, { children: [
          /* @__PURE__ */ jsxs(Text, { color: isSelected ? "suggestion" : "error", children: [
            isSelected ? figures.pointer : figures.cross,
            " "
          ] }),
          /* @__PURE__ */ jsx(Text, { bold: isSelected, children: row_0.label }),
          row_0.scope && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            " (",
            row_0.scope,
            ")"
          ] })
        ] }),
        /* @__PURE__ */ jsx(Box, { marginLeft: 3, children: /* @__PURE__ */ jsx(Text, { color: "error", children: row_0.message }) }),
        row_0.guidance && /* @__PURE__ */ jsx(Box, { marginLeft: 3, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: row_0.guidance }) })
      ] }, idx);
    };
    $[11] = clampedIndex;
    $[12] = t11;
  } else {
    t11 = $[12];
  }
  const t12 = rows.map(t11);
  let t13;
  if ($[13] !== actionMessage) {
    t13 = actionMessage && /* @__PURE__ */ jsx(Box, { marginTop: 1, marginLeft: 1, children: /* @__PURE__ */ jsx(Text, { color: "claude", children: actionMessage }) });
    $[13] = actionMessage;
    $[14] = t13;
  } else {
    t13 = $[14];
  }
  let t14;
  if ($[15] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t14 = /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:previous", context: "Select", fallback: "\u2191", description: "navigate" });
    $[15] = t14;
  } else {
    t14 = $[15];
  }
  let t15;
  if ($[16] !== hasAction) {
    t15 = hasAction && /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Select", fallback: "Enter", description: "resolve" });
    $[16] = hasAction;
    $[17] = t15;
  } else {
    t15 = $[17];
  }
  let t16;
  if ($[18] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t16 = /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "back" });
    $[18] = t16;
  } else {
    t16 = $[18];
  }
  let t17;
  if ($[19] !== t15) {
    t17 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      t14,
      t15,
      t16
    ] }) }) });
    $[19] = t15;
    $[20] = t17;
  } else {
    t17 = $[20];
  }
  let t18;
  if ($[21] !== T0 || $[22] !== t12 || $[23] !== t13 || $[24] !== t17) {
    t18 = /* @__PURE__ */ jsxs(T0, { flexDirection: t10, children: [
      t12,
      t13,
      t17
    ] });
    $[21] = T0;
    $[22] = t12;
    $[23] = t13;
    $[24] = t17;
    $[25] = t18;
  } else {
    t18 = $[25];
  }
  return t18;
}
function _temp9(prev_1) {
  return Math.max(0, prev_1 - 1);
}
function _temp8(s_1) {
  return s_1.scope;
}
function _temp7(e_1) {
  if (isTransientError(e_1)) {
    return false;
  }
  if (e_1.type === "marketplace-not-found" || e_1.type === "marketplace-load-failed" || e_1.type === "marketplace-blocked-by-policy") {
    return false;
  }
  return getPluginNameFromError(e_1) === void 0;
}
function _temp6(e_0) {
  if (isTransientError(e_0)) {
    return false;
  }
  if (e_0.type === "marketplace-not-found" || e_0.type === "marketplace-load-failed" || e_0.type === "marketplace-blocked-by-policy") {
    return false;
  }
  return getPluginNameFromError(e_0) !== void 0;
}
function _temp5(m_0) {
  return m_0.name;
}
function _temp4(m) {
  return m.status === "failed";
}
function _temp3(s_0) {
  return s_0.plugins.installationStatus;
}
function _temp2(s) {
  return s.plugins.errors;
}
function getInitialViewState(parsedCommand) {
  switch (parsedCommand.type) {
    case "help":
      return {
        type: "help"
      };
    case "validate":
      return {
        type: "validate",
        path: parsedCommand.path
      };
    case "install":
      if (parsedCommand.marketplace) {
        return {
          type: "browse-marketplace",
          targetMarketplace: parsedCommand.marketplace,
          targetPlugin: parsedCommand.plugin
        };
      }
      if (parsedCommand.plugin) {
        return {
          type: "discover-plugins",
          targetPlugin: parsedCommand.plugin
        };
      }
      return {
        type: "discover-plugins"
      };
    case "manage":
      return {
        type: "manage-plugins"
      };
    case "uninstall":
      return {
        type: "manage-plugins",
        targetPlugin: parsedCommand.plugin,
        action: "uninstall"
      };
    case "enable":
      return {
        type: "manage-plugins",
        targetPlugin: parsedCommand.plugin,
        action: "enable"
      };
    case "disable":
      return {
        type: "manage-plugins",
        targetPlugin: parsedCommand.plugin,
        action: "disable"
      };
    case "marketplace":
      if (parsedCommand.action === "list") {
        return {
          type: "marketplace-list"
        };
      }
      if (parsedCommand.action === "add") {
        return {
          type: "add-marketplace",
          initialValue: parsedCommand.target
        };
      }
      if (parsedCommand.action === "remove") {
        return {
          type: "manage-marketplaces",
          targetMarketplace: parsedCommand.target,
          action: "remove"
        };
      }
      if (parsedCommand.action === "update") {
        return {
          type: "manage-marketplaces",
          targetMarketplace: parsedCommand.target,
          action: "update"
        };
      }
      return {
        type: "marketplace-menu"
      };
    case "menu":
    default:
      return {
        type: "discover-plugins"
      };
  }
}
function getInitialTab(viewState) {
  if (viewState.type === "manage-plugins") return "installed";
  if (viewState.type === "manage-marketplaces") return "marketplaces";
  return "discover";
}
function PluginSettings(t0) {
  const $ = _c(75);
  const {
    onComplete,
    args,
    showMcpRedirectMessage
  } = t0;
  let parsedCommand;
  let t1;
  if ($[0] !== args) {
    parsedCommand = parsePluginArgs(args);
    t1 = getInitialViewState(parsedCommand);
    $[0] = args;
    $[1] = parsedCommand;
    $[2] = t1;
  } else {
    parsedCommand = $[1];
    t1 = $[2];
  }
  const initialViewState = t1;
  const [viewState, setViewState] = useState(initialViewState);
  let t2;
  if ($[3] !== initialViewState) {
    t2 = getInitialTab(initialViewState);
    $[3] = initialViewState;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  const [activeTab, setActiveTab] = useState(t2);
  const [inputValue, setInputValue] = useState(viewState.type === "add-marketplace" ? viewState.initialValue || "" : "");
  const [cursorOffset, setCursorOffset] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [childSearchActive, setChildSearchActive] = useState(false);
  const setAppState = useSetAppState();
  const pluginErrorCount = useAppState(_temp0);
  const errorsTabTitle = pluginErrorCount > 0 ? `Errors (${pluginErrorCount})` : "Errors";
  const exitState = useExitOnCtrlCDWithKeybindings();
  const cliMode = parsedCommand.type === "marketplace" && parsedCommand.action === "add" && parsedCommand.target !== void 0;
  let t3;
  if ($[5] !== setAppState) {
    t3 = () => {
      setAppState(_temp1);
    };
    $[5] = setAppState;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  const markPluginsChanged = t3;
  let t4;
  if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = (tabId) => {
      const tab = tabId;
      setActiveTab(tab);
      setError(null);
      bb37: switch (tab) {
        case "discover": {
          setViewState({
            type: "discover-plugins"
          });
          break bb37;
        }
        case "installed": {
          setViewState({
            type: "manage-plugins"
          });
          break bb37;
        }
        case "marketplaces": {
          setViewState({
            type: "manage-marketplaces"
          });
          break bb37;
        }
        case "errors":
      }
    };
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  const handleTabChange = t4;
  let t5;
  let t6;
  if ($[8] !== onComplete || $[9] !== result || $[10] !== viewState.type) {
    t5 = () => {
      if (viewState.type === "menu" && !result) {
        onComplete();
      }
    };
    t6 = [viewState.type, result, onComplete];
    $[8] = onComplete;
    $[9] = result;
    $[10] = viewState.type;
    $[11] = t5;
    $[12] = t6;
  } else {
    t5 = $[11];
    t6 = $[12];
  }
  useEffect(t5, t6);
  let t7;
  let t8;
  if ($[13] !== activeTab || $[14] !== viewState.type) {
    t7 = () => {
      if (viewState.type === "browse-marketplace" && activeTab !== "discover") {
        setActiveTab("discover");
      }
    };
    t8 = [viewState.type, activeTab];
    $[13] = activeTab;
    $[14] = viewState.type;
    $[15] = t7;
    $[16] = t8;
  } else {
    t7 = $[15];
    t8 = $[16];
  }
  useEffect(t7, t8);
  let t9;
  if ($[17] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t9 = () => {
      setActiveTab("marketplaces");
      setViewState({
        type: "manage-marketplaces"
      });
      setInputValue("");
      setError(null);
    };
    $[17] = t9;
  } else {
    t9 = $[17];
  }
  const handleAddMarketplaceEscape = t9;
  const t10 = viewState.type === "add-marketplace";
  let t11;
  if ($[18] !== t10) {
    t11 = {
      context: "Settings",
      isActive: t10
    };
    $[18] = t10;
    $[19] = t11;
  } else {
    t11 = $[19];
  }
  useKeybinding("confirm:no", handleAddMarketplaceEscape, t11);
  let t12;
  let t13;
  if ($[20] !== onComplete || $[21] !== result) {
    t12 = () => {
      if (result) {
        onComplete(result);
      }
    };
    t13 = [result, onComplete];
    $[20] = onComplete;
    $[21] = result;
    $[22] = t12;
    $[23] = t13;
  } else {
    t12 = $[22];
    t13 = $[23];
  }
  useEffect(t12, t13);
  let t14;
  let t15;
  if ($[24] !== onComplete || $[25] !== viewState.type) {
    t14 = () => {
      if (viewState.type === "help") {
        onComplete();
      }
    };
    t15 = [viewState.type, onComplete];
    $[24] = onComplete;
    $[25] = viewState.type;
    $[26] = t14;
    $[27] = t15;
  } else {
    t14 = $[26];
    t15 = $[27];
  }
  useEffect(t14, t15);
  if (viewState.type === "help") {
    let t162;
    if ($[28] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t162 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Plugin Command Usage:" }),
        /* @__PURE__ */ jsx(Text, { children: " " }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Installation:" }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin install - Browse and install plugins" }),
        /* @__PURE__ */ jsxs(Text, { children: [
          " ",
          "/plugin install <marketplace> - Install from specific marketplace"
        ] }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin install <plugin> - Install specific plugin" }),
        /* @__PURE__ */ jsxs(Text, { children: [
          " ",
          "/plugin install <plugin>@<market> - Install plugin from marketplace"
        ] }),
        /* @__PURE__ */ jsx(Text, { children: " " }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Management:" }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin manage - Manage installed plugins" }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin enable <plugin> - Enable a plugin" }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin disable <plugin> - Disable a plugin" }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin uninstall <plugin> - Uninstall a plugin" }),
        /* @__PURE__ */ jsx(Text, { children: " " }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Marketplaces:" }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin marketplace - Marketplace management menu" }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin marketplace add - Add a marketplace" }),
        /* @__PURE__ */ jsxs(Text, { children: [
          " ",
          "/plugin marketplace add <path/url> - Add marketplace directly"
        ] }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin marketplace update - Update marketplaces" }),
        /* @__PURE__ */ jsxs(Text, { children: [
          " ",
          "/plugin marketplace update <name> - Update specific marketplace"
        ] }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin marketplace remove - Remove a marketplace" }),
        /* @__PURE__ */ jsxs(Text, { children: [
          " ",
          "/plugin marketplace remove <name> - Remove specific marketplace"
        ] }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin marketplace list - List all marketplaces" }),
        /* @__PURE__ */ jsx(Text, { children: " " }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Validation:" }),
        /* @__PURE__ */ jsxs(Text, { children: [
          " ",
          "/plugin validate <path> - Validate a manifest file or directory"
        ] }),
        /* @__PURE__ */ jsx(Text, { children: " " }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Other:" }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin - Main plugin menu" }),
        /* @__PURE__ */ jsx(Text, { children: " /plugin help - Show this help" }),
        /* @__PURE__ */ jsx(Text, { children: " /plugins - Alias for /plugin" })
      ] });
      $[28] = t162;
    } else {
      t162 = $[28];
    }
    return t162;
  }
  if (viewState.type === "validate") {
    let t162;
    if ($[29] !== onComplete || $[30] !== viewState.path) {
      t162 = /* @__PURE__ */ jsx(ValidatePlugin, { onComplete, path: viewState.path });
      $[29] = onComplete;
      $[30] = viewState.path;
      $[31] = t162;
    } else {
      t162 = $[31];
    }
    return t162;
  }
  if (viewState.type === "marketplace-menu") {
    setViewState({
      type: "menu"
    });
    return null;
  }
  if (viewState.type === "marketplace-list") {
    let t162;
    if ($[32] !== onComplete) {
      t162 = /* @__PURE__ */ jsx(MarketplaceList, { onComplete });
      $[32] = onComplete;
      $[33] = t162;
    } else {
      t162 = $[33];
    }
    return t162;
  }
  if (viewState.type === "add-marketplace") {
    let t162;
    if ($[34] !== cliMode || $[35] !== cursorOffset || $[36] !== error || $[37] !== inputValue || $[38] !== markPluginsChanged || $[39] !== result) {
      t162 = /* @__PURE__ */ jsx(AddMarketplace, { inputValue, setInputValue, cursorOffset, setCursorOffset, error, setError, result, setResult, setViewState, onAddComplete: markPluginsChanged, cliMode });
      $[34] = cliMode;
      $[35] = cursorOffset;
      $[36] = error;
      $[37] = inputValue;
      $[38] = markPluginsChanged;
      $[39] = result;
      $[40] = t162;
    } else {
      t162 = $[40];
    }
    return t162;
  }
  let t16;
  if ($[41] !== activeTab || $[42] !== showMcpRedirectMessage) {
    t16 = showMcpRedirectMessage && activeTab === "installed" ? /* @__PURE__ */ jsx(McpRedirectBanner, {}) : void 0;
    $[41] = activeTab;
    $[42] = showMcpRedirectMessage;
    $[43] = t16;
  } else {
    t16 = $[43];
  }
  let t17;
  if ($[44] !== error || $[45] !== markPluginsChanged || $[46] !== result || $[47] !== viewState.targetMarketplace || $[48] !== viewState.targetPlugin || $[49] !== viewState.type) {
    t17 = /* @__PURE__ */ jsx(Tab, { id: "discover", title: "Discover", children: viewState.type === "browse-marketplace" ? /* @__PURE__ */ jsx(BrowseMarketplace, { error, setError, result, setResult, setViewState, onInstallComplete: markPluginsChanged, targetMarketplace: viewState.targetMarketplace, targetPlugin: viewState.targetPlugin }) : /* @__PURE__ */ jsx(DiscoverPlugins, { error, setError, result, setResult, setViewState, onInstallComplete: markPluginsChanged, onSearchModeChange: setChildSearchActive, targetPlugin: viewState.type === "discover-plugins" ? viewState.targetPlugin : void 0 }) });
    $[44] = error;
    $[45] = markPluginsChanged;
    $[46] = result;
    $[47] = viewState.targetMarketplace;
    $[48] = viewState.targetPlugin;
    $[49] = viewState.type;
    $[50] = t17;
  } else {
    t17 = $[50];
  }
  const t18 = viewState.type === "manage-plugins" ? viewState.targetPlugin : void 0;
  const t19 = viewState.type === "manage-plugins" ? viewState.targetMarketplace : void 0;
  const t20 = viewState.type === "manage-plugins" ? viewState.action : void 0;
  let t21;
  if ($[51] !== markPluginsChanged || $[52] !== t18 || $[53] !== t19 || $[54] !== t20) {
    t21 = /* @__PURE__ */ jsx(Tab, { id: "installed", title: "Installed", children: /* @__PURE__ */ jsx(ManagePlugins, { setViewState, setResult, onManageComplete: markPluginsChanged, onSearchModeChange: setChildSearchActive, targetPlugin: t18, targetMarketplace: t19, action: t20 }) });
    $[51] = markPluginsChanged;
    $[52] = t18;
    $[53] = t19;
    $[54] = t20;
    $[55] = t21;
  } else {
    t21 = $[55];
  }
  const t22 = viewState.type === "manage-marketplaces" ? viewState.targetMarketplace : void 0;
  const t23 = viewState.type === "manage-marketplaces" ? viewState.action : void 0;
  let t24;
  if ($[56] !== error || $[57] !== exitState || $[58] !== markPluginsChanged || $[59] !== t22 || $[60] !== t23) {
    t24 = /* @__PURE__ */ jsx(Tab, { id: "marketplaces", title: "Marketplaces", children: /* @__PURE__ */ jsx(ManageMarketplaces, { setViewState, error, setError, setResult, exitState, onManageComplete: markPluginsChanged, targetMarketplace: t22, action: t23 }) });
    $[56] = error;
    $[57] = exitState;
    $[58] = markPluginsChanged;
    $[59] = t22;
    $[60] = t23;
    $[61] = t24;
  } else {
    t24 = $[61];
  }
  let t25;
  if ($[62] !== markPluginsChanged) {
    t25 = /* @__PURE__ */ jsx(ErrorsTabContent, { setViewState, setActiveTab, markPluginsChanged });
    $[62] = markPluginsChanged;
    $[63] = t25;
  } else {
    t25 = $[63];
  }
  let t26;
  if ($[64] !== errorsTabTitle || $[65] !== t25) {
    t26 = /* @__PURE__ */ jsx(Tab, { id: "errors", title: errorsTabTitle, children: t25 });
    $[64] = errorsTabTitle;
    $[65] = t25;
    $[66] = t26;
  } else {
    t26 = $[66];
  }
  let t27;
  if ($[67] !== activeTab || $[68] !== childSearchActive || $[69] !== t16 || $[70] !== t17 || $[71] !== t21 || $[72] !== t24 || $[73] !== t26) {
    t27 = /* @__PURE__ */ jsx(Pane, { color: "suggestion", children: /* @__PURE__ */ jsxs(Tabs, { title: "Plugins", selectedTab: activeTab, onTabChange: handleTabChange, color: "suggestion", disableNavigation: childSearchActive, banner: t16, children: [
      t17,
      t21,
      t24,
      t26
    ] }) });
    $[67] = activeTab;
    $[68] = childSearchActive;
    $[69] = t16;
    $[70] = t17;
    $[71] = t21;
    $[72] = t24;
    $[73] = t26;
    $[74] = t27;
  } else {
    t27 = $[74];
  }
  return t27;
}
function _temp1(prev) {
  return prev.plugins.needsRefresh ? prev : {
    ...prev,
    plugins: {
      ...prev.plugins,
      needsRefresh: true
    }
  };
}
function _temp0(s) {
  let count = s.plugins.errors.length;
  for (const m of s.plugins.installationStatus.marketplaces) {
    if (m.status === "failed") {
      count++;
    }
  }
  return count;
}
export {
  PluginSettings
};
