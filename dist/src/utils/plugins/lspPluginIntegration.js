import { readFile } from "fs/promises";
import { join, relative, resolve } from "path";
import { z } from "zod/v4";
import { expandEnvVarsInString } from "../../services/mcp/envExpansion.js";
import { logForDebugging } from "../debug.js";
import { isENOENT, toError } from "../errors.js";
import { logError } from "../log.js";
import { jsonParse } from "../slowOperations.js";
import { getPluginDataDir } from "./pluginDirectories.js";
import {
  getPluginStorageId,
  loadPluginOptions,
  substitutePluginVariables,
  substituteUserConfigVariables
} from "./pluginOptionsStorage.js";
import { LspServerConfigSchema } from "./schemas.js";
function validatePathWithinPlugin(pluginPath, relativePath) {
  const resolvedPluginPath = resolve(pluginPath);
  const resolvedFilePath = resolve(pluginPath, relativePath);
  const rel = relative(resolvedPluginPath, resolvedFilePath);
  if (rel.startsWith("..") || resolve(rel) === rel) {
    return null;
  }
  return resolvedFilePath;
}
async function loadPluginLspServers(plugin, errors = []) {
  const servers = {};
  const lspJsonPath = join(plugin.path, ".lsp.json");
  try {
    const content = await readFile(lspJsonPath, "utf-8");
    const parsed = jsonParse(content);
    const result = z.record(z.string(), LspServerConfigSchema()).safeParse(parsed);
    if (result.success) {
      Object.assign(servers, result.data);
    } else {
      const errorMsg = `LSP config validation failed for .lsp.json in plugin ${plugin.name}: ${result.error.message}`;
      logError(new Error(errorMsg));
      errors.push({
        type: "lsp-config-invalid",
        plugin: plugin.name,
        serverName: ".lsp.json",
        validationError: result.error.message,
        source: "plugin"
      });
    }
  } catch (error) {
    if (!isENOENT(error)) {
      const _errorMsg = error instanceof Error ? `Failed to read/parse .lsp.json in plugin ${plugin.name}: ${error.message}` : `Failed to read/parse .lsp.json file in plugin ${plugin.name}`;
      logError(toError(error));
      errors.push({
        type: "lsp-config-invalid",
        plugin: plugin.name,
        serverName: ".lsp.json",
        validationError: error instanceof Error ? `Failed to parse JSON: ${error.message}` : "Failed to parse JSON file",
        source: "plugin"
      });
    }
  }
  if (plugin.manifest.lspServers) {
    const manifestServers = await loadLspServersFromManifest(
      plugin.manifest.lspServers,
      plugin.path,
      plugin.name,
      errors
    );
    if (manifestServers) {
      Object.assign(servers, manifestServers);
    }
  }
  return Object.keys(servers).length > 0 ? servers : void 0;
}
async function loadLspServersFromManifest(declaration, pluginPath, pluginName, errors) {
  const servers = {};
  const declarations = Array.isArray(declaration) ? declaration : [declaration];
  for (const decl of declarations) {
    if (typeof decl === "string") {
      const validatedPath = validatePathWithinPlugin(pluginPath, decl);
      if (!validatedPath) {
        const securityMsg = `Security: Path traversal attempt blocked in plugin ${pluginName}: ${decl}`;
        logError(new Error(securityMsg));
        logForDebugging(securityMsg, { level: "warn" });
        errors.push({
          type: "lsp-config-invalid",
          plugin: pluginName,
          serverName: decl,
          validationError: "Invalid path: must be relative and within plugin directory",
          source: "plugin"
        });
        continue;
      }
      try {
        const content = await readFile(validatedPath, "utf-8");
        const parsed = jsonParse(content);
        const result = z.record(z.string(), LspServerConfigSchema()).safeParse(parsed);
        if (result.success) {
          Object.assign(servers, result.data);
        } else {
          const errorMsg = `LSP config validation failed for ${decl} in plugin ${pluginName}: ${result.error.message}`;
          logError(new Error(errorMsg));
          errors.push({
            type: "lsp-config-invalid",
            plugin: pluginName,
            serverName: decl,
            validationError: result.error.message,
            source: "plugin"
          });
        }
      } catch (error) {
        const _errorMsg = error instanceof Error ? `Failed to read/parse LSP config from ${decl} in plugin ${pluginName}: ${error.message}` : `Failed to read/parse LSP config file ${decl} in plugin ${pluginName}`;
        logError(toError(error));
        errors.push({
          type: "lsp-config-invalid",
          plugin: pluginName,
          serverName: decl,
          validationError: error instanceof Error ? `Failed to parse JSON: ${error.message}` : "Failed to parse JSON file",
          source: "plugin"
        });
      }
    } else {
      for (const [serverName, config] of Object.entries(decl)) {
        const result = LspServerConfigSchema().safeParse(config);
        if (result.success) {
          servers[serverName] = result.data;
        } else {
          const errorMsg = `LSP config validation failed for inline server "${serverName}" in plugin ${pluginName}: ${result.error.message}`;
          logError(new Error(errorMsg));
          errors.push({
            type: "lsp-config-invalid",
            plugin: pluginName,
            serverName,
            validationError: result.error.message,
            source: "plugin"
          });
        }
      }
    }
  }
  return Object.keys(servers).length > 0 ? servers : void 0;
}
function resolvePluginLspEnvironment(config, plugin, userConfig, _errors) {
  const allMissingVars = [];
  const resolveValue = (value) => {
    let resolved2 = substitutePluginVariables(value, plugin);
    if (userConfig) {
      resolved2 = substituteUserConfigVariables(resolved2, userConfig);
    }
    const { expanded, missingVars } = expandEnvVarsInString(resolved2);
    allMissingVars.push(...missingVars);
    return expanded;
  };
  const resolved = { ...config };
  if (resolved.command) {
    resolved.command = resolveValue(resolved.command);
  }
  if (resolved.args) {
    resolved.args = resolved.args.map((arg) => resolveValue(arg));
  }
  const resolvedEnv = {
    CLAUDE_PLUGIN_ROOT: plugin.path,
    CLAUDE_PLUGIN_DATA: getPluginDataDir(plugin.source),
    ...resolved.env || {}
  };
  for (const [key, value] of Object.entries(resolvedEnv)) {
    if (key !== "CLAUDE_PLUGIN_ROOT" && key !== "CLAUDE_PLUGIN_DATA") {
      resolvedEnv[key] = resolveValue(value);
    }
  }
  resolved.env = resolvedEnv;
  if (resolved.workspaceFolder) {
    resolved.workspaceFolder = resolveValue(resolved.workspaceFolder);
  }
  if (allMissingVars.length > 0) {
    const uniqueMissingVars = [...new Set(allMissingVars)];
    const warnMsg = `Missing environment variables in plugin LSP config: ${uniqueMissingVars.join(", ")}`;
    logError(new Error(warnMsg));
    logForDebugging(warnMsg, { level: "warn" });
  }
  return resolved;
}
function addPluginScopeToLspServers(servers, pluginName) {
  const scopedServers = {};
  for (const [name, config] of Object.entries(servers)) {
    const scopedName = `plugin:${pluginName}:${name}`;
    scopedServers[scopedName] = {
      ...config,
      scope: "dynamic",
      // Use dynamic scope for plugin servers
      source: pluginName
    };
  }
  return scopedServers;
}
async function getPluginLspServers(plugin, errors = []) {
  if (!plugin.enabled) {
    return void 0;
  }
  const servers = plugin.lspServers || await loadPluginLspServers(plugin, errors);
  if (!servers) {
    return void 0;
  }
  const userConfig = plugin.manifest.userConfig ? loadPluginOptions(getPluginStorageId(plugin)) : void 0;
  const resolvedServers = {};
  for (const [name, config] of Object.entries(servers)) {
    resolvedServers[name] = resolvePluginLspEnvironment(
      config,
      plugin,
      userConfig,
      errors
    );
  }
  return addPluginScopeToLspServers(resolvedServers, plugin.name);
}
async function extractLspServersFromPlugins(plugins, errors = []) {
  const allServers = {};
  for (const plugin of plugins) {
    if (!plugin.enabled) continue;
    const servers = await loadPluginLspServers(plugin, errors);
    if (servers) {
      const scopedServers = addPluginScopeToLspServers(servers, plugin.name);
      Object.assign(allServers, scopedServers);
      plugin.lspServers = servers;
      logForDebugging(
        `Loaded ${Object.keys(servers).length} LSP servers from plugin ${plugin.name}`
      );
    }
  }
  return allServers;
}
export {
  addPluginScopeToLspServers,
  extractLspServersFromPlugins,
  getPluginLspServers,
  loadPluginLspServers,
  resolvePluginLspEnvironment
};
