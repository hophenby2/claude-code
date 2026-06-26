import { logForDebugging } from "../debug.js";
import { updateHooksConfigSnapshot } from "../hooks/hooksConfigSnapshot.js";
import {
  createDisabledBypassPermissionsContext,
  findOverlyBroadBashPermissions,
  isBypassPermissionsModeDisabled,
  removeDangerousPermissions,
  transitionPlanAutoMode
} from "../permissions/permissionSetup.js";
import { syncPermissionRulesFromDisk } from "../permissions/permissions.js";
import { loadAllPermissionRulesFromDisk } from "../permissions/permissionsLoader.js";
import { getInitialSettings } from "./settings.js";
function applySettingsChange(source, setAppState) {
  const newSettings = getInitialSettings();
  logForDebugging(`Settings changed from ${source}, updating app state`);
  const updatedRules = loadAllPermissionRulesFromDisk();
  updateHooksConfigSnapshot();
  setAppState((prev) => {
    let newContext = syncPermissionRulesFromDisk(
      prev.toolPermissionContext,
      updatedRules
    );
    if (process.env.USER_TYPE === "ant" && process.env.CLAUDE_CODE_ENTRYPOINT !== "local-agent") {
      const overlyBroad = findOverlyBroadBashPermissions(updatedRules, []);
      if (overlyBroad.length > 0) {
        newContext = removeDangerousPermissions(newContext, overlyBroad);
      }
    }
    if (newContext.isBypassPermissionsModeAvailable && isBypassPermissionsModeDisabled()) {
      newContext = createDisabledBypassPermissionsContext(newContext);
    }
    newContext = transitionPlanAutoMode(newContext);
    const prevEffort = prev.settings.effortLevel;
    const newEffort = newSettings.effortLevel;
    const effortChanged = prevEffort !== newEffort;
    return {
      ...prev,
      settings: newSettings,
      toolPermissionContext: newContext,
      // Only propagate a defined new value — when the disk key is absent
      // (e.g. /effort max for non-ants writes undefined; --effort CLI flag),
      // prev.settings.effortLevel can be stale (internal writes suppress the
      // watcher that would resync AppState.settings), so effortChanged would
      // be true and we'd wipe a session-scoped value held in effortValue.
      ...effortChanged && newEffort !== void 0 ? { effortValue: newEffort } : {}
    };
  });
}
export {
  applySettingsChange
};
