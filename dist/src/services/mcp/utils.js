import { createHash } from "crypto";
import { join } from "path";
import { getIsNonInteractiveSession } from "../../bootstrap/state.js";
import { getCwd } from "../../utils/cwd.js";
import { getGlobalClaudeFile } from "../../utils/env.js";
import { isSettingSourceEnabled } from "../../utils/settings/constants.js";
import {
  getSettings_DEPRECATED,
  hasSkipDangerousModePermissionPrompt
} from "../../utils/settings/settings.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { getEnterpriseMcpFilePath, getMcpConfigByName } from "./config.js";
import { mcpInfoFromString } from "./mcpStringUtils.js";
import { normalizeNameForMCP } from "./normalization.js";
import {
  ConfigScopeSchema
} from "./types.js";
function filterToolsByServer(tools, serverName) {
  const prefix = `mcp__${normalizeNameForMCP(serverName)}__`;
  return tools.filter((tool) => tool.name?.startsWith(prefix));
}
function commandBelongsToServer(command, serverName) {
  const normalized = normalizeNameForMCP(serverName);
  const name = command.name;
  if (!name) return false;
  return name.startsWith(`mcp__${normalized}__`) || name.startsWith(`${normalized}:`);
}
function filterCommandsByServer(commands, serverName) {
  return commands.filter((c) => commandBelongsToServer(c, serverName));
}
function filterMcpPromptsByServer(commands, serverName) {
  return commands.filter(
    (c) => commandBelongsToServer(c, serverName) && !(c.type === "prompt" && c.loadedFrom === "mcp")
  );
}
function filterResourcesByServer(resources, serverName) {
  return resources.filter((resource) => resource.server === serverName);
}
function excludeToolsByServer(tools, serverName) {
  const prefix = `mcp__${normalizeNameForMCP(serverName)}__`;
  return tools.filter((tool) => !tool.name?.startsWith(prefix));
}
function excludeCommandsByServer(commands, serverName) {
  return commands.filter((c) => !commandBelongsToServer(c, serverName));
}
function excludeResourcesByServer(resources, serverName) {
  const result = { ...resources };
  delete result[serverName];
  return result;
}
function hashMcpConfig(config) {
  const { scope: _scope, ...rest } = config;
  const stable = jsonStringify(rest, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v;
      const sorted = {};
      for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
      return sorted;
    }
    return v;
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}
function excludeStalePluginClients(mcp, configs) {
  const stale = mcp.clients.filter((c) => {
    const fresh = configs[c.name];
    if (!fresh) return c.config.scope === "dynamic";
    return hashMcpConfig(c.config) !== hashMcpConfig(fresh);
  });
  if (stale.length === 0) {
    return { ...mcp, stale: [] };
  }
  let { tools, commands, resources } = mcp;
  for (const s of stale) {
    tools = excludeToolsByServer(tools, s.name);
    commands = excludeCommandsByServer(commands, s.name);
    resources = excludeResourcesByServer(resources, s.name);
  }
  const staleNames = new Set(stale.map((c) => c.name));
  return {
    clients: mcp.clients.filter((c) => !staleNames.has(c.name)),
    tools,
    commands,
    resources,
    stale
  };
}
function isToolFromMcpServer(toolName, serverName) {
  const info = mcpInfoFromString(toolName);
  return info?.serverName === serverName;
}
function isMcpTool(tool) {
  return tool.name?.startsWith("mcp__") || tool.isMcp === true;
}
function isMcpCommand(command) {
  return command.name?.startsWith("mcp__") || command.isMcp === true;
}
function describeMcpConfigFilePath(scope) {
  switch (scope) {
    case "user":
      return getGlobalClaudeFile();
    case "project":
      return join(getCwd(), ".mcp.json");
    case "local":
      return `${getGlobalClaudeFile()} [project: ${getCwd()}]`;
    case "dynamic":
      return "Dynamically configured";
    case "enterprise":
      return getEnterpriseMcpFilePath();
    case "claudeai":
      return "claude.ai";
    default:
      return scope;
  }
}
function getScopeLabel(scope) {
  switch (scope) {
    case "local":
      return "Local config (private to you in this project)";
    case "project":
      return "Project config (shared via .mcp.json)";
    case "user":
      return "User config (available in all your projects)";
    case "dynamic":
      return "Dynamic config (from command line)";
    case "enterprise":
      return "Enterprise config (managed by your organization)";
    case "claudeai":
      return "claude.ai config";
    default:
      return scope;
  }
}
function ensureConfigScope(scope) {
  if (!scope) return "local";
  if (!ConfigScopeSchema().options.includes(scope)) {
    throw new Error(
      `Invalid scope: ${scope}. Must be one of: ${ConfigScopeSchema().options.join(", ")}`
    );
  }
  return scope;
}
function ensureTransport(type) {
  if (!type) return "stdio";
  if (type !== "stdio" && type !== "sse" && type !== "http") {
    throw new Error(
      `Invalid transport type: ${type}. Must be one of: stdio, sse, http`
    );
  }
  return type;
}
function parseHeaders(headerArray) {
  const headers = {};
  for (const header of headerArray) {
    const colonIndex = header.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(
        `Invalid header format: "${header}". Expected format: "Header-Name: value"`
      );
    }
    const key = header.substring(0, colonIndex).trim();
    const value = header.substring(colonIndex + 1).trim();
    if (!key) {
      throw new Error(
        `Invalid header: "${header}". Header name cannot be empty.`
      );
    }
    headers[key] = value;
  }
  return headers;
}
function getProjectMcpServerStatus(serverName) {
  const settings = getSettings_DEPRECATED();
  const normalizedName = normalizeNameForMCP(serverName);
  if (settings?.disabledMcpjsonServers?.some(
    (name) => normalizeNameForMCP(name) === normalizedName
  )) {
    return "rejected";
  }
  if (settings?.enabledMcpjsonServers?.some(
    (name) => normalizeNameForMCP(name) === normalizedName
  ) || settings?.enableAllProjectMcpServers) {
    return "approved";
  }
  if (hasSkipDangerousModePermissionPrompt() && isSettingSourceEnabled("projectSettings")) {
    return "approved";
  }
  if (getIsNonInteractiveSession() && isSettingSourceEnabled("projectSettings")) {
    return "approved";
  }
  return "pending";
}
function getMcpServerScopeFromToolName(toolName) {
  if (!isMcpTool({ name: toolName })) {
    return null;
  }
  const mcpInfo = mcpInfoFromString(toolName);
  if (!mcpInfo) {
    return null;
  }
  const serverConfig = getMcpConfigByName(mcpInfo.serverName);
  if (!serverConfig && mcpInfo.serverName.startsWith("claude_ai_")) {
    return "claudeai";
  }
  return serverConfig?.scope ?? null;
}
function isStdioConfig(config) {
  return config.type === "stdio" || config.type === void 0;
}
function isSSEConfig(config) {
  return config.type === "sse";
}
function isHTTPConfig(config) {
  return config.type === "http";
}
function isWebSocketConfig(config) {
  return config.type === "ws";
}
function extractAgentMcpServers(agents) {
  const serverMap = /* @__PURE__ */ new Map();
  for (const agent of agents) {
    if (!agent.mcpServers?.length) continue;
    for (const spec of agent.mcpServers) {
      if (typeof spec === "string") continue;
      const entries = Object.entries(spec);
      if (entries.length !== 1) continue;
      const [serverName, serverConfig] = entries[0];
      const existing = serverMap.get(serverName);
      if (existing) {
        if (!existing.sourceAgents.includes(agent.agentType)) {
          existing.sourceAgents.push(agent.agentType);
        }
      } else {
        serverMap.set(serverName, {
          config: { ...serverConfig, name: serverName },
          sourceAgents: [agent.agentType]
        });
      }
    }
  }
  const result = [];
  for (const [name, { config, sourceAgents }] of serverMap) {
    if (isStdioConfig(config)) {
      result.push({
        name,
        sourceAgents,
        transport: "stdio",
        command: config.command,
        needsAuth: false
      });
    } else if (isSSEConfig(config)) {
      result.push({
        name,
        sourceAgents,
        transport: "sse",
        url: config.url,
        needsAuth: true
      });
    } else if (isHTTPConfig(config)) {
      result.push({
        name,
        sourceAgents,
        transport: "http",
        url: config.url,
        needsAuth: true
      });
    } else if (isWebSocketConfig(config)) {
      result.push({
        name,
        sourceAgents,
        transport: "ws",
        url: config.url,
        needsAuth: false
      });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
function getLoggingSafeMcpBaseUrl(config) {
  if (!("url" in config) || typeof config.url !== "string") {
    return void 0;
  }
  try {
    const url = new URL(config.url);
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return void 0;
  }
}
export {
  commandBelongsToServer,
  describeMcpConfigFilePath,
  ensureConfigScope,
  ensureTransport,
  excludeCommandsByServer,
  excludeResourcesByServer,
  excludeStalePluginClients,
  excludeToolsByServer,
  extractAgentMcpServers,
  filterCommandsByServer,
  filterMcpPromptsByServer,
  filterResourcesByServer,
  filterToolsByServer,
  getLoggingSafeMcpBaseUrl,
  getMcpServerScopeFromToolName,
  getProjectMcpServerStatus,
  getScopeLabel,
  hashMcpConfig,
  isMcpCommand,
  isMcpTool,
  isToolFromMcpServer,
  parseHeaders
};
