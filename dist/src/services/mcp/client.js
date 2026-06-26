const feature = (_name) => false;
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  SSEClientTransport
} from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  StreamableHTTPClientTransport
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  createFetchWithInit
} from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolResultSchema,
  ElicitRequestSchema,
  ErrorCode,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ListRootsRequestSchema,
  ListToolsResultSchema,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import mapValues from "lodash-es/mapValues.js";
import memoize from "lodash-es/memoize.js";
import zipObject from "lodash-es/zipObject.js";
import pMap from "p-map";
import { getOriginalCwd, getSessionId } from "../../bootstrap/state.js";
import { getOauthConfig } from "../../constants/oauth.js";
import { PRODUCT_URL } from "../../constants/product.js";
import {
  toolMatchesName
} from "../../Tool.js";
import { ListMcpResourcesTool } from "../../tools/ListMcpResourcesTool/ListMcpResourcesTool.js";
import { MCPTool } from "../../tools/MCPTool/MCPTool.js";
import { createMcpAuthTool } from "../../tools/McpAuthTool/McpAuthTool.js";
import { ReadMcpResourceTool } from "../../tools/ReadMcpResourceTool/ReadMcpResourceTool.js";
import { createAbortController } from "../../utils/abortController.js";
import { count } from "../../utils/array.js";
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  handleOAuth401Error
} from "../../utils/auth.js";
import { registerCleanup } from "../../utils/cleanupRegistry.js";
import { detectCodeIndexingFromMcpServerName } from "../../utils/codeIndexing.js";
import { logForDebugging } from "../../utils/debug.js";
import { isEnvDefinedFalsy, isEnvTruthy } from "../../utils/envUtils.js";
import {
  errorMessage,
  TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
} from "../../utils/errors.js";
import { getMCPUserAgent } from "../../utils/http.js";
import { maybeNotifyIDEConnected } from "../../utils/ide.js";
import { maybeResizeAndDownsampleImageBuffer } from "../../utils/imageResizer.js";
import { logMCPDebug, logMCPError } from "../../utils/log.js";
import {
  getBinaryBlobSavedMessage,
  getFormatDescription,
  getLargeOutputInstructions,
  persistBinaryContent
} from "../../utils/mcpOutputStorage.js";
import {
  getContentSizeEstimate,
  mcpContentNeedsTruncation,
  truncateMcpContentIfNeeded
} from "../../utils/mcpValidation.js";
import { WebSocketTransport } from "../../utils/mcpWebSocketTransport.js";
import { memoizeWithLRU } from "../../utils/memoize.js";
import { getWebSocketTLSOptions } from "../../utils/mtls.js";
import {
  getProxyFetchOptions,
  getWebSocketProxyAgent,
  getWebSocketProxyUrl
} from "../../utils/proxy.js";
import { recursivelySanitizeUnicode } from "../../utils/sanitization.js";
import { getSessionIngressAuthToken } from "../../utils/sessionIngressAuth.js";
import { subprocessEnv } from "../../utils/subprocessEnv.js";
import {
  isPersistError,
  persistToolResult
} from "../../utils/toolResultStorage.js";
import {
  logEvent
} from "../analytics/index.js";
import {
  runElicitationHooks,
  runElicitationResultHooks
} from "./elicitationHandler.js";
import { buildMcpToolName } from "./mcpStringUtils.js";
import { normalizeNameForMCP } from "./normalization.js";
import { getLoggingSafeMcpBaseUrl } from "./utils.js";
const fetchMcpSkillsForClient = false ? null.fetchMcpSkillsForClient : null;
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { classifyMcpToolForCollapse } from "../../tools/MCPTool/classifyForCollapse.js";
import { clearKeychainCache } from "../../utils/secureStorage/macOsKeychainHelpers.js";
import { sleep } from "../../utils/sleep.js";
import {
  ClaudeAuthProvider,
  hasMcpDiscoveryButNoToken,
  wrapFetchWithStepUpDetection
} from "./auth.js";
import { markClaudeAiMcpConnected } from "./claudeai.js";
import { getAllMcpConfigs, isMcpServerDisabled } from "./config.js";
import { getMcpServerHeaders } from "./headersHelper.js";
import { SdkControlClientTransport } from "./SdkControlTransport.js";
class McpAuthError extends Error {
  serverName;
  constructor(serverName, message) {
    super(message);
    this.name = "McpAuthError";
    this.serverName = serverName;
  }
}
class McpSessionExpiredError extends Error {
  constructor(serverName) {
    super(`MCP server "${serverName}" session expired`);
    this.name = "McpSessionExpiredError";
  }
}
class McpToolCallError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS extends TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  constructor(message, telemetryMessage, mcpMeta) {
    super(message, telemetryMessage);
    this.mcpMeta = mcpMeta;
    this.name = "McpToolCallError";
  }
  mcpMeta;
}
function isMcpSessionExpiredError(error) {
  const httpStatus = "code" in error ? error.code : void 0;
  if (httpStatus !== 404) {
    return false;
  }
  return error.message.includes('"code":-32001') || error.message.includes('"code": -32001');
}
const DEFAULT_MCP_TOOL_TIMEOUT_MS = 1e8;
const MAX_MCP_DESCRIPTION_LENGTH = 2048;
function getMcpToolTimeoutMs() {
  return parseInt(process.env.MCP_TOOL_TIMEOUT || "", 10) || DEFAULT_MCP_TOOL_TIMEOUT_MS;
}
import { isClaudeInChromeMCPServer } from "../../utils/claudeInChrome/common.js";
const claudeInChromeToolRendering = () => require("../../utils/claudeInChrome/toolRendering.js");
const computerUseWrapper = false ? () => null : void 0;
const isComputerUseMCPServer = false ? null.isComputerUseMCPServer : void 0;
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { getClaudeConfigHomeDir } from "../../utils/envUtils.js";
import { jsonParse, jsonStringify } from "../../utils/slowOperations.js";
const MCP_AUTH_CACHE_TTL_MS = 15 * 60 * 1e3;
function getMcpAuthCachePath() {
  return join(getClaudeConfigHomeDir(), "mcp-needs-auth-cache.json");
}
let authCachePromise = null;
function getMcpAuthCache() {
  if (!authCachePromise) {
    authCachePromise = readFile(getMcpAuthCachePath(), "utf-8").then((data) => jsonParse(data)).catch(() => ({}));
  }
  return authCachePromise;
}
async function isMcpAuthCached(serverId) {
  const cache = await getMcpAuthCache();
  const entry = cache[serverId];
  if (!entry) {
    return false;
  }
  return Date.now() - entry.timestamp < MCP_AUTH_CACHE_TTL_MS;
}
let writeChain = Promise.resolve();
function setMcpAuthCacheEntry(serverId) {
  writeChain = writeChain.then(async () => {
    const cache = await getMcpAuthCache();
    cache[serverId] = { timestamp: Date.now() };
    const cachePath = getMcpAuthCachePath();
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, jsonStringify(cache));
    authCachePromise = null;
  }).catch(() => {
  });
}
function clearMcpAuthCache() {
  authCachePromise = null;
  void unlink(getMcpAuthCachePath()).catch(() => {
  });
}
function mcpBaseUrlAnalytics(serverRef) {
  const url = getLoggingSafeMcpBaseUrl(serverRef);
  return url ? {
    mcpServerBaseUrl: url
  } : {};
}
function handleRemoteAuthFailure(name, serverRef, transportType) {
  logEvent("tengu_mcp_server_needs_auth", {
    transportType,
    ...mcpBaseUrlAnalytics(serverRef)
  });
  const label = {
    sse: "SSE",
    http: "HTTP",
    "claudeai-proxy": "claude.ai proxy"
  };
  logMCPDebug(
    name,
    `Authentication required for ${label[transportType]} server`
  );
  setMcpAuthCacheEntry(name);
  return { name, type: "needs-auth", config: serverRef };
}
function createClaudeAiProxyFetch(innerFetch) {
  return async (url, init) => {
    const doRequest = async () => {
      await checkAndRefreshOAuthTokenIfNeeded();
      const currentTokens = getClaudeAIOAuthTokens();
      if (!currentTokens) {
        throw new Error("No claude.ai OAuth token available");
      }
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${currentTokens.accessToken}`);
      const response2 = await innerFetch(url, { ...init, headers });
      return { response: response2, sentToken: currentTokens.accessToken };
    };
    const { response, sentToken } = await doRequest();
    if (response.status !== 401) {
      return response;
    }
    const tokenChanged = await handleOAuth401Error(sentToken).catch(() => false);
    logEvent("tengu_mcp_claudeai_proxy_401", {
      tokenChanged
    });
    if (!tokenChanged) {
      const now = getClaudeAIOAuthTokens()?.accessToken;
      if (!now || now === sentToken) {
        return response;
      }
    }
    try {
      return (await doRequest()).response;
    } catch {
      return response;
    }
  };
}
async function createNodeWsClient(url, options) {
  const wsModule = await import("ws");
  const WS = wsModule.default;
  return new WS(url, ["mcp"], options);
}
const IMAGE_MIME_TYPES = /* @__PURE__ */ new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp"
]);
function getConnectionTimeoutMs() {
  return parseInt(process.env.MCP_TIMEOUT || "", 10) || 3e4;
}
const MCP_REQUEST_TIMEOUT_MS = 6e4;
const MCP_STREAMABLE_HTTP_ACCEPT = "application/json, text/event-stream";
function wrapFetchWithTimeout(baseFetch) {
  return async (url, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") {
      return baseFetch(url, init);
    }
    const headers = new Headers(init?.headers);
    if (!headers.has("accept")) {
      headers.set("accept", MCP_STREAMABLE_HTTP_ACCEPT);
    }
    const controller = new AbortController();
    const timer = setTimeout(
      (c) => c.abort(new DOMException("The operation timed out.", "TimeoutError")),
      MCP_REQUEST_TIMEOUT_MS,
      controller
    );
    timer.unref?.();
    const parentSignal = init?.signal;
    const abort = () => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener("abort", abort);
    if (parentSignal?.aborted) {
      controller.abort(parentSignal.reason);
    }
    const cleanup = () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abort);
    };
    try {
      const response = await baseFetch(url, {
        ...init,
        headers,
        signal: controller.signal
      });
      cleanup();
      return response;
    } catch (error) {
      cleanup();
      throw error;
    }
  };
}
function getMcpServerConnectionBatchSize() {
  return parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE || "", 10) || 3;
}
function getRemoteMcpServerConnectionBatchSize() {
  return parseInt(process.env.MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE || "", 10) || 20;
}
function isLocalMcpServer(config) {
  return !config.type || config.type === "stdio" || config.type === "sdk";
}
const ALLOWED_IDE_TOOLS = ["mcp__ide__executeCode", "mcp__ide__getDiagnostics"];
function isIncludedMcpTool(tool) {
  return !tool.name.startsWith("mcp__ide__") || ALLOWED_IDE_TOOLS.includes(tool.name);
}
function getServerCacheKey(name, serverRef) {
  return `${name}-${jsonStringify(serverRef)}`;
}
const connectToServer = memoize(
  async (name, serverRef, serverStats) => {
    const connectStartTime = Date.now();
    let inProcessServer;
    try {
      let transport;
      const sessionIngressToken = getSessionIngressAuthToken();
      if (serverRef.type === "sse") {
        const authProvider = new ClaudeAuthProvider(name, serverRef);
        const combinedHeaders = await getMcpServerHeaders(name, serverRef);
        const transportOptions = {
          authProvider,
          // Use fresh timeout per request to avoid stale AbortSignal bug.
          // Step-up detection wraps innermost so the 403 is seen before the
          // SDK's handler calls auth() → tokens().
          fetch: wrapFetchWithTimeout(
            wrapFetchWithStepUpDetection(createFetchWithInit(), authProvider)
          ),
          requestInit: {
            headers: {
              "User-Agent": getMCPUserAgent(),
              ...combinedHeaders
            }
          }
        };
        transportOptions.eventSourceInit = {
          fetch: async (url, init) => {
            const authHeaders = {};
            const tokens = await authProvider.tokens();
            if (tokens) {
              authHeaders.Authorization = `Bearer ${tokens.access_token}`;
            }
            const proxyOptions = getProxyFetchOptions();
            return fetch(url, {
              ...init,
              ...proxyOptions,
              headers: {
                "User-Agent": getMCPUserAgent(),
                ...authHeaders,
                ...init?.headers,
                ...combinedHeaders,
                Accept: "text/event-stream"
              }
            });
          }
        };
        transport = new SSEClientTransport(
          new URL(serverRef.url),
          transportOptions
        );
        logMCPDebug(name, `SSE transport initialized, awaiting connection`);
      } else if (serverRef.type === "sse-ide") {
        logMCPDebug(name, `Setting up SSE-IDE transport to ${serverRef.url}`);
        const proxyOptions = getProxyFetchOptions();
        const transportOptions = proxyOptions.dispatcher ? {
          eventSourceInit: {
            fetch: async (url, init) => {
              return fetch(url, {
                ...init,
                ...proxyOptions,
                headers: {
                  "User-Agent": getMCPUserAgent(),
                  ...init?.headers
                }
              });
            }
          }
        } : {};
        transport = new SSEClientTransport(
          new URL(serverRef.url),
          Object.keys(transportOptions).length > 0 ? transportOptions : void 0
        );
      } else if (serverRef.type === "ws-ide") {
        const tlsOptions = getWebSocketTLSOptions();
        const wsHeaders = {
          "User-Agent": getMCPUserAgent(),
          ...serverRef.authToken && {
            "X-Claude-Code-Ide-Authorization": serverRef.authToken
          }
        };
        let wsClient;
        if (typeof Bun !== "undefined") {
          wsClient = new globalThis.WebSocket(serverRef.url, {
            protocols: ["mcp"],
            headers: wsHeaders,
            proxy: getWebSocketProxyUrl(serverRef.url),
            tls: tlsOptions || void 0
          });
        } else {
          wsClient = await createNodeWsClient(serverRef.url, {
            headers: wsHeaders,
            agent: getWebSocketProxyAgent(serverRef.url),
            ...tlsOptions || {}
          });
        }
        transport = new WebSocketTransport(wsClient);
      } else if (serverRef.type === "ws") {
        logMCPDebug(
          name,
          `Initializing WebSocket transport to ${serverRef.url}`
        );
        const combinedHeaders = await getMcpServerHeaders(name, serverRef);
        const tlsOptions = getWebSocketTLSOptions();
        const wsHeaders = {
          "User-Agent": getMCPUserAgent(),
          ...sessionIngressToken && {
            Authorization: `Bearer ${sessionIngressToken}`
          },
          ...combinedHeaders
        };
        const wsHeadersForLogging = mapValues(
          wsHeaders,
          (value, key) => key.toLowerCase() === "authorization" ? "[REDACTED]" : value
        );
        logMCPDebug(
          name,
          `WebSocket transport options: ${jsonStringify({
            url: serverRef.url,
            headers: wsHeadersForLogging,
            hasSessionAuth: !!sessionIngressToken
          })}`
        );
        let wsClient;
        if (typeof Bun !== "undefined") {
          wsClient = new globalThis.WebSocket(serverRef.url, {
            protocols: ["mcp"],
            headers: wsHeaders,
            proxy: getWebSocketProxyUrl(serverRef.url),
            tls: tlsOptions || void 0
          });
        } else {
          wsClient = await createNodeWsClient(serverRef.url, {
            headers: wsHeaders,
            agent: getWebSocketProxyAgent(serverRef.url),
            ...tlsOptions || {}
          });
        }
        transport = new WebSocketTransport(wsClient);
      } else if (serverRef.type === "http") {
        logMCPDebug(name, `Initializing HTTP transport to ${serverRef.url}`);
        logMCPDebug(
          name,
          `Node version: ${process.version}, Platform: ${process.platform}`
        );
        logMCPDebug(
          name,
          `Environment: ${jsonStringify({
            NODE_OPTIONS: process.env.NODE_OPTIONS || "not set",
            UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || "default",
            HTTP_PROXY: process.env.HTTP_PROXY || "not set",
            HTTPS_PROXY: process.env.HTTPS_PROXY || "not set",
            NO_PROXY: process.env.NO_PROXY || "not set"
          })}`
        );
        const authProvider = new ClaudeAuthProvider(name, serverRef);
        const combinedHeaders = await getMcpServerHeaders(name, serverRef);
        const hasOAuthTokens = !!await authProvider.tokens();
        const proxyOptions = getProxyFetchOptions();
        logMCPDebug(
          name,
          `Proxy options: ${proxyOptions.dispatcher ? "custom dispatcher" : "default"}`
        );
        const transportOptions = {
          authProvider,
          // Use fresh timeout per request to avoid stale AbortSignal bug.
          // Step-up detection wraps innermost so the 403 is seen before the
          // SDK's handler calls auth() → tokens().
          fetch: wrapFetchWithTimeout(
            wrapFetchWithStepUpDetection(createFetchWithInit(), authProvider)
          ),
          requestInit: {
            ...proxyOptions,
            headers: {
              "User-Agent": getMCPUserAgent(),
              ...sessionIngressToken && !hasOAuthTokens && {
                Authorization: `Bearer ${sessionIngressToken}`
              },
              ...combinedHeaders
            }
          }
        };
        const headersForLogging = transportOptions.requestInit?.headers ? mapValues(
          transportOptions.requestInit.headers,
          (value, key) => key.toLowerCase() === "authorization" ? "[REDACTED]" : value
        ) : void 0;
        logMCPDebug(
          name,
          `HTTP transport options: ${jsonStringify({
            url: serverRef.url,
            headers: headersForLogging,
            hasAuthProvider: !!authProvider,
            timeoutMs: MCP_REQUEST_TIMEOUT_MS
          })}`
        );
        transport = new StreamableHTTPClientTransport(
          new URL(serverRef.url),
          transportOptions
        );
        logMCPDebug(name, `HTTP transport created successfully`);
      } else if (serverRef.type === "sdk") {
        throw new Error("SDK servers should be handled in print.ts");
      } else if (serverRef.type === "claudeai-proxy") {
        logMCPDebug(
          name,
          `Initializing claude.ai proxy transport for server ${serverRef.id}`
        );
        const tokens = getClaudeAIOAuthTokens();
        if (!tokens) {
          throw new Error("No claude.ai OAuth token found");
        }
        const oauthConfig = getOauthConfig();
        const proxyUrl = `${oauthConfig.MCP_PROXY_URL}${oauthConfig.MCP_PROXY_PATH.replace("{server_id}", serverRef.id)}`;
        logMCPDebug(name, `Using claude.ai proxy at ${proxyUrl}`);
        const fetchWithAuth = createClaudeAiProxyFetch(globalThis.fetch);
        const proxyOptions = getProxyFetchOptions();
        const transportOptions = {
          // Wrap fetchWithAuth with fresh timeout per request
          fetch: wrapFetchWithTimeout(fetchWithAuth),
          requestInit: {
            ...proxyOptions,
            headers: {
              "User-Agent": getMCPUserAgent(),
              "X-Mcp-Client-Session-Id": getSessionId()
            }
          }
        };
        transport = new StreamableHTTPClientTransport(
          new URL(proxyUrl),
          transportOptions
        );
        logMCPDebug(name, `claude.ai proxy transport created successfully`);
      } else if ((serverRef.type === "stdio" || !serverRef.type) && isClaudeInChromeMCPServer(name)) {
        const { createChromeContext } = await import("../../utils/claudeInChrome/mcpServer.js");
        const { createClaudeForChromeMcpServer } = await import("@ant/claude-for-chrome-mcp");
        const { createLinkedTransportPair } = await import("./InProcessTransport.js");
        const context = createChromeContext(serverRef.env);
        inProcessServer = createClaudeForChromeMcpServer(context);
        const [clientTransport, serverTransport] = createLinkedTransportPair();
        await inProcessServer.connect(serverTransport);
        transport = clientTransport;
        logMCPDebug(name, `In-process Chrome MCP server started`);
      } else if (false) {
        const { createComputerUseMcpServerForCli } = await null;
        const { createLinkedTransportPair } = await null;
        inProcessServer = await createComputerUseMcpServerForCli();
        const [clientTransport, serverTransport] = createLinkedTransportPair();
        await inProcessServer.connect(serverTransport);
        transport = clientTransport;
        logMCPDebug(name, `In-process Computer Use MCP server started`);
      } else if (serverRef.type === "stdio" || !serverRef.type) {
        const finalCommand = process.env.CLAUDE_CODE_SHELL_PREFIX || serverRef.command;
        const finalArgs = process.env.CLAUDE_CODE_SHELL_PREFIX ? [[serverRef.command, ...serverRef.args].join(" ")] : serverRef.args;
        transport = new StdioClientTransport({
          command: finalCommand,
          args: finalArgs,
          env: {
            ...subprocessEnv(),
            ...serverRef.env
          },
          stderr: "pipe"
          // prevents error output from the MCP server from printing to the UI
        });
      } else {
        throw new Error(`Unsupported server type: ${serverRef.type}`);
      }
      let stderrHandler;
      let stderrOutput = "";
      if (serverRef.type === "stdio" || !serverRef.type) {
        const stdioTransport = transport;
        if (stdioTransport.stderr) {
          stderrHandler = (data) => {
            if (stderrOutput.length < 64 * 1024 * 1024) {
              try {
                stderrOutput += data.toString();
              } catch {
              }
            }
          };
          stdioTransport.stderr.on("data", stderrHandler);
        }
      }
      const client = new Client(
        {
          name: "claude-code",
          title: "Claude Code",
          version: "0.0.0-dev",
          description: "Anthropic's agentic coding tool",
          websiteUrl: PRODUCT_URL
        },
        {
          capabilities: {
            roots: {},
            // Empty object declares the capability. Sending {form:{},url:{}}
            // breaks Java MCP SDK servers (Spring AI) whose Elicitation class
            // has zero fields and fails on unknown properties.
            elicitation: {}
          }
        }
      );
      if (serverRef.type === "http") {
        logMCPDebug(name, `Client created, setting up request handler`);
      }
      client.setRequestHandler(ListRootsRequestSchema, async () => {
        logMCPDebug(name, `Received ListRoots request from server`);
        return {
          roots: [
            {
              uri: `file://${getOriginalCwd()}`
            }
          ]
        };
      });
      logMCPDebug(
        name,
        `Starting connection with timeout of ${getConnectionTimeoutMs()}ms`
      );
      if (serverRef.type === "http") {
        logMCPDebug(name, `Testing basic HTTP connectivity to ${serverRef.url}`);
        try {
          const testUrl = new URL(serverRef.url);
          logMCPDebug(
            name,
            `Parsed URL: host=${testUrl.hostname}, port=${testUrl.port || "default"}, protocol=${testUrl.protocol}`
          );
          if (testUrl.hostname === "127.0.0.1" || testUrl.hostname === "localhost") {
            logMCPDebug(name, `Using loopback address: ${testUrl.hostname}`);
          }
        } catch (urlError) {
          logMCPDebug(name, `Failed to parse URL: ${urlError}`);
        }
      }
      const connectPromise = client.connect(transport);
      const timeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
          const elapsed = Date.now() - connectStartTime;
          logMCPDebug(
            name,
            `Connection timeout triggered after ${elapsed}ms (limit: ${getConnectionTimeoutMs()}ms)`
          );
          if (inProcessServer) {
            inProcessServer.close().catch(() => {
            });
          }
          transport.close().catch(() => {
          });
          reject(
            new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
              `MCP server "${name}" connection timed out after ${getConnectionTimeoutMs()}ms`,
              "MCP connection timeout"
            )
          );
        }, getConnectionTimeoutMs());
        connectPromise.then(
          () => {
            clearTimeout(timeoutId);
          },
          (_error) => {
            clearTimeout(timeoutId);
          }
        );
      });
      try {
        await Promise.race([connectPromise, timeoutPromise]);
        if (stderrOutput) {
          logMCPError(name, `Server stderr: ${stderrOutput}`);
          stderrOutput = "";
        }
        const elapsed = Date.now() - connectStartTime;
        logMCPDebug(
          name,
          `Successfully connected (transport: ${serverRef.type || "stdio"}) in ${elapsed}ms`
        );
      } catch (error) {
        const elapsed = Date.now() - connectStartTime;
        if (serverRef.type === "sse" && error instanceof Error) {
          logMCPDebug(
            name,
            `SSE Connection failed after ${elapsed}ms: ${jsonStringify({
              url: serverRef.url,
              error: error.message,
              errorType: error.constructor.name,
              stack: error.stack
            })}`
          );
          logMCPError(name, error);
          if (error instanceof UnauthorizedError) {
            return handleRemoteAuthFailure(name, serverRef, "sse");
          }
        } else if (serverRef.type === "http" && error instanceof Error) {
          const errorObj = error;
          logMCPDebug(
            name,
            `HTTP Connection failed after ${elapsed}ms: ${error.message} (code: ${errorObj.code || "none"}, errno: ${errorObj.errno || "none"})`
          );
          logMCPError(name, error);
          if (error instanceof UnauthorizedError) {
            return handleRemoteAuthFailure(name, serverRef, "http");
          }
        } else if (serverRef.type === "claudeai-proxy" && error instanceof Error) {
          logMCPDebug(
            name,
            `claude.ai proxy connection failed after ${elapsed}ms: ${error.message}`
          );
          logMCPError(name, error);
          const errorCode = error.code;
          if (errorCode === 401) {
            return handleRemoteAuthFailure(name, serverRef, "claudeai-proxy");
          }
        } else if (serverRef.type === "sse-ide" || serverRef.type === "ws-ide") {
          logEvent("tengu_mcp_ide_server_connection_failed", {
            connectionDurationMs: elapsed
          });
        }
        if (inProcessServer) {
          inProcessServer.close().catch(() => {
          });
        }
        transport.close().catch(() => {
        });
        if (stderrOutput) {
          logMCPError(name, `Server stderr: ${stderrOutput}`);
        }
        throw error;
      }
      const capabilities = client.getServerCapabilities();
      const serverVersion = client.getServerVersion();
      const rawInstructions = client.getInstructions();
      let instructions = rawInstructions;
      if (rawInstructions && rawInstructions.length > MAX_MCP_DESCRIPTION_LENGTH) {
        instructions = rawInstructions.slice(0, MAX_MCP_DESCRIPTION_LENGTH) + "\u2026 [truncated]";
        logMCPDebug(
          name,
          `Server instructions truncated from ${rawInstructions.length} to ${MAX_MCP_DESCRIPTION_LENGTH} chars`
        );
      }
      logMCPDebug(
        name,
        `Connection established with capabilities: ${jsonStringify({
          hasTools: !!capabilities?.tools,
          hasPrompts: !!capabilities?.prompts,
          hasResources: !!capabilities?.resources,
          hasResourceSubscribe: !!capabilities?.resources?.subscribe,
          serverVersion: serverVersion || "unknown"
        })}`
      );
      logForDebugging(
        `[MCP] Server "${name}" connected with subscribe=${!!capabilities?.resources?.subscribe}`
      );
      client.setRequestHandler(ElicitRequestSchema, async (request) => {
        logMCPDebug(
          name,
          `Elicitation request received during initialization: ${jsonStringify(request)}`
        );
        return { action: "cancel" };
      });
      if (serverRef.type === "sse-ide" || serverRef.type === "ws-ide") {
        const ideConnectionDurationMs = Date.now() - connectStartTime;
        logEvent("tengu_mcp_ide_server_connection_succeeded", {
          connectionDurationMs: ideConnectionDurationMs,
          serverVersion
        });
        try {
          void maybeNotifyIDEConnected(client);
        } catch (error) {
          logMCPError(
            name,
            `Failed to send ide_connected notification: ${error}`
          );
        }
      }
      const connectionStartTime = Date.now();
      let hasErrorOccurred = false;
      const originalOnerror = client.onerror;
      const originalOnclose = client.onclose;
      let consecutiveConnectionErrors = 0;
      const MAX_ERRORS_BEFORE_RECONNECT = 3;
      let hasTriggeredClose = false;
      const closeTransportAndRejectPending = (reason) => {
        if (hasTriggeredClose) return;
        hasTriggeredClose = true;
        logMCPDebug(name, `Closing transport (${reason})`);
        void client.close().catch((e) => {
          logMCPDebug(name, `Error during close: ${errorMessage(e)}`);
        });
      };
      const isTerminalConnectionError = (msg) => {
        return msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("EPIPE") || msg.includes("EHOSTUNREACH") || msg.includes("ECONNREFUSED") || msg.includes("Body Timeout Error") || msg.includes("terminated") || // SDK SSE reconnection intermediate errors — may be wrapped around the
        // actual network error, so the substrings above won't match
        msg.includes("SSE stream disconnected") || msg.includes("Failed to reconnect SSE stream");
      };
      client.onerror = (error) => {
        const uptime = Date.now() - connectionStartTime;
        hasErrorOccurred = true;
        const transportType = serverRef.type || "stdio";
        logMCPDebug(
          name,
          `${transportType.toUpperCase()} connection dropped after ${Math.floor(uptime / 1e3)}s uptime`
        );
        if (error.message) {
          if (error.message.includes("ECONNRESET")) {
            logMCPDebug(
              name,
              `Connection reset - server may have crashed or restarted`
            );
          } else if (error.message.includes("ETIMEDOUT")) {
            logMCPDebug(
              name,
              `Connection timeout - network issue or server unresponsive`
            );
          } else if (error.message.includes("ECONNREFUSED")) {
            logMCPDebug(name, `Connection refused - server may be down`);
          } else if (error.message.includes("EPIPE")) {
            logMCPDebug(
              name,
              `Broken pipe - server closed connection unexpectedly`
            );
          } else if (error.message.includes("EHOSTUNREACH")) {
            logMCPDebug(name, `Host unreachable - network connectivity issue`);
          } else if (error.message.includes("ESRCH")) {
            logMCPDebug(
              name,
              `Process not found - stdio server process terminated`
            );
          } else if (error.message.includes("spawn")) {
            logMCPDebug(
              name,
              `Failed to spawn process - check command and permissions`
            );
          } else {
            logMCPDebug(name, `Connection error: ${error.message}`);
          }
        }
        if ((transportType === "http" || transportType === "claudeai-proxy") && isMcpSessionExpiredError(error)) {
          logMCPDebug(
            name,
            `MCP session expired (server returned 404 with session-not-found), triggering reconnection`
          );
          closeTransportAndRejectPending("session expired");
          if (originalOnerror) {
            originalOnerror(error);
          }
          return;
        }
        if (transportType === "sse" || transportType === "http" || transportType === "claudeai-proxy") {
          if (error.message.includes("Maximum reconnection attempts")) {
            closeTransportAndRejectPending("SSE reconnection exhausted");
            if (originalOnerror) {
              originalOnerror(error);
            }
            return;
          }
          if (isTerminalConnectionError(error.message)) {
            consecutiveConnectionErrors++;
            logMCPDebug(
              name,
              `Terminal connection error ${consecutiveConnectionErrors}/${MAX_ERRORS_BEFORE_RECONNECT}`
            );
            if (consecutiveConnectionErrors >= MAX_ERRORS_BEFORE_RECONNECT) {
              consecutiveConnectionErrors = 0;
              closeTransportAndRejectPending("max consecutive terminal errors");
            }
          } else {
            consecutiveConnectionErrors = 0;
          }
        }
        if (originalOnerror) {
          originalOnerror(error);
        }
      };
      client.onclose = () => {
        const uptime = Date.now() - connectionStartTime;
        const transportType = serverRef.type ?? "unknown";
        logMCPDebug(
          name,
          `${transportType.toUpperCase()} connection closed after ${Math.floor(uptime / 1e3)}s (${hasErrorOccurred ? "with errors" : "cleanly"})`
        );
        const key = getServerCacheKey(name, serverRef);
        fetchToolsForClient.cache.delete(name);
        fetchResourcesForClient.cache.delete(name);
        fetchCommandsForClient.cache.delete(name);
        if (false) {
          fetchMcpSkillsForClient.cache.delete(name);
        }
        connectToServer.cache.delete(key);
        logMCPDebug(name, `Cleared connection cache for reconnection`);
        if (originalOnclose) {
          originalOnclose();
        }
      };
      const cleanup = async () => {
        if (inProcessServer) {
          try {
            await inProcessServer.close();
          } catch (error) {
            logMCPDebug(name, `Error closing in-process server: ${error}`);
          }
          try {
            await client.close();
          } catch (error) {
            logMCPDebug(name, `Error closing client: ${error}`);
          }
          return;
        }
        if (stderrHandler && (serverRef.type === "stdio" || !serverRef.type)) {
          const stdioTransport = transport;
          stdioTransport.stderr?.off("data", stderrHandler);
        }
        if (serverRef.type === "stdio") {
          try {
            const stdioTransport = transport;
            const childPid = stdioTransport.pid;
            if (childPid) {
              logMCPDebug(name, "Sending SIGINT to MCP server process");
              try {
                process.kill(childPid, "SIGINT");
              } catch (error) {
                logMCPDebug(name, `Error sending SIGINT: ${error}`);
                return;
              }
              await new Promise(async (resolve) => {
                let resolved = false;
                const checkInterval = setInterval(() => {
                  try {
                    process.kill(childPid, 0);
                  } catch {
                    if (!resolved) {
                      resolved = true;
                      clearInterval(checkInterval);
                      clearTimeout(failsafeTimeout);
                      logMCPDebug(name, "MCP server process exited cleanly");
                      resolve();
                    }
                  }
                }, 50);
                const failsafeTimeout = setTimeout(() => {
                  if (!resolved) {
                    resolved = true;
                    clearInterval(checkInterval);
                    logMCPDebug(
                      name,
                      "Cleanup timeout reached, stopping process monitoring"
                    );
                    resolve();
                  }
                }, 600);
                try {
                  await sleep(100);
                  if (!resolved) {
                    try {
                      process.kill(childPid, 0);
                      logMCPDebug(
                        name,
                        "SIGINT failed, sending SIGTERM to MCP server process"
                      );
                      try {
                        process.kill(childPid, "SIGTERM");
                      } catch (termError) {
                        logMCPDebug(name, `Error sending SIGTERM: ${termError}`);
                        resolved = true;
                        clearInterval(checkInterval);
                        clearTimeout(failsafeTimeout);
                        resolve();
                        return;
                      }
                    } catch {
                      resolved = true;
                      clearInterval(checkInterval);
                      clearTimeout(failsafeTimeout);
                      resolve();
                      return;
                    }
                    await sleep(400);
                    if (!resolved) {
                      try {
                        process.kill(childPid, 0);
                        logMCPDebug(
                          name,
                          "SIGTERM failed, sending SIGKILL to MCP server process"
                        );
                        try {
                          process.kill(childPid, "SIGKILL");
                        } catch (killError) {
                          logMCPDebug(
                            name,
                            `Error sending SIGKILL: ${killError}`
                          );
                        }
                      } catch {
                        resolved = true;
                        clearInterval(checkInterval);
                        clearTimeout(failsafeTimeout);
                        resolve();
                      }
                    }
                  }
                  if (!resolved) {
                    resolved = true;
                    clearInterval(checkInterval);
                    clearTimeout(failsafeTimeout);
                    resolve();
                  }
                } catch {
                  if (!resolved) {
                    resolved = true;
                    clearInterval(checkInterval);
                    clearTimeout(failsafeTimeout);
                    resolve();
                  }
                }
              });
            }
          } catch (processError) {
            logMCPDebug(name, `Error terminating process: ${processError}`);
          }
        }
        try {
          await client.close();
        } catch (error) {
          logMCPDebug(name, `Error closing client: ${error}`);
        }
      };
      const cleanupUnregister = registerCleanup(cleanup);
      const wrappedCleanup = async () => {
        cleanupUnregister?.();
        await cleanup();
      };
      const connectionDurationMs = Date.now() - connectStartTime;
      logEvent("tengu_mcp_server_connection_succeeded", {
        connectionDurationMs,
        transportType: serverRef.type ?? "stdio",
        totalServers: serverStats?.totalServers,
        stdioCount: serverStats?.stdioCount,
        sseCount: serverStats?.sseCount,
        httpCount: serverStats?.httpCount,
        sseIdeCount: serverStats?.sseIdeCount,
        wsIdeCount: serverStats?.wsIdeCount,
        ...mcpBaseUrlAnalytics(serverRef)
      });
      return {
        name,
        client,
        type: "connected",
        capabilities: capabilities ?? {},
        serverInfo: serverVersion,
        instructions,
        config: serverRef,
        cleanup: wrappedCleanup
      };
    } catch (error) {
      const connectionDurationMs = Date.now() - connectStartTime;
      logEvent("tengu_mcp_server_connection_failed", {
        connectionDurationMs,
        totalServers: serverStats?.totalServers || 1,
        stdioCount: serverStats?.stdioCount || (serverRef.type === "stdio" ? 1 : 0),
        sseCount: serverStats?.sseCount || (serverRef.type === "sse" ? 1 : 0),
        httpCount: serverStats?.httpCount || (serverRef.type === "http" ? 1 : 0),
        sseIdeCount: serverStats?.sseIdeCount || (serverRef.type === "sse-ide" ? 1 : 0),
        wsIdeCount: serverStats?.wsIdeCount || (serverRef.type === "ws-ide" ? 1 : 0),
        transportType: serverRef.type ?? "stdio",
        ...mcpBaseUrlAnalytics(serverRef)
      });
      logMCPDebug(
        name,
        `Connection failed after ${connectionDurationMs}ms: ${errorMessage(error)}`
      );
      logMCPError(name, `Connection failed: ${errorMessage(error)}`);
      if (inProcessServer) {
        inProcessServer.close().catch(() => {
        });
      }
      return {
        name,
        type: "failed",
        config: serverRef,
        error: errorMessage(error)
      };
    }
  },
  getServerCacheKey
);
async function clearServerCache(name, serverRef) {
  const key = getServerCacheKey(name, serverRef);
  try {
    const wrappedClient = await connectToServer(name, serverRef);
    if (wrappedClient.type === "connected") {
      await wrappedClient.cleanup();
    }
  } catch {
  }
  connectToServer.cache.delete(key);
  fetchToolsForClient.cache.delete(name);
  fetchResourcesForClient.cache.delete(name);
  fetchCommandsForClient.cache.delete(name);
  if (false) {
    fetchMcpSkillsForClient.cache.delete(name);
  }
}
async function ensureConnectedClient(client) {
  if (client.config.type === "sdk") {
    return client;
  }
  const connectedClient = await connectToServer(client.name, client.config);
  if (connectedClient.type !== "connected") {
    throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
      `MCP server "${client.name}" is not connected`,
      "MCP server not connected"
    );
  }
  return connectedClient;
}
function areMcpConfigsEqual(a, b) {
  if (a.type !== b.type) return false;
  const { scope: _scopeA, ...configA } = a;
  const { scope: _scopeB, ...configB } = b;
  return jsonStringify(configA) === jsonStringify(configB);
}
const MCP_FETCH_CACHE_SIZE = 20;
function mcpToolInputToAutoClassifierInput(input, toolName) {
  const keys = Object.keys(input);
  return keys.length > 0 ? keys.map((k) => `${k}=${String(input[k])}`).join(" ") : toolName;
}
const fetchToolsForClient = memoizeWithLRU(
  async (client) => {
    if (client.type !== "connected") return [];
    try {
      if (!client.capabilities?.tools) {
        return [];
      }
      const result = await client.client.request(
        { method: "tools/list" },
        ListToolsResultSchema
      );
      const toolsToProcess = recursivelySanitizeUnicode(result.tools);
      const skipPrefix = client.config.type === "sdk" && isEnvTruthy(process.env.CLAUDE_AGENT_SDK_MCP_NO_PREFIX);
      return toolsToProcess.map((tool) => {
        const fullyQualifiedName = buildMcpToolName(client.name, tool.name);
        return {
          ...MCPTool,
          // In skip-prefix mode, use the original name for model invocation so MCP tools
          // can override builtins by name. mcpInfo is used for permission checking.
          name: skipPrefix ? tool.name : fullyQualifiedName,
          mcpInfo: { serverName: client.name, toolName: tool.name },
          isMcp: true,
          // Collapse whitespace: _meta is open to external MCP servers, and
          // a newline here would inject orphan lines into the deferred-tool
          // list (formatDeferredToolLine joins on '\n').
          searchHint: typeof tool._meta?.["anthropic/searchHint"] === "string" ? tool._meta["anthropic/searchHint"].replace(/\s+/g, " ").trim() || void 0 : void 0,
          alwaysLoad: tool._meta?.["anthropic/alwaysLoad"] === true,
          async description() {
            return tool.description ?? "";
          },
          async prompt() {
            const desc = tool.description ?? "";
            return desc.length > MAX_MCP_DESCRIPTION_LENGTH ? desc.slice(0, MAX_MCP_DESCRIPTION_LENGTH) + "\u2026 [truncated]" : desc;
          },
          isConcurrencySafe() {
            return tool.annotations?.readOnlyHint ?? false;
          },
          isReadOnly() {
            return tool.annotations?.readOnlyHint ?? false;
          },
          toAutoClassifierInput(input) {
            return mcpToolInputToAutoClassifierInput(input, tool.name);
          },
          isDestructive() {
            return tool.annotations?.destructiveHint ?? false;
          },
          isOpenWorld() {
            return tool.annotations?.openWorldHint ?? false;
          },
          isSearchOrReadCommand() {
            return classifyMcpToolForCollapse(client.name, tool.name);
          },
          inputJSONSchema: tool.inputSchema,
          async checkPermissions() {
            return {
              behavior: "passthrough",
              message: "MCPTool requires permission.",
              suggestions: [
                {
                  type: "addRules",
                  rules: [
                    {
                      toolName: fullyQualifiedName,
                      ruleContent: void 0
                    }
                  ],
                  behavior: "allow",
                  destination: "localSettings"
                }
              ]
            };
          },
          async call(args, context, _canUseTool, parentMessage, onProgress) {
            const toolUseId = extractToolUseId(parentMessage);
            const meta = toolUseId ? { "claudecode/toolUseId": toolUseId } : {};
            if (onProgress && toolUseId) {
              onProgress({
                toolUseID: toolUseId,
                data: {
                  type: "mcp_progress",
                  status: "started",
                  serverName: client.name,
                  toolName: tool.name
                }
              });
            }
            const startTime = Date.now();
            const MAX_SESSION_RETRIES = 1;
            for (let attempt = 0; ; attempt++) {
              try {
                const connectedClient = await ensureConnectedClient(client);
                const mcpResult = await callMCPToolWithUrlElicitationRetry({
                  client: connectedClient,
                  clientConnection: client,
                  tool: tool.name,
                  args,
                  meta,
                  signal: context.abortController.signal,
                  setAppState: context.setAppState,
                  onProgress: onProgress && toolUseId ? (progressData) => {
                    onProgress({
                      toolUseID: toolUseId,
                      data: progressData
                    });
                  } : void 0,
                  handleElicitation: context.handleElicitation
                });
                if (onProgress && toolUseId) {
                  onProgress({
                    toolUseID: toolUseId,
                    data: {
                      type: "mcp_progress",
                      status: "completed",
                      serverName: client.name,
                      toolName: tool.name,
                      elapsedTimeMs: Date.now() - startTime
                    }
                  });
                }
                return {
                  data: mcpResult.content,
                  ...(mcpResult._meta || mcpResult.structuredContent) && {
                    mcpMeta: {
                      ...mcpResult._meta && {
                        _meta: mcpResult._meta
                      },
                      ...mcpResult.structuredContent && {
                        structuredContent: mcpResult.structuredContent
                      }
                    }
                  }
                };
              } catch (error) {
                if (error instanceof McpSessionExpiredError && attempt < MAX_SESSION_RETRIES) {
                  logMCPDebug(
                    client.name,
                    `Retrying tool '${tool.name}' after session recovery`
                  );
                  continue;
                }
                if (onProgress && toolUseId) {
                  onProgress({
                    toolUseID: toolUseId,
                    data: {
                      type: "mcp_progress",
                      status: "failed",
                      serverName: client.name,
                      toolName: tool.name,
                      elapsedTimeMs: Date.now() - startTime
                    }
                  });
                }
                if (error instanceof Error && !(error instanceof TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)) {
                  const name = error.constructor.name;
                  if (name === "Error") {
                    throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
                      error.message,
                      error.message.slice(0, 200)
                    );
                  }
                  if (name === "McpError" && "code" in error && typeof error.code === "number") {
                    throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
                      error.message,
                      `McpError ${error.code}`
                    );
                  }
                }
                throw error;
              }
            }
          },
          userFacingName() {
            const displayName = tool.annotations?.title || tool.name;
            return `${client.name} - ${displayName} (MCP)`;
          },
          ...isClaudeInChromeMCPServer(client.name) && (client.config.type === "stdio" || !client.config.type) ? claudeInChromeToolRendering().getClaudeInChromeMCPToolOverrides(
            tool.name
          ) : {},
          ...false ? computerUseWrapper().getComputerUseMCPToolOverrides(tool.name) : {}
        };
      }).filter(isIncludedMcpTool);
    } catch (error) {
      logMCPError(client.name, `Failed to fetch tools: ${errorMessage(error)}`);
      return [];
    }
  },
  (client) => client.name,
  MCP_FETCH_CACHE_SIZE
);
const fetchResourcesForClient = memoizeWithLRU(
  async (client) => {
    if (client.type !== "connected") return [];
    try {
      if (!client.capabilities?.resources) {
        return [];
      }
      const result = await client.client.request(
        { method: "resources/list" },
        ListResourcesResultSchema
      );
      if (!result.resources) return [];
      return result.resources.map((resource) => ({
        ...resource,
        server: client.name
      }));
    } catch (error) {
      logMCPError(
        client.name,
        `Failed to fetch resources: ${errorMessage(error)}`
      );
      return [];
    }
  },
  (client) => client.name,
  MCP_FETCH_CACHE_SIZE
);
const fetchCommandsForClient = memoizeWithLRU(
  async (client) => {
    if (client.type !== "connected") return [];
    try {
      if (!client.capabilities?.prompts) {
        return [];
      }
      const result = await client.client.request(
        { method: "prompts/list" },
        ListPromptsResultSchema
      );
      if (!result.prompts) return [];
      const promptsToProcess = recursivelySanitizeUnicode(result.prompts);
      return promptsToProcess.map((prompt) => {
        const argNames = Object.values(prompt.arguments ?? {}).map((k) => k.name);
        return {
          type: "prompt",
          name: "mcp__" + normalizeNameForMCP(client.name) + "__" + prompt.name,
          description: prompt.description ?? "",
          hasUserSpecifiedDescription: !!prompt.description,
          contentLength: 0,
          // Dynamic MCP content
          isEnabled: () => true,
          isHidden: false,
          isMcp: true,
          progressMessage: "running",
          userFacingName() {
            return `${client.name}:${prompt.name} (MCP)`;
          },
          argNames,
          source: "mcp",
          async getPromptForCommand(args) {
            const argsArray = args.split(" ");
            try {
              const connectedClient = await ensureConnectedClient(client);
              const result2 = await connectedClient.client.getPrompt({
                name: prompt.name,
                arguments: zipObject(argNames, argsArray)
              });
              const transformed = await Promise.all(
                result2.messages.map(
                  (message) => transformResultContent(message.content, connectedClient.name)
                )
              );
              return transformed.flat();
            } catch (error) {
              logMCPError(
                client.name,
                `Error running command '${prompt.name}': ${errorMessage(error)}`
              );
              throw error;
            }
          }
        };
      });
    } catch (error) {
      logMCPError(
        client.name,
        `Failed to fetch commands: ${errorMessage(error)}`
      );
      return [];
    }
  },
  (client) => client.name,
  MCP_FETCH_CACHE_SIZE
);
async function callIdeRpc(toolName, args, client) {
  const result = await callMCPTool({
    client,
    tool: toolName,
    args,
    signal: createAbortController().signal
  });
  return result.content;
}
async function reconnectMcpServerImpl(name, config) {
  try {
    clearKeychainCache();
    await clearServerCache(name, config);
    const client = await connectToServer(name, config);
    if (client.type !== "connected") {
      return {
        client,
        tools: [],
        commands: []
      };
    }
    if (config.type === "claudeai-proxy") {
      markClaudeAiMcpConnected(name);
    }
    const supportsResources = !!client.capabilities?.resources;
    const [tools, mcpCommands, mcpSkills, resources] = await Promise.all([
      fetchToolsForClient(client),
      fetchCommandsForClient(client),
      false ? fetchMcpSkillsForClient(client) : Promise.resolve([]),
      supportsResources ? fetchResourcesForClient(client) : Promise.resolve([])
    ]);
    const commands = [...mcpCommands, ...mcpSkills];
    const resourceTools = [];
    if (supportsResources) {
      const hasResourceTools = [ListMcpResourcesTool, ReadMcpResourceTool].some(
        (tool) => tools.some((t) => toolMatchesName(t, tool.name))
      );
      if (!hasResourceTools) {
        resourceTools.push(ListMcpResourcesTool, ReadMcpResourceTool);
      }
    }
    return {
      client,
      tools: [...tools, ...resourceTools],
      commands,
      resources: resources.length > 0 ? resources : void 0
    };
  } catch (error) {
    logMCPError(name, `Error during reconnection: ${errorMessage(error)}`);
    return {
      client: { name, type: "failed", config },
      tools: [],
      commands: []
    };
  }
}
async function processBatched(items, concurrency, processor) {
  await pMap(items, processor, { concurrency });
}
async function getMcpToolsCommandsAndResources(onConnectionAttempt, mcpConfigs) {
  let resourceToolsAdded = false;
  const allConfigEntries = Object.entries(
    mcpConfigs ?? (await getAllMcpConfigs()).servers
  );
  const configEntries = [];
  for (const entry of allConfigEntries) {
    if (isMcpServerDisabled(entry[0])) {
      onConnectionAttempt({
        client: { name: entry[0], type: "disabled", config: entry[1] },
        tools: [],
        commands: []
      });
    } else {
      configEntries.push(entry);
    }
  }
  const totalServers = configEntries.length;
  const stdioCount = count(configEntries, ([_, c]) => c.type === "stdio");
  const sseCount = count(configEntries, ([_, c]) => c.type === "sse");
  const httpCount = count(configEntries, ([_, c]) => c.type === "http");
  const sseIdeCount = count(configEntries, ([_, c]) => c.type === "sse-ide");
  const wsIdeCount = count(configEntries, ([_, c]) => c.type === "ws-ide");
  const localServers = configEntries.filter(
    ([_, config]) => isLocalMcpServer(config)
  );
  const remoteServers = configEntries.filter(
    ([_, config]) => !isLocalMcpServer(config)
  );
  const serverStats = {
    totalServers,
    stdioCount,
    sseCount,
    httpCount,
    sseIdeCount,
    wsIdeCount
  };
  const processServer = async ([name, config]) => {
    try {
      if (isMcpServerDisabled(name)) {
        onConnectionAttempt({
          client: {
            name,
            type: "disabled",
            config
          },
          tools: [],
          commands: []
        });
        return;
      }
      if ((config.type === "claudeai-proxy" || config.type === "http" || config.type === "sse") && (await isMcpAuthCached(name) || (config.type === "http" || config.type === "sse") && hasMcpDiscoveryButNoToken(name, config))) {
        logMCPDebug(name, `Skipping connection (cached needs-auth)`);
        onConnectionAttempt({
          client: { name, type: "needs-auth", config },
          tools: [createMcpAuthTool(name, config)],
          commands: []
        });
        return;
      }
      const client = await connectToServer(name, config, serverStats);
      if (client.type !== "connected") {
        onConnectionAttempt({
          client,
          tools: client.type === "needs-auth" ? [createMcpAuthTool(name, config)] : [],
          commands: []
        });
        return;
      }
      if (config.type === "claudeai-proxy") {
        markClaudeAiMcpConnected(name);
      }
      const supportsResources = !!client.capabilities?.resources;
      const [tools, mcpCommands, mcpSkills, resources] = await Promise.all([
        fetchToolsForClient(client),
        fetchCommandsForClient(client),
        // Discover skills from skill:// resources
        false ? fetchMcpSkillsForClient(client) : Promise.resolve([]),
        // Fetch resources if supported
        supportsResources ? fetchResourcesForClient(client) : Promise.resolve([])
      ]);
      const commands = [...mcpCommands, ...mcpSkills];
      const resourceTools = [];
      if (supportsResources && !resourceToolsAdded) {
        resourceToolsAdded = true;
        resourceTools.push(ListMcpResourcesTool, ReadMcpResourceTool);
      }
      onConnectionAttempt({
        client,
        tools: [...tools, ...resourceTools],
        commands,
        resources: resources.length > 0 ? resources : void 0
      });
    } catch (error) {
      logMCPError(
        name,
        `Error fetching tools/commands/resources: ${errorMessage(error)}`
      );
      onConnectionAttempt({
        client: { name, type: "failed", config },
        tools: [],
        commands: []
      });
    }
  };
  await Promise.all([
    processBatched(
      localServers,
      getMcpServerConnectionBatchSize(),
      processServer
    ),
    processBatched(
      remoteServers,
      getRemoteMcpServerConnectionBatchSize(),
      processServer
    )
  ]);
}
function prefetchAllMcpResources(mcpConfigs) {
  return new Promise((resolve) => {
    let pendingCount = 0;
    let completedCount = 0;
    pendingCount = Object.keys(mcpConfigs).length;
    if (pendingCount === 0) {
      void resolve({
        clients: [],
        tools: [],
        commands: []
      });
      return;
    }
    const clients = [];
    const tools = [];
    const commands = [];
    getMcpToolsCommandsAndResources((result) => {
      clients.push(result.client);
      tools.push(...result.tools);
      commands.push(...result.commands);
      completedCount++;
      if (completedCount >= pendingCount) {
        const commandsMetadataLength = commands.reduce((sum, command) => {
          const commandMetadataLength = command.name.length + (command.description ?? "").length + (command.argumentHint ?? "").length;
          return sum + commandMetadataLength;
        }, 0);
        logEvent("tengu_mcp_tools_commands_loaded", {
          tools_count: tools.length,
          commands_count: commands.length,
          commands_metadata_length: commandsMetadataLength
        });
        void resolve({
          clients,
          tools,
          commands
        });
      }
    }, mcpConfigs).catch((error) => {
      logMCPError(
        "prefetchAllMcpResources",
        `Failed to get MCP resources: ${errorMessage(error)}`
      );
      void resolve({
        clients: [],
        tools: [],
        commands: []
      });
    });
  });
}
async function transformResultContent(resultContent, serverName) {
  switch (resultContent.type) {
    case "text":
      return [
        {
          type: "text",
          text: resultContent.text
        }
      ];
    case "audio": {
      const audioData = resultContent;
      return await persistBlobToTextBlock(
        Buffer.from(audioData.data, "base64"),
        audioData.mimeType,
        serverName,
        `[Audio from ${serverName}] `
      );
    }
    case "image": {
      const imageBuffer = Buffer.from(String(resultContent.data), "base64");
      const ext = resultContent.mimeType?.split("/")[1] || "png";
      const resized = await maybeResizeAndDownsampleImageBuffer(
        imageBuffer,
        imageBuffer.length,
        ext
      );
      return [
        {
          type: "image",
          source: {
            data: resized.buffer.toString("base64"),
            media_type: `image/${resized.mediaType}`,
            type: "base64"
          }
        }
      ];
    }
    case "resource": {
      const resource = resultContent.resource;
      const prefix = `[Resource from ${serverName} at ${resource.uri}] `;
      if ("text" in resource) {
        return [
          {
            type: "text",
            text: `${prefix}${resource.text}`
          }
        ];
      } else if ("blob" in resource) {
        const isImage = IMAGE_MIME_TYPES.has(resource.mimeType ?? "");
        if (isImage) {
          const imageBuffer = Buffer.from(resource.blob, "base64");
          const ext = resource.mimeType?.split("/")[1] || "png";
          const resized = await maybeResizeAndDownsampleImageBuffer(
            imageBuffer,
            imageBuffer.length,
            ext
          );
          const content = [];
          if (prefix) {
            content.push({
              type: "text",
              text: prefix
            });
          }
          content.push({
            type: "image",
            source: {
              data: resized.buffer.toString("base64"),
              media_type: `image/${resized.mediaType}`,
              type: "base64"
            }
          });
          return content;
        } else {
          return await persistBlobToTextBlock(
            Buffer.from(resource.blob, "base64"),
            resource.mimeType,
            serverName,
            prefix
          );
        }
      }
      return [];
    }
    case "resource_link": {
      const resourceLink = resultContent;
      let text = `[Resource link: ${resourceLink.name}] ${resourceLink.uri}`;
      if (resourceLink.description) {
        text += ` (${resourceLink.description})`;
      }
      return [
        {
          type: "text",
          text
        }
      ];
    }
    default:
      return [];
  }
}
async function persistBlobToTextBlock(bytes, mimeType, serverName, sourceDescription) {
  const persistId = `mcp-${normalizeNameForMCP(serverName)}-blob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await persistBinaryContent(bytes, mimeType, persistId);
  if ("error" in result) {
    return [
      {
        type: "text",
        text: `${sourceDescription}Binary content (${mimeType || "unknown type"}, ${bytes.length} bytes) could not be saved to disk: ${result.error}`
      }
    ];
  }
  return [
    {
      type: "text",
      text: getBinaryBlobSavedMessage(
        result.filepath,
        mimeType,
        result.size,
        sourceDescription
      )
    }
  ];
}
function inferCompactSchema(value, depth = 2) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${inferCompactSchema(value[0], depth - 1)}]`;
  }
  if (typeof value === "object") {
    if (depth <= 0) return "{...}";
    const entries = Object.entries(value).slice(0, 10);
    const props = entries.map(
      ([k, v]) => `${k}: ${inferCompactSchema(v, depth - 1)}`
    );
    const suffix = Object.keys(value).length > 10 ? ", ..." : "";
    return `{${props.join(", ")}${suffix}}`;
  }
  return typeof value;
}
async function transformMCPResult(result, tool, name) {
  if (result && typeof result === "object") {
    if ("toolResult" in result) {
      return {
        content: String(result.toolResult),
        type: "toolResult"
      };
    }
    if ("structuredContent" in result && result.structuredContent !== void 0) {
      return {
        content: jsonStringify(result.structuredContent),
        type: "structuredContent",
        schema: inferCompactSchema(result.structuredContent)
      };
    }
    if ("content" in result && Array.isArray(result.content)) {
      const transformedContent = (await Promise.all(
        result.content.map((item) => transformResultContent(item, name))
      )).flat();
      return {
        content: transformedContent,
        type: "contentArray",
        schema: inferCompactSchema(transformedContent)
      };
    }
  }
  const errorMessage2 = `MCP server "${name}" tool "${tool}": unexpected response format`;
  logMCPError(name, errorMessage2);
  throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
    errorMessage2,
    "MCP tool unexpected response format"
  );
}
function contentContainsImages(content) {
  if (!content || typeof content === "string") {
    return false;
  }
  return content.some((block) => block.type === "image");
}
async function processMCPResult(result, tool, name) {
  const { content, type, schema } = await transformMCPResult(result, tool, name);
  if (name === "ide") {
    return content;
  }
  if (!await mcpContentNeedsTruncation(content)) {
    return content;
  }
  const sizeEstimateTokens = getContentSizeEstimate(content);
  if (isEnvDefinedFalsy(process.env.ENABLE_MCP_LARGE_OUTPUT_FILES)) {
    logEvent("tengu_mcp_large_result_handled", {
      outcome: "truncated",
      reason: "env_disabled",
      sizeEstimateTokens
    });
    return await truncateMcpContentIfNeeded(content);
  }
  if (!content) {
    return content;
  }
  if (contentContainsImages(content)) {
    logEvent("tengu_mcp_large_result_handled", {
      outcome: "truncated",
      reason: "contains_images",
      sizeEstimateTokens
    });
    return await truncateMcpContentIfNeeded(content);
  }
  const timestamp = Date.now();
  const persistId = `mcp-${normalizeNameForMCP(name)}-${normalizeNameForMCP(tool)}-${timestamp}`;
  const contentStr = typeof content === "string" ? content : jsonStringify(content, null, 2);
  const persistResult = await persistToolResult(contentStr, persistId);
  if (isPersistError(persistResult)) {
    const contentLength = contentStr.length;
    logEvent("tengu_mcp_large_result_handled", {
      outcome: "truncated",
      reason: "persist_failed",
      sizeEstimateTokens
    });
    return `Error: result (${contentLength.toLocaleString()} characters) exceeds maximum allowed tokens. Failed to save output to file: ${persistResult.error}. If this MCP server provides pagination or filtering tools, use them to retrieve specific portions of the data.`;
  }
  logEvent("tengu_mcp_large_result_handled", {
    outcome: "persisted",
    reason: "file_saved",
    sizeEstimateTokens,
    persistedSizeChars: persistResult.originalSize
  });
  const formatDescription = getFormatDescription(type, schema);
  return getLargeOutputInstructions(
    persistResult.filepath,
    persistResult.originalSize,
    formatDescription
  );
}
async function callMCPToolWithUrlElicitationRetry({
  client: connectedClient,
  clientConnection,
  tool,
  args,
  meta,
  signal,
  setAppState,
  onProgress,
  callToolFn = callMCPTool,
  handleElicitation
}) {
  const MAX_URL_ELICITATION_RETRIES = 3;
  for (let attempt = 0; ; attempt++) {
    try {
      return await callToolFn({
        client: connectedClient,
        tool,
        args,
        meta,
        signal,
        onProgress
      });
    } catch (error) {
      if (!(error instanceof McpError) || error.code !== ErrorCode.UrlElicitationRequired) {
        throw error;
      }
      if (attempt >= MAX_URL_ELICITATION_RETRIES) {
        throw error;
      }
      const errorData = error.data;
      const rawElicitations = errorData != null && typeof errorData === "object" && "elicitations" in errorData && Array.isArray(errorData.elicitations) ? errorData.elicitations : [];
      const elicitations = rawElicitations.filter(
        (e) => {
          if (e == null || typeof e !== "object") return false;
          const obj = e;
          return obj.mode === "url" && typeof obj.url === "string" && typeof obj.elicitationId === "string" && typeof obj.message === "string";
        }
      );
      const serverName = clientConnection.type === "connected" ? clientConnection.name : "unknown";
      if (elicitations.length === 0) {
        logMCPDebug(
          serverName,
          `Tool '${tool}' returned -32042 but no valid elicitations in error data`
        );
        throw error;
      }
      logMCPDebug(
        serverName,
        `Tool '${tool}' requires URL elicitation (error -32042, attempt ${attempt + 1}), processing ${elicitations.length} elicitation(s)`
      );
      for (const elicitation of elicitations) {
        const { elicitationId } = elicitation;
        const hookResponse = await runElicitationHooks(
          serverName,
          elicitation,
          signal
        );
        if (hookResponse) {
          logMCPDebug(
            serverName,
            `URL elicitation ${elicitationId} resolved by hook: ${jsonStringify(hookResponse)}`
          );
          if (hookResponse.action !== "accept") {
            return {
              content: `URL elicitation was ${hookResponse.action === "decline" ? "declined" : hookResponse.action + "ed"} by a hook. The tool "${tool}" could not complete because it requires the user to open a URL.`
            };
          }
          continue;
        }
        let userResult;
        if (handleElicitation) {
          userResult = await handleElicitation(serverName, elicitation, signal);
        } else {
          const waitingState = {
            actionLabel: "Retry now",
            showCancel: true
          };
          userResult = await new Promise((resolve) => {
            const onAbort = () => {
              void resolve({ action: "cancel" });
            };
            if (signal.aborted) {
              onAbort();
              return;
            }
            signal.addEventListener("abort", onAbort, { once: true });
            setAppState((prev) => ({
              ...prev,
              elicitation: {
                queue: [
                  ...prev.elicitation.queue,
                  {
                    serverName,
                    requestId: `error-elicit-${elicitationId}`,
                    params: elicitation,
                    signal,
                    waitingState,
                    respond: (result) => {
                      if (result.action === "accept") {
                        return;
                      }
                      signal.removeEventListener("abort", onAbort);
                      void resolve(result);
                    },
                    onWaitingDismiss: (action) => {
                      signal.removeEventListener("abort", onAbort);
                      if (action === "retry") {
                        void resolve({ action: "accept" });
                      } else {
                        void resolve({ action: "cancel" });
                      }
                    }
                  }
                ]
              }
            }));
          });
        }
        const finalResult = await runElicitationResultHooks(
          serverName,
          userResult,
          signal,
          "url",
          elicitationId
        );
        if (finalResult.action !== "accept") {
          logMCPDebug(
            serverName,
            `User ${finalResult.action === "decline" ? "declined" : finalResult.action + "ed"} URL elicitation ${elicitationId}`
          );
          return {
            content: `URL elicitation was ${finalResult.action === "decline" ? "declined" : finalResult.action + "ed"} by the user. The tool "${tool}" could not complete because it requires the user to open a URL.`
          };
        }
        logMCPDebug(
          serverName,
          `Elicitation ${elicitationId} completed, retrying tool call`
        );
      }
    }
  }
}
async function callMCPTool({
  client: { client, name, config },
  tool,
  args,
  meta,
  signal,
  onProgress
}) {
  const toolStartTime = Date.now();
  let progressInterval;
  try {
    logMCPDebug(name, `Calling MCP tool: ${tool}`);
    progressInterval = setInterval(
      (startTime, name2, tool2) => {
        const elapsed2 = Date.now() - startTime;
        const elapsedSeconds = Math.floor(elapsed2 / 1e3);
        const duration2 = `${elapsedSeconds}s`;
        logMCPDebug(name2, `Tool '${tool2}' still running (${duration2} elapsed)`);
      },
      3e4,
      // Log every 30 seconds
      toolStartTime,
      name,
      tool
    );
    const timeoutMs = getMcpToolTimeoutMs();
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        (reject2, name2, tool2, timeoutMs2) => {
          reject2(
            new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
              `MCP server "${name2}" tool "${tool2}" timed out after ${Math.floor(timeoutMs2 / 1e3)}s`,
              "MCP tool timeout"
            )
          );
        },
        timeoutMs,
        reject,
        name,
        tool,
        timeoutMs
      );
    });
    const result = await Promise.race([
      client.callTool(
        {
          name: tool,
          arguments: args,
          _meta: meta
        },
        CallToolResultSchema,
        {
          signal,
          timeout: timeoutMs,
          onprogress: onProgress ? (sdkProgress) => {
            onProgress({
              type: "mcp_progress",
              status: "progress",
              serverName: name,
              toolName: tool,
              progress: sdkProgress.progress,
              total: sdkProgress.total,
              progressMessage: sdkProgress.message
            });
          } : void 0
        }
      ),
      timeoutPromise
    ]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
    if ("isError" in result && result.isError) {
      let errorDetails = "Unknown error";
      if ("content" in result && Array.isArray(result.content) && result.content.length > 0) {
        const firstContent = result.content[0];
        if (firstContent && typeof firstContent === "object" && "text" in firstContent) {
          errorDetails = firstContent.text;
        }
      } else if ("error" in result) {
        errorDetails = String(result.error);
      }
      logMCPError(name, errorDetails);
      throw new McpToolCallError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
        errorDetails,
        "MCP tool returned error",
        "_meta" in result && result._meta ? { _meta: result._meta } : void 0
      );
    }
    const elapsed = Date.now() - toolStartTime;
    const duration = elapsed < 1e3 ? `${elapsed}ms` : elapsed < 6e4 ? `${Math.floor(elapsed / 1e3)}s` : `${Math.floor(elapsed / 6e4)}m ${Math.floor(elapsed % 6e4 / 1e3)}s`;
    logMCPDebug(name, `Tool '${tool}' completed successfully in ${duration}`);
    const codeIndexingTool = detectCodeIndexingFromMcpServerName(name);
    if (codeIndexingTool) {
      logEvent("tengu_code_indexing_tool_used", {
        tool: codeIndexingTool,
        source: "mcp",
        success: true
      });
    }
    const content = await processMCPResult(result, tool, name);
    return {
      content,
      _meta: result._meta,
      structuredContent: result.structuredContent
    };
  } catch (e) {
    if (progressInterval !== void 0) {
      clearInterval(progressInterval);
    }
    const elapsed = Date.now() - toolStartTime;
    if (e instanceof Error && e.name !== "AbortError") {
      logMCPDebug(
        name,
        `Tool '${tool}' failed after ${Math.floor(elapsed / 1e3)}s: ${e.message}`
      );
    }
    if (e instanceof Error) {
      const errorCode = "code" in e ? e.code : void 0;
      if (errorCode === 401 || e instanceof UnauthorizedError) {
        logMCPDebug(
          name,
          `Tool call returned 401 Unauthorized - token may have expired`
        );
        logEvent("tengu_mcp_tool_call_auth_error", {});
        throw new McpAuthError(
          name,
          `MCP server "${name}" requires re-authorization (token expired)`
        );
      }
      const isSessionExpired = isMcpSessionExpiredError(e);
      const isConnectionClosedOnHttp = "code" in e && e.code === -32e3 && e.message.includes("Connection closed") && (config.type === "http" || config.type === "claudeai-proxy");
      if (isSessionExpired || isConnectionClosedOnHttp) {
        logMCPDebug(
          name,
          `MCP session expired during tool call (${isSessionExpired ? "404/-32001" : "connection closed"}), clearing connection cache for re-initialization`
        );
        logEvent("tengu_mcp_session_expired", {});
        await clearServerCache(name, config);
        throw new McpSessionExpiredError(name);
      }
    }
    if (!(e instanceof Error) || e.name !== "AbortError") {
      throw e;
    }
    return { content: void 0 };
  } finally {
    if (progressInterval !== void 0) {
      clearInterval(progressInterval);
    }
  }
}
function extractToolUseId(message) {
  if (message.message.content[0]?.type !== "tool_use") {
    return void 0;
  }
  return message.message.content[0].id;
}
async function setupSdkMcpClients(sdkMcpConfigs, sendMcpMessage) {
  const clients = [];
  const tools = [];
  const results = await Promise.allSettled(
    Object.entries(sdkMcpConfigs).map(async ([name, config]) => {
      const transport = new SdkControlClientTransport(name, sendMcpMessage);
      const client = new Client(
        {
          name: "claude-code",
          title: "Claude Code",
          version: "0.0.0-dev",
          description: "Anthropic's agentic coding tool",
          websiteUrl: PRODUCT_URL
        },
        {
          capabilities: {}
        }
      );
      try {
        await client.connect(transport);
        const capabilities = client.getServerCapabilities();
        const connectedClient = {
          type: "connected",
          name,
          capabilities: capabilities || {},
          client,
          config: { ...config, scope: "dynamic" },
          cleanup: async () => {
            await client.close();
          }
        };
        const serverTools = [];
        if (capabilities?.tools) {
          const sdkTools = await fetchToolsForClient(connectedClient);
          serverTools.push(...sdkTools);
        }
        return {
          client: connectedClient,
          tools: serverTools
        };
      } catch (error) {
        logMCPError(name, `Failed to connect SDK MCP server: ${error}`);
        return {
          client: {
            type: "failed",
            name,
            config: { ...config, scope: "user" }
          },
          tools: []
        };
      }
    })
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      clients.push(result.value.client);
      tools.push(...result.value.tools);
    }
  }
  return { clients, tools };
}
export {
  McpAuthError,
  McpToolCallError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  areMcpConfigsEqual,
  callIdeRpc,
  callMCPToolWithUrlElicitationRetry,
  clearMcpAuthCache,
  clearServerCache,
  connectToServer,
  createClaudeAiProxyFetch,
  ensureConnectedClient,
  fetchCommandsForClient,
  fetchResourcesForClient,
  fetchToolsForClient,
  getMcpServerConnectionBatchSize,
  getMcpToolsCommandsAndResources,
  getServerCacheKey,
  inferCompactSchema,
  isMcpSessionExpiredError,
  mcpToolInputToAutoClassifierInput,
  prefetchAllMcpResources,
  processMCPResult,
  reconnectMcpServerImpl,
  setupSdkMcpClients,
  transformMCPResult,
  transformResultContent,
  wrapFetchWithTimeout
};
