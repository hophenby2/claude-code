import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import { chmod, open, rename, stat, unlink } from "fs/promises";
import mapValues from "lodash-es/mapValues.js";
import memoize from "lodash-es/memoize.js";
import { dirname, join, parse } from "path";
import { getPlatform } from "../../utils/platform.js";
import { getPluginErrorMessage } from "../../types/plugin.js";
import { isClaudeInChromeMCPServer } from "../../utils/claudeInChrome/common.js";
import {
  getCurrentProjectConfig,
  getGlobalConfig,
  saveCurrentProjectConfig,
  saveGlobalConfig
} from "../../utils/config.js";
import { getCwd } from "../../utils/cwd.js";
import { logForDebugging } from "../../utils/debug.js";
import { getErrnoCode } from "../../utils/errors.js";
import { getFsImplementation } from "../../utils/fsOperations.js";
import { safeParseJSON } from "../../utils/json.js";
import { logError } from "../../utils/log.js";
import { getPluginMcpServers } from "../../utils/plugins/mcpPluginIntegration.js";
import { loadAllPluginsCacheOnly } from "../../utils/plugins/pluginLoader.js";
import { isSettingSourceEnabled } from "../../utils/settings/constants.js";
import { getManagedFilePath } from "../../utils/settings/managedPath.js";
import { isRestrictedToPluginOnly } from "../../utils/settings/pluginOnlyPolicy.js";
import {
  getInitialSettings,
  getSettingsForSource
} from "../../utils/settings/settings.js";
import {
  isMcpServerCommandEntry,
  isMcpServerNameEntry,
  isMcpServerUrlEntry
} from "../../utils/settings/types.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import {
  logEvent
} from "../analytics/index.js";
import { fetchClaudeAIMcpConfigsIfEligible } from "./claudeai.js";
import { expandEnvVarsInString } from "./envExpansion.js";
import {
  McpJsonConfigSchema,
  McpServerConfigSchema
} from "./types.js";
import { getProjectMcpServerStatus } from "./utils.js";
function getEnterpriseMcpFilePath() {
  return join(getManagedFilePath(), "managed-mcp.json");
}
function addScopeToServers(servers, scope) {
  if (!servers) {
    return {};
  }
  const scopedServers = {};
  for (const [name, config] of Object.entries(servers)) {
    scopedServers[name] = { ...config, scope };
  }
  return scopedServers;
}
async function writeMcpjsonFile(config) {
  const mcpJsonPath = join(getCwd(), ".mcp.json");
  let existingMode;
  try {
    const stats = await stat(mcpJsonPath);
    existingMode = stats.mode;
  } catch (e) {
    const code = getErrnoCode(e);
    if (code !== "ENOENT") {
      throw e;
    }
  }
  const tempPath = `${mcpJsonPath}.tmp.${process.pid}.${Date.now()}`;
  const handle = await open(tempPath, "w", existingMode ?? 420);
  try {
    await handle.writeFile(jsonStringify(config, null, 2), {
      encoding: "utf8"
    });
    await handle.datasync();
  } finally {
    await handle.close();
  }
  try {
    if (existingMode !== void 0) {
      await chmod(tempPath, existingMode);
    }
    await rename(tempPath, mcpJsonPath);
  } catch (e) {
    try {
      await unlink(tempPath);
    } catch {
    }
    throw e;
  }
}
function getServerCommandArray(config) {
  if (config.type !== void 0 && config.type !== "stdio") {
    return null;
  }
  const stdioConfig = config;
  return [stdioConfig.command, ...stdioConfig.args ?? []];
}
function commandArraysMatch(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((val, idx) => val === b[idx]);
}
function getServerUrl(config) {
  return "url" in config ? config.url : null;
}
const CCR_PROXY_PATH_MARKERS = [
  "/v2/session_ingress/shttp/mcp/",
  "/v2/ccr-sessions/"
];
function unwrapCcrProxyUrl(url) {
  if (!CCR_PROXY_PATH_MARKERS.some((m) => url.includes(m))) {
    return url;
  }
  try {
    const parsed = new URL(url);
    const original = parsed.searchParams.get("mcp_url");
    return original || url;
  } catch {
    return url;
  }
}
function getMcpServerSignature(config) {
  const cmd = getServerCommandArray(config);
  if (cmd) {
    return `stdio:${jsonStringify(cmd)}`;
  }
  const url = getServerUrl(config);
  if (url) {
    return `url:${unwrapCcrProxyUrl(url)}`;
  }
  return null;
}
function dedupPluginMcpServers(pluginServers, manualServers) {
  const manualSigs = /* @__PURE__ */ new Map();
  for (const [name, config] of Object.entries(manualServers)) {
    const sig = getMcpServerSignature(config);
    if (sig && !manualSigs.has(sig)) manualSigs.set(sig, name);
  }
  const servers = {};
  const suppressed = [];
  const seenPluginSigs = /* @__PURE__ */ new Map();
  for (const [name, config] of Object.entries(pluginServers)) {
    const sig = getMcpServerSignature(config);
    if (sig === null) {
      servers[name] = config;
      continue;
    }
    const manualDup = manualSigs.get(sig);
    if (manualDup !== void 0) {
      logForDebugging(
        `Suppressing plugin MCP server "${name}": duplicates manually-configured "${manualDup}"`
      );
      suppressed.push({ name, duplicateOf: manualDup });
      continue;
    }
    const pluginDup = seenPluginSigs.get(sig);
    if (pluginDup !== void 0) {
      logForDebugging(
        `Suppressing plugin MCP server "${name}": duplicates earlier plugin server "${pluginDup}"`
      );
      suppressed.push({ name, duplicateOf: pluginDup });
      continue;
    }
    seenPluginSigs.set(sig, name);
    servers[name] = config;
  }
  return { servers, suppressed };
}
function dedupClaudeAiMcpServers(claudeAiServers, manualServers) {
  const manualSigs = /* @__PURE__ */ new Map();
  for (const [name, config] of Object.entries(manualServers)) {
    if (isMcpServerDisabled(name)) continue;
    const sig = getMcpServerSignature(config);
    if (sig && !manualSigs.has(sig)) manualSigs.set(sig, name);
  }
  const servers = {};
  const suppressed = [];
  for (const [name, config] of Object.entries(claudeAiServers)) {
    const sig = getMcpServerSignature(config);
    const manualDup = sig !== null ? manualSigs.get(sig) : void 0;
    if (manualDup !== void 0) {
      logForDebugging(
        `Suppressing claude.ai connector "${name}": duplicates manually-configured "${manualDup}"`
      );
      suppressed.push({ name, duplicateOf: manualDup });
      continue;
    }
    servers[name] = config;
  }
  return { servers, suppressed };
}
function urlPatternToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${regexStr}$`);
}
function urlMatchesPattern(url, pattern) {
  const regex = urlPatternToRegex(pattern);
  return regex.test(url);
}
function getMcpAllowlistSettings() {
  if (shouldAllowManagedMcpServersOnly()) {
    return getSettingsForSource("policySettings") ?? {};
  }
  return getInitialSettings();
}
function getMcpDenylistSettings() {
  return getInitialSettings();
}
function isMcpServerDenied(serverName, config) {
  const settings = getMcpDenylistSettings();
  if (!settings.deniedMcpServers) {
    return false;
  }
  for (const entry of settings.deniedMcpServers) {
    if (isMcpServerNameEntry(entry) && entry.serverName === serverName) {
      return true;
    }
  }
  if (config) {
    const serverCommand = getServerCommandArray(config);
    if (serverCommand) {
      for (const entry of settings.deniedMcpServers) {
        if (isMcpServerCommandEntry(entry) && commandArraysMatch(entry.serverCommand, serverCommand)) {
          return true;
        }
      }
    }
    const serverUrl = getServerUrl(config);
    if (serverUrl) {
      for (const entry of settings.deniedMcpServers) {
        if (isMcpServerUrlEntry(entry) && urlMatchesPattern(serverUrl, entry.serverUrl)) {
          return true;
        }
      }
    }
  }
  return false;
}
function isMcpServerAllowedByPolicy(serverName, config) {
  if (isMcpServerDenied(serverName, config)) {
    return false;
  }
  const settings = getMcpAllowlistSettings();
  if (!settings.allowedMcpServers) {
    return true;
  }
  if (settings.allowedMcpServers.length === 0) {
    return false;
  }
  const hasCommandEntries = settings.allowedMcpServers.some(
    isMcpServerCommandEntry
  );
  const hasUrlEntries = settings.allowedMcpServers.some(isMcpServerUrlEntry);
  if (config) {
    const serverCommand = getServerCommandArray(config);
    const serverUrl = getServerUrl(config);
    if (serverCommand) {
      if (hasCommandEntries) {
        for (const entry of settings.allowedMcpServers) {
          if (isMcpServerCommandEntry(entry) && commandArraysMatch(entry.serverCommand, serverCommand)) {
            return true;
          }
        }
        return false;
      } else {
        for (const entry of settings.allowedMcpServers) {
          if (isMcpServerNameEntry(entry) && entry.serverName === serverName) {
            return true;
          }
        }
        return false;
      }
    } else if (serverUrl) {
      if (hasUrlEntries) {
        for (const entry of settings.allowedMcpServers) {
          if (isMcpServerUrlEntry(entry) && urlMatchesPattern(serverUrl, entry.serverUrl)) {
            return true;
          }
        }
        return false;
      } else {
        for (const entry of settings.allowedMcpServers) {
          if (isMcpServerNameEntry(entry) && entry.serverName === serverName) {
            return true;
          }
        }
        return false;
      }
    } else {
      for (const entry of settings.allowedMcpServers) {
        if (isMcpServerNameEntry(entry) && entry.serverName === serverName) {
          return true;
        }
      }
      return false;
    }
  }
  for (const entry of settings.allowedMcpServers) {
    if (isMcpServerNameEntry(entry) && entry.serverName === serverName) {
      return true;
    }
  }
  return false;
}
function filterMcpServersByPolicy(configs) {
  const allowed = {};
  const blocked = [];
  for (const [name, config] of Object.entries(configs)) {
    const c = config;
    if (c.type === "sdk" || isMcpServerAllowedByPolicy(name, c)) {
      allowed[name] = config;
    } else {
      blocked.push(name);
    }
  }
  return { allowed, blocked };
}
function expandEnvVars(config) {
  const missingVars = [];
  function expandString(str) {
    const { expanded: expanded2, missingVars: vars } = expandEnvVarsInString(str);
    missingVars.push(...vars);
    return expanded2;
  }
  let expanded;
  switch (config.type) {
    case void 0:
    case "stdio": {
      const stdioConfig = config;
      expanded = {
        ...stdioConfig,
        command: expandString(stdioConfig.command),
        args: stdioConfig.args.map(expandString),
        env: stdioConfig.env ? mapValues(stdioConfig.env, expandString) : void 0
      };
      break;
    }
    case "sse":
    case "http":
    case "ws": {
      const remoteConfig = config;
      expanded = {
        ...remoteConfig,
        url: expandString(remoteConfig.url),
        headers: remoteConfig.headers ? mapValues(remoteConfig.headers, expandString) : void 0
      };
      break;
    }
    case "sse-ide":
    case "ws-ide":
      expanded = config;
      break;
    case "sdk":
      expanded = config;
      break;
    case "claudeai-proxy":
      expanded = config;
      break;
  }
  return {
    expanded,
    missingVars: [...new Set(missingVars)]
  };
}
async function addMcpConfig(name, config, scope) {
  if (name.match(/[^a-zA-Z0-9_-]/)) {
    throw new Error(
      `Invalid name ${name}. Names can only contain letters, numbers, hyphens, and underscores.`
    );
  }
  if (isClaudeInChromeMCPServer(name)) {
    throw new Error(`Cannot add MCP server "${name}": this name is reserved.`);
  }
  if (false) {
    const { isComputerUseMCPServer } = await null;
    if (isComputerUseMCPServer(name)) {
      throw new Error(`Cannot add MCP server "${name}": this name is reserved.`);
    }
  }
  if (doesEnterpriseMcpConfigExist()) {
    throw new Error(
      `Cannot add MCP server: enterprise MCP configuration is active and has exclusive control over MCP servers`
    );
  }
  const result = McpServerConfigSchema().safeParse(config);
  if (!result.success) {
    const formattedErrors = result.error.issues.map((err) => `${err.path.join(".")}: ${err.message}`).join(", ");
    throw new Error(`Invalid configuration: ${formattedErrors}`);
  }
  const validatedConfig = result.data;
  if (isMcpServerDenied(name, validatedConfig)) {
    throw new Error(
      `Cannot add MCP server "${name}": server is explicitly blocked by enterprise policy`
    );
  }
  if (!isMcpServerAllowedByPolicy(name, validatedConfig)) {
    throw new Error(
      `Cannot add MCP server "${name}": not allowed by enterprise policy`
    );
  }
  switch (scope) {
    case "project": {
      const { servers } = getProjectMcpConfigsFromCwd();
      if (servers[name]) {
        throw new Error(`MCP server ${name} already exists in .mcp.json`);
      }
      break;
    }
    case "user": {
      const globalConfig = getGlobalConfig();
      if (globalConfig.mcpServers?.[name]) {
        throw new Error(`MCP server ${name} already exists in user config`);
      }
      break;
    }
    case "local": {
      const projectConfig = getCurrentProjectConfig();
      if (projectConfig.mcpServers?.[name]) {
        throw new Error(`MCP server ${name} already exists in local config`);
      }
      break;
    }
    case "dynamic":
      throw new Error("Cannot add MCP server to scope: dynamic");
    case "enterprise":
      throw new Error("Cannot add MCP server to scope: enterprise");
    case "claudeai":
      throw new Error("Cannot add MCP server to scope: claudeai");
  }
  switch (scope) {
    case "project": {
      const { servers: existingServers } = getProjectMcpConfigsFromCwd();
      const mcpServers = {};
      for (const [serverName, serverConfig] of Object.entries(
        existingServers
      )) {
        const { scope: _, ...configWithoutScope } = serverConfig;
        mcpServers[serverName] = configWithoutScope;
      }
      mcpServers[name] = validatedConfig;
      const mcpConfig = { mcpServers };
      try {
        await writeMcpjsonFile(mcpConfig);
      } catch (error) {
        throw new Error(`Failed to write to .mcp.json: ${error}`);
      }
      break;
    }
    case "user": {
      saveGlobalConfig((current) => ({
        ...current,
        mcpServers: {
          ...current.mcpServers,
          [name]: validatedConfig
        }
      }));
      break;
    }
    case "local": {
      saveCurrentProjectConfig((current) => ({
        ...current,
        mcpServers: {
          ...current.mcpServers,
          [name]: validatedConfig
        }
      }));
      break;
    }
    default:
      throw new Error(`Cannot add MCP server to scope: ${scope}`);
  }
}
async function removeMcpConfig(name, scope) {
  switch (scope) {
    case "project": {
      const { servers: existingServers } = getProjectMcpConfigsFromCwd();
      if (!existingServers[name]) {
        throw new Error(`No MCP server found with name: ${name} in .mcp.json`);
      }
      const mcpServers = {};
      for (const [serverName, serverConfig] of Object.entries(
        existingServers
      )) {
        if (serverName !== name) {
          const { scope: _, ...configWithoutScope } = serverConfig;
          mcpServers[serverName] = configWithoutScope;
        }
      }
      const mcpConfig = { mcpServers };
      try {
        await writeMcpjsonFile(mcpConfig);
      } catch (error) {
        throw new Error(`Failed to remove from .mcp.json: ${error}`);
      }
      break;
    }
    case "user": {
      const config = getGlobalConfig();
      if (!config.mcpServers?.[name]) {
        throw new Error(`No user-scoped MCP server found with name: ${name}`);
      }
      saveGlobalConfig((current) => {
        const { [name]: _, ...restMcpServers } = current.mcpServers ?? {};
        return {
          ...current,
          mcpServers: restMcpServers
        };
      });
      break;
    }
    case "local": {
      const config = getCurrentProjectConfig();
      if (!config.mcpServers?.[name]) {
        throw new Error(`No project-local MCP server found with name: ${name}`);
      }
      saveCurrentProjectConfig((current) => {
        const { [name]: _, ...restMcpServers } = current.mcpServers ?? {};
        return {
          ...current,
          mcpServers: restMcpServers
        };
      });
      break;
    }
    default:
      throw new Error(`Cannot remove MCP server from scope: ${scope}`);
  }
}
function getProjectMcpConfigsFromCwd() {
  if (!isSettingSourceEnabled("projectSettings")) {
    return { servers: {}, errors: [] };
  }
  const mcpJsonPath = join(getCwd(), ".mcp.json");
  const { config, errors } = parseMcpConfigFromFilePath({
    filePath: mcpJsonPath,
    expandVars: true,
    scope: "project"
  });
  if (!config) {
    const nonMissingErrors = errors.filter(
      (e) => !e.message.startsWith("MCP config file not found")
    );
    if (nonMissingErrors.length > 0) {
      logForDebugging(
        `MCP config errors for ${mcpJsonPath}: ${jsonStringify(nonMissingErrors.map((e) => e.message))}`,
        { level: "error" }
      );
      return { servers: {}, errors: nonMissingErrors };
    }
    return { servers: {}, errors: [] };
  }
  return {
    servers: config.mcpServers ? addScopeToServers(config.mcpServers, "project") : {},
    errors: errors || []
  };
}
function getMcpConfigsByScope(scope) {
  const sourceMap = {
    project: "projectSettings",
    user: "userSettings",
    local: "localSettings"
  };
  if (scope in sourceMap && !isSettingSourceEnabled(sourceMap[scope])) {
    return { servers: {}, errors: [] };
  }
  switch (scope) {
    case "project": {
      const allServers = {};
      const allErrors = [];
      const dirs = [];
      let currentDir = getCwd();
      while (currentDir !== parse(currentDir).root) {
        dirs.push(currentDir);
        currentDir = dirname(currentDir);
      }
      for (const dir of dirs.reverse()) {
        const mcpJsonPath = join(dir, ".mcp.json");
        const { config, errors } = parseMcpConfigFromFilePath({
          filePath: mcpJsonPath,
          expandVars: true,
          scope: "project"
        });
        if (!config) {
          const nonMissingErrors = errors.filter(
            (e) => !e.message.startsWith("MCP config file not found")
          );
          if (nonMissingErrors.length > 0) {
            logForDebugging(
              `MCP config errors for ${mcpJsonPath}: ${jsonStringify(nonMissingErrors.map((e) => e.message))}`,
              { level: "error" }
            );
            allErrors.push(...nonMissingErrors);
          }
          continue;
        }
        if (config.mcpServers) {
          Object.assign(allServers, addScopeToServers(config.mcpServers, scope));
        }
        if (errors.length > 0) {
          allErrors.push(...errors);
        }
      }
      return {
        servers: allServers,
        errors: allErrors
      };
    }
    case "user": {
      const mcpServers = getGlobalConfig().mcpServers;
      if (!mcpServers) {
        return { servers: {}, errors: [] };
      }
      const { config, errors } = parseMcpConfig({
        configObject: { mcpServers },
        expandVars: true,
        scope: "user"
      });
      return {
        servers: addScopeToServers(config?.mcpServers, scope),
        errors
      };
    }
    case "local": {
      const mcpServers = getCurrentProjectConfig().mcpServers;
      if (!mcpServers) {
        return { servers: {}, errors: [] };
      }
      const { config, errors } = parseMcpConfig({
        configObject: { mcpServers },
        expandVars: true,
        scope: "local"
      });
      return {
        servers: addScopeToServers(config?.mcpServers, scope),
        errors
      };
    }
    case "enterprise": {
      const enterpriseMcpPath = getEnterpriseMcpFilePath();
      const { config, errors } = parseMcpConfigFromFilePath({
        filePath: enterpriseMcpPath,
        expandVars: true,
        scope: "enterprise"
      });
      if (!config) {
        const nonMissingErrors = errors.filter(
          (e) => !e.message.startsWith("MCP config file not found")
        );
        if (nonMissingErrors.length > 0) {
          logForDebugging(
            `Enterprise MCP config errors for ${enterpriseMcpPath}: ${jsonStringify(nonMissingErrors.map((e) => e.message))}`,
            { level: "error" }
          );
          return { servers: {}, errors: nonMissingErrors };
        }
        return { servers: {}, errors: [] };
      }
      return {
        servers: addScopeToServers(config.mcpServers, scope),
        errors
      };
    }
  }
}
function getMcpConfigByName(name) {
  const { servers: enterpriseServers } = getMcpConfigsByScope("enterprise");
  if (isRestrictedToPluginOnly("mcp")) {
    return enterpriseServers[name] ?? null;
  }
  const { servers: userServers } = getMcpConfigsByScope("user");
  const { servers: projectServers } = getMcpConfigsByScope("project");
  const { servers: localServers } = getMcpConfigsByScope("local");
  if (enterpriseServers[name]) {
    return enterpriseServers[name];
  }
  if (localServers[name]) {
    return localServers[name];
  }
  if (projectServers[name]) {
    return projectServers[name];
  }
  if (userServers[name]) {
    return userServers[name];
  }
  return null;
}
async function getClaudeCodeMcpConfigs(dynamicServers = {}, extraDedupTargets = Promise.resolve({})) {
  const { servers: enterpriseServers } = getMcpConfigsByScope("enterprise");
  if (doesEnterpriseMcpConfigExist()) {
    const filtered2 = {};
    for (const [name, serverConfig] of Object.entries(enterpriseServers)) {
      if (!isMcpServerAllowedByPolicy(name, serverConfig)) {
        continue;
      }
      filtered2[name] = serverConfig;
    }
    return { servers: filtered2, errors: [] };
  }
  const mcpLocked = isRestrictedToPluginOnly("mcp");
  const noServers = {
    servers: {}
  };
  const { servers: userServers } = mcpLocked ? noServers : getMcpConfigsByScope("user");
  const { servers: projectServers } = mcpLocked ? noServers : getMcpConfigsByScope("project");
  const { servers: localServers } = mcpLocked ? noServers : getMcpConfigsByScope("local");
  const pluginMcpServers = {};
  const pluginResult = await loadAllPluginsCacheOnly();
  const mcpErrors = [];
  if (pluginResult.errors.length > 0) {
    for (const error of pluginResult.errors) {
      if (error.type === "mcp-config-invalid" || error.type === "mcpb-download-failed" || error.type === "mcpb-extract-failed" || error.type === "mcpb-invalid-manifest") {
        const errorMessage = `Plugin MCP loading error - ${error.type}: ${getPluginErrorMessage(error)}`;
        logError(new Error(errorMessage));
      } else {
        const errorType = error.type;
        logForDebugging(
          `Plugin not available for MCP: ${error.source} - error type: ${errorType}`
        );
      }
    }
  }
  const pluginServerResults = await Promise.all(
    pluginResult.enabled.map((plugin) => getPluginMcpServers(plugin, mcpErrors))
  );
  for (const servers of pluginServerResults) {
    if (servers) {
      Object.assign(pluginMcpServers, servers);
    }
  }
  if (mcpErrors.length > 0) {
    for (const error of mcpErrors) {
      const errorMessage = `Plugin MCP server error - ${error.type}: ${getPluginErrorMessage(error)}`;
      logError(new Error(errorMessage));
    }
  }
  const approvedProjectServers = {};
  for (const [name, config] of Object.entries(projectServers)) {
    if (getProjectMcpServerStatus(name) === "approved") {
      approvedProjectServers[name] = config;
    }
  }
  const extraTargets = await extraDedupTargets;
  const enabledManualServers = {};
  for (const [name, config] of Object.entries({
    ...userServers,
    ...approvedProjectServers,
    ...localServers,
    ...dynamicServers,
    ...extraTargets
  })) {
    if (!isMcpServerDisabled(name) && isMcpServerAllowedByPolicy(name, config)) {
      enabledManualServers[name] = config;
    }
  }
  const enabledPluginServers = {};
  const disabledPluginServers = {};
  for (const [name, config] of Object.entries(pluginMcpServers)) {
    if (isMcpServerDisabled(name) || !isMcpServerAllowedByPolicy(name, config)) {
      disabledPluginServers[name] = config;
    } else {
      enabledPluginServers[name] = config;
    }
  }
  const { servers: dedupedPluginServers, suppressed } = dedupPluginMcpServers(
    enabledPluginServers,
    enabledManualServers
  );
  Object.assign(dedupedPluginServers, disabledPluginServers);
  for (const { name, duplicateOf } of suppressed) {
    const parts = name.split(":");
    if (parts[0] !== "plugin" || parts.length < 3) continue;
    mcpErrors.push({
      type: "mcp-server-suppressed-duplicate",
      source: name,
      plugin: parts[1],
      serverName: parts.slice(2).join(":"),
      duplicateOf
    });
  }
  const configs = Object.assign(
    {},
    dedupedPluginServers,
    userServers,
    approvedProjectServers,
    localServers
  );
  const filtered = {};
  for (const [name, serverConfig] of Object.entries(configs)) {
    if (!isMcpServerAllowedByPolicy(name, serverConfig)) {
      continue;
    }
    filtered[name] = serverConfig;
  }
  return { servers: filtered, errors: mcpErrors };
}
async function getAllMcpConfigs() {
  if (doesEnterpriseMcpConfigExist()) {
    return getClaudeCodeMcpConfigs();
  }
  const claudeaiPromise = fetchClaudeAIMcpConfigsIfEligible();
  const { servers: claudeCodeServers, errors } = await getClaudeCodeMcpConfigs(
    {},
    claudeaiPromise
  );
  const { allowed: claudeaiMcpServers } = filterMcpServersByPolicy(
    await claudeaiPromise
  );
  const { servers: dedupedClaudeAi } = dedupClaudeAiMcpServers(
    claudeaiMcpServers,
    claudeCodeServers
  );
  const servers = Object.assign({}, dedupedClaudeAi, claudeCodeServers);
  return { servers, errors };
}
function parseMcpConfig(params) {
  const { configObject, expandVars, scope, filePath } = params;
  const schemaResult = McpJsonConfigSchema().safeParse(configObject);
  if (!schemaResult.success) {
    return {
      config: null,
      errors: schemaResult.error.issues.map((issue) => ({
        ...filePath && { file: filePath },
        path: issue.path.join("."),
        message: "Does not adhere to MCP server configuration schema",
        mcpErrorMetadata: {
          scope,
          severity: "fatal"
        }
      }))
    };
  }
  const errors = [];
  const validatedServers = {};
  for (const [name, config] of Object.entries(schemaResult.data.mcpServers)) {
    let configToCheck = config;
    if (expandVars) {
      const { expanded, missingVars } = expandEnvVars(config);
      if (missingVars.length > 0) {
        errors.push({
          ...filePath && { file: filePath },
          path: `mcpServers.${name}`,
          message: `Missing environment variables: ${missingVars.join(", ")}`,
          suggestion: `Set the following environment variables: ${missingVars.join(", ")}`,
          mcpErrorMetadata: {
            scope,
            serverName: name,
            severity: "warning"
          }
        });
      }
      configToCheck = expanded;
    }
    if (getPlatform() === "windows" && (!configToCheck.type || configToCheck.type === "stdio") && (configToCheck.command === "npx" || configToCheck.command.endsWith("\\npx") || configToCheck.command.endsWith("/npx"))) {
      errors.push({
        ...filePath && { file: filePath },
        path: `mcpServers.${name}`,
        message: `Windows requires 'cmd /c' wrapper to execute npx`,
        suggestion: `Change command to "cmd" with args ["/c", "npx", ...]. See: https://code.claude.com/docs/en/mcp#configure-mcp-servers`,
        mcpErrorMetadata: {
          scope,
          serverName: name,
          severity: "warning"
        }
      });
    }
    validatedServers[name] = configToCheck;
  }
  return {
    config: { mcpServers: validatedServers },
    errors
  };
}
function parseMcpConfigFromFilePath(params) {
  const { filePath, expandVars, scope } = params;
  const fs = getFsImplementation();
  let configContent;
  try {
    configContent = fs.readFileSync(filePath, { encoding: "utf8" });
  } catch (error) {
    const code = getErrnoCode(error);
    if (code === "ENOENT") {
      return {
        config: null,
        errors: [
          {
            file: filePath,
            path: "",
            message: `MCP config file not found: ${filePath}`,
            suggestion: "Check that the file path is correct",
            mcpErrorMetadata: {
              scope,
              severity: "fatal"
            }
          }
        ]
      };
    }
    logForDebugging(
      `MCP config read error for ${filePath} (scope=${scope}): ${error}`,
      { level: "error" }
    );
    return {
      config: null,
      errors: [
        {
          file: filePath,
          path: "",
          message: `Failed to read file: ${error}`,
          suggestion: "Check file permissions and ensure the file exists",
          mcpErrorMetadata: {
            scope,
            severity: "fatal"
          }
        }
      ]
    };
  }
  const parsedJson = safeParseJSON(configContent);
  if (!parsedJson) {
    logForDebugging(
      `MCP config is not valid JSON: ${filePath} (scope=${scope}, length=${configContent.length}, first100=${jsonStringify(configContent.slice(0, 100))})`,
      { level: "error" }
    );
    return {
      config: null,
      errors: [
        {
          file: filePath,
          path: "",
          message: `MCP config is not a valid JSON`,
          suggestion: "Fix the JSON syntax errors in the file",
          mcpErrorMetadata: {
            scope,
            severity: "fatal"
          }
        }
      ]
    };
  }
  return parseMcpConfig({
    configObject: parsedJson,
    expandVars,
    scope,
    filePath
  });
}
const doesEnterpriseMcpConfigExist = memoize(() => {
  const { config } = parseMcpConfigFromFilePath({
    filePath: getEnterpriseMcpFilePath(),
    expandVars: true,
    scope: "enterprise"
  });
  return config !== null;
});
function shouldAllowManagedMcpServersOnly() {
  return getSettingsForSource("policySettings")?.allowManagedMcpServersOnly === true;
}
function areMcpConfigsAllowedWithEnterpriseMcpConfig(configs) {
  return Object.values(configs).every(
    (c) => c.type === "sdk" && c.name === "claude-vscode"
  );
}
const DEFAULT_DISABLED_BUILTIN = false ? require2("../../utils/computerUse/common.js").COMPUTER_USE_MCP_SERVER_NAME : null;
function isDefaultDisabledBuiltin(name) {
  return DEFAULT_DISABLED_BUILTIN !== null && name === DEFAULT_DISABLED_BUILTIN;
}
function isMcpServerDisabled(name) {
  const projectConfig = getCurrentProjectConfig();
  if (isDefaultDisabledBuiltin(name)) {
    const enabledServers = projectConfig.enabledMcpServers || [];
    return !enabledServers.includes(name);
  }
  const disabledServers = projectConfig.disabledMcpServers || [];
  return disabledServers.includes(name);
}
function toggleMembership(list, name, shouldContain) {
  const contains = list.includes(name);
  if (contains === shouldContain) return list;
  return shouldContain ? [...list, name] : list.filter((s) => s !== name);
}
function setMcpServerEnabled(name, enabled) {
  const isBuiltinStateChange = isDefaultDisabledBuiltin(name) && isMcpServerDisabled(name) === enabled;
  saveCurrentProjectConfig((current) => {
    if (isDefaultDisabledBuiltin(name)) {
      const prev2 = current.enabledMcpServers || [];
      const next2 = toggleMembership(prev2, name, enabled);
      if (next2 === prev2) return current;
      return { ...current, enabledMcpServers: next2 };
    }
    const prev = current.disabledMcpServers || [];
    const next = toggleMembership(prev, name, !enabled);
    if (next === prev) return current;
    return { ...current, disabledMcpServers: next };
  });
  if (isBuiltinStateChange) {
    logEvent("tengu_builtin_mcp_toggle", {
      serverName: name,
      enabled
    });
  }
}
export {
  addMcpConfig,
  areMcpConfigsAllowedWithEnterpriseMcpConfig,
  dedupClaudeAiMcpServers,
  dedupPluginMcpServers,
  doesEnterpriseMcpConfigExist,
  filterMcpServersByPolicy,
  getAllMcpConfigs,
  getClaudeCodeMcpConfigs,
  getEnterpriseMcpFilePath,
  getMcpConfigByName,
  getMcpConfigsByScope,
  getMcpServerSignature,
  getProjectMcpConfigsFromCwd,
  isMcpServerDisabled,
  parseMcpConfig,
  parseMcpConfigFromFilePath,
  removeMcpConfig,
  setMcpServerEnabled,
  shouldAllowManagedMcpServersOnly,
  unwrapCcrProxyUrl
};
