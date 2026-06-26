import reject from "lodash-es/reject.js";
import { z } from "zod/v4";
import { performMCPOAuthFlow } from "../../services/mcp/auth.js";
import {
  clearMcpAuthCache,
  reconnectMcpServerImpl
} from "../../services/mcp/client.js";
import {
  buildMcpToolName,
  getMcpPrefix
} from "../../services/mcp/mcpStringUtils.js";
import { errorMessage } from "../../utils/errors.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { logMCPDebug, logMCPError } from "../../utils/log.js";
const inputSchema = lazySchema(() => z.object({}));
function getConfigUrl(config) {
  if ("url" in config) return config.url;
  return void 0;
}
function createMcpAuthTool(serverName, config) {
  const url = getConfigUrl(config);
  const transport = config.type ?? "stdio";
  const location = url ? `${transport} at ${url}` : transport;
  const description = `The \`${serverName}\` MCP server (${location}) is installed but requires authentication. Call this tool to start the OAuth flow \u2014 you'll receive an authorization URL to share with the user. Once the user completes authorization in their browser, the server's real tools will become available automatically.`;
  return {
    name: buildMcpToolName(serverName, "authenticate"),
    isMcp: true,
    mcpInfo: { serverName, toolName: "authenticate" },
    isEnabled: () => true,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    toAutoClassifierInput: () => serverName,
    userFacingName: () => `${serverName} - authenticate (MCP)`,
    maxResultSizeChars: 1e4,
    renderToolUseMessage: () => `Authenticate ${serverName} MCP server`,
    async description() {
      return description;
    },
    async prompt() {
      return description;
    },
    get inputSchema() {
      return inputSchema();
    },
    async checkPermissions(input) {
      return { behavior: "allow", updatedInput: input };
    },
    async call(_input, context) {
      if (config.type === "claudeai-proxy") {
        return {
          data: {
            status: "unsupported",
            message: `This is a claude.ai MCP connector. Ask the user to run /mcp and select "${serverName}" to authenticate.`
          }
        };
      }
      if (config.type !== "sse" && config.type !== "http") {
        return {
          data: {
            status: "unsupported",
            message: `Server "${serverName}" uses ${transport} transport which does not support OAuth from this tool. Ask the user to run /mcp and authenticate manually.`
          }
        };
      }
      const sseOrHttpConfig = config;
      let resolveAuthUrl;
      const authUrlPromise = new Promise((resolve) => {
        resolveAuthUrl = resolve;
      });
      const controller = new AbortController();
      const { setAppState } = context;
      const oauthPromise = performMCPOAuthFlow(
        serverName,
        sseOrHttpConfig,
        (u) => resolveAuthUrl?.(u),
        controller.signal,
        { skipBrowserOpen: true }
      );
      void oauthPromise.then(async () => {
        clearMcpAuthCache();
        const result = await reconnectMcpServerImpl(serverName, config);
        const prefix = getMcpPrefix(serverName);
        setAppState((prev) => ({
          ...prev,
          mcp: {
            ...prev.mcp,
            clients: prev.mcp.clients.map(
              (c) => c.name === serverName ? result.client : c
            ),
            tools: [
              ...reject(prev.mcp.tools, (t) => t.name?.startsWith(prefix)),
              ...result.tools
            ],
            commands: [
              ...reject(prev.mcp.commands, (c) => c.name?.startsWith(prefix)),
              ...result.commands
            ],
            resources: result.resources ? { ...prev.mcp.resources, [serverName]: result.resources } : prev.mcp.resources
          }
        }));
        logMCPDebug(
          serverName,
          `OAuth complete, reconnected with ${result.tools.length} tool(s)`
        );
      }).catch((err) => {
        logMCPError(
          serverName,
          `OAuth flow failed after tool-triggered start: ${errorMessage(err)}`
        );
      });
      try {
        const authUrl = await Promise.race([
          authUrlPromise,
          oauthPromise.then(() => null)
        ]);
        if (authUrl) {
          return {
            data: {
              status: "auth_url",
              authUrl,
              message: `Ask the user to open this URL in their browser to authorize the ${serverName} MCP server:

${authUrl}

Once they complete the flow, the server's tools will become available automatically.`
            }
          };
        }
        return {
          data: {
            status: "auth_url",
            message: `Authentication completed silently for ${serverName}. The server's tools should now be available.`
          }
        };
      } catch (err) {
        return {
          data: {
            status: "error",
            message: `Failed to start OAuth flow for ${serverName}: ${errorMessage(err)}. Ask the user to run /mcp and authenticate manually.`
          }
        };
      }
    },
    mapToolResultToToolResultBlockParam(data, toolUseID) {
      return {
        tool_use_id: toolUseID,
        type: "tool_result",
        content: data.message
      };
    }
  };
}
export {
  createMcpAuthTool
};
