import { logForDebugging } from "../utils/debug.js";
import { jsonParse, jsonStringify } from "../utils/slowOperations.js";
function isStdoutMessage(value) {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}
class DirectConnectSessionManager {
  ws = null;
  config;
  callbacks;
  constructor(config, callbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }
  connect() {
    const headers = {};
    if (this.config.authToken) {
      headers["authorization"] = `Bearer ${this.config.authToken}`;
    }
    this.ws = new WebSocket(this.config.wsUrl, {
      headers
    });
    this.ws.addEventListener("open", () => {
      this.callbacks.onConnected?.();
    });
    this.ws.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : "";
      const lines = data.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        let raw;
        try {
          raw = jsonParse(line);
        } catch {
          continue;
        }
        if (!isStdoutMessage(raw)) {
          continue;
        }
        const parsed = raw;
        if (parsed.type === "control_request") {
          if (parsed.request.subtype === "can_use_tool") {
            this.callbacks.onPermissionRequest(
              parsed.request,
              parsed.request_id
            );
          } else {
            logForDebugging(
              `[DirectConnect] Unsupported control request subtype: ${parsed.request.subtype}`
            );
            this.sendErrorResponse(
              parsed.request_id,
              `Unsupported control request subtype: ${parsed.request.subtype}`
            );
          }
          continue;
        }
        if (parsed.type !== "control_response" && parsed.type !== "keep_alive" && parsed.type !== "control_cancel_request" && parsed.type !== "streamlined_text" && parsed.type !== "streamlined_tool_use_summary" && !(parsed.type === "system" && parsed.subtype === "post_turn_summary")) {
          this.callbacks.onMessage(parsed);
        }
      }
    });
    this.ws.addEventListener("close", () => {
      this.callbacks.onDisconnected?.();
    });
    this.ws.addEventListener("error", () => {
      this.callbacks.onError?.(new Error("WebSocket connection error"));
    });
  }
  sendMessage(content) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    const message = jsonStringify({
      type: "user",
      message: {
        role: "user",
        content
      },
      parent_tool_use_id: null,
      session_id: ""
    });
    this.ws.send(message);
    return true;
  }
  respondToPermissionRequest(requestId, result) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const response = jsonStringify({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: requestId,
        response: {
          behavior: result.behavior,
          ...result.behavior === "allow" ? { updatedInput: result.updatedInput } : { message: result.message }
        }
      }
    });
    this.ws.send(response);
  }
  /**
   * Send an interrupt signal to cancel the current request
   */
  sendInterrupt() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const request = jsonStringify({
      type: "control_request",
      request_id: crypto.randomUUID(),
      request: {
        subtype: "interrupt"
      }
    });
    this.ws.send(request);
  }
  sendErrorResponse(requestId, error) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const response = jsonStringify({
      type: "control_response",
      response: {
        subtype: "error",
        request_id: requestId,
        error
      }
    });
    this.ws.send(response);
  }
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
export {
  DirectConnectSessionManager
};
