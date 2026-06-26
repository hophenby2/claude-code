import { setMainLoopModelOverride } from "../bootstrap/state.js";
import {
  clearApiKeyHelperCache,
  clearAwsCredentialsCache,
  clearGcpCredentialsCache
} from "../utils/auth.js";
import { getGlobalConfig, saveGlobalConfig } from "../utils/config.js";
import { toError } from "../utils/errors.js";
import { logError } from "../utils/log.js";
import { applyConfigEnvironmentVariables } from "../utils/managedEnv.js";
import {
  permissionModeFromString,
  toExternalPermissionMode
} from "../utils/permissions/PermissionMode.js";
import {
  notifyPermissionModeChanged,
  notifySessionMetadataChanged
} from "../utils/sessionState.js";
import { updateSettingsForSource } from "../utils/settings/settings.js";
function externalMetadataToAppState(metadata) {
  return (prev) => ({
    ...prev,
    ...typeof metadata.permission_mode === "string" ? {
      toolPermissionContext: {
        ...prev.toolPermissionContext,
        mode: permissionModeFromString(metadata.permission_mode)
      }
    } : {},
    ...typeof metadata.is_ultraplan_mode === "boolean" ? { isUltraplanMode: metadata.is_ultraplan_mode } : {}
  });
}
function onChangeAppState({
  newState,
  oldState
}) {
  const prevMode = oldState.toolPermissionContext.mode;
  const newMode = newState.toolPermissionContext.mode;
  if (prevMode !== newMode) {
    const prevExternal = toExternalPermissionMode(prevMode);
    const newExternal = toExternalPermissionMode(newMode);
    if (prevExternal !== newExternal) {
      const isUltraplan = newExternal === "plan" && newState.isUltraplanMode && !oldState.isUltraplanMode ? true : null;
      notifySessionMetadataChanged({
        permission_mode: newExternal,
        is_ultraplan_mode: isUltraplan
      });
    }
    notifyPermissionModeChanged(newMode);
  }
  if (newState.mainLoopModel !== oldState.mainLoopModel && newState.mainLoopModel === null) {
    updateSettingsForSource("userSettings", { model: void 0 });
    setMainLoopModelOverride(null);
  }
  if (newState.mainLoopModel !== oldState.mainLoopModel && newState.mainLoopModel !== null) {
    updateSettingsForSource("userSettings", { model: newState.mainLoopModel });
    setMainLoopModelOverride(newState.mainLoopModel);
  }
  if (newState.expandedView !== oldState.expandedView) {
    const showExpandedTodos = newState.expandedView === "tasks";
    const showSpinnerTree = newState.expandedView === "teammates";
    if (getGlobalConfig().showExpandedTodos !== showExpandedTodos || getGlobalConfig().showSpinnerTree !== showSpinnerTree) {
      saveGlobalConfig((current) => ({
        ...current,
        showExpandedTodos,
        showSpinnerTree
      }));
    }
  }
  if (newState.verbose !== oldState.verbose && getGlobalConfig().verbose !== newState.verbose) {
    const verbose = newState.verbose;
    saveGlobalConfig((current) => ({
      ...current,
      verbose
    }));
  }
  if (process.env.USER_TYPE === "ant") {
    if (newState.tungstenPanelVisible !== oldState.tungstenPanelVisible && newState.tungstenPanelVisible !== void 0 && getGlobalConfig().tungstenPanelVisible !== newState.tungstenPanelVisible) {
      const tungstenPanelVisible = newState.tungstenPanelVisible;
      saveGlobalConfig((current) => ({ ...current, tungstenPanelVisible }));
    }
  }
  if (newState.settings !== oldState.settings) {
    try {
      clearApiKeyHelperCache();
      clearAwsCredentialsCache();
      clearGcpCredentialsCache();
      if (newState.settings.env !== oldState.settings.env) {
        applyConfigEnvironmentVariables();
      }
    } catch (error) {
      logError(toError(error));
    }
  }
}
export {
  externalMetadataToAppState,
  onChangeAppState
};
