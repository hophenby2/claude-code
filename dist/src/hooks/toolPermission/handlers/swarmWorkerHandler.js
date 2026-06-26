const feature = (_name) => false;
import { isAgentSwarmsEnabled } from "../../../utils/agentSwarmsEnabled.js";
import { toError } from "../../../utils/errors.js";
import { logError } from "../../../utils/log.js";
import {
  createPermissionRequest,
  isSwarmWorker,
  sendPermissionRequestViaMailbox
} from "../../../utils/swarm/permissionSync.js";
import { registerPermissionCallback } from "../../useSwarmPermissionPoller.js";
import { createResolveOnce } from "../PermissionContext.js";
async function handleSwarmWorkerPermission(params) {
  if (!isAgentSwarmsEnabled() || !isSwarmWorker()) {
    return null;
  }
  const { ctx, description, updatedInput, suggestions } = params;
  const classifierResult = false ? await ctx.tryClassifier?.(params.pendingClassifierCheck, updatedInput) : null;
  if (classifierResult) {
    return classifierResult;
  }
  try {
    const clearPendingRequest = () => ctx.toolUseContext.setAppState((prev) => ({
      ...prev,
      pendingWorkerRequest: null
    }));
    const decision = await new Promise((resolve) => {
      const { resolve: resolveOnce, claim } = createResolveOnce(resolve);
      const request = createPermissionRequest({
        toolName: ctx.tool.name,
        toolUseId: ctx.toolUseID,
        input: ctx.input,
        description,
        permissionSuggestions: suggestions
      });
      registerPermissionCallback({
        requestId: request.id,
        toolUseId: ctx.toolUseID,
        async onAllow(allowedInput, permissionUpdates, feedback, contentBlocks) {
          if (!claim()) return;
          clearPendingRequest();
          const finalInput = allowedInput && Object.keys(allowedInput).length > 0 ? allowedInput : ctx.input;
          resolveOnce(
            await ctx.handleUserAllow(
              finalInput,
              permissionUpdates,
              feedback,
              void 0,
              contentBlocks
            )
          );
        },
        onReject(feedback, contentBlocks) {
          if (!claim()) return;
          clearPendingRequest();
          ctx.logDecision({
            decision: "reject",
            source: { type: "user_reject", hasFeedback: !!feedback }
          });
          resolveOnce(ctx.cancelAndAbort(feedback, void 0, contentBlocks));
        }
      });
      void sendPermissionRequestViaMailbox(request);
      ctx.toolUseContext.setAppState((prev) => ({
        ...prev,
        pendingWorkerRequest: {
          toolName: ctx.tool.name,
          toolUseId: ctx.toolUseID,
          description
        }
      }));
      ctx.toolUseContext.abortController.signal.addEventListener(
        "abort",
        () => {
          if (!claim()) return;
          clearPendingRequest();
          ctx.logCancelled();
          resolveOnce(ctx.cancelAndAbort(void 0, true));
        },
        { once: true }
      );
    });
    return decision;
  } catch (error) {
    logError(toError(error));
    return null;
  }
}
export {
  handleSwarmWorkerPermission
};
