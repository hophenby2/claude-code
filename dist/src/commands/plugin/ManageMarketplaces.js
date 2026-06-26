import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { useEffect, useRef, useState } from "react";
import { logEvent } from "../../services/analytics/index.js";
import { ConfigurableShortcutHint } from "../../components/ConfigurableShortcutHint.js";
import { Byline } from "../../components/design-system/Byline.js";
import { KeyboardShortcutHint } from "../../components/design-system/KeyboardShortcutHint.js";
import { Box, Text, useInput } from "../../ink.js";
import { useKeybinding, useKeybindings } from "../../keybindings/useKeybinding.js";
import { count } from "../../utils/array.js";
import { shouldSkipPluginAutoupdate } from "../../utils/config.js";
import { errorMessage } from "../../utils/errors.js";
import { clearAllCaches } from "../../utils/plugins/cacheUtils.js";
import { createPluginId, formatMarketplaceLoadingErrors, getMarketplaceSourceDisplay, loadMarketplacesWithGracefulDegradation } from "../../utils/plugins/marketplaceHelpers.js";
import { loadKnownMarketplacesConfig, refreshMarketplace, removeMarketplaceSource, setMarketplaceAutoUpdate } from "../../utils/plugins/marketplaceManager.js";
import { updatePluginsForMarketplaces } from "../../utils/plugins/pluginAutoupdate.js";
import { loadAllPlugins } from "../../utils/plugins/pluginLoader.js";
import { isMarketplaceAutoUpdate } from "../../utils/plugins/schemas.js";
import { getSettingsForSource, updateSettingsForSource } from "../../utils/settings/settings.js";
import { plural } from "../../utils/stringUtils.js";
function ManageMarketplaces({
  setViewState,
  error,
  setError,
  setResult,
  exitState,
  onManageComplete,
  targetMarketplace,
  action
}) {
  const [marketplaceStates, setMarketplaceStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [progressMessage, setProgressMessage] = useState(null);
  const [internalView, setInternalView] = useState("list");
  const [selectedMarketplace, setSelectedMarketplace] = useState(null);
  const [detailsMenuIndex, setDetailsMenuIndex] = useState(0);
  const hasAttemptedAutoAction = useRef(false);
  useEffect(() => {
    async function loadMarketplaces() {
      try {
        const config = await loadKnownMarketplacesConfig();
        const {
          enabled,
          disabled
        } = await loadAllPlugins();
        const allPlugins = [...enabled, ...disabled];
        const {
          marketplaces,
          failures
        } = await loadMarketplacesWithGracefulDegradation(config);
        const states = [];
        for (const {
          name,
          config: entry,
          data: marketplace
        } of marketplaces) {
          const installedFromMarketplace = allPlugins.filter((plugin) => plugin.source.endsWith(`@${name}`));
          states.push({
            name,
            source: getMarketplaceSourceDisplay(entry.source),
            lastUpdated: entry.lastUpdated,
            pluginCount: marketplace?.plugins.length,
            installedPlugins: installedFromMarketplace,
            pendingUpdate: false,
            pendingRemove: false,
            autoUpdate: isMarketplaceAutoUpdate(name, entry)
          });
        }
        states.sort((a, b) => {
          if (a.name === "claude-plugin-directory") return -1;
          if (b.name === "claude-plugin-directory") return 1;
          return a.name.localeCompare(b.name);
        });
        setMarketplaceStates(states);
        const successCount = count(marketplaces, (m) => m.data !== null);
        const errorResult = formatMarketplaceLoadingErrors(failures, successCount);
        if (errorResult) {
          if (errorResult.type === "warning") {
            setProcessError(errorResult.message);
          } else {
            throw new Error(errorResult.message);
          }
        }
        if (targetMarketplace && !hasAttemptedAutoAction.current && !error) {
          hasAttemptedAutoAction.current = true;
          const targetIndex = states.findIndex((s) => s.name === targetMarketplace);
          if (targetIndex >= 0) {
            const targetState = states[targetIndex];
            if (action) {
              setSelectedIndex(targetIndex + 1);
              const newStates = [...states];
              if (action === "update") {
                newStates[targetIndex].pendingUpdate = true;
              } else if (action === "remove") {
                newStates[targetIndex].pendingRemove = true;
              }
              setMarketplaceStates(newStates);
              setTimeout(applyChanges, 100, newStates);
            } else if (targetState) {
              setSelectedIndex(targetIndex + 1);
              setSelectedMarketplace(targetState);
              setInternalView("details");
            }
          } else if (setError) {
            setError(`Marketplace not found: ${targetMarketplace}`);
          }
        }
      } catch (err) {
        if (setError) {
          setError(err instanceof Error ? err.message : "Failed to load marketplaces");
        }
        setProcessError(err instanceof Error ? err.message : "Failed to load marketplaces");
      } finally {
        setLoading(false);
      }
    }
    void loadMarketplaces();
  }, [targetMarketplace, action, error]);
  const hasPendingChanges = () => {
    return marketplaceStates.some((state) => state.pendingUpdate || state.pendingRemove);
  };
  const getPendingCounts = () => {
    const updateCount2 = count(marketplaceStates, (s) => s.pendingUpdate);
    const removeCount2 = count(marketplaceStates, (s) => s.pendingRemove);
    return {
      updateCount: updateCount2,
      removeCount: removeCount2
    };
  };
  const applyChanges = async (states) => {
    const statesToProcess = states || marketplaceStates;
    const wasInDetailsView = internalView === "details";
    setIsProcessing(true);
    setProcessError(null);
    setSuccessMessage(null);
    setProgressMessage(null);
    try {
      const settings = getSettingsForSource("userSettings");
      let updatedCount = 0;
      let removedCount = 0;
      const refreshedMarketplaces = /* @__PURE__ */ new Set();
      for (const state of statesToProcess) {
        if (state.pendingRemove) {
          if (state.installedPlugins && state.installedPlugins.length > 0) {
            const newEnabledPlugins = {
              ...settings?.enabledPlugins
            };
            for (const plugin of state.installedPlugins) {
              const pluginId = createPluginId(plugin.name, state.name);
              newEnabledPlugins[pluginId] = false;
            }
            updateSettingsForSource("userSettings", {
              enabledPlugins: newEnabledPlugins
            });
          }
          await removeMarketplaceSource(state.name);
          removedCount++;
          logEvent("tengu_marketplace_removed", {
            marketplace_name: state.name,
            plugins_uninstalled: state.installedPlugins?.length || 0
          });
          continue;
        }
        if (state.pendingUpdate) {
          await refreshMarketplace(state.name, (message) => {
            setProgressMessage(message);
          });
          updatedCount++;
          refreshedMarketplaces.add(state.name.toLowerCase());
          logEvent("tengu_marketplace_updated", {
            marketplace_name: state.name
          });
        }
      }
      let updatedPluginCount = 0;
      if (refreshedMarketplaces.size > 0) {
        const updatedPluginIds = await updatePluginsForMarketplaces(refreshedMarketplaces);
        updatedPluginCount = updatedPluginIds.length;
      }
      clearAllCaches();
      if (onManageComplete) {
        await onManageComplete();
      }
      const config = await loadKnownMarketplacesConfig();
      const {
        enabled,
        disabled
      } = await loadAllPlugins();
      const allPlugins = [...enabled, ...disabled];
      const {
        marketplaces
      } = await loadMarketplacesWithGracefulDegradation(config);
      const newStates = [];
      for (const {
        name,
        config: entry,
        data: marketplace
      } of marketplaces) {
        const installedFromMarketplace = allPlugins.filter((plugin) => plugin.source.endsWith(`@${name}`));
        newStates.push({
          name,
          source: getMarketplaceSourceDisplay(entry.source),
          lastUpdated: entry.lastUpdated,
          pluginCount: marketplace?.plugins.length,
          installedPlugins: installedFromMarketplace,
          pendingUpdate: false,
          pendingRemove: false,
          autoUpdate: isMarketplaceAutoUpdate(name, entry)
        });
      }
      newStates.sort((a, b) => {
        if (a.name === "claude-plugin-directory") return -1;
        if (b.name === "claude-plugin-directory") return 1;
        return a.name.localeCompare(b.name);
      });
      setMarketplaceStates(newStates);
      if (wasInDetailsView && selectedMarketplace) {
        const updatedMarketplace = newStates.find((s) => s.name === selectedMarketplace.name);
        if (updatedMarketplace) {
          setSelectedMarketplace(updatedMarketplace);
        }
      }
      const actions = [];
      if (updatedCount > 0) {
        const pluginPart = updatedPluginCount > 0 ? ` (${updatedPluginCount} ${plural(updatedPluginCount, "plugin")} bumped)` : "";
        actions.push(`Updated ${updatedCount} ${plural(updatedCount, "marketplace")}${pluginPart}`);
      }
      if (removedCount > 0) {
        actions.push(`Removed ${removedCount} ${plural(removedCount, "marketplace")}`);
      }
      if (actions.length > 0) {
        const successMsg = `${figures.tick} ${actions.join(", ")}`;
        if (wasInDetailsView) {
          setSuccessMessage(successMsg);
        } else {
          setResult(successMsg);
          setTimeout(setViewState, 2e3, {
            type: "menu"
          });
        }
      } else if (!wasInDetailsView) {
        setViewState({
          type: "menu"
        });
      }
    } catch (err) {
      const errorMsg = errorMessage(err);
      setProcessError(errorMsg);
      if (setError) {
        setError(errorMsg);
      }
    } finally {
      setIsProcessing(false);
      setProgressMessage(null);
    }
  };
  const confirmRemove = async () => {
    if (!selectedMarketplace) return;
    const newStates = marketplaceStates.map((state) => state.name === selectedMarketplace.name ? {
      ...state,
      pendingRemove: true
    } : state);
    setMarketplaceStates(newStates);
    await applyChanges(newStates);
  };
  const buildDetailsMenuOptions = (marketplace) => {
    if (!marketplace) return [];
    const options = [{
      label: `Browse plugins (${marketplace.pluginCount ?? 0})`,
      value: "browse"
    }, {
      label: "Update marketplace",
      secondaryLabel: marketplace.lastUpdated ? `(last updated ${new Date(marketplace.lastUpdated).toLocaleDateString()})` : void 0,
      value: "update"
    }];
    if (!shouldSkipPluginAutoupdate()) {
      options.push({
        label: marketplace.autoUpdate ? "Disable auto-update" : "Enable auto-update",
        value: "toggle-auto-update"
      });
    }
    options.push({
      label: "Remove marketplace",
      value: "remove"
    });
    return options;
  };
  const handleToggleAutoUpdate = async (marketplace) => {
    const newAutoUpdate = !marketplace.autoUpdate;
    try {
      await setMarketplaceAutoUpdate(marketplace.name, newAutoUpdate);
      setMarketplaceStates((prev) => prev.map((state) => state.name === marketplace.name ? {
        ...state,
        autoUpdate: newAutoUpdate
      } : state));
      setSelectedMarketplace((prev) => prev ? {
        ...prev,
        autoUpdate: newAutoUpdate
      } : prev);
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : "Failed to update setting");
    }
  };
  useKeybinding("confirm:no", () => {
    setInternalView("list");
    setDetailsMenuIndex(0);
  }, {
    context: "Confirmation",
    isActive: !isProcessing && (internalView === "details" || internalView === "confirm-remove")
  });
  useKeybinding("confirm:no", () => {
    setMarketplaceStates((prev) => prev.map((state) => ({
      ...state,
      pendingUpdate: false,
      pendingRemove: false
    })));
    setSelectedIndex(0);
  }, {
    context: "Confirmation",
    isActive: !isProcessing && internalView === "list" && hasPendingChanges()
  });
  useKeybinding("confirm:no", () => {
    setViewState({
      type: "menu"
    });
  }, {
    context: "Confirmation",
    isActive: !isProcessing && internalView === "list" && !hasPendingChanges()
  });
  useKeybindings({
    "select:previous": () => setSelectedIndex((prev) => Math.max(0, prev - 1)),
    "select:next": () => {
      const totalItems = marketplaceStates.length + 1;
      setSelectedIndex((prev) => Math.min(totalItems - 1, prev + 1));
    },
    "select:accept": () => {
      const marketplaceIndex = selectedIndex - 1;
      if (selectedIndex === 0) {
        setViewState({
          type: "add-marketplace"
        });
      } else if (hasPendingChanges()) {
        void applyChanges();
      } else {
        const marketplace = marketplaceStates[marketplaceIndex];
        if (marketplace) {
          setSelectedMarketplace(marketplace);
          setInternalView("details");
          setDetailsMenuIndex(0);
        }
      }
    }
  }, {
    context: "Select",
    isActive: !isProcessing && internalView === "list"
  });
  useInput((input) => {
    const marketplaceIndex = selectedIndex - 1;
    if ((input === "u" || input === "U") && marketplaceIndex >= 0) {
      setMarketplaceStates((prev) => prev.map((state, idx) => idx === marketplaceIndex ? {
        ...state,
        pendingUpdate: !state.pendingUpdate,
        pendingRemove: state.pendingUpdate ? state.pendingRemove : false
      } : state));
    } else if ((input === "r" || input === "R") && marketplaceIndex >= 0) {
      const marketplace = marketplaceStates[marketplaceIndex];
      if (marketplace) {
        setSelectedMarketplace(marketplace);
        setInternalView("confirm-remove");
      }
    }
  }, {
    isActive: !isProcessing && internalView === "list"
  });
  useKeybindings({
    "select:previous": () => setDetailsMenuIndex((prev) => Math.max(0, prev - 1)),
    "select:next": () => {
      const menuOptions = buildDetailsMenuOptions(selectedMarketplace);
      setDetailsMenuIndex((prev) => Math.min(menuOptions.length - 1, prev + 1));
    },
    "select:accept": () => {
      if (!selectedMarketplace) return;
      const menuOptions = buildDetailsMenuOptions(selectedMarketplace);
      const selectedOption = menuOptions[detailsMenuIndex];
      if (selectedOption?.value === "browse") {
        setViewState({
          type: "browse-marketplace",
          targetMarketplace: selectedMarketplace.name
        });
      } else if (selectedOption?.value === "update") {
        const newStates = marketplaceStates.map((state) => state.name === selectedMarketplace.name ? {
          ...state,
          pendingUpdate: true
        } : state);
        setMarketplaceStates(newStates);
        void applyChanges(newStates);
      } else if (selectedOption?.value === "toggle-auto-update") {
        void handleToggleAutoUpdate(selectedMarketplace);
      } else if (selectedOption?.value === "remove") {
        setInternalView("confirm-remove");
      }
    }
  }, {
    context: "Select",
    isActive: !isProcessing && internalView === "details"
  });
  useInput((input) => {
    if (input === "y" || input === "Y") {
      void confirmRemove();
    } else if (input === "n" || input === "N") {
      setInternalView("list");
      setSelectedMarketplace(null);
    }
  }, {
    isActive: !isProcessing && internalView === "confirm-remove"
  });
  if (loading) {
    return /* @__PURE__ */ jsx(Text, { children: "Loading marketplaces\u2026" });
  }
  if (marketplaceStates.length === 0) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Manage marketplaces" }) }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
        /* @__PURE__ */ jsxs(Text, { color: "suggestion", children: [
          figures.pointer,
          " +"
        ] }),
        /* @__PURE__ */ jsx(Text, { bold: true, color: "suggestion", children: "Add Marketplace" })
      ] }),
      /* @__PURE__ */ jsx(Box, { marginLeft: 3, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: exitState.pending ? /* @__PURE__ */ jsxs(Fragment, { children: [
        "Press ",
        exitState.keyName,
        " again to go back"
      ] }) : /* @__PURE__ */ jsxs(Byline, { children: [
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Select", fallback: "Enter", description: "select" }),
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "go back" })
      ] }) }) })
    ] });
  }
  if (internalView === "confirm-remove" && selectedMarketplace) {
    const pluginCount = selectedMarketplace.installedPlugins?.length || 0;
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs(Text, { bold: true, color: "warning", children: [
        "Remove marketplace ",
        /* @__PURE__ */ jsx(Text, { italic: true, children: selectedMarketplace.name }),
        "?"
      ] }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        pluginCount > 0 && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
          "This will also uninstall ",
          pluginCount,
          " ",
          plural(pluginCount, "plugin"),
          " from this marketplace:"
        ] }) }),
        selectedMarketplace.installedPlugins && selectedMarketplace.installedPlugins.length > 0 && /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginTop: 1, marginLeft: 2, children: selectedMarketplace.installedPlugins.map((plugin) => /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "\u2022 ",
          plugin.name
        ] }, plugin.name)) }),
        /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
          "Press ",
          /* @__PURE__ */ jsx(Text, { bold: true, children: "y" }),
          " to confirm or ",
          /* @__PURE__ */ jsx(Text, { bold: true, children: "n" }),
          " to cancel"
        ] }) })
      ] })
    ] });
  }
  if (internalView === "details" && selectedMarketplace) {
    const isUpdating = selectedMarketplace.pendingUpdate || isProcessing;
    const menuOptions = buildDetailsMenuOptions(selectedMarketplace);
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Text, { bold: true, children: selectedMarketplace.name }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: selectedMarketplace.source }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
        selectedMarketplace.pluginCount || 0,
        " available",
        " ",
        plural(selectedMarketplace.pluginCount || 0, "plugin")
      ] }) }),
      selectedMarketplace.installedPlugins && selectedMarketplace.installedPlugins.length > 0 && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
        /* @__PURE__ */ jsxs(Text, { bold: true, children: [
          "Installed plugins (",
          selectedMarketplace.installedPlugins.length,
          "):"
        ] }),
        /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginLeft: 1, children: selectedMarketplace.installedPlugins.map((plugin) => /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
          /* @__PURE__ */ jsx(Text, { children: figures.bullet }),
          /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
            /* @__PURE__ */ jsx(Text, { children: plugin.name }),
            /* @__PURE__ */ jsx(Text, { dimColor: true, children: plugin.manifest.description })
          ] })
        ] }, plugin.name)) })
      ] }),
      isUpdating && /* @__PURE__ */ jsxs(Box, { marginTop: 1, flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { color: "claude", children: "Updating marketplace\u2026" }),
        progressMessage && /* @__PURE__ */ jsx(Text, { dimColor: true, children: progressMessage })
      ] }),
      !isUpdating && successMessage && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "claude", children: successMessage }) }),
      !isUpdating && processError && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "error", children: processError }) }),
      !isUpdating && /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginTop: 1, children: menuOptions.map((option, idx) => {
        if (!option) return null;
        const isSelected = idx === detailsMenuIndex;
        return /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsxs(Text, { color: isSelected ? "suggestion" : void 0, children: [
            isSelected ? figures.pointer : " ",
            " ",
            option.label
          ] }),
          option.secondaryLabel && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            " ",
            option.secondaryLabel
          ] })
        ] }, option.value);
      }) }),
      !isUpdating && !shouldSkipPluginAutoupdate() && selectedMarketplace.autoUpdate && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Auto-update enabled. Claude Code will automatically update this marketplace and its installed plugins." }) }),
      /* @__PURE__ */ jsx(Box, { marginLeft: 3, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: isUpdating ? /* @__PURE__ */ jsx(Fragment, { children: "Please wait\u2026" }) : /* @__PURE__ */ jsxs(Byline, { children: [
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Select", fallback: "Enter", description: "select" }),
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "go back" })
      ] }) }) })
    ] });
  }
  const {
    updateCount,
    removeCount
  } = getPendingCounts();
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Manage marketplaces" }) }),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, marginBottom: 1, children: [
      /* @__PURE__ */ jsxs(Text, { color: selectedIndex === 0 ? "suggestion" : void 0, children: [
        selectedIndex === 0 ? figures.pointer : " ",
        " +"
      ] }),
      /* @__PURE__ */ jsx(Text, { bold: true, color: selectedIndex === 0 ? "suggestion" : void 0, children: "Add Marketplace" })
    ] }),
    /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: marketplaceStates.map((state, idx) => {
      const isSelected = idx + 1 === selectedIndex;
      const indicators = [];
      if (state.pendingUpdate) indicators.push("UPDATE");
      if (state.pendingRemove) indicators.push("REMOVE");
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, marginBottom: 1, children: [
        /* @__PURE__ */ jsxs(Text, { color: isSelected ? "suggestion" : void 0, children: [
          isSelected ? figures.pointer : " ",
          " ",
          state.pendingRemove ? figures.cross : figures.bullet
        ] }),
        /* @__PURE__ */ jsxs(Box, { flexDirection: "column", flexGrow: 1, children: [
          /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
            /* @__PURE__ */ jsxs(Text, { bold: true, strikethrough: state.pendingRemove, dimColor: state.pendingRemove, children: [
              state.name === "claude-plugins-official" && /* @__PURE__ */ jsx(Text, { color: "claude", children: "\u273B " }),
              state.name,
              state.name === "claude-plugins-official" && /* @__PURE__ */ jsx(Text, { color: "claude", children: " \u273B" })
            ] }),
            indicators.length > 0 && /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
              "[",
              indicators.join(", "),
              "]"
            ] })
          ] }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: state.source }),
          /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            state.pluginCount !== void 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
              state.pluginCount,
              " available"
            ] }),
            state.installedPlugins && state.installedPlugins.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
              " \u2022 ",
              state.installedPlugins.length,
              " installed"
            ] }),
            state.lastUpdated && /* @__PURE__ */ jsxs(Fragment, { children: [
              " ",
              "\u2022 Updated",
              " ",
              new Date(state.lastUpdated).toLocaleDateString()
            ] })
          ] })
        ] })
      ] }, state.name);
    }) }),
    hasPendingChanges() && /* @__PURE__ */ jsxs(Box, { marginTop: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsxs(Text, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Pending changes:" }),
        " ",
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Enter to apply" })
      ] }),
      updateCount > 0 && /* @__PURE__ */ jsxs(Text, { children: [
        "\u2022 Update ",
        updateCount,
        " ",
        plural(updateCount, "marketplace")
      ] }),
      removeCount > 0 && /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
        "\u2022 Remove ",
        removeCount,
        " ",
        plural(removeCount, "marketplace")
      ] })
    ] }),
    isProcessing && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "claude", children: "Processing changes\u2026" }) }),
    processError && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "error", children: processError }) }),
    /* @__PURE__ */ jsx(ManageMarketplacesKeyHints, { exitState, hasPendingActions: hasPendingChanges() })
  ] });
}
function ManageMarketplacesKeyHints(t0) {
  const $ = _c(18);
  const {
    exitState,
    hasPendingActions
  } = t0;
  if (exitState.pending) {
    let t12;
    if ($[0] !== exitState.keyName) {
      t12 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, italic: true, children: [
        "Press ",
        exitState.keyName,
        " again to go back"
      ] }) });
      $[0] = exitState.keyName;
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    return t12;
  }
  let t1;
  if ($[2] !== hasPendingActions) {
    t1 = hasPendingActions && /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Select", fallback: "Enter", description: "apply changes" });
    $[2] = hasPendingActions;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  let t2;
  if ($[4] !== hasPendingActions) {
    t2 = !hasPendingActions && /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Select", fallback: "Enter", description: "select" });
    $[4] = hasPendingActions;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  let t3;
  if ($[6] !== hasPendingActions) {
    t3 = !hasPendingActions && /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "u", action: "update" });
    $[6] = hasPendingActions;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  let t4;
  if ($[8] !== hasPendingActions) {
    t4 = !hasPendingActions && /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "r", action: "remove" });
    $[8] = hasPendingActions;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  const t5 = hasPendingActions ? "cancel" : "go back";
  let t6;
  if ($[10] !== t5) {
    t6 = /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: t5 });
    $[10] = t5;
    $[11] = t6;
  } else {
    t6 = $[11];
  }
  let t7;
  if ($[12] !== t1 || $[13] !== t2 || $[14] !== t3 || $[15] !== t4 || $[16] !== t6) {
    t7 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      t1,
      t2,
      t3,
      t4,
      t6
    ] }) }) });
    $[12] = t1;
    $[13] = t2;
    $[14] = t3;
    $[15] = t4;
    $[16] = t6;
    $[17] = t7;
  } else {
    t7 = $[17];
  }
  return t7;
}
export {
  ManageMarketplaces
};
