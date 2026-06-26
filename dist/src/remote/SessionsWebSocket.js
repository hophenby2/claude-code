import { randomUUID } from "crypto";
import { getOauthConfig } from "../constants/oauth.js";
import { logForDebugging } from "../utils/debug.js";
import { errorMessage } from "../utils/errors.js";
import { logError } from "../utils/log.js";
import { getWebSocketTLSOptions } from "../utils/mtls.js";
import { getWebSocketProxyAgent, getWebSocketProxyUrl } from "../utils/proxy.js";
import { jsonParse, jsonStringify } from "../utils/slowOperations.js";
const RECONNECT_DELAY_MS = 2e3;
const MAX_RECONNECT_ATTEMPTS = 5;
const PING_INTERVAL_MS = 3e4;
const MAX_SESSION_NOT_FOUND_RETRIES = 3;
const PERMANENT_CLOSE_CODES = /* @__PURE__ */ new Set([
  4003
  // unauthorized
]);
function isSessionsMessage(value) {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  return typeof value.type === "string";
}
class SessionsWebSocket {
  constructor(sessionId, orgUuid, getAccessToken, callbacks) {
    this.sessionId = sessionId;
    this.orgUuid = orgUuid;
    this.getAccessToken = getAccessToken;
    this.callbacks = callbacks;
  }
  sessionId;
  orgUuid;
  getAccessToken;
  callbacks;
  ws = null;
  state = "closed";
  reconnectAttempts = 0;
  sessionNotFoundRetries = 0;
  pingInterval = null;
  reconnectTimer = null;
  /**
   * Connect to the sessions WebSocket endpoint
   */
  async connect() {
    if (this.state === "connecting") {
      logForDebugging("[SessionsWebSocket] Already connecting");
      return;
    }
    this.state = "connecting";
    const baseUrl = getOauthConfig().BASE_API_URL.replace("https://", "wss://");
    const url = `${baseUrl}/v1/sessions/ws/${this.sessionId}/subscribe?organization_uuid=${this.orgUuid}`;
    logForDebugging(`[SessionsWebSocket] Connecting to ${url}`);
    const accessToken = this.getAccessToken();
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "anthropic-version": "2023-06-01"
    };
    if (typeof Bun !== "undefined") {
      const ws = new globalThis.WebSocket(url, {
        headers,
        proxy: getWebSocketProxyUrl(url),
        tls: getWebSocketTLSOptions() || void 0
      });
      this.ws = ws;
      ws.addEventListener("open", () => {
        logForDebugging(
          "[SessionsWebSocket] Connection opened, authenticated via headers"
        );
        this.state = "connected";
        this.reconnectAttempts = 0;
        this.sessionNotFoundRetries = 0;
        this.startPingInterval();
        this.callbacks.onConnected?.();
      });
      ws.addEventListener("message", (event) => {
        const data = typeof event.data === "string" ? event.data : String(event.data);
        this.handleMessage(data);
      });
      ws.addEventListener("error", () => {
        const err = new Error("[SessionsWebSocket] WebSocket error");
        logError(err);
        this.callbacks.onError?.(err);
      });
      ws.addEventListener("close", (event) => {
        logForDebugging(
          `[SessionsWebSocket] Closed: code=${event.code} reason=${event.reason}`
        );
        this.handleClose(event.code);
      });
      ws.addEventListener("pong", () => {
        logForDebugging("[SessionsWebSocket] Pong received");
      });
    } else {
      const { default: WS } = await import("ws");
      const ws = new WS(url, {
        headers,
        agent: getWebSocketProxyAgent(url),
        ...getWebSocketTLSOptions()
      });
      this.ws = ws;
      ws.on("open", () => {
        logForDebugging(
          "[SessionsWebSocket] Connection opened, authenticated via headers"
        );
        this.state = "connected";
        this.reconnectAttempts = 0;
        this.sessionNotFoundRetries = 0;
        this.startPingInterval();
        this.callbacks.onConnected?.();
      });
      ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });
      ws.on("error", (err) => {
        logError(new Error(`[SessionsWebSocket] Error: ${err.message}`));
        this.callbacks.onError?.(err);
      });
      ws.on("close", (code, reason) => {
        logForDebugging(
          `[SessionsWebSocket] Closed: code=${code} reason=${reason.toString()}`
        );
        this.handleClose(code);
      });
      ws.on("pong", () => {
        logForDebugging("[SessionsWebSocket] Pong received");
      });
    }
  }
  /**
   * Handle incoming WebSocket message
   */
  handleMessage(data) {
    try {
      const message = jsonParse(data);
      if (isSessionsMessage(message)) {
        this.callbacks.onMessage(message);
      } else {
        logForDebugging(
          `[SessionsWebSocket] Ignoring message type: ${typeof message === "object" && message !== null && "type" in message ? String(message.type) : "unknown"}`
        );
      }
    } catch (error) {
      logError(
        new Error(
          `[SessionsWebSocket] Failed to parse message: ${errorMessage(error)}`
        )
      );
    }
  }
  /**
   * Handle WebSocket close
   */
  handleClose(closeCode) {
    this.stopPingInterval();
    if (this.state === "closed") {
      return;
    }
    this.ws = null;
    const previousState = this.state;
    this.state = "closed";
    if (PERMANENT_CLOSE_CODES.has(closeCode)) {
      logForDebugging(
        `[SessionsWebSocket] Permanent close code ${closeCode}, not reconnecting`
      );
      this.callbacks.onClose?.();
      return;
    }
    if (closeCode === 4001) {
      this.sessionNotFoundRetries++;
      if (this.sessionNotFoundRetries > MAX_SESSION_NOT_FOUND_RETRIES) {
        logForDebugging(
          `[SessionsWebSocket] 4001 retry budget exhausted (${MAX_SESSION_NOT_FOUND_RETRIES}), not reconnecting`
        );
        this.callbacks.onClose?.();
        return;
      }
      this.scheduleReconnect(
        RECONNECT_DELAY_MS * this.sessionNotFoundRetries,
        `4001 attempt ${this.sessionNotFoundRetries}/${MAX_SESSION_NOT_FOUND_RETRIES}`
      );
      return;
    }
    if (previousState === "connected" && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      this.scheduleReconnect(
        RECONNECT_DELAY_MS,
        `attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
      );
    } else {
      logForDebugging("[SessionsWebSocket] Not reconnecting");
      this.callbacks.onClose?.();
    }
  }
  scheduleReconnect(delay, label) {
    this.callbacks.onReconnecting?.();
    logForDebugging(
      `[SessionsWebSocket] Scheduling reconnect (${label}) in ${delay}ms`
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
  startPingInterval() {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.state === "connected") {
        try {
          this.ws.ping?.();
        } catch {
        }
      }
    }, PING_INTERVAL_MS);
  }
  /**
   * Stop ping interval
   */
  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  /**
   * Send a control response back to the session
   */
  sendControlResponse(response) {
    if (!this.ws || this.state !== "connected") {
      logError(new Error("[SessionsWebSocket] Cannot send: not connected"));
      return;
    }
    logForDebugging("[SessionsWebSocket] Sending control response");
    this.ws.send(jsonStringify(response));
  }
  /**
   * Send a control request to the session (e.g., interrupt)
   */
  sendControlRequest(request) {
    if (!this.ws || this.state !== "connected") {
      logError(new Error("[SessionsWebSocket] Cannot send: not connected"));
      return;
    }
    const controlRequest = {
      type: "control_request",
      request_id: randomUUID(),
      request
    };
    logForDebugging(
      `[SessionsWebSocket] Sending control request: ${request.subtype}`
    );
    this.ws.send(jsonStringify(controlRequest));
  }
  /**
   * Check if connected
   */
  isConnected() {
    return this.state === "connected";
  }
  /**
   * Close the WebSocket connection
   */
  close() {
    logForDebugging("[SessionsWebSocket] Closing connection");
    this.state = "closed";
    this.stopPingInterval();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  /**
   * Force reconnect - closes existing connection and establishes a new one.
   * Useful when the subscription becomes stale (e.g., after container shutdown).
   */
  reconnect() {
    logForDebugging("[SessionsWebSocket] Force reconnecting");
    this.reconnectAttempts = 0;
    this.sessionNotFoundRetries = 0;
    this.close();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, 500);
  }
}
export {
  SessionsWebSocket
};
