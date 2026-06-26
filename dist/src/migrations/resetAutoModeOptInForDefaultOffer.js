const feature = (_name) => false;
import "../services/analytics/index.js";
import "../utils/config.js";
import "../utils/log.js";
import "../utils/permissions/permissionSetup.js";
import "../utils/settings/settings.js";
function resetAutoModeOptInForDefaultOffer() {
  if (false) {
    const config = getGlobalConfig();
    if (config.hasResetAutoModeOptInForDefaultOffer) return;
    if (getAutoModeEnabledState() !== "enabled") return;
    try {
      const user = getSettingsForSource("userSettings");
      if (user?.skipAutoPermissionPrompt && user?.permissions?.defaultMode !== "auto") {
        updateSettingsForSource("userSettings", {
          skipAutoPermissionPrompt: void 0
        });
        logEvent("tengu_migrate_reset_auto_opt_in_for_default_offer", {});
      }
      saveGlobalConfig((c) => {
        if (c.hasResetAutoModeOptInForDefaultOffer) return c;
        return { ...c, hasResetAutoModeOptInForDefaultOffer: true };
      });
    } catch (error) {
      logError(new Error(`Failed to reset auto mode opt-in: ${error}`));
    }
  }
}
export {
  resetAutoModeOptInForDefaultOffer
};
