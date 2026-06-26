import { jsx } from "react/jsx-runtime";
import { stat } from "fs/promises";
import pMap from "p-map";
import { cwd } from "process";
import { MCPServerDesktopImportDialog } from "../../components/MCPServerDesktopImportDialog.js";
import { render } from "../../ink.js";
import { KeybindingSetup } from "../../keybindings/KeybindingProviderSetup.js";
import { logEvent } from "../../services/analytics/index.js";
import { clearMcpClientConfig, clearServerTokensFromLocalStorage, getMcpClientConfig, readClientSecret, saveMcpClientSecret } from "../../services/mcp/auth.js";
import { connectToServer, getMcpServerConnectionBatchSize } from "../../services/mcp/client.js";
import { addMcpConfig, getAllMcpConfigs, getMcpConfigByName, getMcpConfigsByScope, removeMcpConfig } from "../../services/mcp/config.js";
import { describeMcpConfigFilePath, ensureConfigScope, getScopeLabel } from "../../services/mcp/utils.js";
import { AppStateProvider } from "../../state/AppState.js";
import { getCurrentProjectConfig, getGlobalConfig, saveCurrentProjectConfig } from "../../utils/config.js";
import { isFsInaccessible } from "../../utils/errors.js";
import { gracefulShutdown } from "../../utils/gracefulShutdown.js";
import { safeParseJSON } from "../../utils/json.js";
import { getPlatform } from "../../utils/platform.js";
import { cliError, cliOk } from "../exit.js";
async function checkMcpServerHealth(name, server) {
  try {
    const result = await connectToServer(name, server);
    if (result.type === "connected") {
      return "\u2713 Connected";
    } else if (result.type === "needs-auth") {
      return "! Needs authentication";
    } else {
      return "\u2717 Failed to connect";
    }
  } catch (_error) {
    return "\u2717 Connection error";
  }
}
async function mcpServeHandler({
  debug,
  verbose
}) {
  const providedCwd = cwd();
  logEvent("tengu_mcp_start", {});
  try {
    await stat(providedCwd);
  } catch (error) {
    if (isFsInaccessible(error)) {
      cliError(`Error: Directory ${providedCwd} does not exist`);
    }
    throw error;
  }
  try {
    const {
      setup
    } = await import("../../setup.js");
    await setup(providedCwd, "default", false, false, void 0, false);
    const {
      startMCPServer
    } = await import("../../entrypoints/mcp.js");
    await startMCPServer(providedCwd, debug ?? false, verbose ?? false);
  } catch (error) {
    cliError(`Error: Failed to start MCP server: ${error}`);
  }
}
async function mcpRemoveHandler(name, options) {
  const serverBeforeRemoval = getMcpConfigByName(name);
  const cleanupSecureStorage = () => {
    if (serverBeforeRemoval && (serverBeforeRemoval.type === "sse" || serverBeforeRemoval.type === "http")) {
      clearServerTokensFromLocalStorage(name, serverBeforeRemoval);
      clearMcpClientConfig(name, serverBeforeRemoval);
    }
  };
  try {
    if (options.scope) {
      const scope = ensureConfigScope(options.scope);
      logEvent("tengu_mcp_delete", {
        name,
        scope
      });
      await removeMcpConfig(name, scope);
      cleanupSecureStorage();
      process.stdout.write(`Removed MCP server ${name} from ${scope} config
`);
      cliOk(`File modified: ${describeMcpConfigFilePath(scope)}`);
    }
    const projectConfig = getCurrentProjectConfig();
    const globalConfig = getGlobalConfig();
    const {
      servers: projectServers
    } = getMcpConfigsByScope("project");
    const mcpJsonExists = !!projectServers[name];
    const scopes = [];
    if (projectConfig.mcpServers?.[name]) scopes.push("local");
    if (mcpJsonExists) scopes.push("project");
    if (globalConfig.mcpServers?.[name]) scopes.push("user");
    if (scopes.length === 0) {
      cliError(`No MCP server found with name: "${name}"`);
    } else if (scopes.length === 1) {
      const scope = scopes[0];
      logEvent("tengu_mcp_delete", {
        name,
        scope
      });
      await removeMcpConfig(name, scope);
      cleanupSecureStorage();
      process.stdout.write(`Removed MCP server "${name}" from ${scope} config
`);
      cliOk(`File modified: ${describeMcpConfigFilePath(scope)}`);
    } else {
      process.stderr.write(`MCP server "${name}" exists in multiple scopes:
`);
      scopes.forEach((scope) => {
        process.stderr.write(`  - ${getScopeLabel(scope)} (${describeMcpConfigFilePath(scope)})
`);
      });
      process.stderr.write("\nTo remove from a specific scope, use:\n");
      scopes.forEach((scope) => {
        process.stderr.write(`  claude mcp remove "${name}" -s ${scope}
`);
      });
      cliError();
    }
  } catch (error) {
    cliError(error.message);
  }
}
async function mcpListHandler() {
  logEvent("tengu_mcp_list", {});
  const {
    servers: configs
  } = await getAllMcpConfigs();
  if (Object.keys(configs).length === 0) {
    console.log("No MCP servers configured. Use `claude mcp add` to add a server.");
  } else {
    console.log("Checking MCP server health...\n");
    const entries = Object.entries(configs);
    const results = await pMap(entries, async ([name, server]) => ({
      name,
      server,
      status: await checkMcpServerHealth(name, server)
    }), {
      concurrency: getMcpServerConnectionBatchSize()
    });
    for (const {
      name,
      server,
      status
    } of results) {
      if (server.type === "sse") {
        console.log(`${name}: ${server.url} (SSE) - ${status}`);
      } else if (server.type === "http") {
        console.log(`${name}: ${server.url} (HTTP) - ${status}`);
      } else if (server.type === "claudeai-proxy") {
        console.log(`${name}: ${server.url} - ${status}`);
      } else if (!server.type || server.type === "stdio") {
        const args = Array.isArray(server.args) ? server.args : [];
        console.log(`${name}: ${server.command} ${args.join(" ")} - ${status}`);
      }
    }
  }
  await gracefulShutdown(0);
}
async function mcpGetHandler(name) {
  logEvent("tengu_mcp_get", {
    name
  });
  const server = getMcpConfigByName(name);
  if (!server) {
    cliError(`No MCP server found with name: ${name}`);
  }
  console.log(`${name}:`);
  console.log(`  Scope: ${getScopeLabel(server.scope)}`);
  const status = await checkMcpServerHealth(name, server);
  console.log(`  Status: ${status}`);
  if (server.type === "sse") {
    console.log(`  Type: sse`);
    console.log(`  URL: ${server.url}`);
    if (server.headers) {
      console.log("  Headers:");
      for (const [key, value] of Object.entries(server.headers)) {
        console.log(`    ${key}: ${value}`);
      }
    }
    if (server.oauth?.clientId || server.oauth?.callbackPort) {
      const parts = [];
      if (server.oauth.clientId) {
        parts.push("client_id configured");
        const clientConfig = getMcpClientConfig(name, server);
        if (clientConfig?.clientSecret) parts.push("client_secret configured");
      }
      if (server.oauth.callbackPort) parts.push(`callback_port ${server.oauth.callbackPort}`);
      console.log(`  OAuth: ${parts.join(", ")}`);
    }
  } else if (server.type === "http") {
    console.log(`  Type: http`);
    console.log(`  URL: ${server.url}`);
    if (server.headers) {
      console.log("  Headers:");
      for (const [key, value] of Object.entries(server.headers)) {
        console.log(`    ${key}: ${value}`);
      }
    }
    if (server.oauth?.clientId || server.oauth?.callbackPort) {
      const parts = [];
      if (server.oauth.clientId) {
        parts.push("client_id configured");
        const clientConfig = getMcpClientConfig(name, server);
        if (clientConfig?.clientSecret) parts.push("client_secret configured");
      }
      if (server.oauth.callbackPort) parts.push(`callback_port ${server.oauth.callbackPort}`);
      console.log(`  OAuth: ${parts.join(", ")}`);
    }
  } else if (server.type === "stdio") {
    console.log(`  Type: stdio`);
    console.log(`  Command: ${server.command}`);
    const args = Array.isArray(server.args) ? server.args : [];
    console.log(`  Args: ${args.join(" ")}`);
    if (server.env) {
      console.log("  Environment:");
      for (const [key, value] of Object.entries(server.env)) {
        console.log(`    ${key}=${value}`);
      }
    }
  }
  console.log(`
To remove this server, run: claude mcp remove "${name}" -s ${server.scope}`);
  await gracefulShutdown(0);
}
async function mcpAddJsonHandler(name, json, options) {
  try {
    const scope = ensureConfigScope(options.scope);
    const parsedJson = safeParseJSON(json);
    const needsSecret = options.clientSecret && parsedJson && typeof parsedJson === "object" && "type" in parsedJson && (parsedJson.type === "sse" || parsedJson.type === "http") && "url" in parsedJson && typeof parsedJson.url === "string" && "oauth" in parsedJson && parsedJson.oauth && typeof parsedJson.oauth === "object" && "clientId" in parsedJson.oauth;
    const clientSecret = needsSecret ? await readClientSecret() : void 0;
    await addMcpConfig(name, parsedJson, scope);
    const transportType = parsedJson && typeof parsedJson === "object" && "type" in parsedJson ? String(parsedJson.type || "stdio") : "stdio";
    if (clientSecret && parsedJson && typeof parsedJson === "object" && "type" in parsedJson && (parsedJson.type === "sse" || parsedJson.type === "http") && "url" in parsedJson && typeof parsedJson.url === "string") {
      saveMcpClientSecret(name, {
        type: parsedJson.type,
        url: parsedJson.url
      }, clientSecret);
    }
    logEvent("tengu_mcp_add", {
      scope,
      source: "json",
      type: transportType
    });
    cliOk(`Added ${transportType} MCP server ${name} to ${scope} config`);
  } catch (error) {
    cliError(error.message);
  }
}
async function mcpAddFromDesktopHandler(options) {
  try {
    const scope = ensureConfigScope(options.scope);
    const platform = getPlatform();
    logEvent("tengu_mcp_add", {
      scope,
      platform,
      source: "desktop"
    });
    const {
      readClaudeDesktopMcpServers
    } = await import("../../utils/claudeDesktop.js");
    const servers = await readClaudeDesktopMcpServers();
    if (Object.keys(servers).length === 0) {
      cliOk("No MCP servers found in Claude Desktop configuration or configuration file does not exist.");
    }
    const {
      unmount
    } = await render(/* @__PURE__ */ jsx(AppStateProvider, { children: /* @__PURE__ */ jsx(KeybindingSetup, { children: /* @__PURE__ */ jsx(MCPServerDesktopImportDialog, { servers, scope, onDone: () => {
      unmount();
    } }) }) }), {
      exitOnCtrlC: true
    });
  } catch (error) {
    cliError(error.message);
  }
}
async function mcpResetChoicesHandler() {
  logEvent("tengu_mcp_reset_mcpjson_choices", {});
  saveCurrentProjectConfig((current) => ({
    ...current,
    enabledMcpjsonServers: [],
    disabledMcpjsonServers: [],
    enableAllProjectMcpServers: false
  }));
  cliOk("All project-scoped (.mcp.json) server approvals and rejections have been reset.\nYou will be prompted for approval next time you start Claude Code.");
}
export {
  mcpAddFromDesktopHandler,
  mcpAddJsonHandler,
  mcpGetHandler,
  mcpListHandler,
  mcpRemoveHandler,
  mcpResetChoicesHandler,
  mcpServeHandler
};
