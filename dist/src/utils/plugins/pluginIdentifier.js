import {
  ALLOWED_OFFICIAL_MARKETPLACE_NAMES
} from "./schemas.js";
const SETTING_SOURCE_TO_SCOPE = {
  policySettings: "managed",
  userSettings: "user",
  projectSettings: "project",
  localSettings: "local",
  flagSettings: "flag"
};
function parsePluginIdentifier(plugin) {
  if (plugin.includes("@")) {
    const parts = plugin.split("@");
    return { name: parts[0] || "", marketplace: parts[1] };
  }
  return { name: plugin };
}
function buildPluginId(name, marketplace) {
  return marketplace ? `${name}@${marketplace}` : name;
}
function isOfficialMarketplaceName(marketplace) {
  return marketplace !== void 0 && ALLOWED_OFFICIAL_MARKETPLACE_NAMES.has(marketplace.toLowerCase());
}
const SCOPE_TO_EDITABLE_SOURCE = {
  user: "userSettings",
  project: "projectSettings",
  local: "localSettings"
};
function scopeToSettingSource(scope) {
  if (scope === "managed") {
    throw new Error("Cannot install plugins to managed scope");
  }
  return SCOPE_TO_EDITABLE_SOURCE[scope];
}
function settingSourceToScope(source) {
  return SETTING_SOURCE_TO_SCOPE[source];
}
export {
  SETTING_SOURCE_TO_SCOPE,
  buildPluginId,
  isOfficialMarketplaceName,
  parsePluginIdentifier,
  scopeToSettingSource,
  settingSourceToScope
};
