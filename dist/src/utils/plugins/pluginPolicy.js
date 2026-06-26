import { getSettingsForSource } from "../settings/settings.js";
function isPluginBlockedByPolicy(pluginId) {
  const policyEnabled = getSettingsForSource("policySettings")?.enabledPlugins;
  return policyEnabled?.[pluginId] === false;
}
export {
  isPluginBlockedByPolicy
};
