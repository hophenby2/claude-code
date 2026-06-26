const feature = (_name) => false;
import { randomUUID } from "crypto";
import { SDKControlElicitationResponseSchema } from "../entrypoints/sdk/controlSchemas.js";
import { hookJSONOutputSchema } from "../types/hooks.js";
import { logForDebugging } from "../utils/debug.js";
import { logForDiagnosticsNoPII } from "../utils/diagLogs.js";
import { AbortError } from "../utils/errors.js";
import {
  permissionPromptToolResultToPermissionDecision,
  outputSchema as permissionToolOutputSchema
} from "../utils/permissions/PermissionPromptToolResultSchema.js";
import { hasPermissionsToUseTool } from "../utils/permissions/permissions.js";
import { writeToStdout } from "../utils/process.js";
import { jsonStringify } from "../utils/slowOperations.js";
import { z } from "zod/v4";
import { notifyCommandLifecycle } from "../utils/commandLifecycle.js";
import { normalizeControlMessageKeys } from "../utils/controlMessageCompat.js";
import { executePermissionRequestHooks } from "../utils/hooks.js";
import {
  applyPermissionUpdates,
  persistPermissionUpdates
} from "../utils/permissions/PermissionUpdate.js";
import {
  notifySessionStateChanged
} from "../utils/sessionState.js";
import { jsonParse } from "../utils/slowOperations.js";
import { Stream } from "../utils/stream.js";
import { ndjsonSafeStringify } from "./ndjsonSafeStringify.js";
const SANDBOX_NETWORK_ACCESS_TOOL_NAME = "SandboxNetworkAccess";
function serializeDecisionReason(reason) {
  if (!reason) {
    return void 0;
  }
  if (false) {
    return reason.reason;
  }
  switch (reason.type) {
    case "rule":
    case "mode":
    case "subcommandResults":
    case "permissionPromptTool":
      return void 0;
    case "hook":
    case "asyncAgent":
    case "sandboxOverride":
    case "workingDir":
    case "safetyCheck":
    case "other":
      return reason.reason;
  }
}
function buildRequiresActionDetails(tool, input, toolUseID, requestId) {
  let description;
  try {
    description = tool.getActivityDescription?.(input) ?? tool.getToolUseSummary?.(input) ?? tool.userFacingName(input);
  } catch {
    description = tool.name;
  }
  return {
    tool_name: tool.name,
    action_description: description,
    tool_use_id: toolUseID,
    request_id: requestId,
    input
  };
}
const MAX_RESOLVED_TOOL_USE_IDS = 1e3;
class StructuredIO {
  constructor(input, replayUserMessages) {
    this.input = input;
    this.replayUserMessages = replayUserMessages;
    this.input = input;
    this.structuredInput = this.read();
  }
  input;
  replayUserMessages;
  structuredInput;
  pendingRequests = /* @__PURE__ */ new Map();
  // CCR external_metadata read back on worker start; null when the
  // transport doesn't restore. Assigned by RemoteIO.
  restoredWorkerState = Promise.resolve(null);
  inputClosed = false;
  unexpectedResponseCallback;
  // Tracks tool_use IDs that have been resolved through the normal permission
  // flow (or aborted by a hook). When a duplicate control_response arrives
  // after the original was already handled, this Set prevents the orphan
  // handler from re-processing it — which would push duplicate assistant
  // messages into mutableMessages and cause a 400 "tool_use ids must be unique"
  // error from the API.
  resolvedToolUseIds = /* @__PURE__ */ new Set();
  prependedLines = [];
  onControlRequestSent;
  onControlRequestResolved;
  // sendRequest() and print.ts both enqueue here; the drain loop is the
  // only writer. Prevents control_request from overtaking queued stream_events.
  outbound = new Stream();
  /**
   * Records a tool_use ID as resolved so that late/duplicate control_response
   * messages for the same tool are ignored by the orphan handler.
   */
  trackResolvedToolUseId(request) {
    if (request.request.subtype === "can_use_tool") {
      this.resolvedToolUseIds.add(request.request.tool_use_id);
      if (this.resolvedToolUseIds.size > MAX_RESOLVED_TOOL_USE_IDS) {
        const first = this.resolvedToolUseIds.values().next().value;
        if (first !== void 0) {
          this.resolvedToolUseIds.delete(first);
        }
      }
    }
  }
  /** Flush pending internal events. No-op for non-remote IO. Overridden by RemoteIO. */
  flushInternalEvents() {
    return Promise.resolve();
  }
  /** Internal-event queue depth. Overridden by RemoteIO; zero otherwise. */
  get internalEventsPending() {
    return 0;
  }
  /**
   * Queue a user turn to be yielded before the next message from this.input.
   * Works before iteration starts and mid-stream — read() re-checks
   * prependedLines between each yielded message.
   */
  prependUserMessage(content) {
    this.prependedLines.push(
      jsonStringify({
        type: "user",
        session_id: "",
        message: { role: "user", content },
        parent_tool_use_id: null
      }) + "\n"
    );
  }
  async *read() {
    let content = "";
    const splitAndProcess = async function* () {
      for (; ; ) {
        if (this.prependedLines.length > 0) {
          content = this.prependedLines.join("") + content;
          this.prependedLines = [];
        }
        const newline = content.indexOf("\n");
        if (newline === -1) break;
        const line = content.slice(0, newline);
        content = content.slice(newline + 1);
        const message = await this.processLine(line);
        if (message) {
          logForDiagnosticsNoPII("info", "cli_stdin_message_parsed", {
            type: message.type
          });
          yield message;
        }
      }
    }.bind(this);
    yield* splitAndProcess();
    for await (const block of this.input) {
      content += block;
      yield* splitAndProcess();
    }
    if (content) {
      const message = await this.processLine(content);
      if (message) {
        yield message;
      }
    }
    this.inputClosed = true;
    for (const request of this.pendingRequests.values()) {
      request.reject(
        new Error("Tool permission stream closed before response received")
      );
    }
  }
  getPendingPermissionRequests() {
    return Array.from(this.pendingRequests.values()).map((entry) => entry.request).filter((pr) => pr.request.subtype === "can_use_tool");
  }
  setUnexpectedResponseCallback(callback) {
    this.unexpectedResponseCallback = callback;
  }
  /**
   * Inject a control_response message to resolve a pending permission request.
   * Used by the bridge to feed permission responses from claude.ai into the
   * SDK permission flow.
   *
   * Also sends a control_cancel_request to the SDK consumer so its canUseTool
   * callback is aborted via the signal — otherwise the callback hangs.
   */
  injectControlResponse(response) {
    const requestId = response.response?.request_id;
    if (!requestId) return;
    const request = this.pendingRequests.get(requestId);
    if (!request) return;
    this.trackResolvedToolUseId(request.request);
    this.pendingRequests.delete(requestId);
    void this.write({
      type: "control_cancel_request",
      request_id: requestId
    });
    if (response.response.subtype === "error") {
      request.reject(new Error(response.response.error));
    } else {
      const result = response.response.response;
      if (request.schema) {
        try {
          request.resolve(request.schema.parse(result));
        } catch (error) {
          request.reject(error);
        }
      } else {
        request.resolve({});
      }
    }
  }
  /**
   * Register a callback invoked whenever a can_use_tool control_request
   * is written to stdout. Used by the bridge to forward permission
   * requests to claude.ai.
   */
  setOnControlRequestSent(callback) {
    this.onControlRequestSent = callback;
  }
  /**
   * Register a callback invoked when a can_use_tool control_response arrives
   * from the SDK consumer (via stdin). Used by the bridge to cancel the
   * stale permission prompt on claude.ai when the SDK consumer wins the race.
   */
  setOnControlRequestResolved(callback) {
    this.onControlRequestResolved = callback;
  }
  async processLine(line) {
    if (!line) {
      return void 0;
    }
    try {
      const message = normalizeControlMessageKeys(jsonParse(line));
      if (message.type === "keep_alive") {
        return void 0;
      }
      if (message.type === "update_environment_variables") {
        const keys = Object.keys(message.variables);
        for (const [key, value] of Object.entries(message.variables)) {
          process.env[key] = value;
        }
        logForDebugging(
          `[structuredIO] applied update_environment_variables: ${keys.join(", ")}`
        );
        return void 0;
      }
      if (message.type === "control_response") {
        const uuid = "uuid" in message && typeof message.uuid === "string" ? message.uuid : void 0;
        if (uuid) {
          notifyCommandLifecycle(uuid, "completed");
        }
        const request = this.pendingRequests.get(message.response.request_id);
        if (!request) {
          const responsePayload = message.response.subtype === "success" ? message.response.response : void 0;
          const toolUseID = responsePayload?.toolUseID;
          if (typeof toolUseID === "string" && this.resolvedToolUseIds.has(toolUseID)) {
            logForDebugging(
              `Ignoring duplicate control_response for already-resolved toolUseID=${toolUseID} request_id=${message.response.request_id}`
            );
            return void 0;
          }
          if (this.unexpectedResponseCallback) {
            await this.unexpectedResponseCallback(message);
          }
          return void 0;
        }
        this.trackResolvedToolUseId(request.request);
        this.pendingRequests.delete(message.response.request_id);
        if (request.request.request.subtype === "can_use_tool" && this.onControlRequestResolved) {
          this.onControlRequestResolved(message.response.request_id);
        }
        if (message.response.subtype === "error") {
          request.reject(new Error(message.response.error));
          return void 0;
        }
        const result = message.response.response;
        if (request.schema) {
          try {
            request.resolve(request.schema.parse(result));
          } catch (error) {
            request.reject(error);
          }
        } else {
          request.resolve({});
        }
        if (this.replayUserMessages) {
          return message;
        }
        return void 0;
      }
      if (message.type !== "user" && message.type !== "control_request" && message.type !== "assistant" && message.type !== "system") {
        logForDebugging(`Ignoring unknown message type: ${message.type}`, {
          level: "warn"
        });
        return void 0;
      }
      if (message.type === "control_request") {
        if (!message.request) {
          exitWithMessage(`Error: Missing request on control_request`);
        }
        return message;
      }
      if (message.type === "assistant" || message.type === "system") {
        return message;
      }
      if (message.message.role !== "user") {
        exitWithMessage(
          `Error: Expected message role 'user', got '${message.message.role}'`
        );
      }
      return message;
    } catch (error) {
      console.error(`Error parsing streaming input line: ${line}: ${error}`);
      process.exit(1);
    }
  }
  async write(message) {
    writeToStdout(ndjsonSafeStringify(message) + "\n");
  }
  async sendRequest(request, schema, signal, requestId = randomUUID()) {
    const message = {
      type: "control_request",
      request_id: requestId,
      request
    };
    if (this.inputClosed) {
      throw new Error("Stream closed");
    }
    if (signal?.aborted) {
      throw new Error("Request aborted");
    }
    this.outbound.enqueue(message);
    if (request.subtype === "can_use_tool" && this.onControlRequestSent) {
      this.onControlRequestSent(message);
    }
    const aborted = () => {
      this.outbound.enqueue({
        type: "control_cancel_request",
        request_id: requestId
      });
      const request2 = this.pendingRequests.get(requestId);
      if (request2) {
        this.trackResolvedToolUseId(request2.request);
        request2.reject(new AbortError());
      }
    };
    if (signal) {
      signal.addEventListener("abort", aborted, {
        once: true
      });
    }
    try {
      return await new Promise((resolve, reject) => {
        this.pendingRequests.set(requestId, {
          request: {
            type: "control_request",
            request_id: requestId,
            request
          },
          resolve: (result) => {
            resolve(result);
          },
          reject,
          schema
        });
      });
    } finally {
      if (signal) {
        signal.removeEventListener("abort", aborted);
      }
      this.pendingRequests.delete(requestId);
    }
  }
  createCanUseTool(onPermissionPrompt) {
    return async (tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision) => {
      const mainPermissionResult = forceDecision ?? await hasPermissionsToUseTool(
        tool,
        input,
        toolUseContext,
        assistantMessage,
        toolUseID
      );
      if (mainPermissionResult.behavior === "allow" || mainPermissionResult.behavior === "deny") {
        return mainPermissionResult;
      }
      const hookAbortController = new AbortController();
      const parentSignal = toolUseContext.abortController.signal;
      const onParentAbort = () => hookAbortController.abort();
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
      try {
        const hookPromise = executePermissionRequestHooksForSDK(
          tool.name,
          toolUseID,
          input,
          toolUseContext,
          mainPermissionResult.suggestions
        ).then((decision) => ({ source: "hook", decision }));
        const requestId = randomUUID();
        onPermissionPrompt?.(
          buildRequiresActionDetails(tool, input, toolUseID, requestId)
        );
        const sdkPromise = this.sendRequest(
          {
            subtype: "can_use_tool",
            tool_name: tool.name,
            input,
            permission_suggestions: mainPermissionResult.suggestions,
            blocked_path: mainPermissionResult.blockedPath,
            decision_reason: serializeDecisionReason(
              mainPermissionResult.decisionReason
            ),
            tool_use_id: toolUseID,
            agent_id: toolUseContext.agentId
          },
          permissionToolOutputSchema(),
          hookAbortController.signal,
          requestId
        ).then((result) => ({ source: "sdk", result }));
        const winner = await Promise.race([hookPromise, sdkPromise]);
        if (winner.source === "hook") {
          if (winner.decision) {
            sdkPromise.catch(() => {
            });
            hookAbortController.abort();
            return winner.decision;
          }
          const sdkResult = await sdkPromise;
          return permissionPromptToolResultToPermissionDecision(
            sdkResult.result,
            tool,
            input,
            toolUseContext
          );
        }
        return permissionPromptToolResultToPermissionDecision(
          winner.result,
          tool,
          input,
          toolUseContext
        );
      } catch (error) {
        return permissionPromptToolResultToPermissionDecision(
          {
            behavior: "deny",
            message: `Tool permission request failed: ${error}`,
            toolUseID
          },
          tool,
          input,
          toolUseContext
        );
      } finally {
        if (this.getPendingPermissionRequests().length === 0) {
          notifySessionStateChanged("running");
        }
        parentSignal.removeEventListener("abort", onParentAbort);
      }
    };
  }
  createHookCallback(callbackId, timeout) {
    return {
      type: "callback",
      timeout,
      callback: async (input, toolUseID, abort) => {
        try {
          const result = await this.sendRequest(
            {
              subtype: "hook_callback",
              callback_id: callbackId,
              input,
              tool_use_id: toolUseID || void 0
            },
            hookJSONOutputSchema(),
            abort
          );
          return result;
        } catch (error) {
          console.error(`Error in hook callback ${callbackId}:`, error);
          return {};
        }
      }
    };
  }
  /**
   * Sends an elicitation request to the SDK consumer and returns the response.
   */
  async handleElicitation(serverName, message, requestedSchema, signal, mode, url, elicitationId) {
    try {
      const result = await this.sendRequest(
        {
          subtype: "elicitation",
          mcp_server_name: serverName,
          message,
          mode,
          url,
          elicitation_id: elicitationId,
          requested_schema: requestedSchema
        },
        SDKControlElicitationResponseSchema(),
        signal
      );
      return result;
    } catch {
      return { action: "cancel" };
    }
  }
  /**
   * Creates a SandboxAskCallback that forwards sandbox network permission
   * requests to the SDK host as can_use_tool control_requests.
   *
   * This piggybacks on the existing can_use_tool protocol with a synthetic
   * tool name so that SDK hosts (VS Code, CCR, etc.) can prompt the user
   * for network access without requiring a new protocol subtype.
   */
  createSandboxAskCallback() {
    return async (hostPattern) => {
      try {
        const result = await this.sendRequest(
          {
            subtype: "can_use_tool",
            tool_name: SANDBOX_NETWORK_ACCESS_TOOL_NAME,
            input: { host: hostPattern.host },
            tool_use_id: randomUUID(),
            description: `Allow network connection to ${hostPattern.host}?`
          },
          permissionToolOutputSchema()
        );
        return result.behavior === "allow";
      } catch {
        return false;
      }
    };
  }
  /**
   * Sends an MCP message to an SDK server and waits for the response
   */
  async sendMcpMessage(serverName, message) {
    const response = await this.sendRequest(
      {
        subtype: "mcp_message",
        server_name: serverName,
        message
      },
      z.object({
        mcp_response: z.any()
      })
    );
    return response.mcp_response;
  }
}
function exitWithMessage(message) {
  console.error(message);
  process.exit(1);
}
async function executePermissionRequestHooksForSDK(toolName, toolUseID, input, toolUseContext, suggestions) {
  const appState = toolUseContext.getAppState();
  const permissionMode = appState.toolPermissionContext.mode;
  const hookGenerator = executePermissionRequestHooks(
    toolName,
    toolUseID,
    input,
    toolUseContext,
    permissionMode,
    suggestions,
    toolUseContext.abortController.signal
  );
  for await (const hookResult of hookGenerator) {
    if (hookResult.permissionRequestResult && (hookResult.permissionRequestResult.behavior === "allow" || hookResult.permissionRequestResult.behavior === "deny")) {
      const decision = hookResult.permissionRequestResult;
      if (decision.behavior === "allow") {
        const finalInput = decision.updatedInput || input;
        const permissionUpdates = decision.updatedPermissions ?? [];
        if (permissionUpdates.length > 0) {
          persistPermissionUpdates(permissionUpdates);
          const currentAppState = toolUseContext.getAppState();
          const updatedContext = applyPermissionUpdates(
            currentAppState.toolPermissionContext,
            permissionUpdates
          );
          toolUseContext.setAppState((prev) => {
            if (prev.toolPermissionContext === updatedContext) return prev;
            return { ...prev, toolPermissionContext: updatedContext };
          });
        }
        return {
          behavior: "allow",
          updatedInput: finalInput,
          userModified: false,
          decisionReason: {
            type: "hook",
            hookName: "PermissionRequest"
          }
        };
      } else {
        return {
          behavior: "deny",
          message: decision.message || "Permission denied by PermissionRequest hook",
          decisionReason: {
            type: "hook",
            hookName: "PermissionRequest"
          }
        };
      }
    }
  }
  return void 0;
}
export {
  SANDBOX_NETWORK_ACCESS_TOOL_NAME,
  StructuredIO
};
