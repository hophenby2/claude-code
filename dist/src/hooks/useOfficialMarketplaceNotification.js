import { jsx } from "react/jsx-runtime";
import { Text } from "../ink.js";
import { logForDebugging } from "../utils/debug.js";
import { checkAndInstallOfficialMarketplace } from "../utils/plugins/officialMarketplaceStartupCheck.js";
import { useStartupNotification } from "./notifs/useStartupNotification.js";
function useOfficialMarketplaceNotification() {
  useStartupNotification(_temp);
}
async function _temp() {
  const result = await checkAndInstallOfficialMarketplace();
  const notifs = [];
  if (result.configSaveFailed) {
    logForDebugging("Showing marketplace config save failure notification");
    notifs.push({
      key: "marketplace-config-save-failed",
      jsx: /* @__PURE__ */ jsx(Text, { color: "error", children: "Failed to save marketplace retry info \xB7 Check ~/.claude.json permissions" }),
      priority: "immediate",
      timeoutMs: 1e4
    });
  }
  if (result.installed) {
    logForDebugging("Showing marketplace installation success notification");
    notifs.push({
      key: "marketplace-installed",
      jsx: /* @__PURE__ */ jsx(Text, { color: "success", children: "\u2713 Anthropic marketplace installed \xB7 /plugin to see available plugins" }),
      priority: "immediate",
      timeoutMs: 7e3
    });
  } else {
    if (result.skipped && result.reason === "unknown") {
      logForDebugging("Showing marketplace installation failure notification");
      notifs.push({
        key: "marketplace-install-failed",
        jsx: /* @__PURE__ */ jsx(Text, { color: "warning", children: "Failed to install Anthropic marketplace \xB7 Will retry on next startup" }),
        priority: "immediate",
        timeoutMs: 8e3
      });
    }
  }
  return notifs;
}
export {
  useOfficialMarketplaceNotification
};
