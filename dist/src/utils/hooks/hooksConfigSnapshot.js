import { resetSdkInitState } from "../../bootstrap/state.js";
import { isRestrictedToPluginOnly } from "../settings/pluginOnlyPolicy.js";
import * as settingsModule from "../settings/settings.js";
import { resetSettingsCache } from "../settings/settingsCache.js";
let initialHooksConfig = null;
function getHooksFromAllowedSources() {
  const policySettings = settingsModule.getSettingsForSource("policySettings");
  if (policySettings?.disableAllHooks === true) {
    return {};
  }
  if (policySettings?.allowManagedHooksOnly === true) {
    return policySettings.hooks ?? {};
  }
  if (isRestrictedToPluginOnly("hooks")) {
    return policySettings?.hooks ?? {};
  }
  const mergedSettings = settingsModule.getSettings_DEPRECATED();
  if (mergedSettings.disableAllHooks === true) {
    return policySettings?.hooks ?? {};
  }
  return mergedSettings.hooks ?? {};
}
function shouldAllowManagedHooksOnly() {
  const policySettings = settingsModule.getSettingsForSource("policySettings");
  if (policySettings?.allowManagedHooksOnly === true) {
    return true;
  }
  if (settingsModule.getSettings_DEPRECATED().disableAllHooks === true && policySettings?.disableAllHooks !== true) {
    return true;
  }
  return false;
}
function shouldDisableAllHooksIncludingManaged() {
  return settingsModule.getSettingsForSource("policySettings")?.disableAllHooks === true;
}
function captureHooksConfigSnapshot() {
  initialHooksConfig = getHooksFromAllowedSources();
}
function updateHooksConfigSnapshot() {
  resetSettingsCache();
  initialHooksConfig = getHooksFromAllowedSources();
}
function getHooksConfigFromSnapshot() {
  if (initialHooksConfig === null) {
    captureHooksConfigSnapshot();
  }
  return initialHooksConfig;
}
function resetHooksConfigSnapshot() {
  initialHooksConfig = null;
  resetSdkInitState();
}
export {
  captureHooksConfigSnapshot,
  getHooksConfigFromSnapshot,
  resetHooksConfigSnapshot,
  shouldAllowManagedHooksOnly,
  shouldDisableAllHooksIncludingManaged,
  updateHooksConfigSnapshot
};
