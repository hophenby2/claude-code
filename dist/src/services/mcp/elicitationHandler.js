import {
  ElicitationCompleteNotificationSchema,
  ElicitRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import {
  executeElicitationHooks,
  executeElicitationResultHooks,
  executeNotificationHooks
} from "../../utils/hooks.js";
import { logMCPDebug, logMCPError } from "../../utils/log.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import {
  logEvent
} from "../analytics/index.js";
function getElicitationMode(params) {
  return params.mode === "url" ? "url" : "form";
}
function findElicitationInQueue(queue, serverName, elicitationId) {
  return queue.findIndex(
    (e) => e.serverName === serverName && e.params.mode === "url" && "elicitationId" in e.params && e.params.elicitationId === elicitationId
  );
}
function registerElicitationHandler(client, serverName, setAppState) {
  try {
    client.setRequestHandler(ElicitRequestSchema, async (request, extra) => {
      logMCPDebug(
        serverName,
        `Received elicitation request: ${jsonStringify(request)}`
      );
      const mode = getElicitationMode(request.params);
      logEvent("tengu_mcp_elicitation_shown", {
        mode
      });
      try {
        const hookResponse = await runElicitationHooks(
          serverName,
          request.params,
          extra.signal
        );
        if (hookResponse) {
          logMCPDebug(
            serverName,
            `Elicitation resolved by hook: ${jsonStringify(hookResponse)}`
          );
          logEvent("tengu_mcp_elicitation_response", {
            mode,
            action: hookResponse.action
          });
          return hookResponse;
        }
        const elicitationId = mode === "url" && "elicitationId" in request.params ? request.params.elicitationId : void 0;
        const response = new Promise((resolve) => {
          const onAbort = () => {
            resolve({ action: "cancel" });
          };
          if (extra.signal.aborted) {
            onAbort();
            return;
          }
          const waitingState = elicitationId ? { actionLabel: "Skip confirmation" } : void 0;
          setAppState((prev) => ({
            ...prev,
            elicitation: {
              queue: [
                ...prev.elicitation.queue,
                {
                  serverName,
                  requestId: extra.requestId,
                  params: request.params,
                  signal: extra.signal,
                  waitingState,
                  respond: (result2) => {
                    extra.signal.removeEventListener("abort", onAbort);
                    logEvent("tengu_mcp_elicitation_response", {
                      mode,
                      action: result2.action
                    });
                    resolve(result2);
                  }
                }
              ]
            }
          }));
          extra.signal.addEventListener("abort", onAbort, { once: true });
        });
        const rawResult = await response;
        logMCPDebug(
          serverName,
          `Elicitation response: ${jsonStringify(rawResult)}`
        );
        const result = await runElicitationResultHooks(
          serverName,
          rawResult,
          extra.signal,
          mode,
          elicitationId
        );
        return result;
      } catch (error) {
        logMCPError(serverName, `Elicitation error: ${error}`);
        return { action: "cancel" };
      }
    });
    client.setNotificationHandler(
      ElicitationCompleteNotificationSchema,
      (notification) => {
        const { elicitationId } = notification.params;
        logMCPDebug(
          serverName,
          `Received elicitation completion notification: ${elicitationId}`
        );
        void executeNotificationHooks({
          message: `MCP server "${serverName}" confirmed elicitation ${elicitationId} complete`,
          notificationType: "elicitation_complete"
        });
        let found = false;
        setAppState((prev) => {
          const idx = findElicitationInQueue(
            prev.elicitation.queue,
            serverName,
            elicitationId
          );
          if (idx === -1) return prev;
          found = true;
          const queue = [...prev.elicitation.queue];
          queue[idx] = { ...queue[idx], completed: true };
          return { ...prev, elicitation: { queue } };
        });
        if (!found) {
          logMCPDebug(
            serverName,
            `Ignoring completion notification for unknown elicitation: ${elicitationId}`
          );
        }
      }
    );
  } catch {
    return;
  }
}
async function runElicitationHooks(serverName, params, signal) {
  try {
    const mode = params.mode === "url" ? "url" : "form";
    const url = "url" in params ? params.url : void 0;
    const elicitationId = "elicitationId" in params ? params.elicitationId : void 0;
    const { elicitationResponse, blockingError } = await executeElicitationHooks({
      serverName,
      message: params.message,
      requestedSchema: "requestedSchema" in params ? params.requestedSchema : void 0,
      signal,
      mode,
      url,
      elicitationId
    });
    if (blockingError) {
      return { action: "decline" };
    }
    if (elicitationResponse) {
      return {
        action: elicitationResponse.action,
        content: elicitationResponse.content
      };
    }
    return void 0;
  } catch (error) {
    logMCPError(serverName, `Elicitation hook error: ${error}`);
    return void 0;
  }
}
async function runElicitationResultHooks(serverName, result, signal, mode, elicitationId) {
  try {
    const { elicitationResultResponse, blockingError } = await executeElicitationResultHooks({
      serverName,
      action: result.action,
      content: result.content,
      signal,
      mode,
      elicitationId
    });
    if (blockingError) {
      void executeNotificationHooks({
        message: `Elicitation response for server "${serverName}": decline`,
        notificationType: "elicitation_response"
      });
      return { action: "decline" };
    }
    const finalResult = elicitationResultResponse ? {
      action: elicitationResultResponse.action,
      content: elicitationResultResponse.content ?? result.content
    } : result;
    void executeNotificationHooks({
      message: `Elicitation response for server "${serverName}": ${finalResult.action}`,
      notificationType: "elicitation_response"
    });
    return finalResult;
  } catch (error) {
    logMCPError(serverName, `ElicitationResult hook error: ${error}`);
    void executeNotificationHooks({
      message: `Elicitation response for server "${serverName}": ${result.action}`,
      notificationType: "elicitation_response"
    });
    return result;
  }
}
export {
  registerElicitationHandler,
  runElicitationHooks,
  runElicitationResultHooks
};
