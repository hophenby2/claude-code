import { createHash } from "crypto";
import { sep } from "path";
import {
  logEvent
} from "../../services/analytics/index.js";
import {
  isOfficialMarketplaceName,
  parsePluginIdentifier
} from "../plugins/pluginIdentifier.js";
const BUILTIN_MARKETPLACE_NAME = "builtin";
const PLUGIN_ID_HASH_SALT = "claude-plugin-telemetry-v1";
function hashPluginId(name, marketplace) {
  const key = marketplace ? `${name}@${marketplace.toLowerCase()}` : name;
  return createHash("sha256").update(key + PLUGIN_ID_HASH_SALT).digest("hex").slice(0, 16);
}
function getTelemetryPluginScope(name, marketplace, managedNames) {
  if (marketplace === BUILTIN_MARKETPLACE_NAME) return "default-bundle";
  if (isOfficialMarketplaceName(marketplace)) return "official";
  if (managedNames?.has(name)) return "org";
  return "user-local";
}
function getEnabledVia(plugin, managedNames, seedDirs) {
  if (plugin.isBuiltin) return "default-enable";
  if (managedNames?.has(plugin.name)) return "org-policy";
  if (seedDirs.some(
    (dir) => plugin.path.startsWith(dir.endsWith(sep) ? dir : dir + sep)
  )) {
    return "seed-mount";
  }
  return "user-install";
}
function buildPluginTelemetryFields(name, marketplace, managedNames = null) {
  const scope = getTelemetryPluginScope(name, marketplace, managedNames);
  const isAnthropicControlled = scope === "official" || scope === "default-bundle";
  return {
    plugin_id_hash: hashPluginId(
      name,
      marketplace
    ),
    plugin_scope: scope,
    plugin_name_redacted: isAnthropicControlled ? name : "third-party",
    marketplace_name_redacted: isAnthropicControlled && marketplace ? marketplace : "third-party",
    is_official_plugin: isAnthropicControlled
  };
}
function buildPluginCommandTelemetryFields(pluginInfo, managedNames = null) {
  const { marketplace } = parsePluginIdentifier(pluginInfo.repository);
  return buildPluginTelemetryFields(
    pluginInfo.pluginManifest.name,
    marketplace,
    managedNames
  );
}
function logPluginsEnabledForSession(plugins, managedNames, seedDirs) {
  for (const plugin of plugins) {
    const { marketplace } = parsePluginIdentifier(plugin.repository);
    logEvent("tengu_plugin_enabled_for_session", {
      _PROTO_plugin_name: plugin.name,
      ...marketplace && {
        _PROTO_marketplace_name: marketplace
      },
      ...buildPluginTelemetryFields(plugin.name, marketplace, managedNames),
      enabled_via: getEnabledVia(
        plugin,
        managedNames,
        seedDirs
      ),
      skill_path_count: (plugin.skillsPath ? 1 : 0) + (plugin.skillsPaths?.length ?? 0),
      command_path_count: (plugin.commandsPath ? 1 : 0) + (plugin.commandsPaths?.length ?? 0),
      has_mcp: plugin.manifest.mcpServers !== void 0,
      has_hooks: plugin.hooksConfig !== void 0,
      ...plugin.manifest.version && {
        version: plugin.manifest.version
      }
    });
  }
}
function classifyPluginCommandError(error) {
  const msg = String(error?.message ?? error);
  if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|ECONNRESET|network|Could not resolve|Connection refused|timed out/i.test(
    msg
  )) {
    return "network";
  }
  if (/\b404\b|not found|does not exist|no such plugin/i.test(msg)) {
    return "not-found";
  }
  if (/\b40[13]\b|EACCES|EPERM|permission denied|unauthorized/i.test(msg)) {
    return "permission";
  }
  if (/invalid|malformed|schema|validation|parse error/i.test(msg)) {
    return "validation";
  }
  return "unknown";
}
function logPluginLoadErrors(errors, managedNames) {
  for (const err of errors) {
    const { name, marketplace } = parsePluginIdentifier(err.source);
    const pluginName = "plugin" in err && err.plugin ? err.plugin : name;
    logEvent("tengu_plugin_load_failed", {
      error_category: err.type,
      _PROTO_plugin_name: pluginName,
      ...marketplace && {
        _PROTO_marketplace_name: marketplace
      },
      ...buildPluginTelemetryFields(pluginName, marketplace, managedNames)
    });
  }
}
export {
  buildPluginCommandTelemetryFields,
  buildPluginTelemetryFields,
  classifyPluginCommandError,
  getEnabledVia,
  getTelemetryPluginScope,
  hashPluginId,
  logPluginLoadErrors,
  logPluginsEnabledForSession
};
