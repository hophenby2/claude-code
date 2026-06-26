const feature = (_name) => false;
import { randomUUID } from "crypto";
import "../../../utils/debug.js";
import "../../../bootstrap/state.js";
import "../../../ink/terminal-focus-state.js";
import "../../../services/mcp/channelNotification.js";
import "../../../services/mcp/channelPermissions.js";
import "../../../tools/BashTool/bashPermissions.js";
import "../../../tools/BashTool/toolName.js";
import {
  clearClassifierChecking
} from "../../../utils/classifierApprovals.js";
import "../../../utils/errors.js";
import { hasPermissionsToUseTool } from "../../../utils/permissions/permissions.js";
import { createResolveOnce } from "../PermissionContext.js";
function handleInteractivePermission(params, resolve) {
  const {
    ctx,
    description,
    result,
    awaitAutomatedChecksBeforeDialog,
    bridgeCallbacks,
    channelCallbacks
  } = params;
  const { resolve: resolveOnce, isResolved, claim } = createResolveOnce(resolve);
  let userInteracted = false;
  let checkmarkTransitionTimer;
  let checkmarkAbortHandler;
  const bridgeRequestId = bridgeCallbacks ? randomUUID() : void 0;
  let channelUnsubscribe;
  const permissionPromptStartTimeMs = Date.now();
  const displayInput = result.updatedInput ?? ctx.input;
  function clearClassifierIndicator() {
    if (false) {
      ctx.updateQueueItem({ classifierCheckInProgress: false });
    }
  }
  ctx.pushToQueue({
    assistantMessage: ctx.assistantMessage,
    tool: ctx.tool,
    description,
    input: displayInput,
    toolUseContext: ctx.toolUseContext,
    toolUseID: ctx.toolUseID,
    permissionResult: result,
    permissionPromptStartTimeMs,
    ...false ? {
      classifierCheckInProgress: !!result.pendingClassifierCheck && !awaitAutomatedChecksBeforeDialog
    } : {},
    onUserInteraction() {
      const GRACE_PERIOD_MS = 200;
      if (Date.now() - permissionPromptStartTimeMs < GRACE_PERIOD_MS) {
        return;
      }
      userInteracted = true;
      clearClassifierChecking(ctx.toolUseID);
      clearClassifierIndicator();
    },
    onDismissCheckmark() {
      if (checkmarkTransitionTimer) {
        clearTimeout(checkmarkTransitionTimer);
        checkmarkTransitionTimer = void 0;
        if (checkmarkAbortHandler) {
          ctx.toolUseContext.abortController.signal.removeEventListener(
            "abort",
            checkmarkAbortHandler
          );
          checkmarkAbortHandler = void 0;
        }
        ctx.removeFromQueue();
      }
    },
    onAbort() {
      if (!claim()) return;
      if (bridgeCallbacks && bridgeRequestId) {
        bridgeCallbacks.sendResponse(bridgeRequestId, {
          behavior: "deny",
          message: "User aborted"
        });
        bridgeCallbacks.cancelRequest(bridgeRequestId);
      }
      channelUnsubscribe?.();
      ctx.logCancelled();
      ctx.logDecision(
        { decision: "reject", source: { type: "user_abort" } },
        { permissionPromptStartTimeMs }
      );
      resolveOnce(ctx.cancelAndAbort(void 0, true));
    },
    async onAllow(updatedInput, permissionUpdates, feedback, contentBlocks) {
      if (!claim()) return;
      if (bridgeCallbacks && bridgeRequestId) {
        bridgeCallbacks.sendResponse(bridgeRequestId, {
          behavior: "allow",
          updatedInput,
          updatedPermissions: permissionUpdates
        });
        bridgeCallbacks.cancelRequest(bridgeRequestId);
      }
      channelUnsubscribe?.();
      resolveOnce(
        await ctx.handleUserAllow(
          updatedInput,
          permissionUpdates,
          feedback,
          permissionPromptStartTimeMs,
          contentBlocks,
          result.decisionReason
        )
      );
    },
    onReject(feedback, contentBlocks) {
      if (!claim()) return;
      if (bridgeCallbacks && bridgeRequestId) {
        bridgeCallbacks.sendResponse(bridgeRequestId, {
          behavior: "deny",
          message: feedback ?? "User denied permission"
        });
        bridgeCallbacks.cancelRequest(bridgeRequestId);
      }
      channelUnsubscribe?.();
      ctx.logDecision(
        {
          decision: "reject",
          source: { type: "user_reject", hasFeedback: !!feedback }
        },
        { permissionPromptStartTimeMs }
      );
      resolveOnce(ctx.cancelAndAbort(feedback, void 0, contentBlocks));
    },
    async recheckPermission() {
      if (isResolved()) return;
      const freshResult = await hasPermissionsToUseTool(
        ctx.tool,
        ctx.input,
        ctx.toolUseContext,
        ctx.assistantMessage,
        ctx.toolUseID
      );
      if (freshResult.behavior === "allow") {
        if (!claim()) return;
        if (bridgeCallbacks && bridgeRequestId) {
          bridgeCallbacks.cancelRequest(bridgeRequestId);
        }
        channelUnsubscribe?.();
        ctx.removeFromQueue();
        ctx.logDecision({ decision: "accept", source: "config" });
        resolveOnce(ctx.buildAllow(freshResult.updatedInput ?? ctx.input));
      }
    }
  });
  if (bridgeCallbacks && bridgeRequestId) {
    bridgeCallbacks.sendRequest(
      bridgeRequestId,
      ctx.tool.name,
      displayInput,
      ctx.toolUseID,
      description,
      result.suggestions,
      result.blockedPath
    );
    const signal = ctx.toolUseContext.abortController.signal;
    const unsubscribe = bridgeCallbacks.onResponse(
      bridgeRequestId,
      (response) => {
        if (!claim()) return;
        signal.removeEventListener("abort", unsubscribe);
        clearClassifierChecking(ctx.toolUseID);
        clearClassifierIndicator();
        ctx.removeFromQueue();
        channelUnsubscribe?.();
        if (response.behavior === "allow") {
          if (response.updatedPermissions?.length) {
            void ctx.persistPermissions(response.updatedPermissions);
          }
          ctx.logDecision(
            {
              decision: "accept",
              source: {
                type: "user",
                permanent: !!response.updatedPermissions?.length
              }
            },
            { permissionPromptStartTimeMs }
          );
          resolveOnce(ctx.buildAllow(response.updatedInput ?? displayInput));
        } else {
          ctx.logDecision(
            {
              decision: "reject",
              source: {
                type: "user_reject",
                hasFeedback: !!response.message
              }
            },
            { permissionPromptStartTimeMs }
          );
          resolveOnce(ctx.cancelAndAbort(response.message));
        }
      }
    );
    signal.addEventListener("abort", unsubscribe, { once: true });
  }
  if (false) {
    const channelRequestId = shortRequestId(ctx.toolUseID);
    const allowedChannels = getAllowedChannels();
    const channelClients = filterPermissionRelayClients(
      ctx.toolUseContext.getAppState().mcp.clients,
      (name) => findChannelEntry(name, allowedChannels) !== void 0
    );
    if (channelClients.length > 0) {
      const params2 = {
        request_id: channelRequestId,
        tool_name: ctx.tool.name,
        description,
        input_preview: truncateForPreview(displayInput)
      };
      for (const client of channelClients) {
        if (client.type !== "connected") continue;
        void client.client.notification({
          method: CHANNEL_PERMISSION_REQUEST_METHOD,
          params: params2
        }).catch((e) => {
          logForDebugging(
            `Channel permission_request failed for ${client.name}: ${errorMessage(e)}`,
            { level: "error" }
          );
        });
      }
      const channelSignal = ctx.toolUseContext.abortController.signal;
      const mapUnsub = channelCallbacks.onResponse(
        channelRequestId,
        (response) => {
          if (!claim()) return;
          channelUnsubscribe?.();
          clearClassifierChecking(ctx.toolUseID);
          clearClassifierIndicator();
          ctx.removeFromQueue();
          if (bridgeCallbacks && bridgeRequestId) {
            bridgeCallbacks.cancelRequest(bridgeRequestId);
          }
          if (response.behavior === "allow") {
            ctx.logDecision(
              {
                decision: "accept",
                source: { type: "user", permanent: false }
              },
              { permissionPromptStartTimeMs }
            );
            resolveOnce(ctx.buildAllow(displayInput));
          } else {
            ctx.logDecision(
              {
                decision: "reject",
                source: { type: "user_reject", hasFeedback: false }
              },
              { permissionPromptStartTimeMs }
            );
            resolveOnce(
              ctx.cancelAndAbort(`Denied via channel ${response.fromServer}`)
            );
          }
        }
      );
      channelUnsubscribe = () => {
        mapUnsub();
        channelSignal.removeEventListener("abort", channelUnsubscribe);
      };
      channelSignal.addEventListener("abort", channelUnsubscribe, {
        once: true
      });
    }
  }
  if (!awaitAutomatedChecksBeforeDialog) {
    void (async () => {
      if (isResolved()) return;
      const currentAppState = ctx.toolUseContext.getAppState();
      const hookDecision = await ctx.runHooks(
        currentAppState.toolPermissionContext.mode,
        result.suggestions,
        result.updatedInput,
        permissionPromptStartTimeMs
      );
      if (!hookDecision || !claim()) return;
      if (bridgeCallbacks && bridgeRequestId) {
        bridgeCallbacks.cancelRequest(bridgeRequestId);
      }
      channelUnsubscribe?.();
      ctx.removeFromQueue();
      resolveOnce(hookDecision);
    })();
  }
  if (false) {
    setClassifierChecking(ctx.toolUseID);
    void executeAsyncClassifierCheck(
      result.pendingClassifierCheck,
      ctx.toolUseContext.abortController.signal,
      ctx.toolUseContext.options.isNonInteractiveSession,
      {
        shouldContinue: () => !isResolved() && !userInteracted,
        onComplete: () => {
          clearClassifierChecking(ctx.toolUseID);
          clearClassifierIndicator();
        },
        onAllow: (decisionReason) => {
          if (!claim()) return;
          if (bridgeCallbacks && bridgeRequestId) {
            bridgeCallbacks.cancelRequest(bridgeRequestId);
          }
          channelUnsubscribe?.();
          clearClassifierChecking(ctx.toolUseID);
          const matchedRule = decisionReason.type === "classifier" ? decisionReason.reason.match(
            /^Allowed by prompt rule: "(.+)"$/
          )?.[1] ?? decisionReason.reason : void 0;
          if (false) {
            ctx.updateQueueItem({
              classifierCheckInProgress: false,
              classifierAutoApproved: true,
              classifierMatchedRule: matchedRule
            });
          }
          if (false) {
            if (decisionReason.classifier === "auto-mode") {
              setYoloClassifierApproval(ctx.toolUseID, decisionReason.reason);
            } else if (matchedRule) {
              setClassifierApproval(ctx.toolUseID, matchedRule);
            }
          }
          ctx.logDecision(
            { decision: "accept", source: { type: "classifier" } },
            { permissionPromptStartTimeMs }
          );
          resolveOnce(ctx.buildAllow(ctx.input, { decisionReason }));
          const signal = ctx.toolUseContext.abortController.signal;
          checkmarkAbortHandler = () => {
            if (checkmarkTransitionTimer) {
              clearTimeout(checkmarkTransitionTimer);
              checkmarkTransitionTimer = void 0;
              ctx.removeFromQueue();
            }
          };
          const checkmarkMs = getTerminalFocused() ? 3e3 : 1e3;
          checkmarkTransitionTimer = setTimeout(() => {
            checkmarkTransitionTimer = void 0;
            if (checkmarkAbortHandler) {
              signal.removeEventListener("abort", checkmarkAbortHandler);
              checkmarkAbortHandler = void 0;
            }
            ctx.removeFromQueue();
          }, checkmarkMs);
          signal.addEventListener("abort", checkmarkAbortHandler, {
            once: true
          });
        }
      }
    ).catch((error) => {
      logForDebugging(`Async classifier check failed: ${errorMessage(error)}`, {
        level: "error"
      });
    });
  }
}
export {
  handleInteractivePermission
};
