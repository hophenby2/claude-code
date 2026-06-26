import "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import { APIUserAbortError } from "@anthropic-ai/sdk";
import "../ink.js";
import "../tools/BashTool/bashPermissions.js";
import "../tools/BashTool/toolName.js";
import "../utils/autoModeDenials.js";
import { clearClassifierChecking } from "../utils/classifierApprovals.js";
import { logForDebugging } from "../utils/debug.js";
import { AbortError } from "../utils/errors.js";
import { logError } from "../utils/log.js";
import { hasPermissionsToUseTool } from "../utils/permissions/permissions.js";
import { handleCoordinatorPermission } from "./toolPermission/handlers/coordinatorHandler.js";
import { handleInteractivePermission } from "./toolPermission/handlers/interactiveHandler.js";
import { handleSwarmWorkerPermission } from "./toolPermission/handlers/swarmWorkerHandler.js";
import { createPermissionContext, createPermissionQueueOps } from "./toolPermission/PermissionContext.js";
import { logPermissionDecision } from "./toolPermission/permissionLogging.js";
function useCanUseTool(setToolUseConfirmQueue, setToolPermissionContext) {
  const $ = _c(3);
  let t0;
  if ($[0] !== setToolPermissionContext || $[1] !== setToolUseConfirmQueue) {
    t0 = async (tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision) => new Promise((resolve) => {
      const ctx = createPermissionContext(tool, input, toolUseContext, assistantMessage, toolUseID, setToolPermissionContext, createPermissionQueueOps(setToolUseConfirmQueue));
      if (ctx.resolveIfAborted(resolve)) {
        return;
      }
      const decisionPromise = forceDecision !== void 0 ? Promise.resolve(forceDecision) : hasPermissionsToUseTool(tool, input, toolUseContext, assistantMessage, toolUseID);
      return decisionPromise.then(async (result) => {
        if (result.behavior === "allow") {
          if (ctx.resolveIfAborted(resolve)) {
            return;
          }
          if (false) {
            setYoloClassifierApproval(toolUseID, result.decisionReason.reason);
          }
          ctx.logDecision({
            decision: "accept",
            source: "config"
          });
          resolve(ctx.buildAllow(result.updatedInput ?? input, {
            decisionReason: result.decisionReason
          }));
          return;
        }
        const appState = toolUseContext.getAppState();
        const description = await tool.description(input, {
          isNonInteractiveSession: toolUseContext.options.isNonInteractiveSession,
          toolPermissionContext: appState.toolPermissionContext,
          tools: toolUseContext.options.tools
        });
        if (ctx.resolveIfAborted(resolve)) {
          return;
        }
        switch (result.behavior) {
          case "deny": {
            logPermissionDecision({
              tool,
              input,
              toolUseContext,
              messageId: ctx.messageId,
              toolUseID
            }, {
              decision: "reject",
              source: "config"
            });
            if (false) {
              recordAutoModeDenial({
                toolName: tool.name,
                display: description,
                reason: result.decisionReason.reason ?? "",
                timestamp: Date.now()
              });
              toolUseContext.addNotification?.({
                key: "auto-mode-denied",
                priority: "immediate",
                jsx: /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsxs(Text, { color: "error", children: [
                    tool.userFacingName(input).toLowerCase(),
                    " denied by auto mode"
                  ] }),
                  /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 /permissions" })
                ] })
              });
            }
            resolve(result);
            return;
          }
          case "ask": {
            if (appState.toolPermissionContext.awaitAutomatedChecksBeforeDialog) {
              const coordinatorDecision = await handleCoordinatorPermission({
                ctx,
                ...false ? {
                  pendingClassifierCheck: result.pendingClassifierCheck
                } : {},
                updatedInput: result.updatedInput,
                suggestions: result.suggestions,
                permissionMode: appState.toolPermissionContext.mode
              });
              if (coordinatorDecision) {
                resolve(coordinatorDecision);
                return;
              }
            }
            if (ctx.resolveIfAborted(resolve)) {
              return;
            }
            const swarmDecision = await handleSwarmWorkerPermission({
              ctx,
              description,
              ...false ? {
                pendingClassifierCheck: result.pendingClassifierCheck
              } : {},
              updatedInput: result.updatedInput,
              suggestions: result.suggestions
            });
            if (swarmDecision) {
              resolve(swarmDecision);
              return;
            }
            if (false) {
              const speculativePromise = peekSpeculativeClassifierCheck(input.command);
              if (speculativePromise) {
                const raceResult = await Promise.race([speculativePromise.then(_temp), new Promise(_temp2)]);
                if (ctx.resolveIfAborted(resolve)) {
                  return;
                }
                if (raceResult.type === "result" && raceResult.result.matches && raceResult.result.confidence === "high" && false) {
                  consumeSpeculativeClassifierCheck(input.command);
                  const matchedRule = raceResult.result.matchedDescription ?? void 0;
                  if (matchedRule) {
                    setClassifierApproval(toolUseID, matchedRule);
                  }
                  ctx.logDecision({
                    decision: "accept",
                    source: {
                      type: "classifier"
                    }
                  });
                  resolve(ctx.buildAllow(result.updatedInput ?? input, {
                    decisionReason: {
                      type: "classifier",
                      classifier: "bash_allow",
                      reason: `Allowed by prompt rule: "${raceResult.result.matchedDescription}"`
                    }
                  }));
                  return;
                }
              }
            }
            handleInteractivePermission({
              ctx,
              description,
              result,
              awaitAutomatedChecksBeforeDialog: appState.toolPermissionContext.awaitAutomatedChecksBeforeDialog,
              bridgeCallbacks: false ? appState.replBridgePermissionCallbacks : void 0,
              channelCallbacks: false ? appState.channelPermissionCallbacks : void 0
            }, resolve);
            return;
          }
        }
      }).catch((error) => {
        if (error instanceof AbortError || error instanceof APIUserAbortError) {
          logForDebugging(`Permission check threw ${error.constructor.name} for tool=${tool.name}: ${error.message}`);
          ctx.logCancelled();
          resolve(ctx.cancelAndAbort(void 0, true));
        } else {
          logError(error);
          resolve(ctx.cancelAndAbort(void 0, true));
        }
      }).finally(() => {
        clearClassifierChecking(toolUseID);
      });
    });
    $[0] = setToolPermissionContext;
    $[1] = setToolUseConfirmQueue;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  return t0;
}
function _temp2(res) {
  return setTimeout(res, 2e3, {
    type: "timeout"
  });
}
function _temp(r) {
  return {
    type: "result",
    result: r
  };
}
var useCanUseTool_default = useCanUseTool;
export {
  useCanUseTool_default as default
};
