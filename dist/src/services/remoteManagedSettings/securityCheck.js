import { jsx } from "react/jsx-runtime";
import { getIsInteractive } from "../../bootstrap/state.js";
import { ManagedSettingsSecurityDialog } from "../../components/ManagedSettingsSecurityDialog/ManagedSettingsSecurityDialog.js";
import { extractDangerousSettings, hasDangerousSettings, hasDangerousSettingsChanged } from "../../components/ManagedSettingsSecurityDialog/utils.js";
import { render } from "../../ink.js";
import { KeybindingSetup } from "../../keybindings/KeybindingProviderSetup.js";
import { AppStateProvider } from "../../state/AppState.js";
import { gracefulShutdownSync } from "../../utils/gracefulShutdown.js";
import { getBaseRenderOptions } from "../../utils/renderOptions.js";
import { logEvent } from "../analytics/index.js";
async function checkManagedSettingsSecurity(cachedSettings, newSettings) {
  if (!newSettings || !hasDangerousSettings(extractDangerousSettings(newSettings))) {
    return "no_check_needed";
  }
  if (!hasDangerousSettingsChanged(cachedSettings, newSettings)) {
    return "no_check_needed";
  }
  if (!getIsInteractive()) {
    return "no_check_needed";
  }
  logEvent("tengu_managed_settings_security_dialog_shown", {});
  return new Promise((resolve) => {
    void (async () => {
      const {
        unmount
      } = await render(/* @__PURE__ */ jsx(AppStateProvider, { children: /* @__PURE__ */ jsx(KeybindingSetup, { children: /* @__PURE__ */ jsx(ManagedSettingsSecurityDialog, { settings: newSettings, onAccept: () => {
        logEvent("tengu_managed_settings_security_dialog_accepted", {});
        unmount();
        void resolve("approved");
      }, onReject: () => {
        logEvent("tengu_managed_settings_security_dialog_rejected", {});
        unmount();
        void resolve("rejected");
      } }) }) }), getBaseRenderOptions(false));
    })();
  });
}
function handleSecurityCheckResult(result) {
  if (result === "rejected") {
    gracefulShutdownSync(1);
    return false;
  }
  return true;
}
export {
  checkManagedSettingsSecurity,
  handleSecurityCheckResult
};
