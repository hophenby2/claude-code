const feature = (_name) => false;
import { basename } from "path";
import { useCallback, useEffect, useRef } from "react";
import { getSessionId } from "../../bootstrap/state.js";
import {
  clearServerCache,
  fetchCommandsForClient,
  fetchResourcesForClient,
  fetchToolsForClient,
  getMcpToolsCommandsAndResources,
  reconnectMcpServerImpl
} from "./client.js";
const fetchMcpSkillsForClient = false ? null.fetchMcpSkillsForClient : null;
const clearSkillIndexCache = false ? null.clearSkillIndexCache : null;
import {
  PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema
} from "@modelcontextprotocol/sdk/types.js";
import omit from "lodash-es/omit.js";
import reject from "lodash-es/reject.js";
import {
  logEvent
} from "../analytics/index.js";
import {
  dedupClaudeAiMcpServers,
  doesEnterpriseMcpConfigExist,
  filterMcpServersByPolicy,
  getClaudeCodeMcpConfigs,
  isMcpServerDisabled,
  setMcpServerEnabled
} from "./config.js";
import { logForDebugging } from "../../utils/debug.js";
import "../../bootstrap/state.js";
import { useNotifications } from "../../context/notifications.js";
import {
  useAppState,
  useAppStateStore,
  useSetAppState
} from "../../state/AppState.js";
import { errorMessage } from "../../utils/errors.js";
import { logMCPDebug, logMCPError } from "../../utils/log.js";
import "../../utils/messageQueueManager.js";
import "./channelNotification.js";
import "./channelPermissions.js";
import {
  clearClaudeAIMcpConfigsCache,
  fetchClaudeAIMcpConfigsIfEligible
} from "./claudeai.js";
import { registerElicitationHandler } from "./elicitationHandler.js";
import { getMcpPrefix } from "./mcpStringUtils.js";
import { commandBelongsToServer, excludeStalePluginClients } from "./utils.js";
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_BACKOFF_MS = 1e3;
const MAX_BACKOFF_MS = 3e4;
function getErrorKey(error) {
  const plugin = "plugin" in error ? error.plugin : "no-plugin";
  return `${error.type}:${error.source}:${plugin}`;
}
function addErrorsToAppState(setAppState, newErrors) {
  if (newErrors.length === 0) return;
  setAppState((prevState) => {
    const existingKeys = new Set(
      prevState.plugins.errors.map((e) => getErrorKey(e))
    );
    const uniqueNewErrors = newErrors.filter(
      (error) => !existingKeys.has(getErrorKey(error))
    );
    if (uniqueNewErrors.length === 0) {
      return prevState;
    }
    return {
      ...prevState,
      plugins: {
        ...prevState.plugins,
        errors: [...prevState.plugins.errors, ...uniqueNewErrors]
      }
    };
  });
}
function useManageMCPConnections(dynamicMcpConfig, isStrictMcpConfig = false) {
  const store = useAppStateStore();
  const _authVersion = useAppState((s) => s.authVersion);
  const _pluginReconnectKey = useAppState((s) => s.mcp.pluginReconnectKey);
  const setAppState = useSetAppState();
  const reconnectTimersRef = useRef(/* @__PURE__ */ new Map());
  const channelWarnedKindsRef = useRef(/* @__PURE__ */ new Set());
  const channelPermCallbacksRef = useRef(
    null
  );
  if (false) {
    channelPermCallbacksRef.current = createChannelPermissionCallbacks();
  }
  useEffect(() => {
    if (false) {
      const callbacks = channelPermCallbacksRef.current;
      if (!callbacks) return;
      if (!isChannelPermissionRelayEnabled()) return;
      setAppState((prev) => {
        if (prev.channelPermissionCallbacks === callbacks) return prev;
        return { ...prev, channelPermissionCallbacks: callbacks };
      });
      return () => {
        setAppState((prev) => {
          if (prev.channelPermissionCallbacks === void 0) return prev;
          return { ...prev, channelPermissionCallbacks: void 0 };
        });
      };
    }
  }, [setAppState]);
  const { addNotification } = useNotifications();
  const MCP_BATCH_FLUSH_MS = 16;
  const pendingUpdatesRef = useRef([]);
  const flushTimerRef = useRef(null);
  const flushPendingUpdates = useCallback(() => {
    flushTimerRef.current = null;
    const updates = pendingUpdatesRef.current;
    if (updates.length === 0) return;
    pendingUpdatesRef.current = [];
    setAppState((prevState) => {
      let mcp = prevState.mcp;
      for (const update of updates) {
        const {
          tools: rawTools,
          commands: rawCmds,
          resources: rawRes,
          ...client
        } = update;
        const tools = client.type === "disabled" || client.type === "failed" ? rawTools ?? [] : rawTools;
        const commands = client.type === "disabled" || client.type === "failed" ? rawCmds ?? [] : rawCmds;
        const resources = client.type === "disabled" || client.type === "failed" ? rawRes ?? [] : rawRes;
        const prefix = getMcpPrefix(client.name);
        const existingClientIndex = mcp.clients.findIndex(
          (c) => c.name === client.name
        );
        const updatedClients = existingClientIndex === -1 ? [...mcp.clients, client] : mcp.clients.map((c) => c.name === client.name ? client : c);
        const updatedTools = tools === void 0 ? mcp.tools : [...reject(mcp.tools, (t) => t.name?.startsWith(prefix)), ...tools];
        const updatedCommands = commands === void 0 ? mcp.commands : [
          ...reject(
            mcp.commands,
            (c) => commandBelongsToServer(c, client.name)
          ),
          ...commands
        ];
        const updatedResources = resources === void 0 ? mcp.resources : {
          ...mcp.resources,
          ...resources.length > 0 ? { [client.name]: resources } : omit(mcp.resources, client.name)
        };
        mcp = {
          ...mcp,
          clients: updatedClients,
          tools: updatedTools,
          commands: updatedCommands,
          resources: updatedResources
        };
      }
      return { ...prevState, mcp };
    });
  }, [setAppState]);
  const updateServer = useCallback(
    (update) => {
      pendingUpdatesRef.current.push(update);
      if (flushTimerRef.current === null) {
        flushTimerRef.current = setTimeout(
          flushPendingUpdates,
          MCP_BATCH_FLUSH_MS
        );
      }
    },
    [flushPendingUpdates]
  );
  const onConnectionAttempt = useCallback(
    ({
      client,
      tools,
      commands,
      resources
    }) => {
      updateServer({ ...client, tools, commands, resources });
      switch (client.type) {
        case "connected": {
          registerElicitationHandler(client.client, client.name, setAppState);
          client.client.onclose = () => {
            const configType = client.config.type ?? "stdio";
            clearServerCache(client.name, client.config).catch(() => {
              logForDebugging(
                `Failed to invalidate the server cache: ${client.name}`
              );
            });
            if (isMcpServerDisabled(client.name)) {
              logMCPDebug(
                client.name,
                `Server is disabled, skipping automatic reconnection`
              );
              return;
            }
            if (configType !== "stdio" && configType !== "sdk") {
              const transportType = getTransportDisplayName(configType);
              logMCPDebug(
                client.name,
                `${transportType} transport closed/disconnected, attempting automatic reconnection`
              );
              const existingTimer = reconnectTimersRef.current.get(client.name);
              if (existingTimer) {
                clearTimeout(existingTimer);
                reconnectTimersRef.current.delete(client.name);
              }
              const reconnectWithBackoff = async () => {
                for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
                  if (isMcpServerDisabled(client.name)) {
                    logMCPDebug(
                      client.name,
                      `Server disabled during reconnection, stopping retry`
                    );
                    reconnectTimersRef.current.delete(client.name);
                    return;
                  }
                  updateServer({
                    ...client,
                    type: "pending",
                    reconnectAttempt: attempt,
                    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS
                  });
                  const reconnectStartTime = Date.now();
                  try {
                    const result = await reconnectMcpServerImpl(
                      client.name,
                      client.config
                    );
                    const elapsed = Date.now() - reconnectStartTime;
                    if (result.client.type === "connected") {
                      logMCPDebug(
                        client.name,
                        `${transportType} reconnection successful after ${elapsed}ms (attempt ${attempt})`
                      );
                      reconnectTimersRef.current.delete(client.name);
                      onConnectionAttempt(result);
                      return;
                    }
                    logMCPDebug(
                      client.name,
                      `${transportType} reconnection attempt ${attempt} completed with status: ${result.client.type}`
                    );
                    if (attempt === MAX_RECONNECT_ATTEMPTS) {
                      logMCPDebug(
                        client.name,
                        `Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`
                      );
                      reconnectTimersRef.current.delete(client.name);
                      onConnectionAttempt(result);
                      return;
                    }
                  } catch (error) {
                    const elapsed = Date.now() - reconnectStartTime;
                    logMCPError(
                      client.name,
                      `${transportType} reconnection attempt ${attempt} failed after ${elapsed}ms: ${error}`
                    );
                    if (attempt === MAX_RECONNECT_ATTEMPTS) {
                      logMCPDebug(
                        client.name,
                        `Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`
                      );
                      reconnectTimersRef.current.delete(client.name);
                      updateServer({ ...client, type: "failed" });
                      return;
                    }
                  }
                  const backoffMs = Math.min(
                    INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1),
                    MAX_BACKOFF_MS
                  );
                  logMCPDebug(
                    client.name,
                    `Scheduling reconnection attempt ${attempt + 1} in ${backoffMs}ms`
                  );
                  await new Promise((resolve) => {
                    const timer = setTimeout(resolve, backoffMs);
                    reconnectTimersRef.current.set(client.name, timer);
                  });
                }
              };
              void reconnectWithBackoff();
            } else {
              updateServer({ ...client, type: "failed" });
            }
          };
          if (false) {
            const gate = gateChannelServer(
              client.name,
              client.capabilities,
              client.config.pluginSource
            );
            const entry = findChannelEntry(client.name, getAllowedChannels());
            const pluginId = entry?.kind === "plugin" ? `${entry.name}@${entry.marketplace}` : void 0;
            if (gate.action === "register" || gate.kind !== "capability") {
              logEvent("tengu_mcp_channel_gate", {
                registered: gate.action === "register",
                skip_kind: gate.action === "skip" ? gate.kind : void 0,
                entry_kind: entry?.kind,
                is_dev: entry?.dev ?? false,
                plugin: pluginId
              });
            }
            switch (gate.action) {
              case "register":
                logMCPDebug(client.name, "Channel notifications registered");
                client.client.setNotificationHandler(
                  ChannelMessageNotificationSchema(),
                  async (notification) => {
                    const { content, meta } = notification.params;
                    logMCPDebug(
                      client.name,
                      `notifications/claude/channel: ${content.slice(0, 80)}`
                    );
                    logEvent("tengu_mcp_channel_message", {
                      content_length: content.length,
                      meta_key_count: Object.keys(meta ?? {}).length,
                      entry_kind: entry?.kind,
                      is_dev: entry?.dev ?? false,
                      plugin: pluginId
                    });
                    enqueue({
                      mode: "prompt",
                      value: wrapChannelMessage(client.name, content, meta),
                      priority: "next",
                      isMeta: true,
                      origin: { kind: "channel", server: client.name },
                      skipSlashCommands: true
                    });
                  }
                );
                if (client.capabilities?.experimental?.["claude/channel/permission"] !== void 0) {
                  client.client.setNotificationHandler(
                    ChannelPermissionNotificationSchema(),
                    async (notification) => {
                      const { request_id, behavior } = notification.params;
                      const resolved = channelPermCallbacksRef.current?.resolve(
                        request_id,
                        behavior,
                        client.name
                      ) ?? false;
                      logMCPDebug(
                        client.name,
                        `notifications/claude/channel/permission: ${request_id} \u2192 ${behavior} (${resolved ? "matched pending" : "no pending entry \u2014 stale or unknown ID"})`
                      );
                    }
                  );
                }
                break;
              case "skip":
                client.client.removeNotificationHandler(
                  "notifications/claude/channel"
                );
                client.client.removeNotificationHandler(
                  CHANNEL_PERMISSION_METHOD
                );
                logMCPDebug(
                  client.name,
                  `Channel notifications skipped: ${gate.reason}`
                );
                if (gate.kind !== "capability" && gate.kind !== "session" && !channelWarnedKindsRef.current.has(gate.kind) && (gate.kind === "marketplace" || gate.kind === "allowlist" || entry !== void 0)) {
                  channelWarnedKindsRef.current.add(gate.kind);
                  const text = gate.kind === "disabled" ? "Channels are not currently available" : gate.kind === "auth" ? "Channels require claude.ai authentication \xB7 run /login" : gate.kind === "policy" ? "Channels are not enabled for your org \xB7 have an administrator set channelsEnabled: true in managed settings" : gate.reason;
                  addNotification({
                    key: `channels-blocked-${gate.kind}`,
                    priority: "high",
                    text,
                    color: "warning",
                    timeoutMs: 12e3
                  });
                }
                break;
            }
          }
          if (client.capabilities?.tools?.listChanged) {
            client.client.setNotificationHandler(
              ToolListChangedNotificationSchema,
              async () => {
                logMCPDebug(
                  client.name,
                  `Received tools/list_changed notification, refreshing tools`
                );
                try {
                  const previousToolsPromise = fetchToolsForClient.cache.get(
                    client.name
                  );
                  fetchToolsForClient.cache.delete(client.name);
                  const newTools = await fetchToolsForClient(client);
                  const newCount = newTools.length;
                  if (previousToolsPromise) {
                    previousToolsPromise.then(
                      (previousTools) => {
                        logEvent("tengu_mcp_list_changed", {
                          type: "tools",
                          previousCount: previousTools.length,
                          newCount
                        });
                      },
                      () => {
                        logEvent("tengu_mcp_list_changed", {
                          type: "tools",
                          newCount
                        });
                      }
                    );
                  } else {
                    logEvent("tengu_mcp_list_changed", {
                      type: "tools",
                      newCount
                    });
                  }
                  updateServer({ ...client, tools: newTools });
                } catch (error) {
                  logMCPError(
                    client.name,
                    `Failed to refresh tools after list_changed notification: ${errorMessage(error)}`
                  );
                }
              }
            );
          }
          if (client.capabilities?.prompts?.listChanged) {
            client.client.setNotificationHandler(
              PromptListChangedNotificationSchema,
              async () => {
                logMCPDebug(
                  client.name,
                  `Received prompts/list_changed notification, refreshing prompts`
                );
                logEvent("tengu_mcp_list_changed", {
                  type: "prompts"
                });
                try {
                  fetchCommandsForClient.cache.delete(client.name);
                  const [mcpPrompts, mcpSkills] = await Promise.all([
                    fetchCommandsForClient(client),
                    false ? fetchMcpSkillsForClient(client) : Promise.resolve([])
                  ]);
                  updateServer({
                    ...client,
                    commands: [...mcpPrompts, ...mcpSkills]
                  });
                  clearSkillIndexCache?.();
                } catch (error) {
                  logMCPError(
                    client.name,
                    `Failed to refresh prompts after list_changed notification: ${errorMessage(error)}`
                  );
                }
              }
            );
          }
          if (client.capabilities?.resources?.listChanged) {
            client.client.setNotificationHandler(
              ResourceListChangedNotificationSchema,
              async () => {
                logMCPDebug(
                  client.name,
                  `Received resources/list_changed notification, refreshing resources`
                );
                logEvent("tengu_mcp_list_changed", {
                  type: "resources"
                });
                try {
                  fetchResourcesForClient.cache.delete(client.name);
                  if (false) {
                    fetchMcpSkillsForClient.cache.delete(client.name);
                    fetchCommandsForClient.cache.delete(client.name);
                    const [newResources, mcpPrompts, mcpSkills] = await Promise.all([
                      fetchResourcesForClient(client),
                      fetchCommandsForClient(client),
                      fetchMcpSkillsForClient(client)
                    ]);
                    updateServer({
                      ...client,
                      resources: newResources,
                      commands: [...mcpPrompts, ...mcpSkills]
                    });
                    clearSkillIndexCache?.();
                  } else {
                    const newResources = await fetchResourcesForClient(client);
                    updateServer({ ...client, resources: newResources });
                  }
                } catch (error) {
                  logMCPError(
                    client.name,
                    `Failed to refresh resources after list_changed notification: ${errorMessage(error)}`
                  );
                }
              }
            );
          }
          break;
        }
        case "needs-auth":
        case "failed":
        case "pending":
        case "disabled":
          break;
      }
    },
    [updateServer]
  );
  const sessionId = getSessionId();
  useEffect(() => {
    async function initializeServersAsPending() {
      const { servers: existingConfigs, errors: mcpErrors } = isStrictMcpConfig ? { servers: {}, errors: [] } : await getClaudeCodeMcpConfigs(dynamicMcpConfig);
      const configs = { ...existingConfigs, ...dynamicMcpConfig };
      addErrorsToAppState(setAppState, mcpErrors);
      setAppState((prevState) => {
        const { stale, ...mcpWithoutStale } = excludeStalePluginClients(
          prevState.mcp,
          configs
        );
        for (const s of stale) {
          const timer = reconnectTimersRef.current.get(s.name);
          if (timer) {
            clearTimeout(timer);
            reconnectTimersRef.current.delete(s.name);
          }
          if (s.type === "connected") {
            s.client.onclose = void 0;
            void clearServerCache(s.name, s.config).catch(() => {
            });
          }
        }
        const existingServerNames = new Set(
          mcpWithoutStale.clients.map((c) => c.name)
        );
        const newClients = Object.entries(configs).filter(([name]) => !existingServerNames.has(name)).map(([name, config]) => ({
          name,
          type: isMcpServerDisabled(name) ? "disabled" : "pending",
          config
        }));
        if (newClients.length === 0 && stale.length === 0) {
          return prevState;
        }
        return {
          ...prevState,
          mcp: {
            ...prevState.mcp,
            ...mcpWithoutStale,
            clients: [...mcpWithoutStale.clients, ...newClients]
          }
        };
      });
    }
    void initializeServersAsPending().catch((error) => {
      logMCPError(
        "useManageMCPConnections",
        `Failed to initialize servers as pending: ${errorMessage(error)}`
      );
    });
  }, [
    isStrictMcpConfig,
    dynamicMcpConfig,
    setAppState,
    sessionId,
    _pluginReconnectKey
  ]);
  useEffect(() => {
    let cancelled = false;
    async function loadAndConnectMcpConfigs() {
      let claudeaiPromise;
      if (isStrictMcpConfig || doesEnterpriseMcpConfigExist()) {
        claudeaiPromise = Promise.resolve({});
      } else {
        clearClaudeAIMcpConfigsCache();
        claudeaiPromise = fetchClaudeAIMcpConfigsIfEligible();
      }
      const { servers: claudeCodeConfigs, errors: mcpErrors } = isStrictMcpConfig ? { servers: {}, errors: [] } : await getClaudeCodeMcpConfigs(dynamicMcpConfig, claudeaiPromise);
      if (cancelled) return;
      addErrorsToAppState(setAppState, mcpErrors);
      const configs = { ...claudeCodeConfigs, ...dynamicMcpConfig };
      const enabledConfigs = Object.fromEntries(
        Object.entries(configs).filter(([name]) => !isMcpServerDisabled(name))
      );
      getMcpToolsCommandsAndResources(
        onConnectionAttempt,
        enabledConfigs
      ).catch((error) => {
        logMCPError(
          "useManageMcpConnections",
          `Failed to get MCP resources: ${errorMessage(error)}`
        );
      });
      let claudeaiConfigs = {};
      if (!isStrictMcpConfig) {
        claudeaiConfigs = filterMcpServersByPolicy(
          await claudeaiPromise
        ).allowed;
        if (cancelled) return;
        if (Object.keys(claudeaiConfigs).length > 0) {
          const { servers: dedupedClaudeAi } = dedupClaudeAiMcpServers(
            claudeaiConfigs,
            configs
          );
          claudeaiConfigs = dedupedClaudeAi;
        }
        if (Object.keys(claudeaiConfigs).length > 0) {
          setAppState((prevState) => {
            const existingServerNames = new Set(
              prevState.mcp.clients.map((c) => c.name)
            );
            const newClients = Object.entries(claudeaiConfigs).filter(([name]) => !existingServerNames.has(name)).map(([name, config]) => ({
              name,
              type: isMcpServerDisabled(name) ? "disabled" : "pending",
              config
            }));
            if (newClients.length === 0) return prevState;
            return {
              ...prevState,
              mcp: {
                ...prevState.mcp,
                clients: [...prevState.mcp.clients, ...newClients]
              }
            };
          });
          const enabledClaudeaiConfigs = Object.fromEntries(
            Object.entries(claudeaiConfigs).filter(
              ([name]) => !isMcpServerDisabled(name)
            )
          );
          getMcpToolsCommandsAndResources(
            onConnectionAttempt,
            enabledClaudeaiConfigs
          ).catch((error) => {
            logMCPError(
              "useManageMcpConnections",
              `Failed to get claude.ai MCP resources: ${errorMessage(error)}`
            );
          });
        }
      }
      const allConfigs = { ...configs, ...claudeaiConfigs };
      const counts = {
        enterprise: 0,
        global: 0,
        project: 0,
        user: 0,
        plugin: 0,
        claudeai: 0
      };
      const stdioCommands = [];
      for (const [name, serverConfig] of Object.entries(allConfigs)) {
        if (serverConfig.scope === "enterprise") counts.enterprise++;
        else if (serverConfig.scope === "user") counts.global++;
        else if (serverConfig.scope === "project") counts.project++;
        else if (serverConfig.scope === "local") counts.user++;
        else if (serverConfig.scope === "dynamic") counts.plugin++;
        else if (serverConfig.scope === "claudeai") counts.claudeai++;
        if (process.env.USER_TYPE === "ant" && !isMcpServerDisabled(name) && (serverConfig.type === void 0 || serverConfig.type === "stdio") && "command" in serverConfig) {
          stdioCommands.push(basename(serverConfig.command));
        }
      }
      logEvent("tengu_mcp_servers", {
        ...counts,
        ...process.env.USER_TYPE === "ant" && stdioCommands.length > 0 ? {
          stdio_commands: stdioCommands.sort().join(
            ","
          )
        } : {}
      });
    }
    void loadAndConnectMcpConfigs();
    return () => {
      cancelled = true;
    };
  }, [
    isStrictMcpConfig,
    dynamicMcpConfig,
    onConnectionAttempt,
    setAppState,
    _authVersion,
    sessionId,
    _pluginReconnectKey
  ]);
  useEffect(() => {
    const timers = reconnectTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
        flushPendingUpdates();
      }
    };
  }, [flushPendingUpdates]);
  const reconnectMcpServer = useCallback(
    async (serverName) => {
      const client = store.getState().mcp.clients.find((c) => c.name === serverName);
      if (!client) {
        throw new Error(`MCP server ${serverName} not found`);
      }
      const existingTimer = reconnectTimersRef.current.get(serverName);
      if (existingTimer) {
        clearTimeout(existingTimer);
        reconnectTimersRef.current.delete(serverName);
      }
      const result = await reconnectMcpServerImpl(serverName, client.config);
      onConnectionAttempt(result);
      return result;
    },
    [store, onConnectionAttempt]
  );
  const toggleMcpServer = useCallback(
    async (serverName) => {
      const client = store.getState().mcp.clients.find((c) => c.name === serverName);
      if (!client) {
        throw new Error(`MCP server ${serverName} not found`);
      }
      const isCurrentlyDisabled = client.type === "disabled";
      if (!isCurrentlyDisabled) {
        const existingTimer = reconnectTimersRef.current.get(serverName);
        if (existingTimer) {
          clearTimeout(existingTimer);
          reconnectTimersRef.current.delete(serverName);
        }
        setMcpServerEnabled(serverName, false);
        if (client.type === "connected") {
          await clearServerCache(serverName, client.config);
        }
        updateServer({
          name: serverName,
          type: "disabled",
          config: client.config
        });
      } else {
        setMcpServerEnabled(serverName, true);
        updateServer({
          name: serverName,
          type: "pending",
          config: client.config
        });
        const result = await reconnectMcpServerImpl(serverName, client.config);
        onConnectionAttempt(result);
      }
    },
    [store, updateServer, onConnectionAttempt]
  );
  return { reconnectMcpServer, toggleMcpServer };
}
function getTransportDisplayName(type) {
  switch (type) {
    case "http":
      return "HTTP";
    case "ws":
    case "ws-ide":
      return "WebSocket";
    default:
      return "SSE";
  }
}
export {
  useManageMCPConnections
};
