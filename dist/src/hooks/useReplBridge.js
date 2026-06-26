import "react/jsx-runtime";
const feature = (_name) => false;
import { useCallback, useEffect, useRef } from "react";
import "../bootstrap/state.js";
import "../bridge/bridgePermissionCallbacks.js";
import "../bridge/bridgeStatusUtil.js";
import "../bridge/inboundMessages.js";
import "../bridge/replBridgeHandle.js";
import "../commands.js";
import "../constants/product.js";
import { useNotifications } from "../context/notifications.js";
import "../ink.js";
import "../services/analytics/growthbook.js";
import { useAppStateStore, useSetAppState } from "../state/AppState.js";
import "../utils/cwd.js";
import "../utils/debug.js";
import "../utils/errors.js";
import "../utils/messageQueueManager.js";
import "../utils/messages/systemInit.js";
import "../utils/messages.js";
import "../utils/permissions/permissionSetup.js";
import "../utils/swarm/leaderPermissionBridge.js";
const BRIDGE_FAILURE_DISMISS_MS = 1e4;
const MAX_CONSECUTIVE_INIT_FAILURES = 3;
function useReplBridge(messages, setMessages, abortControllerRef, commands, mainLoopModel) {
  const handleRef = useRef(null);
  const teardownPromiseRef = useRef(void 0);
  const lastWrittenIndexRef = useRef(0);
  const flushedUUIDsRef = useRef(/* @__PURE__ */ new Set());
  const failureTimeoutRef = useRef(void 0);
  const consecutiveFailuresRef = useRef(0);
  const setAppState = useSetAppState();
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const mainLoopModelRef = useRef(mainLoopModel);
  mainLoopModelRef.current = mainLoopModel;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const store = useAppStateStore();
  const {
    addNotification
  } = useNotifications();
  const replBridgeEnabled = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAppState((s) => s.replBridgeEnabled)
  ) : false;
  const replBridgeConnected = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAppState((s_0) => s_0.replBridgeConnected)
  ) : false;
  const replBridgeOutboundOnly = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAppState((s_1) => s_1.replBridgeOutboundOnly)
  ) : false;
  const replBridgeInitialName = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAppState((s_2) => s_2.replBridgeInitialName)
  ) : void 0;
  useEffect(() => {
    if (false) {
      let notifyBridgeFailed = function(detail) {
        if (outboundOnly) return;
        addNotification({
          key: "bridge-failed",
          jsx: /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Text, { color: "error", children: "Remote Control failed" }),
            detail && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
              " \xB7 ",
              detail
            ] })
          ] }),
          priority: "immediate"
        });
      };
      if (!replBridgeEnabled) return;
      const outboundOnly = replBridgeOutboundOnly;
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_INIT_FAILURES) {
        logForDebugging(`[bridge:repl] Hook: ${consecutiveFailuresRef.current} consecutive init failures, not retrying this session`);
        const fuseHint = "disabled after repeated failures \xB7 restart to retry";
        notifyBridgeFailed(fuseHint);
        setAppState((prev) => {
          if (prev.replBridgeError === fuseHint && !prev.replBridgeEnabled) return prev;
          return {
            ...prev,
            replBridgeError: fuseHint,
            replBridgeEnabled: false
          };
        });
        return;
      }
      let cancelled = false;
      const initialMessageCount = messages.length;
      void (async () => {
        try {
          let handleStateChange = function(state, detail_0) {
            if (cancelled) return;
            if (outboundOnly) {
              logForDebugging(`[bridge:repl] Mirror state=${state}${detail_0 ? ` detail=${detail_0}` : ""}`);
              if (state === "failed") {
                setAppState((prev_3) => {
                  if (!prev_3.replBridgeConnected) return prev_3;
                  return {
                    ...prev_3,
                    replBridgeConnected: false
                  };
                });
              } else if (state === "ready" || state === "connected") {
                setAppState((prev_4) => {
                  if (prev_4.replBridgeConnected) return prev_4;
                  return {
                    ...prev_4,
                    replBridgeConnected: true
                  };
                });
              }
              return;
            }
            const handle = handleRef.current;
            switch (state) {
              case "ready":
                setAppState((prev_9) => {
                  const connectUrl = handle && handle.environmentId !== "" ? buildBridgeConnectUrl(handle.environmentId, handle.sessionIngressUrl) : prev_9.replBridgeConnectUrl;
                  const sessionUrl = handle ? getRemoteSessionUrl(handle.bridgeSessionId, handle.sessionIngressUrl) : prev_9.replBridgeSessionUrl;
                  const envId = handle?.environmentId;
                  const sessionId = handle?.bridgeSessionId;
                  if (prev_9.replBridgeConnected && !prev_9.replBridgeSessionActive && !prev_9.replBridgeReconnecting && prev_9.replBridgeConnectUrl === connectUrl && prev_9.replBridgeSessionUrl === sessionUrl && prev_9.replBridgeEnvironmentId === envId && prev_9.replBridgeSessionId === sessionId) {
                    return prev_9;
                  }
                  return {
                    ...prev_9,
                    replBridgeConnected: true,
                    replBridgeSessionActive: false,
                    replBridgeReconnecting: false,
                    replBridgeConnectUrl: connectUrl,
                    replBridgeSessionUrl: sessionUrl,
                    replBridgeEnvironmentId: envId,
                    replBridgeSessionId: sessionId,
                    replBridgeError: void 0
                  };
                });
                break;
              case "connected": {
                setAppState((prev_8) => {
                  if (prev_8.replBridgeSessionActive) return prev_8;
                  return {
                    ...prev_8,
                    replBridgeConnected: true,
                    replBridgeSessionActive: true,
                    replBridgeReconnecting: false,
                    replBridgeError: void 0
                  };
                });
                if (getFeatureValue_CACHED_MAY_BE_STALE("tengu_bridge_system_init", false)) {
                  void (async () => {
                    try {
                      const skills = await getSlashCommandToolSkills(getCwd());
                      if (cancelled) return;
                      const state_0 = store.getState();
                      handleRef.current?.writeSdkMessages([buildSystemInitMessage({
                        // tools/mcpClients/plugins redacted for REPL-bridge:
                        // MCP-prefixed tool names and server names leak which
                        // integrations the user has wired up; plugin paths leak
                        // raw filesystem paths (username, project structure).
                        // CCR v2 persists SDK messages to Spanner — users who
                        // tap "Connect from phone" may not expect these on
                        // Anthropic's servers. QueryEngine (SDK) still emits
                        // full lists — SDK consumers expect full telemetry.
                        tools: [],
                        mcpClients: [],
                        model: mainLoopModelRef.current,
                        permissionMode: state_0.toolPermissionContext.mode,
                        // TODO: avoid the cast
                        // Remote clients can only invoke bridge-safe commands —
                        // advertising unsafe ones (local-jsx, unallowed local)
                        // would let mobile/web attempt them and hit errors.
                        commands: commandsRef.current.filter(isBridgeSafeCommand),
                        agents: state_0.agentDefinitions.activeAgents,
                        skills,
                        plugins: [],
                        fastMode: state_0.fastMode
                      })]);
                    } catch (err_0) {
                      logForDebugging(`[bridge:repl] Failed to send system/init: ${errorMessage(err_0)}`, {
                        level: "error"
                      });
                    }
                  })();
                }
                break;
              }
              case "reconnecting":
                setAppState((prev_7) => {
                  if (prev_7.replBridgeReconnecting) return prev_7;
                  return {
                    ...prev_7,
                    replBridgeReconnecting: true,
                    replBridgeSessionActive: false
                  };
                });
                break;
              case "failed":
                clearTimeout(failureTimeoutRef.current);
                notifyBridgeFailed(detail_0);
                setAppState((prev_5) => ({
                  ...prev_5,
                  replBridgeError: detail_0,
                  replBridgeReconnecting: false,
                  replBridgeSessionActive: false,
                  replBridgeConnected: false
                }));
                failureTimeoutRef.current = setTimeout(() => {
                  if (cancelled) return;
                  failureTimeoutRef.current = void 0;
                  setAppState((prev_6) => {
                    if (!prev_6.replBridgeError) return prev_6;
                    return {
                      ...prev_6,
                      replBridgeEnabled: false,
                      replBridgeError: void 0
                    };
                  });
                }, BRIDGE_FAILURE_DISMISS_MS);
                break;
            }
          }, handlePermissionResponse = function(msg_0) {
            const requestId = msg_0.response?.request_id;
            if (!requestId) return;
            const handler = pendingPermissionHandlers.get(requestId);
            if (!handler) {
              logForDebugging(`[bridge:repl] No handler for control_response request_id=${requestId}`);
              return;
            }
            pendingPermissionHandlers.delete(requestId);
            const inner = msg_0.response;
            if (inner.subtype === "success" && inner.response && isBridgePermissionResponse(inner.response)) {
              handler(inner.response);
            }
          };
          if (teardownPromiseRef.current) {
            logForDebugging("[bridge:repl] Hook: waiting for previous teardown to complete before re-init");
            await teardownPromiseRef.current;
            teardownPromiseRef.current = void 0;
            logForDebugging("[bridge:repl] Hook: previous teardown complete, proceeding with re-init");
          }
          if (cancelled) return;
          const {
            initReplBridge
          } = await null;
          const {
            shouldShowAppUpgradeMessage
          } = await null;
          let perpetual = false;
          if (false) {
            const {
              isAssistantMode
            } = await null;
            perpetual = isAssistantMode();
          }
          async function handleInboundMessage(msg) {
            try {
              const fields = extractInboundMessageFields(msg);
              if (!fields) return;
              const {
                uuid
              } = fields;
              const {
                resolveAndPrepend
              } = await null;
              let sanitized = fields.content;
              if (false) {
                const {
                  sanitizeInboundWebhookContent
                } = null;
                sanitized = sanitizeInboundWebhookContent(fields.content);
              }
              const content = await resolveAndPrepend(msg, sanitized);
              const preview = typeof content === "string" ? content.slice(0, 80) : `[${content.length} content blocks]`;
              logForDebugging(`[bridge:repl] Injecting inbound user message: ${preview}${uuid ? ` uuid=${uuid}` : ""}`);
              enqueue({
                value: content,
                mode: "prompt",
                uuid,
                // skipSlashCommands stays true as defense-in-depth —
                // processUserInputBase overrides it internally when bridgeOrigin
                // is set AND the resolved command passes isBridgeSafeCommand.
                // This keeps exit-word suppression and immediate-command blocks
                // intact for any code path that checks skipSlashCommands directly.
                skipSlashCommands: true,
                bridgeOrigin: true
              });
            } catch (e) {
              logForDebugging(`[bridge:repl] handleInboundMessage failed: ${e}`, {
                level: "error"
              });
            }
          }
          const pendingPermissionHandlers = /* @__PURE__ */ new Map();
          const handle_0 = await initReplBridge({
            outboundOnly,
            tags: outboundOnly ? ["ccr-mirror"] : void 0,
            onInboundMessage: handleInboundMessage,
            onPermissionResponse: handlePermissionResponse,
            onInterrupt() {
              abortControllerRef.current?.abort();
            },
            onSetModel(model) {
              const resolved = model === "default" ? null : model ?? null;
              setMainLoopModelOverride(resolved);
              setAppState((prev_10) => {
                if (prev_10.mainLoopModelForSession === resolved) return prev_10;
                return {
                  ...prev_10,
                  mainLoopModelForSession: resolved
                };
              });
            },
            onSetMaxThinkingTokens(maxTokens) {
              const enabled = maxTokens !== null;
              setAppState((prev_11) => {
                if (prev_11.thinkingEnabled === enabled) return prev_11;
                return {
                  ...prev_11,
                  thinkingEnabled: enabled
                };
              });
            },
            onSetPermissionMode(mode) {
              if (mode === "bypassPermissions") {
                if (isBypassPermissionsModeDisabled()) {
                  return {
                    ok: false,
                    error: "Cannot set permission mode to bypassPermissions because it is disabled by settings or configuration"
                  };
                }
                if (!store.getState().toolPermissionContext.isBypassPermissionsModeAvailable) {
                  return {
                    ok: false,
                    error: "Cannot set permission mode to bypassPermissions because the session was not launched with --dangerously-skip-permissions"
                  };
                }
              }
              if (false) {
                const reason = getAutoModeUnavailableReason();
                return {
                  ok: false,
                  error: reason ? `Cannot set permission mode to auto: ${getAutoModeUnavailableNotification(reason)}` : "Cannot set permission mode to auto"
                };
              }
              setAppState((prev_12) => {
                const current = prev_12.toolPermissionContext.mode;
                if (current === mode) return prev_12;
                const next = transitionPermissionMode(current, mode, prev_12.toolPermissionContext);
                return {
                  ...prev_12,
                  toolPermissionContext: {
                    ...next,
                    mode
                  }
                };
              });
              setImmediate(() => {
                getLeaderToolUseConfirmQueue()?.((currentQueue) => {
                  currentQueue.forEach((item) => {
                    void item.recheckPermission();
                  });
                  return currentQueue;
                });
              });
              return {
                ok: true
              };
            },
            onStateChange: handleStateChange,
            initialMessages: messages.length > 0 ? messages : void 0,
            getMessages: () => messagesRef.current,
            previouslyFlushedUUIDs: flushedUUIDsRef.current,
            initialName: replBridgeInitialName,
            perpetual
          });
          if (cancelled) {
            logForDebugging(`[bridge:repl] Hook: init cancelled during flight, tearing down${handle_0 ? ` env=${handle_0.environmentId}` : ""}`);
            if (handle_0) {
              void handle_0.teardown();
            }
            return;
          }
          if (!handle_0) {
            consecutiveFailuresRef.current++;
            logForDebugging(`[bridge:repl] Init returned null (precondition or session creation failed); consecutive failures: ${consecutiveFailuresRef.current}`);
            clearTimeout(failureTimeoutRef.current);
            setAppState((prev_13) => ({
              ...prev_13,
              replBridgeError: prev_13.replBridgeError ?? "check debug logs for details"
            }));
            failureTimeoutRef.current = setTimeout(() => {
              if (cancelled) return;
              failureTimeoutRef.current = void 0;
              setAppState((prev_14) => {
                if (!prev_14.replBridgeError) return prev_14;
                return {
                  ...prev_14,
                  replBridgeEnabled: false,
                  replBridgeError: void 0
                };
              });
            }, BRIDGE_FAILURE_DISMISS_MS);
            return;
          }
          handleRef.current = handle_0;
          setReplBridgeHandle(handle_0);
          consecutiveFailuresRef.current = 0;
          lastWrittenIndexRef.current = initialMessageCount;
          if (outboundOnly) {
            setAppState((prev_15) => {
              if (prev_15.replBridgeConnected && prev_15.replBridgeSessionId === handle_0.bridgeSessionId) return prev_15;
              return {
                ...prev_15,
                replBridgeConnected: true,
                replBridgeSessionId: handle_0.bridgeSessionId,
                replBridgeSessionUrl: void 0,
                replBridgeConnectUrl: void 0,
                replBridgeError: void 0
              };
            });
            logForDebugging(`[bridge:repl] Mirror initialized, session=${handle_0.bridgeSessionId}`);
          } else {
            const permissionCallbacks = {
              sendRequest(requestId_0, toolName, input, toolUseId, description, permissionSuggestions, blockedPath) {
                handle_0.sendControlRequest({
                  type: "control_request",
                  request_id: requestId_0,
                  request: {
                    subtype: "can_use_tool",
                    tool_name: toolName,
                    input,
                    tool_use_id: toolUseId,
                    description,
                    ...permissionSuggestions ? {
                      permission_suggestions: permissionSuggestions
                    } : {},
                    ...blockedPath ? {
                      blocked_path: blockedPath
                    } : {}
                  }
                });
              },
              sendResponse(requestId_1, response) {
                const payload = {
                  ...response
                };
                handle_0.sendControlResponse({
                  type: "control_response",
                  response: {
                    subtype: "success",
                    request_id: requestId_1,
                    response: payload
                  }
                });
              },
              cancelRequest(requestId_2) {
                handle_0.sendControlCancelRequest(requestId_2);
              },
              onResponse(requestId_3, handler_0) {
                pendingPermissionHandlers.set(requestId_3, handler_0);
                return () => {
                  pendingPermissionHandlers.delete(requestId_3);
                };
              }
            };
            setAppState((prev_16) => ({
              ...prev_16,
              replBridgePermissionCallbacks: permissionCallbacks
            }));
            const url = getRemoteSessionUrl(handle_0.bridgeSessionId, handle_0.sessionIngressUrl);
            const hasEnv = handle_0.environmentId !== "";
            const connectUrl_0 = hasEnv ? buildBridgeConnectUrl(handle_0.environmentId, handle_0.sessionIngressUrl) : void 0;
            setAppState((prev_17) => {
              if (prev_17.replBridgeConnected && prev_17.replBridgeSessionUrl === url) {
                return prev_17;
              }
              return {
                ...prev_17,
                replBridgeConnected: true,
                replBridgeSessionUrl: url,
                replBridgeConnectUrl: connectUrl_0 ?? prev_17.replBridgeConnectUrl,
                replBridgeEnvironmentId: handle_0.environmentId,
                replBridgeSessionId: handle_0.bridgeSessionId,
                replBridgeError: void 0
              };
            });
            const upgradeNudge = !perpetual ? await shouldShowAppUpgradeMessage().catch(() => false) : false;
            if (cancelled) return;
            setMessages((prev_18) => [...prev_18, createBridgeStatusMessage(url, upgradeNudge ? "Please upgrade to the latest version of the Claude mobile app to see your Remote Control sessions." : void 0)]);
            logForDebugging(`[bridge:repl] Hook initialized, session=${handle_0.bridgeSessionId}`);
          }
        } catch (err) {
          if (cancelled) return;
          consecutiveFailuresRef.current++;
          const errMsg = errorMessage(err);
          logForDebugging(`[bridge:repl] Init failed: ${errMsg}; consecutive failures: ${consecutiveFailuresRef.current}`);
          clearTimeout(failureTimeoutRef.current);
          notifyBridgeFailed(errMsg);
          setAppState((prev_0) => ({
            ...prev_0,
            replBridgeError: errMsg
          }));
          failureTimeoutRef.current = setTimeout(() => {
            if (cancelled) return;
            failureTimeoutRef.current = void 0;
            setAppState((prev_1) => {
              if (!prev_1.replBridgeError) return prev_1;
              return {
                ...prev_1,
                replBridgeEnabled: false,
                replBridgeError: void 0
              };
            });
          }, BRIDGE_FAILURE_DISMISS_MS);
          if (!outboundOnly) {
            setMessages((prev_2) => [...prev_2, createSystemMessage(`Remote Control failed to connect: ${errMsg}`, "warning")]);
          }
        }
      })();
      return () => {
        cancelled = true;
        clearTimeout(failureTimeoutRef.current);
        failureTimeoutRef.current = void 0;
        if (handleRef.current) {
          logForDebugging(`[bridge:repl] Hook cleanup: starting teardown for env=${handleRef.current.environmentId} session=${handleRef.current.bridgeSessionId}`);
          teardownPromiseRef.current = handleRef.current.teardown();
          handleRef.current = null;
          setReplBridgeHandle(null);
        }
        setAppState((prev_19) => {
          if (!prev_19.replBridgeConnected && !prev_19.replBridgeSessionActive && !prev_19.replBridgeError) {
            return prev_19;
          }
          return {
            ...prev_19,
            replBridgeConnected: false,
            replBridgeSessionActive: false,
            replBridgeReconnecting: false,
            replBridgeConnectUrl: void 0,
            replBridgeSessionUrl: void 0,
            replBridgeEnvironmentId: void 0,
            replBridgeSessionId: void 0,
            replBridgeError: void 0,
            replBridgePermissionCallbacks: void 0
          };
        });
        lastWrittenIndexRef.current = 0;
      };
    }
  }, [replBridgeEnabled, replBridgeOutboundOnly, setAppState, setMessages, addNotification]);
  useEffect(() => {
    if (false) {
      if (!replBridgeConnected) return;
      const handle_1 = handleRef.current;
      if (!handle_1) return;
      if (lastWrittenIndexRef.current > messages.length) {
        logForDebugging(`[bridge:repl] Compaction detected: lastWrittenIndex=${lastWrittenIndexRef.current} > messages.length=${messages.length}, clamping`);
      }
      const startIndex = Math.min(lastWrittenIndexRef.current, messages.length);
      const newMessages = [];
      for (let i = startIndex; i < messages.length; i++) {
        const msg_1 = messages[i];
        if (msg_1 && (msg_1.type === "user" || msg_1.type === "assistant" || msg_1.type === "system" && msg_1.subtype === "local_command")) {
          newMessages.push(msg_1);
        }
      }
      lastWrittenIndexRef.current = messages.length;
      if (newMessages.length > 0) {
        handle_1.writeMessages(newMessages);
      }
    }
  }, [messages, replBridgeConnected]);
  const sendBridgeResult = useCallback(() => {
    if (false) {
      handleRef.current?.sendResult();
    }
  }, []);
  return {
    sendBridgeResult
  };
}
export {
  BRIDGE_FAILURE_DISMISS_MS,
  useReplBridge
};
