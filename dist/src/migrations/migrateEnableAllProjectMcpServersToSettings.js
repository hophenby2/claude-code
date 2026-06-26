import { logEvent } from "../services/analytics/index.js";
import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig
} from "../utils/config.js";
import { logError } from "../utils/log.js";
import {
  getSettingsForSource,
  updateSettingsForSource
} from "../utils/settings/settings.js";
function migrateEnableAllProjectMcpServersToSettings() {
  const projectConfig = getCurrentProjectConfig();
  const hasEnableAll = projectConfig.enableAllProjectMcpServers !== void 0;
  const hasEnabledServers = projectConfig.enabledMcpjsonServers && projectConfig.enabledMcpjsonServers.length > 0;
  const hasDisabledServers = projectConfig.disabledMcpjsonServers && projectConfig.disabledMcpjsonServers.length > 0;
  if (!hasEnableAll && !hasEnabledServers && !hasDisabledServers) {
    return;
  }
  try {
    const existingSettings = getSettingsForSource("localSettings") || {};
    const updates = {};
    const fieldsToRemove = [];
    if (hasEnableAll && existingSettings.enableAllProjectMcpServers === void 0) {
      updates.enableAllProjectMcpServers = projectConfig.enableAllProjectMcpServers;
      fieldsToRemove.push("enableAllProjectMcpServers");
    } else if (hasEnableAll) {
      fieldsToRemove.push("enableAllProjectMcpServers");
    }
    if (hasEnabledServers && projectConfig.enabledMcpjsonServers) {
      const existingEnabledServers = existingSettings.enabledMcpjsonServers || [];
      updates.enabledMcpjsonServers = [
        .../* @__PURE__ */ new Set([
          ...existingEnabledServers,
          ...projectConfig.enabledMcpjsonServers
        ])
      ];
      fieldsToRemove.push("enabledMcpjsonServers");
    }
    if (hasDisabledServers && projectConfig.disabledMcpjsonServers) {
      const existingDisabledServers = existingSettings.disabledMcpjsonServers || [];
      updates.disabledMcpjsonServers = [
        .../* @__PURE__ */ new Set([
          ...existingDisabledServers,
          ...projectConfig.disabledMcpjsonServers
        ])
      ];
      fieldsToRemove.push("disabledMcpjsonServers");
    }
    if (Object.keys(updates).length > 0) {
      updateSettingsForSource("localSettings", updates);
    }
    if (fieldsToRemove.includes("enableAllProjectMcpServers") || fieldsToRemove.includes("enabledMcpjsonServers") || fieldsToRemove.includes("disabledMcpjsonServers")) {
      saveCurrentProjectConfig((current) => {
        const {
          enableAllProjectMcpServers: _enableAll,
          enabledMcpjsonServers: _enabledServers,
          disabledMcpjsonServers: _disabledServers,
          ...configWithoutFields
        } = current;
        return configWithoutFields;
      });
    }
    logEvent("tengu_migrate_mcp_approval_fields_success", {
      migratedCount: fieldsToRemove.length
    });
  } catch (e) {
    logError(e);
    logEvent("tengu_migrate_mcp_approval_fields_error", {});
  }
}
export {
  migrateEnableAllProjectMcpServersToSettings
};
