import { getSettingsForSource } from "../settings/settings.js";
function getManagedPluginNames() {
  const enabledPlugins = getSettingsForSource("policySettings")?.enabledPlugins;
  if (!enabledPlugins) {
    return null;
  }
  const names = /* @__PURE__ */ new Set();
  for (const [pluginId, value] of Object.entries(enabledPlugins)) {
    if (typeof value !== "boolean" || !pluginId.includes("@")) {
      continue;
    }
    const name = pluginId.split("@")[0];
    if (name) {
      names.add(name);
    }
  }
  return names.size > 0 ? names : null;
}
export {
  getManagedPluginNames
};
