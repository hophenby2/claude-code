import { randomUUID } from "crypto";
import {
  createBridgeApiClient,
  BridgeFatalError,
  isExpiredErrorType,
  isSuppressible403
} from "./bridgeApi.js";
import { logForDebugging } from "../utils/debug.js";
import { logForDiagnosticsNoPII } from "../utils/diagLogs.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { registerCleanup } from "../utils/cleanupRegistry.js";
import {
  handleIngressMessage,
  handleServerControlRequest,
  makeResultMessage,
  isEligibleBridgeMessage,
  extractTitleText,
  BoundedUUIDSet
} from "./bridgeMessaging.js";
import {
  decodeWorkSecret,
  buildSdkUrl,
  buildCCRv2SdkUrl,
  sameSessionId
} from "./workSecret.js";
import { toCompatSessionId, toInfraSessionId } from "./sessionIdCompat.js";
import { updateSessionBridgeId } from "../utils/concurrentSessions.js";
import { getTrustedDeviceToken } from "./trustedDevice.js";
import { HybridTransport } from "../cli/transports/HybridTransport.js";
import {
  createV1ReplTransport,
  createV2ReplTransport
} from "./replBridgeTransport.js";
import { updateSessionIngressAuthToken } from "../utils/sessionIngressAuth.js";
import { isEnvTruthy, isInProtectedNamespace } from "../utils/envUtils.js";
import { validateBridgeId } from "./bridgeApi.js";
import {
  describeAxiosError,
  extractHttpStatus,
  logBridgeSkip
} from "./debugUtils.js";
import { createCapacityWake } from "./capacityWake.js";
import { FlushGate } from "./flushGate.js";
import {
  DEFAULT_POLL_CONFIG
} from "./pollConfigDefaults.js";
import { errorMessage } from "../utils/errors.js";
import { sleep } from "../utils/sleep.js";
import {
  wrapApiForFaultInjection,
  registerBridgeDebugHandle,
  clearBridgeDebugHandle,
  injectBridgeFault
} from "./bridgeDebug.js";
const POLL_ERROR_INITIAL_DELAY_MS = 2e3;
const POLL_ERROR_MAX_DELAY_MS = 6e4;
const POLL_ERROR_GIVE_UP_MS = 15 * 60 * 1e3;
let initSequence = 0;
async function initBridgeCore(params) {
  const {
    dir,
    machineName,
    branch,
    gitRepoUrl,
    title,
    baseUrl,
    sessionIngressUrl,
    workerType,
    getAccessToken,
    createSession,
    archiveSession,
    getCurrentTitle = () => title,
    toSDKMessages = () => {
      throw new Error(
        "BridgeCoreParams.toSDKMessages not provided. Pass it if you use writeMessages() or initialMessages \u2014 daemon callers that only use writeSdkMessages() never hit this path."
      );
    },
    onAuth401,
    getPollIntervalConfig = () => DEFAULT_POLL_CONFIG,
    initialHistoryCap = 200,
    initialMessages,
    previouslyFlushedUUIDs,
    onInboundMessage,
    onPermissionResponse,
    onInterrupt,
    onSetModel,
    onSetMaxThinkingTokens,
    onSetPermissionMode,
    onStateChange,
    onUserMessage,
    perpetual,
    initialSSESequenceNum = 0
  } = params;
  const seq = ++initSequence;
  const { writeBridgePointer, clearBridgePointer, readBridgePointer } = await import("./bridgePointer.js");
  const rawPrior = perpetual ? await readBridgePointer(dir) : null;
  const prior = rawPrior?.source === "repl" ? rawPrior : null;
  logForDebugging(
    `[bridge:repl] initBridgeCore #${seq} starting (initialMessages=${initialMessages?.length ?? 0}${prior ? ` perpetual prior=env:${prior.environmentId}` : ""})`
  );
  const rawApi = createBridgeApiClient({
    baseUrl,
    getAccessToken,
    runnerVersion: "0.0.0",
    onDebug: logForDebugging,
    onAuth401,
    getTrustedDeviceToken
  });
  const api = process.env.USER_TYPE === "ant" ? wrapApiForFaultInjection(rawApi) : rawApi;
  const bridgeConfig = {
    dir,
    machineName,
    branch,
    gitRepoUrl,
    maxSessions: 1,
    spawnMode: "single-session",
    verbose: false,
    sandbox: false,
    bridgeId: randomUUID(),
    workerType,
    environmentId: randomUUID(),
    reuseEnvironmentId: prior?.environmentId,
    apiBaseUrl: baseUrl,
    sessionIngressUrl
  };
  let environmentId;
  let environmentSecret;
  try {
    const reg = await api.registerBridgeEnvironment(bridgeConfig);
    environmentId = reg.environment_id;
    environmentSecret = reg.environment_secret;
  } catch (err) {
    logBridgeSkip(
      "registration_failed",
      `[bridge:repl] Environment registration failed: ${errorMessage(err)}`
    );
    if (prior) {
      await clearBridgePointer(dir);
    }
    onStateChange?.("failed", errorMessage(err));
    return null;
  }
  logForDebugging(`[bridge:repl] Environment registered: ${environmentId}`);
  logForDiagnosticsNoPII("info", "bridge_repl_env_registered");
  logEvent("tengu_bridge_repl_env_registered", {});
  async function tryReconnectInPlace(requestedEnvId, sessionId) {
    if (environmentId !== requestedEnvId) {
      logForDebugging(
        `[bridge:repl] Env mismatch (requested ${requestedEnvId}, got ${environmentId}) \u2014 cannot reconnect in place`
      );
      return false;
    }
    const infraId = toInfraSessionId(sessionId);
    const candidates = infraId === sessionId ? [sessionId] : [sessionId, infraId];
    for (const id of candidates) {
      try {
        await api.reconnectSession(environmentId, id);
        logForDebugging(
          `[bridge:repl] Reconnected session ${id} in place on env ${environmentId}`
        );
        return true;
      } catch (err) {
        logForDebugging(
          `[bridge:repl] reconnectSession(${id}) failed: ${errorMessage(err)}`
        );
      }
    }
    logForDebugging(
      "[bridge:repl] reconnectSession exhausted \u2014 falling through to fresh session"
    );
    return false;
  }
  const reusedPriorSession = prior ? await tryReconnectInPlace(prior.environmentId, prior.sessionId) : false;
  if (prior && !reusedPriorSession) {
    await clearBridgePointer(dir);
  }
  let currentSessionId;
  if (reusedPriorSession && prior) {
    currentSessionId = prior.sessionId;
    logForDebugging(
      `[bridge:repl] Perpetual session reused: ${currentSessionId}`
    );
    if (initialMessages && previouslyFlushedUUIDs) {
      for (const msg of initialMessages) {
        previouslyFlushedUUIDs.add(msg.uuid);
      }
    }
  } else {
    const createdSessionId = await createSession({
      environmentId,
      title,
      gitRepoUrl,
      branch,
      signal: AbortSignal.timeout(15e3)
    });
    if (!createdSessionId) {
      logForDebugging(
        "[bridge:repl] Session creation failed, deregistering environment"
      );
      logEvent("tengu_bridge_repl_session_failed", {});
      await api.deregisterEnvironment(environmentId).catch(() => {
      });
      onStateChange?.("failed", "Session creation failed");
      return null;
    }
    currentSessionId = createdSessionId;
    logForDebugging(`[bridge:repl] Session created: ${currentSessionId}`);
  }
  await writeBridgePointer(dir, {
    sessionId: currentSessionId,
    environmentId,
    source: "repl"
  });
  logForDiagnosticsNoPII("info", "bridge_repl_session_created");
  logEvent("tengu_bridge_repl_started", {
    has_initial_messages: !!(initialMessages && initialMessages.length > 0),
    inProtectedNamespace: isInProtectedNamespace()
  });
  const initialMessageUUIDs = /* @__PURE__ */ new Set();
  if (initialMessages) {
    for (const msg of initialMessages) {
      initialMessageUUIDs.add(msg.uuid);
    }
  }
  const recentPostedUUIDs = new BoundedUUIDSet(2e3);
  for (const uuid of initialMessageUUIDs) {
    recentPostedUUIDs.add(uuid);
  }
  const recentInboundUUIDs = new BoundedUUIDSet(2e3);
  const pollController = new AbortController();
  let transport = null;
  let v2Generation = 0;
  let lastTransportSequenceNum = reusedPriorSession ? initialSSESequenceNum : 0;
  let currentWorkId = null;
  let currentIngressToken = null;
  const capacityWake = createCapacityWake(pollController.signal);
  const wakePollLoop = capacityWake.wake;
  const capacitySignal = capacityWake.signal;
  const flushGate = new FlushGate();
  let userMessageCallbackDone = !onUserMessage;
  const MAX_ENVIRONMENT_RECREATIONS = 3;
  let environmentRecreations = 0;
  let reconnectPromise = null;
  async function reconnectEnvironmentWithSession() {
    if (reconnectPromise) {
      return reconnectPromise;
    }
    reconnectPromise = doReconnect();
    try {
      return await reconnectPromise;
    } finally {
      reconnectPromise = null;
    }
  }
  async function doReconnect() {
    environmentRecreations++;
    v2Generation++;
    logForDebugging(
      `[bridge:repl] Reconnecting after env lost (attempt ${environmentRecreations}/${MAX_ENVIRONMENT_RECREATIONS})`
    );
    if (environmentRecreations > MAX_ENVIRONMENT_RECREATIONS) {
      logForDebugging(
        `[bridge:repl] Environment reconnect limit reached (${MAX_ENVIRONMENT_RECREATIONS}), giving up`
      );
      return false;
    }
    if (transport) {
      const seq2 = transport.getLastSequenceNum();
      if (seq2 > lastTransportSequenceNum) {
        lastTransportSequenceNum = seq2;
      }
      transport.close();
      transport = null;
    }
    wakePollLoop();
    flushGate.drop();
    if (currentWorkId) {
      const workIdBeingCleared = currentWorkId;
      await api.stopWork(environmentId, workIdBeingCleared, false).catch(() => {
      });
      if (currentWorkId !== workIdBeingCleared) {
        logForDebugging(
          "[bridge:repl] Poll loop recovered during stopWork await \u2014 deferring to it"
        );
        environmentRecreations = 0;
        return true;
      }
      currentWorkId = null;
      currentIngressToken = null;
    }
    if (pollController.signal.aborted) {
      logForDebugging("[bridge:repl] Reconnect aborted by teardown");
      return false;
    }
    const requestedEnvId = environmentId;
    bridgeConfig.reuseEnvironmentId = requestedEnvId;
    try {
      const reg = await api.registerBridgeEnvironment(bridgeConfig);
      environmentId = reg.environment_id;
      environmentSecret = reg.environment_secret;
    } catch (err) {
      bridgeConfig.reuseEnvironmentId = void 0;
      logForDebugging(
        `[bridge:repl] Environment re-registration failed: ${errorMessage(err)}`
      );
      return false;
    }
    bridgeConfig.reuseEnvironmentId = void 0;
    logForDebugging(
      `[bridge:repl] Re-registered: requested=${requestedEnvId} got=${environmentId}`
    );
    if (pollController.signal.aborted) {
      logForDebugging(
        "[bridge:repl] Reconnect aborted after env registration, cleaning up"
      );
      await api.deregisterEnvironment(environmentId).catch(() => {
      });
      return false;
    }
    if (transport !== null) {
      logForDebugging(
        "[bridge:repl] Poll loop recovered during registerBridgeEnvironment await \u2014 deferring to it"
      );
      environmentRecreations = 0;
      return true;
    }
    if (await tryReconnectInPlace(requestedEnvId, currentSessionId)) {
      logEvent("tengu_bridge_repl_reconnected_in_place", {});
      environmentRecreations = 0;
      return true;
    }
    if (environmentId !== requestedEnvId) {
      logEvent("tengu_bridge_repl_env_expired_fresh_session", {});
    }
    await archiveSession(currentSessionId);
    if (pollController.signal.aborted) {
      logForDebugging(
        "[bridge:repl] Reconnect aborted after archive, cleaning up"
      );
      await api.deregisterEnvironment(environmentId).catch(() => {
      });
      return false;
    }
    const currentTitle = getCurrentTitle();
    const newSessionId = await createSession({
      environmentId,
      title: currentTitle,
      gitRepoUrl,
      branch,
      signal: AbortSignal.timeout(15e3)
    });
    if (!newSessionId) {
      logForDebugging(
        "[bridge:repl] Session creation failed during reconnection"
      );
      return false;
    }
    if (pollController.signal.aborted) {
      logForDebugging(
        "[bridge:repl] Reconnect aborted after session creation, cleaning up"
      );
      await archiveSession(newSessionId);
      return false;
    }
    currentSessionId = newSessionId;
    void updateSessionBridgeId(toCompatSessionId(newSessionId)).catch(() => {
    });
    lastTransportSequenceNum = 0;
    recentInboundUUIDs.clear();
    userMessageCallbackDone = !onUserMessage;
    logForDebugging(`[bridge:repl] Re-created session: ${currentSessionId}`);
    await writeBridgePointer(dir, {
      sessionId: currentSessionId,
      environmentId,
      source: "repl"
    });
    previouslyFlushedUUIDs?.clear();
    environmentRecreations = 0;
    return true;
  }
  function getOAuthToken() {
    return getAccessToken();
  }
  function drainFlushGate() {
    const msgs = flushGate.end();
    if (msgs.length === 0) return;
    if (!transport) {
      logForDebugging(
        `[bridge:repl] Cannot drain ${msgs.length} pending message(s): no transport`
      );
      return;
    }
    for (const msg of msgs) {
      recentPostedUUIDs.add(msg.uuid);
    }
    const sdkMessages = toSDKMessages(msgs);
    const events = sdkMessages.map((sdkMsg) => ({
      ...sdkMsg,
      session_id: currentSessionId
    }));
    logForDebugging(
      `[bridge:repl] Drained ${msgs.length} pending message(s) after flush`
    );
    void transport.writeBatch(events);
  }
  let doTeardownImpl = null;
  function triggerTeardown() {
    void doTeardownImpl?.();
  }
  function handleTransportPermanentClose(closeCode) {
    logForDebugging(
      `[bridge:repl] Transport permanently closed: code=${closeCode}`
    );
    logEvent("tengu_bridge_repl_ws_closed", {
      code: closeCode
    });
    if (transport) {
      const closedSeq = transport.getLastSequenceNum();
      if (closedSeq > lastTransportSequenceNum) {
        lastTransportSequenceNum = closedSeq;
      }
      transport = null;
    }
    wakePollLoop();
    const dropped = flushGate.drop();
    if (dropped > 0) {
      logForDebugging(
        `[bridge:repl] Dropping ${dropped} pending message(s) on transport close (code=${closeCode})`,
        { level: "warn" }
      );
    }
    if (closeCode === 1e3) {
      onStateChange?.("failed", "session ended");
      pollController.abort();
      triggerTeardown();
      return;
    }
    onStateChange?.(
      "reconnecting",
      `Remote Control connection lost (code ${closeCode})`
    );
    logForDebugging(
      `[bridge:repl] Transport reconnect budget exhausted (code=${closeCode}), attempting env reconnect`
    );
    void reconnectEnvironmentWithSession().then((success) => {
      if (success) return;
      if (pollController.signal.aborted) return;
      logForDebugging(
        "[bridge:repl] reconnectEnvironmentWithSession resolved false \u2014 tearing down"
      );
      logEvent("tengu_bridge_repl_reconnect_failed", {
        close_code: closeCode
      });
      onStateChange?.("failed", "reconnection failed");
      triggerTeardown();
    });
  }
  let sigusr2Handler;
  if (process.env.USER_TYPE === "ant" && process.platform !== "win32") {
    sigusr2Handler = () => {
      logForDebugging(
        "[bridge:repl] SIGUSR2 received \u2014 forcing doReconnect() for testing"
      );
      void reconnectEnvironmentWithSession();
    };
    process.on("SIGUSR2", sigusr2Handler);
  }
  let debugFireClose = null;
  if (process.env.USER_TYPE === "ant") {
    registerBridgeDebugHandle({
      fireClose: (code) => {
        if (!debugFireClose) {
          logForDebugging("[bridge:debug] fireClose: no transport wired yet");
          return;
        }
        logForDebugging(`[bridge:debug] fireClose(${code}) \u2014 injecting`);
        debugFireClose(code);
      },
      forceReconnect: () => {
        logForDebugging("[bridge:debug] forceReconnect \u2014 injecting");
        void reconnectEnvironmentWithSession();
      },
      injectFault: injectBridgeFault,
      wakePollLoop,
      describe: () => `env=${environmentId} session=${currentSessionId} transport=${transport?.getStateLabel() ?? "null"} workId=${currentWorkId ?? "null"}`
    });
  }
  const pollOpts = {
    api,
    getCredentials: () => ({ environmentId, environmentSecret }),
    signal: pollController.signal,
    getPollIntervalConfig,
    onStateChange,
    getWsState: () => transport?.getStateLabel() ?? "null",
    // REPL bridge is single-session: having any transport == at capacity.
    // No need to check isConnectedStatus() — even while the transport is
    // auto-reconnecting internally (up to 10 min), poll is heartbeat-only.
    isAtCapacity: () => transport !== null,
    capacitySignal,
    onFatalError: triggerTeardown,
    getHeartbeatInfo: () => {
      if (!currentWorkId || !currentIngressToken) {
        return null;
      }
      return {
        environmentId,
        workId: currentWorkId,
        sessionToken: currentIngressToken
      };
    },
    // Work-item JWT expired (or work gone). The transport is useless —
    // SSE reconnects and CCR writes use the same stale token. Without
    // this callback the poll loop would do a 10-min at-capacity backoff,
    // during which the work lease (300s TTL) expires and the server stops
    // forwarding prompts → ~25-min dead window observed in daemon logs.
    // Kill the transport + work state so isAtCapacity()=false; the loop
    // fast-polls and picks up the server's re-dispatched work in seconds.
    onHeartbeatFatal: (err) => {
      logForDebugging(
        `[bridge:repl] heartbeatWork fatal (status=${err.status}) \u2014 tearing down work item for fast re-dispatch`
      );
      if (transport) {
        const seq2 = transport.getLastSequenceNum();
        if (seq2 > lastTransportSequenceNum) {
          lastTransportSequenceNum = seq2;
        }
        transport.close();
        transport = null;
      }
      flushGate.drop();
      if (currentWorkId) {
        void api.stopWork(environmentId, currentWorkId, false).catch((e) => {
          logForDebugging(
            `[bridge:repl] stopWork after heartbeat fatal: ${errorMessage(e)}`
          );
        });
      }
      currentWorkId = null;
      currentIngressToken = null;
      wakePollLoop();
      onStateChange?.(
        "reconnecting",
        "Work item lease expired, fetching fresh token"
      );
    },
    async onEnvironmentLost() {
      const success = await reconnectEnvironmentWithSession();
      if (!success) {
        return null;
      }
      return { environmentId, environmentSecret };
    },
    onWorkReceived: (workSessionId, ingressToken, workId, serverUseCcrV2) => {
      if (transport?.isConnectedStatus()) {
        logForDebugging(
          `[bridge:repl] Work received while transport connected, replacing with fresh token (workId=${workId})`
        );
      }
      logForDebugging(
        `[bridge:repl] Work received: workId=${workId} workSessionId=${workSessionId} currentSessionId=${currentSessionId} match=${sameSessionId(workSessionId, currentSessionId)}`
      );
      void writeBridgePointer(dir, {
        sessionId: currentSessionId,
        environmentId,
        source: "repl"
      });
      if (!sameSessionId(workSessionId, currentSessionId)) {
        logForDebugging(
          `[bridge:repl] Rejecting foreign session: expected=${currentSessionId} got=${workSessionId}`
        );
        return;
      }
      currentWorkId = workId;
      currentIngressToken = ingressToken;
      const useCcrV2 = serverUseCcrV2 || isEnvTruthy(process.env.CLAUDE_BRIDGE_USE_CCR_V2);
      let v1OauthToken;
      if (!useCcrV2) {
        v1OauthToken = getOAuthToken();
        if (!v1OauthToken) {
          logForDebugging(
            "[bridge:repl] No OAuth token available for session ingress, skipping work"
          );
          return;
        }
        updateSessionIngressAuthToken(v1OauthToken);
      }
      logEvent("tengu_bridge_repl_work_received", {});
      if (transport) {
        const oldTransport = transport;
        transport = null;
        const oldSeq = oldTransport.getLastSequenceNum();
        if (oldSeq > lastTransportSequenceNum) {
          lastTransportSequenceNum = oldSeq;
        }
        oldTransport.close();
      }
      flushGate.deactivate();
      const onServerControlRequest = (request) => handleServerControlRequest(request, {
        transport,
        sessionId: currentSessionId,
        onInterrupt,
        onSetModel,
        onSetMaxThinkingTokens,
        onSetPermissionMode
      });
      let initialFlushDone = false;
      const wireTransport = (newTransport) => {
        transport = newTransport;
        newTransport.setOnConnect(() => {
          if (transport !== newTransport) return;
          logForDebugging("[bridge:repl] Ingress transport connected");
          logEvent("tengu_bridge_repl_ws_connected", {});
          if (!useCcrV2) {
            const freshToken = getOAuthToken();
            if (freshToken) {
              updateSessionIngressAuthToken(freshToken);
            }
          }
          teardownStarted = false;
          if (!initialFlushDone && initialMessages && initialMessages.length > 0) {
            initialFlushDone = true;
            const historyCap = initialHistoryCap;
            const eligibleMessages = initialMessages.filter(
              (m) => isEligibleBridgeMessage(m) && !previouslyFlushedUUIDs?.has(m.uuid)
            );
            const cappedMessages = historyCap > 0 && eligibleMessages.length > historyCap ? eligibleMessages.slice(-historyCap) : eligibleMessages;
            if (cappedMessages.length < eligibleMessages.length) {
              logForDebugging(
                `[bridge:repl] Capped initial flush: ${eligibleMessages.length} -> ${cappedMessages.length} (cap=${historyCap})`
              );
              logEvent("tengu_bridge_repl_history_capped", {
                eligible_count: eligibleMessages.length,
                capped_count: cappedMessages.length
              });
            }
            const sdkMessages = toSDKMessages(cappedMessages);
            if (sdkMessages.length > 0) {
              logForDebugging(
                `[bridge:repl] Flushing ${sdkMessages.length} initial message(s) via transport`
              );
              const events = sdkMessages.map((sdkMsg) => ({
                ...sdkMsg,
                session_id: currentSessionId
              }));
              const dropsBefore = newTransport.droppedBatchCount;
              void newTransport.writeBatch(events).then(() => {
                if (newTransport.droppedBatchCount > dropsBefore) {
                  logForDebugging(
                    `[bridge:repl] Initial flush dropped ${newTransport.droppedBatchCount - dropsBefore} batch(es) \u2014 not marking ${sdkMessages.length} UUID(s) as flushed`
                  );
                  return;
                }
                if (previouslyFlushedUUIDs) {
                  for (const sdkMsg of sdkMessages) {
                    if (sdkMsg.uuid) {
                      previouslyFlushedUUIDs.add(sdkMsg.uuid);
                    }
                  }
                }
              }).catch(
                (e) => logForDebugging(`[bridge:repl] Initial flush failed: ${e}`)
              ).finally(() => {
                if (transport !== newTransport) return;
                drainFlushGate();
                onStateChange?.("connected");
              });
            } else {
              drainFlushGate();
              onStateChange?.("connected");
            }
          } else if (!flushGate.active) {
            onStateChange?.("connected");
          }
        });
        newTransport.setOnData((data) => {
          handleIngressMessage(
            data,
            recentPostedUUIDs,
            recentInboundUUIDs,
            onInboundMessage,
            onPermissionResponse,
            onServerControlRequest
          );
        });
        debugFireClose = handleTransportPermanentClose;
        newTransport.setOnClose((closeCode) => {
          if (transport !== newTransport) return;
          handleTransportPermanentClose(closeCode);
        });
        if (!initialFlushDone && initialMessages && initialMessages.length > 0) {
          flushGate.start();
        }
        newTransport.connect();
      };
      v2Generation++;
      if (useCcrV2) {
        const sessionUrl = buildCCRv2SdkUrl(baseUrl, workSessionId);
        const thisGen = v2Generation;
        logForDebugging(
          `[bridge:repl] CCR v2: sessionUrl=${sessionUrl} session=${workSessionId} gen=${thisGen}`
        );
        void createV2ReplTransport({
          sessionUrl,
          ingressToken,
          sessionId: workSessionId,
          initialSequenceNum: lastTransportSequenceNum
        }).then(
          (t) => {
            if (pollController.signal.aborted) {
              t.close();
              return;
            }
            if (thisGen !== v2Generation) {
              logForDebugging(
                `[bridge:repl] CCR v2: discarding stale handshake gen=${thisGen} current=${v2Generation}`
              );
              t.close();
              return;
            }
            wireTransport(t);
          },
          (err) => {
            logForDebugging(
              `[bridge:repl] CCR v2: createV2ReplTransport failed: ${errorMessage(err)}`,
              { level: "error" }
            );
            logEvent("tengu_bridge_repl_ccr_v2_init_failed", {});
            if (thisGen !== v2Generation) return;
            if (currentWorkId) {
              void api.stopWork(environmentId, currentWorkId, false).catch((e) => {
                logForDebugging(
                  `[bridge:repl] stopWork after v2 init failure: ${errorMessage(e)}`
                );
              });
              currentWorkId = null;
              currentIngressToken = null;
            }
            wakePollLoop();
          }
        );
      } else {
        const wsUrl = buildSdkUrl(sessionIngressUrl, workSessionId);
        logForDebugging(`[bridge:repl] Ingress URL: ${wsUrl}`);
        logForDebugging(
          `[bridge:repl] Creating HybridTransport: session=${workSessionId}`
        );
        const oauthToken = v1OauthToken ?? "";
        wireTransport(
          createV1ReplTransport(
            new HybridTransport(
              new URL(wsUrl),
              {
                Authorization: `Bearer ${oauthToken}`,
                "anthropic-version": "2023-06-01"
              },
              workSessionId,
              () => ({
                Authorization: `Bearer ${getOAuthToken() ?? oauthToken}`,
                "anthropic-version": "2023-06-01"
              }),
              // Cap retries so a persistently-failing session-ingress can't
              // pin the uploader drain loop for the lifetime of the bridge.
              // 50 attempts ≈ 20 min (15s POST timeout + 8s backoff + jitter
              // per cycle at steady state). Bridge-only — 1P keeps indefinite.
              {
                maxConsecutiveFailures: 50,
                isBridge: true,
                onBatchDropped: () => {
                  onStateChange?.(
                    "reconnecting",
                    "Lost sync with Remote Control \u2014 events could not be delivered"
                  );
                  wakePollLoop();
                }
              }
            )
          )
        );
      }
    }
  };
  void startWorkPollLoop(pollOpts);
  const pointerRefreshTimer = perpetual ? setInterval(() => {
    if (reconnectPromise) return;
    void writeBridgePointer(dir, {
      sessionId: currentSessionId,
      environmentId,
      source: "repl"
    });
  }, 60 * 6e4) : null;
  pointerRefreshTimer?.unref?.();
  const keepAliveIntervalMs = getPollIntervalConfig().session_keepalive_interval_v2_ms;
  const keepAliveTimer = keepAliveIntervalMs > 0 ? setInterval(() => {
    if (!transport) return;
    logForDebugging("[bridge:repl] keep_alive sent");
    void transport.write({ type: "keep_alive" }).catch((err) => {
      logForDebugging(
        `[bridge:repl] keep_alive write failed: ${errorMessage(err)}`
      );
    });
  }, keepAliveIntervalMs) : null;
  keepAliveTimer?.unref?.();
  let teardownStarted = false;
  doTeardownImpl = async () => {
    if (teardownStarted) {
      logForDebugging(
        `[bridge:repl] Teardown already in progress, skipping duplicate call env=${environmentId} session=${currentSessionId}`
      );
      return;
    }
    teardownStarted = true;
    const teardownStart = Date.now();
    logForDebugging(
      `[bridge:repl] Teardown starting: env=${environmentId} session=${currentSessionId} workId=${currentWorkId ?? "none"} transportState=${transport?.getStateLabel() ?? "null"}`
    );
    if (pointerRefreshTimer !== null) {
      clearInterval(pointerRefreshTimer);
    }
    if (keepAliveTimer !== null) {
      clearInterval(keepAliveTimer);
    }
    if (sigusr2Handler) {
      process.off("SIGUSR2", sigusr2Handler);
    }
    if (process.env.USER_TYPE === "ant") {
      clearBridgeDebugHandle();
      debugFireClose = null;
    }
    pollController.abort();
    logForDebugging("[bridge:repl] Teardown: poll loop aborted");
    if (transport) {
      const finalSeq = transport.getLastSequenceNum();
      if (finalSeq > lastTransportSequenceNum) {
        lastTransportSequenceNum = finalSeq;
      }
    }
    if (perpetual) {
      transport = null;
      flushGate.drop();
      await writeBridgePointer(dir, {
        sessionId: currentSessionId,
        environmentId,
        source: "repl"
      });
      logForDebugging(
        `[bridge:repl] Teardown (perpetual): leaving env=${environmentId} session=${currentSessionId} alive on server, duration=${Date.now() - teardownStart}ms`
      );
      return;
    }
    const teardownTransport = transport;
    transport = null;
    flushGate.drop();
    if (teardownTransport) {
      void teardownTransport.write(makeResultMessage(currentSessionId));
    }
    const stopWorkP = currentWorkId ? api.stopWork(environmentId, currentWorkId, true).then(() => {
      logForDebugging("[bridge:repl] Teardown: stopWork completed");
    }).catch((err) => {
      logForDebugging(
        `[bridge:repl] Teardown stopWork failed: ${errorMessage(err)}`
      );
    }) : Promise.resolve();
    await Promise.all([stopWorkP, archiveSession(currentSessionId)]);
    teardownTransport?.close();
    logForDebugging("[bridge:repl] Teardown: transport closed");
    await api.deregisterEnvironment(environmentId).catch((err) => {
      logForDebugging(
        `[bridge:repl] Teardown deregister failed: ${errorMessage(err)}`
      );
    });
    await clearBridgePointer(dir);
    logForDebugging(
      `[bridge:repl] Teardown complete: env=${environmentId} duration=${Date.now() - teardownStart}ms`
    );
  };
  const unregister = registerCleanup(() => doTeardownImpl?.());
  logForDebugging(
    `[bridge:repl] Ready: env=${environmentId} session=${currentSessionId}`
  );
  onStateChange?.("ready");
  return {
    get bridgeSessionId() {
      return currentSessionId;
    },
    get environmentId() {
      return environmentId;
    },
    getSSESequenceNum() {
      const live = transport?.getLastSequenceNum() ?? 0;
      return Math.max(lastTransportSequenceNum, live);
    },
    sessionIngressUrl,
    writeMessages(messages) {
      const filtered = messages.filter(
        (m) => isEligibleBridgeMessage(m) && !initialMessageUUIDs.has(m.uuid) && !recentPostedUUIDs.has(m.uuid)
      );
      if (filtered.length === 0) return;
      if (!userMessageCallbackDone) {
        for (const m of filtered) {
          const text = extractTitleText(m);
          if (text !== void 0 && onUserMessage?.(text, currentSessionId)) {
            userMessageCallbackDone = true;
            break;
          }
        }
      }
      if (flushGate.enqueue(...filtered)) {
        logForDebugging(
          `[bridge:repl] Queued ${filtered.length} message(s) during initial flush`
        );
        return;
      }
      if (!transport) {
        const types = filtered.map((m) => m.type).join(",");
        logForDebugging(
          `[bridge:repl] Transport not configured, dropping ${filtered.length} message(s) [${types}] for session=${currentSessionId}`,
          { level: "warn" }
        );
        return;
      }
      for (const msg of filtered) {
        recentPostedUUIDs.add(msg.uuid);
      }
      logForDebugging(
        `[bridge:repl] Sending ${filtered.length} message(s) via transport`
      );
      const sdkMessages = toSDKMessages(filtered);
      const events = sdkMessages.map((sdkMsg) => ({
        ...sdkMsg,
        session_id: currentSessionId
      }));
      void transport.writeBatch(events);
    },
    writeSdkMessages(messages) {
      const filtered = messages.filter(
        (m) => !m.uuid || !recentPostedUUIDs.has(m.uuid)
      );
      if (filtered.length === 0) return;
      if (!transport) {
        logForDebugging(
          `[bridge:repl] Transport not configured, dropping ${filtered.length} SDK message(s) for session=${currentSessionId}`,
          { level: "warn" }
        );
        return;
      }
      for (const msg of filtered) {
        if (msg.uuid) recentPostedUUIDs.add(msg.uuid);
      }
      const events = filtered.map((m) => ({ ...m, session_id: currentSessionId }));
      void transport.writeBatch(events);
    },
    sendControlRequest(request) {
      if (!transport) {
        logForDebugging(
          "[bridge:repl] Transport not configured, skipping control_request"
        );
        return;
      }
      const event = { ...request, session_id: currentSessionId };
      void transport.write(event);
      logForDebugging(
        `[bridge:repl] Sent control_request request_id=${request.request_id}`
      );
    },
    sendControlResponse(response) {
      if (!transport) {
        logForDebugging(
          "[bridge:repl] Transport not configured, skipping control_response"
        );
        return;
      }
      const event = { ...response, session_id: currentSessionId };
      void transport.write(event);
      logForDebugging("[bridge:repl] Sent control_response");
    },
    sendControlCancelRequest(requestId) {
      if (!transport) {
        logForDebugging(
          "[bridge:repl] Transport not configured, skipping control_cancel_request"
        );
        return;
      }
      const event = {
        type: "control_cancel_request",
        request_id: requestId,
        session_id: currentSessionId
      };
      void transport.write(event);
      logForDebugging(
        `[bridge:repl] Sent control_cancel_request request_id=${requestId}`
      );
    },
    sendResult() {
      if (!transport) {
        logForDebugging(
          `[bridge:repl] sendResult: skipping, transport not configured session=${currentSessionId}`
        );
        return;
      }
      void transport.write(makeResultMessage(currentSessionId));
      logForDebugging(
        `[bridge:repl] Sent result for session=${currentSessionId}`
      );
    },
    async teardown() {
      unregister();
      await doTeardownImpl?.();
      logForDebugging("[bridge:repl] Torn down");
      logEvent("tengu_bridge_repl_teardown", {});
    }
  };
}
async function startWorkPollLoop({
  api,
  getCredentials,
  signal,
  onStateChange,
  onWorkReceived,
  onEnvironmentLost,
  getWsState,
  isAtCapacity,
  capacitySignal,
  onFatalError,
  getPollIntervalConfig = () => DEFAULT_POLL_CONFIG,
  getHeartbeatInfo,
  onHeartbeatFatal
}) {
  const MAX_ENVIRONMENT_RECREATIONS = 3;
  logForDebugging(
    `[bridge:repl] Starting work poll loop for env=${getCredentials().environmentId}`
  );
  let consecutiveErrors = 0;
  let firstErrorTime = null;
  let lastPollErrorTime = null;
  let environmentRecreations = 0;
  let suspensionDetected = false;
  while (!signal.aborted) {
    const { environmentId: envId, environmentSecret: envSecret } = getCredentials();
    const pollConfig = getPollIntervalConfig();
    try {
      const work = await api.pollForWork(
        envId,
        envSecret,
        signal,
        pollConfig.reclaim_older_than_ms
      );
      environmentRecreations = 0;
      if (consecutiveErrors > 0) {
        logForDebugging(
          `[bridge:repl] Poll recovered after ${consecutiveErrors} consecutive error(s)`
        );
        consecutiveErrors = 0;
        firstErrorTime = null;
        lastPollErrorTime = null;
        onStateChange?.("ready");
      }
      if (!work) {
        const skipAtCapacityOnce = suspensionDetected;
        suspensionDetected = false;
        if (isAtCapacity?.() && capacitySignal && !skipAtCapacityOnce) {
          const atCapMs = pollConfig.poll_interval_ms_at_capacity;
          if (pollConfig.non_exclusive_heartbeat_interval_ms > 0 && getHeartbeatInfo) {
            logEvent("tengu_bridge_heartbeat_mode_entered", {
              heartbeat_interval_ms: pollConfig.non_exclusive_heartbeat_interval_ms
            });
            const pollDeadline = atCapMs > 0 ? Date.now() + atCapMs : null;
            let needsBackoff = false;
            let hbCycles = 0;
            while (!signal.aborted && isAtCapacity() && (pollDeadline === null || Date.now() < pollDeadline)) {
              const hbConfig = getPollIntervalConfig();
              if (hbConfig.non_exclusive_heartbeat_interval_ms <= 0) break;
              const info = getHeartbeatInfo();
              if (!info) break;
              const cap = capacitySignal();
              try {
                await api.heartbeatWork(
                  info.environmentId,
                  info.workId,
                  info.sessionToken
                );
              } catch (err) {
                logForDebugging(
                  `[bridge:repl:heartbeat] Failed: ${errorMessage(err)}`
                );
                if (err instanceof BridgeFatalError) {
                  cap.cleanup();
                  logEvent("tengu_bridge_heartbeat_error", {
                    status: err.status,
                    error_type: err.status === 401 || err.status === 403 ? "auth_failed" : "fatal"
                  });
                  if (onHeartbeatFatal) {
                    onHeartbeatFatal(err);
                    logForDebugging(
                      `[bridge:repl:heartbeat] Fatal (status=${err.status}), work state cleared \u2014 fast-polling for re-dispatch`
                    );
                  } else {
                    needsBackoff = true;
                  }
                  break;
                }
              }
              hbCycles++;
              await sleep(
                hbConfig.non_exclusive_heartbeat_interval_ms,
                cap.signal
              );
              cap.cleanup();
            }
            const exitReason = needsBackoff ? "error" : signal.aborted ? "shutdown" : !isAtCapacity() ? "capacity_changed" : pollDeadline !== null && Date.now() >= pollDeadline ? "poll_due" : "config_disabled";
            logEvent("tengu_bridge_heartbeat_mode_exited", {
              reason: exitReason,
              heartbeat_cycles: hbCycles
            });
            if (!needsBackoff) {
              if (exitReason === "poll_due") {
                logForDebugging(
                  `[bridge:repl] Heartbeat poll_due after ${hbCycles} cycles \u2014 falling through to pollForWork`
                );
              }
              continue;
            }
          }
          const sleepMs = atCapMs > 0 ? atCapMs : pollConfig.non_exclusive_heartbeat_interval_ms;
          if (sleepMs > 0) {
            const cap = capacitySignal();
            const sleepStart = Date.now();
            await sleep(sleepMs, cap.signal);
            cap.cleanup();
            const overrun = Date.now() - sleepStart - sleepMs;
            if (overrun > 6e4) {
              logForDebugging(
                `[bridge:repl] At-capacity sleep overran by ${Math.round(overrun / 1e3)}s \u2014 process suspension detected, forcing one fast-poll cycle`
              );
              logEvent("tengu_bridge_repl_suspension_detected", {
                overrun_ms: overrun
              });
              suspensionDetected = true;
            }
          }
        } else {
          await sleep(pollConfig.poll_interval_ms_not_at_capacity, signal);
        }
        continue;
      }
      let secret;
      try {
        secret = decodeWorkSecret(work.secret);
      } catch (err) {
        logForDebugging(
          `[bridge:repl] Failed to decode work secret: ${errorMessage(err)}`
        );
        logEvent("tengu_bridge_repl_work_secret_failed", {});
        await api.stopWork(envId, work.id, false).catch(() => {
        });
        continue;
      }
      logForDebugging(`[bridge:repl] Acknowledging workId=${work.id}`);
      try {
        await api.acknowledgeWork(envId, work.id, secret.session_ingress_token);
      } catch (err) {
        logForDebugging(
          `[bridge:repl] Acknowledge failed workId=${work.id}: ${errorMessage(err)}`
        );
      }
      if (work.data.type === "healthcheck") {
        logForDebugging("[bridge:repl] Healthcheck received");
        continue;
      }
      if (work.data.type === "session") {
        const workSessionId = work.data.id;
        try {
          validateBridgeId(workSessionId, "session_id");
        } catch {
          logForDebugging(
            `[bridge:repl] Invalid session_id in work: ${workSessionId}`
          );
          continue;
        }
        onWorkReceived(
          workSessionId,
          secret.session_ingress_token,
          work.id,
          secret.use_code_sessions === true
        );
        logForDebugging("[bridge:repl] Work accepted, continuing poll loop");
      }
    } catch (err) {
      if (signal.aborted) break;
      if (err instanceof BridgeFatalError && err.status === 404 && onEnvironmentLost) {
        const currentEnvId = getCredentials().environmentId;
        if (envId !== currentEnvId) {
          logForDebugging(
            `[bridge:repl] Stale poll error for old env=${envId}, current env=${currentEnvId} \u2014 skipping onEnvironmentLost`
          );
          consecutiveErrors = 0;
          firstErrorTime = null;
          continue;
        }
        environmentRecreations++;
        logForDebugging(
          `[bridge:repl] Environment deleted, attempting re-registration (attempt ${environmentRecreations}/${MAX_ENVIRONMENT_RECREATIONS})`
        );
        logEvent("tengu_bridge_repl_env_lost", {
          attempt: environmentRecreations
        });
        if (environmentRecreations > MAX_ENVIRONMENT_RECREATIONS) {
          logForDebugging(
            `[bridge:repl] Environment re-registration limit reached (${MAX_ENVIRONMENT_RECREATIONS}), giving up`
          );
          onStateChange?.(
            "failed",
            "Environment deleted and re-registration limit reached"
          );
          onFatalError?.();
          break;
        }
        onStateChange?.("reconnecting", "environment lost, recreating session");
        const newCreds = await onEnvironmentLost();
        if (signal.aborted) break;
        if (newCreds) {
          consecutiveErrors = 0;
          firstErrorTime = null;
          onStateChange?.("ready");
          logForDebugging(
            `[bridge:repl] Re-registered environment: ${newCreds.environmentId}`
          );
          continue;
        }
        onStateChange?.(
          "failed",
          "Environment deleted and re-registration failed"
        );
        onFatalError?.();
        break;
      }
      if (err instanceof BridgeFatalError) {
        const isExpiry = isExpiredErrorType(err.errorType);
        const isSuppressible = isSuppressible403(err);
        logForDebugging(
          `[bridge:repl] Fatal poll error: ${err.message} (status=${err.status}, type=${err.errorType ?? "unknown"})${isSuppressible ? " (suppressed)" : ""}`
        );
        logEvent("tengu_bridge_repl_fatal_error", {
          status: err.status,
          error_type: err.errorType
        });
        logForDiagnosticsNoPII(
          isExpiry ? "info" : "error",
          "bridge_repl_fatal_error",
          { status: err.status, error_type: err.errorType }
        );
        if (!isSuppressible) {
          onStateChange?.(
            "failed",
            isExpiry ? "session expired \xB7 /remote-control to reconnect" : err.message
          );
        }
        onFatalError?.();
        break;
      }
      const now = Date.now();
      if (lastPollErrorTime !== null && now - lastPollErrorTime > POLL_ERROR_MAX_DELAY_MS * 2) {
        logForDebugging(
          `[bridge:repl] Detected system sleep (${Math.round((now - lastPollErrorTime) / 1e3)}s gap), resetting poll error budget`
        );
        logForDiagnosticsNoPII("info", "bridge_repl_poll_sleep_detected", {
          gapMs: now - lastPollErrorTime
        });
        consecutiveErrors = 0;
        firstErrorTime = null;
      }
      lastPollErrorTime = now;
      consecutiveErrors++;
      if (firstErrorTime === null) {
        firstErrorTime = now;
      }
      const elapsed = now - firstErrorTime;
      const httpStatus = extractHttpStatus(err);
      const errMsg = describeAxiosError(err);
      const wsLabel = getWsState?.() ?? "unknown";
      logForDebugging(
        `[bridge:repl] Poll error (attempt ${consecutiveErrors}, elapsed ${Math.round(elapsed / 1e3)}s, ws=${wsLabel}): ${errMsg}`
      );
      logEvent("tengu_bridge_repl_poll_error", {
        status: httpStatus,
        consecutiveErrors,
        elapsedMs: elapsed
      });
      if (consecutiveErrors === 1) {
        onStateChange?.("reconnecting", errMsg);
      }
      if (elapsed >= POLL_ERROR_GIVE_UP_MS) {
        logForDebugging(
          `[bridge:repl] Poll failures exceeded ${POLL_ERROR_GIVE_UP_MS / 1e3}s (${consecutiveErrors} errors), giving up`
        );
        logForDiagnosticsNoPII("info", "bridge_repl_poll_give_up");
        logEvent("tengu_bridge_repl_poll_give_up", {
          consecutiveErrors,
          elapsedMs: elapsed,
          lastStatus: httpStatus
        });
        onStateChange?.("failed", "connection to server lost");
        break;
      }
      const backoff = Math.min(
        POLL_ERROR_INITIAL_DELAY_MS * 2 ** (consecutiveErrors - 1),
        POLL_ERROR_MAX_DELAY_MS
      );
      if (getPollIntervalConfig().non_exclusive_heartbeat_interval_ms > 0) {
        const info = getHeartbeatInfo?.();
        if (info) {
          try {
            await api.heartbeatWork(
              info.environmentId,
              info.workId,
              info.sessionToken
            );
          } catch {
          }
        }
      }
      await sleep(backoff, signal);
    }
  }
  logForDebugging(
    `[bridge:repl] Work poll loop ended (aborted=${signal.aborted}) env=${getCredentials().environmentId}`
  );
}
export {
  POLL_ERROR_GIVE_UP_MS as _POLL_ERROR_GIVE_UP_MS_ForTesting,
  POLL_ERROR_INITIAL_DELAY_MS as _POLL_ERROR_INITIAL_DELAY_MS_ForTesting,
  POLL_ERROR_MAX_DELAY_MS as _POLL_ERROR_MAX_DELAY_MS_ForTesting,
  startWorkPollLoop as _startWorkPollLoopForTesting,
  initBridgeCore
};
