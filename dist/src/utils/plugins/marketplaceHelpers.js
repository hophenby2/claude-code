import isEqual from "lodash-es/isEqual.js";
import { toError } from "../errors.js";
import { logError } from "../log.js";
import { getSettingsForSource } from "../settings/settings.js";
import { plural } from "../stringUtils.js";
import { checkGitAvailable } from "./gitAvailability.js";
import { getMarketplace } from "./marketplaceManager.js";
function formatFailureDetails(failures, includeReasons) {
  const maxShow = 2;
  const details = failures.slice(0, maxShow).map((f) => {
    const reason = f.reason || f.error || "unknown error";
    return includeReasons ? `${f.name} (${reason})` : f.name;
  }).join(includeReasons ? "; " : ", ");
  const remaining = failures.length - maxShow;
  const moreText = remaining > 0 ? ` and ${remaining} more` : "";
  return `${details}${moreText}`;
}
function getMarketplaceSourceDisplay(source) {
  switch (source.source) {
    case "github":
      return source.repo;
    case "url":
      return source.url;
    case "git":
      return source.url;
    case "directory":
      return source.path;
    case "file":
      return source.path;
    case "settings":
      return `settings:${source.name}`;
    default:
      return "Unknown source";
  }
}
function createPluginId(pluginName, marketplaceName) {
  return `${pluginName}@${marketplaceName}`;
}
async function loadMarketplacesWithGracefulDegradation(config) {
  const marketplaces = [];
  const failures = [];
  for (const [name, marketplaceConfig] of Object.entries(config)) {
    if (!isSourceAllowedByPolicy(marketplaceConfig.source)) {
      continue;
    }
    let data = null;
    try {
      data = await getMarketplace(name);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      failures.push({ name, error: errorMessage });
      logError(toError(err));
    }
    marketplaces.push({
      name,
      config: marketplaceConfig,
      data
    });
  }
  return { marketplaces, failures };
}
function formatMarketplaceLoadingErrors(failures, successCount) {
  if (failures.length === 0) {
    return null;
  }
  if (successCount > 0) {
    const message = failures.length === 1 ? `Warning: Failed to load marketplace '${failures[0].name}': ${failures[0].error}` : `Warning: Failed to load ${failures.length} marketplaces: ${formatFailureNames(failures)}`;
    return { type: "warning", message };
  }
  return {
    type: "error",
    message: `Failed to load all marketplaces. Errors: ${formatFailureErrors(failures)}`
  };
}
function formatFailureNames(failures) {
  return failures.map((f) => f.name).join(", ");
}
function formatFailureErrors(failures) {
  return failures.map((f) => `${f.name}: ${f.error}`).join("; ");
}
function getStrictKnownMarketplaces() {
  const policySettings = getSettingsForSource("policySettings");
  if (!policySettings?.strictKnownMarketplaces) {
    return null;
  }
  return policySettings.strictKnownMarketplaces;
}
function getBlockedMarketplaces() {
  const policySettings = getSettingsForSource("policySettings");
  if (!policySettings?.blockedMarketplaces) {
    return null;
  }
  return policySettings.blockedMarketplaces;
}
function getPluginTrustMessage() {
  return getSettingsForSource("policySettings")?.pluginTrustMessage;
}
function areSourcesEqual(a, b) {
  if (a.source !== b.source) return false;
  switch (a.source) {
    case "url":
      return a.url === b.url;
    case "github":
      return a.repo === b.repo && (a.ref || void 0) === (b.ref || void 0) && (a.path || void 0) === (b.path || void 0);
    case "git":
      return a.url === b.url && (a.ref || void 0) === (b.ref || void 0) && (a.path || void 0) === (b.path || void 0);
    case "npm":
      return a.package === b.package;
    case "file":
      return a.path === b.path;
    case "directory":
      return a.path === b.path;
    case "settings":
      return a.name === b.name && isEqual(a.plugins, b.plugins);
    default:
      return false;
  }
}
function extractHostFromSource(source) {
  switch (source.source) {
    case "github":
      return "github.com";
    case "git": {
      const sshMatch = source.url.match(/^[^@]+@([^:]+):/);
      if (sshMatch?.[1]) {
        return sshMatch[1];
      }
      try {
        return new URL(source.url).hostname;
      } catch {
        return null;
      }
    }
    case "url":
      try {
        return new URL(source.url).hostname;
      } catch {
        return null;
      }
    // npm, file, directory, hostPattern, pathPattern sources are not supported for hostPattern matching
    default:
      return null;
  }
}
function doesSourceMatchHostPattern(source, pattern) {
  const host = extractHostFromSource(source);
  if (!host) {
    return false;
  }
  try {
    const regex = new RegExp(pattern.hostPattern);
    return regex.test(host);
  } catch {
    logError(new Error(`Invalid hostPattern regex: ${pattern.hostPattern}`));
    return false;
  }
}
function doesSourceMatchPathPattern(source, pattern) {
  if (source.source !== "file" && source.source !== "directory") {
    return false;
  }
  try {
    const regex = new RegExp(pattern.pathPattern);
    return regex.test(source.path);
  } catch {
    logError(new Error(`Invalid pathPattern regex: ${pattern.pathPattern}`));
    return false;
  }
}
function getHostPatternsFromAllowlist() {
  const allowlist = getStrictKnownMarketplaces();
  if (!allowlist) return [];
  return allowlist.filter(
    (entry) => entry.source === "hostPattern"
  ).map((entry) => entry.hostPattern);
}
function extractGitHubRepoFromGitUrl(url) {
  const sshMatch = url.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch && sshMatch[1]) {
    return sshMatch[1];
  }
  const httpsMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/
  );
  if (httpsMatch && httpsMatch[1]) {
    return httpsMatch[1];
  }
  return null;
}
function blockedConstraintMatches(blockedValue, sourceValue) {
  if (!blockedValue) {
    return true;
  }
  return (blockedValue || void 0) === (sourceValue || void 0);
}
function areSourcesEquivalentForBlocklist(source, blocked) {
  if (source.source === blocked.source) {
    switch (source.source) {
      case "github": {
        const b = blocked;
        if (source.repo !== b.repo) return false;
        return blockedConstraintMatches(b.ref, source.ref) && blockedConstraintMatches(b.path, source.path);
      }
      case "git": {
        const b = blocked;
        if (source.url !== b.url) return false;
        return blockedConstraintMatches(b.ref, source.ref) && blockedConstraintMatches(b.path, source.path);
      }
      case "url":
        return source.url === blocked.url;
      case "npm":
        return source.package === blocked.package;
      case "file":
        return source.path === blocked.path;
      case "directory":
        return source.path === blocked.path;
      case "settings":
        return source.name === blocked.name;
      default:
        return false;
    }
  }
  if (source.source === "git" && blocked.source === "github") {
    const extractedRepo = extractGitHubRepoFromGitUrl(source.url);
    if (extractedRepo === blocked.repo) {
      return blockedConstraintMatches(blocked.ref, source.ref) && blockedConstraintMatches(blocked.path, source.path);
    }
  }
  if (source.source === "github" && blocked.source === "git") {
    const extractedRepo = extractGitHubRepoFromGitUrl(blocked.url);
    if (extractedRepo === source.repo) {
      return blockedConstraintMatches(blocked.ref, source.ref) && blockedConstraintMatches(blocked.path, source.path);
    }
  }
  return false;
}
function isSourceInBlocklist(source) {
  const blocklist = getBlockedMarketplaces();
  if (blocklist === null) {
    return false;
  }
  return blocklist.some(
    (blocked) => areSourcesEquivalentForBlocklist(source, blocked)
  );
}
function isSourceAllowedByPolicy(source) {
  if (isSourceInBlocklist(source)) {
    return false;
  }
  const allowlist = getStrictKnownMarketplaces();
  if (allowlist === null) {
    return true;
  }
  return allowlist.some((allowed) => {
    if (allowed.source === "hostPattern") {
      return doesSourceMatchHostPattern(source, allowed);
    }
    if (allowed.source === "pathPattern") {
      return doesSourceMatchPathPattern(source, allowed);
    }
    return areSourcesEqual(source, allowed);
  });
}
function formatSourceForDisplay(source) {
  switch (source.source) {
    case "github":
      return `github:${source.repo}${source.ref ? `@${source.ref}` : ""}`;
    case "url":
      return source.url;
    case "git":
      return `git:${source.url}${source.ref ? `@${source.ref}` : ""}`;
    case "npm":
      return `npm:${source.package}`;
    case "file":
      return `file:${source.path}`;
    case "directory":
      return `dir:${source.path}`;
    case "hostPattern":
      return `hostPattern:${source.hostPattern}`;
    case "pathPattern":
      return `pathPattern:${source.pathPattern}`;
    case "settings":
      return `settings:${source.name} (${source.plugins.length} ${plural(source.plugins.length, "plugin")})`;
    default:
      return "unknown source";
  }
}
async function detectEmptyMarketplaceReason({
  configuredMarketplaceCount,
  failedMarketplaceCount
}) {
  const gitAvailable = await checkGitAvailable();
  if (!gitAvailable) {
    return "git-not-installed";
  }
  const allowlist = getStrictKnownMarketplaces();
  if (allowlist !== null) {
    if (allowlist.length === 0) {
      return "all-blocked-by-policy";
    }
    if (configuredMarketplaceCount === 0) {
      return "policy-restricts-sources";
    }
  }
  if (configuredMarketplaceCount === 0) {
    return "no-marketplaces-configured";
  }
  if (failedMarketplaceCount > 0 && failedMarketplaceCount === configuredMarketplaceCount) {
    return "all-marketplaces-failed";
  }
  return "all-plugins-installed";
}
export {
  createPluginId,
  detectEmptyMarketplaceReason,
  extractHostFromSource,
  formatFailureDetails,
  formatMarketplaceLoadingErrors,
  formatSourceForDisplay,
  getBlockedMarketplaces,
  getHostPatternsFromAllowlist,
  getMarketplaceSourceDisplay,
  getPluginTrustMessage,
  getStrictKnownMarketplaces,
  isSourceAllowedByPolicy,
  isSourceInBlocklist,
  loadMarketplacesWithGracefulDegradation
};
