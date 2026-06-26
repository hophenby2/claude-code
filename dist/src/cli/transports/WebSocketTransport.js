import { logEvent } from "../../services/analytics/index.js";
import { CircularBuffer } from "../../utils/CircularBuffer.js";
import { logForDebugging } from "../../utils/debug.js";
import { logForDiagnosticsNoPII } from "../../utils/diagLogs.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { getWebSocketTLSOptions } from "../../utils/mtls.js";
import {
  getWebSocketProxyAgent,
  getWebSocketProxyUrl
} from "../../utils/proxy.js";
import {
  registerSessionActivityCallback,
  unregisterSessionActivityCallback
} from "../../utils/sessionActivity.js";
import { jsonStringify } from "../../utils/slowOperations.js";
const KEEP_ALIVE_FRAME = '{"type":"keep_alive"}\n';
const DEFAULT_MAX_BUFFER_SIZE = 1e3;
const DEFAULT_BASE_RECONNECT_DELAY = 1e3;
const DEFAULT_MAX_RECONNECT_DELAY = 3e4;
const DEFAULT_RECONNECT_GIVE_UP_MS = 6e5;
const DEFAULT_PING_INTERVAL = 1e4;
const DEFAULT_KEEPALIVE_INTERVAL = 3e5;
const SLEEP_DETECTION_THRESHOLD_MS = DEFAULT_MAX_RECONNECT_DELAY * 2;
const PERMANENT_CLOSE_CODES = /* @__PURE__ */ new Set([
  1002,
  // protocol error — server rejected handshake (e.g. session reaped)
  4001,
  // session expired / not found
  4003
  // unauthorized
]);
class WebSocketTransport {
  ws = null;
  lastSentId = null;
  url;
  state = "idle";
  onData;
  onCloseCallback;
  onConnectCallback;
  headers;
  sessionId;
  autoReconnect;
  isBridge;
  // Reconnection state
  reconnectAttempts = 0;
  reconnectStartTime = null;
  reconnectTimer = null;
  lastReconnectAttemptTime = null;
  // Wall-clock of last WS data-frame activity (inbound message or outbound
  // ws.send). Used to compute idle time at close — the signal for diagnosing
  // proxy idle-timeout RSTs (e.g. Cloudflare 5-min). Excludes ping/pong
  // control frames (proxies don't count those).
  lastActivityTime = 0;
  // Ping interval for connection health checks
  pingInterval = null;
  pongReceived = true;
  // Periodic keep_alive data frames to reset proxy idle timers
  keepAliveInterval = null;
  // Message buffering for replay on reconnection
  messageBuffer;
  // Track which runtime's WS we're using so we can detach listeners
  // with the matching API (removeEventListener vs. off).
  isBunWs = false;
  // Captured at connect() time for handleOpenEvent timing. Stored as an
  // instance field so the onOpen handler can be a stable class-property
  // arrow function (removable in doDisconnect) instead of a closure over
  // a local variable.
  connectStartTime = 0;
  refreshHeaders;
  constructor(url, headers = {}, sessionId, refreshHeaders, options) {
    this.url = url;
    this.headers = headers;
    this.sessionId = sessionId;
    this.refreshHeaders = refreshHeaders;
    this.autoReconnect = options?.autoReconnect ?? true;
    this.isBridge = options?.isBridge ?? false;
    this.messageBuffer = new CircularBuffer(DEFAULT_MAX_BUFFER_SIZE);
  }
  async connect() {
    if (this.state !== "idle" && this.state !== "reconnecting") {
      logForDebugging(
        `WebSocketTransport: Cannot connect, current state is ${this.state}`,
        { level: "error" }
      );
      logForDiagnosticsNoPII("error", "cli_websocket_connect_failed");
      return;
    }
    this.state = "reconnecting";
    this.connectStartTime = Date.now();
    logForDebugging(`WebSocketTransport: Opening ${this.url.href}`);
    logForDiagnosticsNoPII("info", "cli_websocket_connect_opening");
    const headers = { ...this.headers };
    if (this.lastSentId) {
      headers["X-Last-Request-Id"] = this.lastSentId;
      logForDebugging(
        `WebSocketTransport: Adding X-Last-Request-Id header: ${this.lastSentId}`
      );
    }
    if (typeof Bun !== "undefined") {
      const ws = new globalThis.WebSocket(this.url.href, {
        headers,
        proxy: getWebSocketProxyUrl(this.url.href),
        tls: getWebSocketTLSOptions() || void 0
      });
      this.ws = ws;
      this.isBunWs = true;
      ws.addEventListener("open", this.onBunOpen);
      ws.addEventListener("message", this.onBunMessage);
      ws.addEventListener("error", this.onBunError);
      ws.addEventListener("close", this.onBunClose);
      ws.addEventListener("pong", this.onPong);
    } else {
      const { default: WS } = await import("ws");
      const ws = new WS(this.url.href, {
        headers,
        agent: getWebSocketProxyAgent(this.url.href),
        ...getWebSocketTLSOptions()
      });
      this.ws = ws;
      this.isBunWs = false;
      ws.on("open", this.onNodeOpen);
      ws.on("message", this.onNodeMessage);
      ws.on("error", this.onNodeError);
      ws.on("close", this.onNodeClose);
      ws.on("pong", this.onPong);
    }
  }
  // --- Bun (native WebSocket) event handlers ---
  // Stored as class-property arrow functions so they can be removed in
  // doDisconnect(). Without removal, each reconnect orphans the old WS
  // object + its 5 closures until GC, which accumulates under network
  // instability. Mirrors the pattern in src/utils/mcpWebSocketTransport.ts.
  onBunOpen = () => {
    this.handleOpenEvent();
    if (this.lastSentId) {
      this.replayBufferedMessages("");
    }
  };
  onBunMessage = (event) => {
    const message = typeof event.data === "string" ? event.data : String(event.data);
    this.lastActivityTime = Date.now();
    logForDiagnosticsNoPII("info", "cli_websocket_message_received", {
      length: message.length
    });
    if (this.onData) {
      this.onData(message);
    }
  };
  onBunError = () => {
    logForDebugging("WebSocketTransport: Error", {
      level: "error"
    });
    logForDiagnosticsNoPII("error", "cli_websocket_connect_error");
  };
  // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
  onBunClose = (event) => {
    const isClean = event.code === 1e3 || event.code === 1001;
    logForDebugging(
      `WebSocketTransport: Closed: ${event.code}`,
      isClean ? void 0 : { level: "error" }
    );
    logForDiagnosticsNoPII("error", "cli_websocket_connect_closed");
    this.handleConnectionError(event.code);
  };
  // --- Node (ws package) event handlers ---
  onNodeOpen = () => {
    const ws = this.ws;
    this.handleOpenEvent();
    if (!ws) return;
    const nws = ws;
    const upgradeResponse = nws.upgradeReq;
    if (upgradeResponse?.headers?.["x-last-request-id"]) {
      const serverLastId = upgradeResponse.headers["x-last-request-id"];
      this.replayBufferedMessages(serverLastId);
    }
  };
  onNodeMessage = (data) => {
    const message = data.toString();
    this.lastActivityTime = Date.now();
    logForDiagnosticsNoPII("info", "cli_websocket_message_received", {
      length: message.length
    });
    if (this.onData) {
      this.onData(message);
    }
  };
  onNodeError = (err) => {
    logForDebugging(`WebSocketTransport: Error: ${err.message}`, {
      level: "error"
    });
    logForDiagnosticsNoPII("error", "cli_websocket_connect_error");
  };
  onNodeClose = (code, _reason) => {
    const isClean = code === 1e3 || code === 1001;
    logForDebugging(
      `WebSocketTransport: Closed: ${code}`,
      isClean ? void 0 : { level: "error" }
    );
    logForDiagnosticsNoPII("error", "cli_websocket_connect_closed");
    this.handleConnectionError(code);
  };
  // --- Shared handlers ---
  onPong = () => {
    this.pongReceived = true;
  };
  handleOpenEvent() {
    const connectDuration = Date.now() - this.connectStartTime;
    logForDebugging("WebSocketTransport: Connected");
    logForDiagnosticsNoPII("info", "cli_websocket_connect_connected", {
      duration_ms: connectDuration
    });
    if (this.isBridge && this.reconnectStartTime !== null) {
      logEvent("tengu_ws_transport_reconnected", {
        attempts: this.reconnectAttempts,
        downtimeMs: Date.now() - this.reconnectStartTime
      });
    }
    this.reconnectAttempts = 0;
    this.reconnectStartTime = null;
    this.lastReconnectAttemptTime = null;
    this.lastActivityTime = Date.now();
    this.state = "connected";
    this.onConnectCallback?.();
    this.startPingInterval();
    this.startKeepaliveInterval();
    registerSessionActivityCallback(() => {
      void this.write({ type: "keep_alive" });
    });
  }
  sendLine(line) {
    if (!this.ws || this.state !== "connected") {
      logForDebugging("WebSocketTransport: Not connected");
      logForDiagnosticsNoPII("info", "cli_websocket_send_not_connected");
      return false;
    }
    try {
      this.ws.send(line);
      this.lastActivityTime = Date.now();
      return true;
    } catch (error) {
      logForDebugging(`WebSocketTransport: Failed to send: ${error}`, {
        level: "error"
      });
      logForDiagnosticsNoPII("error", "cli_websocket_send_error");
      this.handleConnectionError();
      return false;
    }
  }
  /**
   * Remove all listeners attached in connect() for the given WebSocket.
   * Without this, each reconnect orphans the old WS object + its closures
   * until GC — these accumulate under network instability. Mirrors the
   * pattern in src/utils/mcpWebSocketTransport.ts.
   */
  removeWsListeners(ws) {
    if (this.isBunWs) {
      const nws = ws;
      nws.removeEventListener("open", this.onBunOpen);
      nws.removeEventListener("message", this.onBunMessage);
      nws.removeEventListener("error", this.onBunError);
      nws.removeEventListener("close", this.onBunClose);
      nws.removeEventListener("pong", this.onPong);
    } else {
      const nws = ws;
      nws.off("open", this.onNodeOpen);
      nws.off("message", this.onNodeMessage);
      nws.off("error", this.onNodeError);
      nws.off("close", this.onNodeClose);
      nws.off("pong", this.onPong);
    }
  }
  doDisconnect() {
    this.stopPingInterval();
    this.stopKeepaliveInterval();
    unregisterSessionActivityCallback();
    if (this.ws) {
      this.removeWsListeners(this.ws);
      this.ws.close();
      this.ws = null;
    }
  }
  handleConnectionError(closeCode) {
    logForDebugging(
      `WebSocketTransport: Disconnected from ${this.url.href}` + (closeCode != null ? ` (code ${closeCode})` : "")
    );
    logForDiagnosticsNoPII("info", "cli_websocket_disconnected");
    if (this.isBridge) {
      logEvent("tengu_ws_transport_closed", {
        closeCode,
        msSinceLastActivity: this.lastActivityTime > 0 ? Date.now() - this.lastActivityTime : -1,
        // 'connected' = healthy drop (the Cloudflare case); 'reconnecting' =
        // connect-rejection mid-storm. State isn't mutated until the branches
        // below, so this reads the pre-close value.
        wasConnected: this.state === "connected",
        reconnectAttempts: this.reconnectAttempts
      });
    }
    this.doDisconnect();
    if (this.state === "closing" || this.state === "closed") return;
    let headersRefreshed = false;
    if (closeCode === 4003 && this.refreshHeaders) {
      const freshHeaders = this.refreshHeaders();
      if (freshHeaders.Authorization !== this.headers.Authorization) {
        Object.assign(this.headers, freshHeaders);
        headersRefreshed = true;
        logForDebugging(
          "WebSocketTransport: 4003 received but headers refreshed, scheduling reconnect"
        );
        logForDiagnosticsNoPII("info", "cli_websocket_4003_token_refreshed");
      }
    }
    if (closeCode != null && PERMANENT_CLOSE_CODES.has(closeCode) && !headersRefreshed) {
      logForDebugging(
        `WebSocketTransport: Permanent close code ${closeCode}, not reconnecting`,
        { level: "error" }
      );
      logForDiagnosticsNoPII("error", "cli_websocket_permanent_close", {
        closeCode
      });
      this.state = "closed";
      this.onCloseCallback?.(closeCode);
      return;
    }
    if (!this.autoReconnect) {
      this.state = "closed";
      this.onCloseCallback?.(closeCode);
      return;
    }
    const now = Date.now();
    if (!this.reconnectStartTime) {
      this.reconnectStartTime = now;
    }
    if (this.lastReconnectAttemptTime !== null && now - this.lastReconnectAttemptTime > SLEEP_DETECTION_THRESHOLD_MS) {
      logForDebugging(
        `WebSocketTransport: Detected system sleep (${Math.round((now - this.lastReconnectAttemptTime) / 1e3)}s gap), resetting reconnection budget`
      );
      logForDiagnosticsNoPII("info", "cli_websocket_sleep_detected", {
        gapMs: now - this.lastReconnectAttemptTime
      });
      this.reconnectStartTime = now;
      this.reconnectAttempts = 0;
    }
    this.lastReconnectAttemptTime = now;
    const elapsed = now - this.reconnectStartTime;
    if (elapsed < DEFAULT_RECONNECT_GIVE_UP_MS) {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (!headersRefreshed && this.refreshHeaders) {
        const freshHeaders = this.refreshHeaders();
        Object.assign(this.headers, freshHeaders);
        logForDebugging("WebSocketTransport: Refreshed headers for reconnect");
      }
      this.state = "reconnecting";
      this.reconnectAttempts++;
      const baseDelay = Math.min(
        DEFAULT_BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
        DEFAULT_MAX_RECONNECT_DELAY
      );
      const delay = Math.max(
        0,
        baseDelay + baseDelay * 0.25 * (2 * Math.random() - 1)
      );
      logForDebugging(
        `WebSocketTransport: Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}, ${Math.round(elapsed / 1e3)}s elapsed)`
      );
      logForDiagnosticsNoPII("error", "cli_websocket_reconnect_attempt", {
        reconnectAttempts: this.reconnectAttempts
      });
      if (this.isBridge) {
        logEvent("tengu_ws_transport_reconnecting", {
          attempt: this.reconnectAttempts,
          elapsedMs: elapsed,
          delayMs: Math.round(delay)
        });
      }
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        void this.connect();
      }, delay);
    } else {
      logForDebugging(
        `WebSocketTransport: Reconnection time budget exhausted after ${Math.round(elapsed / 1e3)}s for ${this.url.href}`,
        { level: "error" }
      );
      logForDiagnosticsNoPII("error", "cli_websocket_reconnect_exhausted", {
        reconnectAttempts: this.reconnectAttempts,
        elapsedMs: elapsed
      });
      this.state = "closed";
      if (this.onCloseCallback) {
        this.onCloseCallback(closeCode);
      }
    }
  }
  close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPingInterval();
    this.stopKeepaliveInterval();
    unregisterSessionActivityCallback();
    this.state = "closing";
    this.doDisconnect();
  }
  replayBufferedMessages(lastId) {
    const messages = this.messageBuffer.toArray();
    if (messages.length === 0) return;
    let startIndex = 0;
    if (lastId) {
      const lastConfirmedIndex = messages.findIndex(
        (message) => "uuid" in message && message.uuid === lastId
      );
      if (lastConfirmedIndex >= 0) {
        startIndex = lastConfirmedIndex + 1;
        const remaining = messages.slice(startIndex);
        this.messageBuffer.clear();
        this.messageBuffer.addAll(remaining);
        if (remaining.length === 0) {
          this.lastSentId = null;
        }
        logForDebugging(
          `WebSocketTransport: Evicted ${startIndex} confirmed messages, ${remaining.length} remaining`
        );
        logForDiagnosticsNoPII(
          "info",
          "cli_websocket_evicted_confirmed_messages",
          {
            evicted: startIndex,
            remaining: remaining.length
          }
        );
      }
    }
    const messagesToReplay = messages.slice(startIndex);
    if (messagesToReplay.length === 0) {
      logForDebugging("WebSocketTransport: No new messages to replay");
      logForDiagnosticsNoPII("info", "cli_websocket_no_messages_to_replay");
      return;
    }
    logForDebugging(
      `WebSocketTransport: Replaying ${messagesToReplay.length} buffered messages`
    );
    logForDiagnosticsNoPII("info", "cli_websocket_messages_to_replay", {
      count: messagesToReplay.length
    });
    for (const message of messagesToReplay) {
      const line = jsonStringify(message) + "\n";
      const success = this.sendLine(line);
      if (!success) {
        this.handleConnectionError();
        break;
      }
    }
  }
  isConnectedStatus() {
    return this.state === "connected";
  }
  isClosedStatus() {
    return this.state === "closed";
  }
  setOnData(callback) {
    this.onData = callback;
  }
  setOnConnect(callback) {
    this.onConnectCallback = callback;
  }
  setOnClose(callback) {
    this.onCloseCallback = callback;
  }
  getStateLabel() {
    return this.state;
  }
  async write(message) {
    if ("uuid" in message && typeof message.uuid === "string") {
      this.messageBuffer.add(message);
      this.lastSentId = message.uuid;
    }
    const line = jsonStringify(message) + "\n";
    if (this.state !== "connected") {
      return;
    }
    const sessionLabel = this.sessionId ? ` session=${this.sessionId}` : "";
    const detailLabel = this.getControlMessageDetailLabel(message);
    logForDebugging(
      `WebSocketTransport: Sending message type=${message.type}${sessionLabel}${detailLabel}`
    );
    this.sendLine(line);
  }
  getControlMessageDetailLabel(message) {
    if (message.type === "control_request") {
      const { request_id, request } = message;
      const toolName = request.subtype === "can_use_tool" ? request.tool_name : "";
      return ` subtype=${request.subtype} request_id=${request_id}${toolName ? ` tool=${toolName}` : ""}`;
    }
    if (message.type === "control_response") {
      const { subtype, request_id } = message.response;
      return ` subtype=${subtype} request_id=${request_id}`;
    }
    return "";
  }
  startPingInterval() {
    this.stopPingInterval();
    this.pongReceived = true;
    let lastTickTime = Date.now();
    this.pingInterval = setInterval(() => {
      if (this.state === "connected" && this.ws) {
        const now = Date.now();
        const gap = now - lastTickTime;
        lastTickTime = now;
        if (gap > SLEEP_DETECTION_THRESHOLD_MS) {
          logForDebugging(
            `WebSocketTransport: ${Math.round(gap / 1e3)}s tick gap detected \u2014 process was suspended, forcing reconnect`
          );
          logForDiagnosticsNoPII(
            "info",
            "cli_websocket_sleep_detected_on_ping",
            { gapMs: gap }
          );
          this.handleConnectionError();
          return;
        }
        if (!this.pongReceived) {
          logForDebugging(
            "WebSocketTransport: No pong received, connection appears dead",
            { level: "error" }
          );
          logForDiagnosticsNoPII("error", "cli_websocket_pong_timeout");
          this.handleConnectionError();
          return;
        }
        this.pongReceived = false;
        try {
          this.ws.ping?.();
        } catch (error) {
          logForDebugging(`WebSocketTransport: Ping failed: ${error}`, {
            level: "error"
          });
          logForDiagnosticsNoPII("error", "cli_websocket_ping_failed");
        }
      }
    }, DEFAULT_PING_INTERVAL);
  }
  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  startKeepaliveInterval() {
    this.stopKeepaliveInterval();
    if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) {
      return;
    }
    this.keepAliveInterval = setInterval(() => {
      if (this.state === "connected" && this.ws) {
        try {
          this.ws.send(KEEP_ALIVE_FRAME);
          this.lastActivityTime = Date.now();
          logForDebugging(
            "WebSocketTransport: Sent periodic keep_alive data frame"
          );
        } catch (error) {
          logForDebugging(
            `WebSocketTransport: Periodic keep_alive failed: ${error}`,
            { level: "error" }
          );
          logForDiagnosticsNoPII("error", "cli_websocket_keepalive_failed");
        }
      }
    }, DEFAULT_KEEPALIVE_INTERVAL);
  }
  stopKeepaliveInterval() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
}
export {
  WebSocketTransport
};
