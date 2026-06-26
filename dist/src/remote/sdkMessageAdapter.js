import { logForDebugging } from "../utils/debug.js";
import { fromSDKCompactMetadata } from "../utils/messages/mappers.js";
import { createUserMessage } from "../utils/messages.js";
function convertAssistantMessage(msg) {
  return {
    type: "assistant",
    message: msg.message,
    uuid: msg.uuid,
    requestId: void 0,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    error: msg.error
  };
}
function convertStreamEvent(msg) {
  return {
    type: "stream_event",
    event: msg.event
  };
}
function convertResultMessage(msg) {
  const isError = msg.subtype !== "success";
  const content = isError ? msg.errors?.join(", ") || "Unknown error" : "Session completed successfully";
  return {
    type: "system",
    subtype: "informational",
    content,
    level: isError ? "warning" : "info",
    uuid: msg.uuid,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function convertInitMessage(msg) {
  return {
    type: "system",
    subtype: "informational",
    content: `Remote session initialized (model: ${msg.model})`,
    level: "info",
    uuid: msg.uuid,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function convertStatusMessage(msg) {
  if (!msg.status) {
    return null;
  }
  return {
    type: "system",
    subtype: "informational",
    content: msg.status === "compacting" ? "Compacting conversation\u2026" : `Status: ${msg.status}`,
    level: "info",
    uuid: msg.uuid,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function convertToolProgressMessage(msg) {
  return {
    type: "system",
    subtype: "informational",
    content: `Tool ${msg.tool_name} running for ${msg.elapsed_time_seconds}s\u2026`,
    level: "info",
    uuid: msg.uuid,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    toolUseID: msg.tool_use_id
  };
}
function convertCompactBoundaryMessage(msg) {
  return {
    type: "system",
    subtype: "compact_boundary",
    content: "Conversation compacted",
    level: "info",
    uuid: msg.uuid,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    compactMetadata: fromSDKCompactMetadata(msg.compact_metadata)
  };
}
function convertSDKMessage(msg, opts) {
  switch (msg.type) {
    case "assistant":
      return { type: "message", message: convertAssistantMessage(msg) };
    case "user": {
      const content = msg.message?.content;
      const isToolResult = Array.isArray(content) && content.some((b) => b.type === "tool_result");
      if (opts?.convertToolResults && isToolResult) {
        return {
          type: "message",
          message: createUserMessage({
            content,
            toolUseResult: msg.tool_use_result,
            uuid: msg.uuid,
            timestamp: msg.timestamp
          })
        };
      }
      if (opts?.convertUserTextMessages && !isToolResult) {
        if (typeof content === "string" || Array.isArray(content)) {
          return {
            type: "message",
            message: createUserMessage({
              content,
              toolUseResult: msg.tool_use_result,
              uuid: msg.uuid,
              timestamp: msg.timestamp
            })
          };
        }
      }
      return { type: "ignored" };
    }
    case "stream_event":
      return { type: "stream_event", event: convertStreamEvent(msg) };
    case "result":
      if (msg.subtype !== "success") {
        return { type: "message", message: convertResultMessage(msg) };
      }
      return { type: "ignored" };
    case "system":
      if (msg.subtype === "init") {
        return { type: "message", message: convertInitMessage(msg) };
      }
      if (msg.subtype === "status") {
        const statusMsg = convertStatusMessage(msg);
        return statusMsg ? { type: "message", message: statusMsg } : { type: "ignored" };
      }
      if (msg.subtype === "compact_boundary") {
        return {
          type: "message",
          message: convertCompactBoundaryMessage(msg)
        };
      }
      logForDebugging(
        `[sdkMessageAdapter] Ignoring system message subtype: ${msg.subtype}`
      );
      return { type: "ignored" };
    case "tool_progress":
      return { type: "message", message: convertToolProgressMessage(msg) };
    case "auth_status":
      logForDebugging("[sdkMessageAdapter] Ignoring auth_status message");
      return { type: "ignored" };
    case "tool_use_summary":
      logForDebugging("[sdkMessageAdapter] Ignoring tool_use_summary message");
      return { type: "ignored" };
    case "rate_limit_event":
      logForDebugging("[sdkMessageAdapter] Ignoring rate_limit_event message");
      return { type: "ignored" };
    default: {
      logForDebugging(
        `[sdkMessageAdapter] Unknown message type: ${msg.type}`
      );
      return { type: "ignored" };
    }
  }
}
function isSessionEndMessage(msg) {
  return msg.type === "result";
}
function isSuccessResult(msg) {
  return msg.subtype === "success";
}
function getResultText(msg) {
  if (msg.subtype === "success") {
    return msg.result;
  }
  return null;
}
export {
  convertSDKMessage,
  getResultText,
  isSessionEndMessage,
  isSuccessResult
};
