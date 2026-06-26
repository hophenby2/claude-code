import { logEvent } from "../services/analytics/index.js";
import { getGlobalConfig, saveGlobalConfig } from "../utils/config.js";
import { logError } from "../utils/log.js";
import {
  hasSkipDangerousModePermissionPrompt,
  updateSettingsForSource
} from "../utils/settings/settings.js";
function migrateBypassPermissionsAcceptedToSettings() {
  const globalConfig = getGlobalConfig();
  if (!globalConfig.bypassPermissionsModeAccepted) {
    return;
  }
  try {
    if (!hasSkipDangerousModePermissionPrompt()) {
      updateSettingsForSource("userSettings", {
        skipDangerousModePermissionPrompt: true
      });
    }
    logEvent("tengu_migrate_bypass_permissions_accepted", {});
    saveGlobalConfig((current) => {
      if (!("bypassPermissionsModeAccepted" in current)) return current;
      const { bypassPermissionsModeAccepted: _, ...updatedConfig } = current;
      return updatedConfig;
    });
  } catch (error) {
    logError(
      new Error(`Failed to migrate bypass permissions accepted: ${error}`)
    );
  }
}
export {
  migrateBypassPermissionsAcceptedToSettings
};
