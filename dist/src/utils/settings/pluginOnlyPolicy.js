import { getSettingsForSource } from "./settings.js";
function isRestrictedToPluginOnly(surface) {
  const policy = getSettingsForSource("policySettings")?.strictPluginOnlyCustomization;
  if (policy === true) return true;
  if (Array.isArray(policy)) return policy.includes(surface);
  return false;
}
const ADMIN_TRUSTED_SOURCES = /* @__PURE__ */ new Set([
  "plugin",
  "policySettings",
  "built-in",
  "builtin",
  "bundled"
]);
function isSourceAdminTrusted(source) {
  return source !== void 0 && ADMIN_TRUSTED_SOURCES.has(source);
}
export {
  isRestrictedToPluginOnly,
  isSourceAdminTrusted
};
