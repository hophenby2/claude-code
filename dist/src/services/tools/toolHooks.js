import {
  logEvent
} from "../analytics/index.js";
import { sanitizeToolNameForAnalytics } from "../analytics/metadata.js";
import { createAttachmentMessage } from "../../utils/attachments.js";
import { logForDebugging } from "../../utils/debug.js";
import {
  executePostToolHooks,
  executePostToolUseFailureHooks,
  executePreToolHooks,
  getPreToolHookBlockingMessage
} from "../../utils/hooks.js";
import { logError } from "../../utils/log.js";
import {
  getRuleBehaviorDescription
} from "../../utils/permissions/PermissionResult.js";
import { checkRuleBasedPermissions } from "../../utils/permissions/permissions.js";
import { formatError } from "../../utils/toolErrors.js";
import { isMcpTool } from "../mcp/utils.js";
async function* runPostToolUseHooks(toolUseContext, tool, toolUseID, messageId, toolInput, toolResponse, requestId, mcpServerType, mcpServerBaseUrl) {
  const postToolStartTime = Date.now();
  try {
    const appState = toolUseContext.getAppState();
    const permissionMode = appState.toolPermissionContext.mode;
    let toolOutput = toolResponse;
    for await (const result of executePostToolHooks(
      tool.name,
      toolUseID,
      toolInput,
      toolOutput,
      toolUseContext,
      permissionMode,
      toolUseContext.abortController.signal
    )) {
      try {
        if (result.message?.type === "attachment" && result.message.attachment.type === "hook_cancelled") {
          logEvent("tengu_post_tool_hooks_cancelled", {
            toolName: sanitizeToolNameForAnalytics(tool.name),
            queryChainId: toolUseContext.queryTracking?.chainId,
            queryDepth: toolUseContext.queryTracking?.depth
          });
          yield {
            message: createAttachmentMessage({
              type: "hook_cancelled",
              hookName: `PostToolUse:${tool.name}`,
              toolUseID,
              hookEvent: "PostToolUse"
            })
          };
          continue;
        }
        if (result.message && !(result.message.type === "attachment" && result.message.attachment.type === "hook_blocking_error")) {
          yield { message: result.message };
        }
        if (result.blockingError) {
          yield {
            message: createAttachmentMessage({
              type: "hook_blocking_error",
              hookName: `PostToolUse:${tool.name}`,
              toolUseID,
              hookEvent: "PostToolUse",
              blockingError: result.blockingError
            })
          };
        }
        if (result.preventContinuation) {
          yield {
            message: createAttachmentMessage({
              type: "hook_stopped_continuation",
              message: result.stopReason || "Execution stopped by PostToolUse hook",
              hookName: `PostToolUse:${tool.name}`,
              toolUseID,
              hookEvent: "PostToolUse"
            })
          };
          return;
        }
        if (result.additionalContexts && result.additionalContexts.length > 0) {
          yield {
            message: createAttachmentMessage({
              type: "hook_additional_context",
              content: result.additionalContexts,
              hookName: `PostToolUse:${tool.name}`,
              toolUseID,
              hookEvent: "PostToolUse"
            })
          };
        }
        if (result.updatedMCPToolOutput && isMcpTool(tool)) {
          toolOutput = result.updatedMCPToolOutput;
          yield {
            updatedMCPToolOutput: toolOutput
          };
        }
      } catch (error) {
        const postToolDurationMs = Date.now() - postToolStartTime;
        logEvent("tengu_post_tool_hook_error", {
          messageID: messageId,
          toolName: sanitizeToolNameForAnalytics(tool.name),
          isMcp: tool.isMcp ?? false,
          duration: postToolDurationMs,
          queryChainId: toolUseContext.queryTracking?.chainId,
          queryDepth: toolUseContext.queryTracking?.depth,
          ...mcpServerType ? {
            mcpServerType
          } : {},
          ...requestId ? {
            requestId
          } : {}
        });
        yield {
          message: createAttachmentMessage({
            type: "hook_error_during_execution",
            content: formatError(error),
            hookName: `PostToolUse:${tool.name}`,
            toolUseID,
            hookEvent: "PostToolUse"
          })
        };
      }
    }
  } catch (error) {
    logError(error);
  }
}
async function* runPostToolUseFailureHooks(toolUseContext, tool, toolUseID, messageId, processedInput, error, isInterrupt, requestId, mcpServerType, mcpServerBaseUrl) {
  const postToolStartTime = Date.now();
  try {
    const appState = toolUseContext.getAppState();
    const permissionMode = appState.toolPermissionContext.mode;
    for await (const result of executePostToolUseFailureHooks(
      tool.name,
      toolUseID,
      processedInput,
      error,
      toolUseContext,
      isInterrupt,
      permissionMode,
      toolUseContext.abortController.signal
    )) {
      try {
        if (result.message?.type === "attachment" && result.message.attachment.type === "hook_cancelled") {
          logEvent("tengu_post_tool_failure_hooks_cancelled", {
            toolName: sanitizeToolNameForAnalytics(tool.name),
            queryChainId: toolUseContext.queryTracking?.chainId,
            queryDepth: toolUseContext.queryTracking?.depth
          });
          yield {
            message: createAttachmentMessage({
              type: "hook_cancelled",
              hookName: `PostToolUseFailure:${tool.name}`,
              toolUseID,
              hookEvent: "PostToolUseFailure"
            })
          };
          continue;
        }
        if (result.message && !(result.message.type === "attachment" && result.message.attachment.type === "hook_blocking_error")) {
          yield { message: result.message };
        }
        if (result.blockingError) {
          yield {
            message: createAttachmentMessage({
              type: "hook_blocking_error",
              hookName: `PostToolUseFailure:${tool.name}`,
              toolUseID,
              hookEvent: "PostToolUseFailure",
              blockingError: result.blockingError
            })
          };
        }
        if (result.additionalContexts && result.additionalContexts.length > 0) {
          yield {
            message: createAttachmentMessage({
              type: "hook_additional_context",
              content: result.additionalContexts,
              hookName: `PostToolUseFailure:${tool.name}`,
              toolUseID,
              hookEvent: "PostToolUseFailure"
            })
          };
        }
      } catch (hookError) {
        const postToolDurationMs = Date.now() - postToolStartTime;
        logEvent("tengu_post_tool_failure_hook_error", {
          messageID: messageId,
          toolName: sanitizeToolNameForAnalytics(tool.name),
          isMcp: tool.isMcp ?? false,
          duration: postToolDurationMs,
          queryChainId: toolUseContext.queryTracking?.chainId,
          queryDepth: toolUseContext.queryTracking?.depth,
          ...mcpServerType ? {
            mcpServerType
          } : {},
          ...requestId ? {
            requestId
          } : {}
        });
        yield {
          message: createAttachmentMessage({
            type: "hook_error_during_execution",
            content: formatError(hookError),
            hookName: `PostToolUseFailure:${tool.name}`,
            toolUseID,
            hookEvent: "PostToolUseFailure"
          })
        };
      }
    }
  } catch (outerError) {
    logError(outerError);
  }
}
async function resolveHookPermissionDecision(hookPermissionResult, tool, input, toolUseContext, canUseTool, assistantMessage, toolUseID) {
  const requiresInteraction = tool.requiresUserInteraction?.();
  const requireCanUseTool = toolUseContext.requireCanUseTool;
  if (hookPermissionResult?.behavior === "allow") {
    const hookInput = hookPermissionResult.updatedInput ?? input;
    const interactionSatisfied = requiresInteraction && hookPermissionResult.updatedInput !== void 0;
    if (requiresInteraction && !interactionSatisfied || requireCanUseTool) {
      logForDebugging(
        `Hook approved tool use for ${tool.name}, but canUseTool is required`
      );
      return {
        decision: await canUseTool(
          tool,
          hookInput,
          toolUseContext,
          assistantMessage,
          toolUseID
        ),
        input: hookInput
      };
    }
    const ruleCheck = await checkRuleBasedPermissions(
      tool,
      hookInput,
      toolUseContext
    );
    if (ruleCheck === null) {
      logForDebugging(
        interactionSatisfied ? `Hook satisfied user interaction for ${tool.name} via updatedInput` : `Hook approved tool use for ${tool.name}, bypassing permission prompt`
      );
      return { decision: hookPermissionResult, input: hookInput };
    }
    if (ruleCheck.behavior === "deny") {
      logForDebugging(
        `Hook approved tool use for ${tool.name}, but deny rule overrides: ${ruleCheck.message}`
      );
      return { decision: ruleCheck, input: hookInput };
    }
    logForDebugging(
      `Hook approved tool use for ${tool.name}, but ask rule requires prompt`
    );
    return {
      decision: await canUseTool(
        tool,
        hookInput,
        toolUseContext,
        assistantMessage,
        toolUseID
      ),
      input: hookInput
    };
  }
  if (hookPermissionResult?.behavior === "deny") {
    logForDebugging(`Hook denied tool use for ${tool.name}`);
    return { decision: hookPermissionResult, input };
  }
  const forceDecision = hookPermissionResult?.behavior === "ask" ? hookPermissionResult : void 0;
  const askInput = hookPermissionResult?.behavior === "ask" && hookPermissionResult.updatedInput ? hookPermissionResult.updatedInput : input;
  return {
    decision: await canUseTool(
      tool,
      askInput,
      toolUseContext,
      assistantMessage,
      toolUseID,
      forceDecision
    ),
    input: askInput
  };
}
async function* runPreToolUseHooks(toolUseContext, tool, processedInput, toolUseID, messageId, requestId, mcpServerType, mcpServerBaseUrl) {
  const hookStartTime = Date.now();
  try {
    const appState = toolUseContext.getAppState();
    for await (const result of executePreToolHooks(
      tool.name,
      toolUseID,
      processedInput,
      toolUseContext,
      appState.toolPermissionContext.mode,
      toolUseContext.abortController.signal,
      void 0,
      // timeoutMs - use default
      toolUseContext.requestPrompt,
      tool.getToolUseSummary?.(processedInput)
    )) {
      try {
        if (result.message) {
          yield { type: "message", message: { message: result.message } };
        }
        if (result.blockingError) {
          const denialMessage = getPreToolHookBlockingMessage(
            `PreToolUse:${tool.name}`,
            result.blockingError
          );
          yield {
            type: "hookPermissionResult",
            hookPermissionResult: {
              behavior: "deny",
              message: denialMessage,
              decisionReason: {
                type: "hook",
                hookName: `PreToolUse:${tool.name}`,
                reason: denialMessage
              }
            }
          };
        }
        if (result.preventContinuation) {
          yield {
            type: "preventContinuation",
            shouldPreventContinuation: true
          };
          if (result.stopReason) {
            yield { type: "stopReason", stopReason: result.stopReason };
          }
        }
        if (result.permissionBehavior !== void 0) {
          logForDebugging(
            `Hook result has permissionBehavior=${result.permissionBehavior}`
          );
          const decisionReason = {
            type: "hook",
            hookName: `PreToolUse:${tool.name}`,
            hookSource: result.hookSource,
            reason: result.hookPermissionDecisionReason
          };
          if (result.permissionBehavior === "allow") {
            yield {
              type: "hookPermissionResult",
              hookPermissionResult: {
                behavior: "allow",
                updatedInput: result.updatedInput,
                decisionReason
              }
            };
          } else if (result.permissionBehavior === "ask") {
            yield {
              type: "hookPermissionResult",
              hookPermissionResult: {
                behavior: "ask",
                updatedInput: result.updatedInput,
                message: result.hookPermissionDecisionReason || `Hook PreToolUse:${tool.name} ${getRuleBehaviorDescription(result.permissionBehavior)} this tool`,
                decisionReason
              }
            };
          } else {
            yield {
              type: "hookPermissionResult",
              hookPermissionResult: {
                behavior: result.permissionBehavior,
                message: result.hookPermissionDecisionReason || `Hook PreToolUse:${tool.name} ${getRuleBehaviorDescription(result.permissionBehavior)} this tool`,
                decisionReason
              }
            };
          }
        }
        if (result.updatedInput && result.permissionBehavior === void 0) {
          yield {
            type: "hookUpdatedInput",
            updatedInput: result.updatedInput
          };
        }
        if (result.additionalContexts && result.additionalContexts.length > 0) {
          yield {
            type: "additionalContext",
            message: {
              message: createAttachmentMessage({
                type: "hook_additional_context",
                content: result.additionalContexts,
                hookName: `PreToolUse:${tool.name}`,
                toolUseID,
                hookEvent: "PreToolUse"
              })
            }
          };
        }
        if (toolUseContext.abortController.signal.aborted) {
          logEvent("tengu_pre_tool_hooks_cancelled", {
            toolName: sanitizeToolNameForAnalytics(tool.name),
            queryChainId: toolUseContext.queryTracking?.chainId,
            queryDepth: toolUseContext.queryTracking?.depth
          });
          yield {
            type: "message",
            message: {
              message: createAttachmentMessage({
                type: "hook_cancelled",
                hookName: `PreToolUse:${tool.name}`,
                toolUseID,
                hookEvent: "PreToolUse"
              })
            }
          };
          yield { type: "stop" };
          return;
        }
      } catch (error) {
        logError(error);
        const durationMs = Date.now() - hookStartTime;
        logEvent("tengu_pre_tool_hook_error", {
          messageID: messageId,
          toolName: sanitizeToolNameForAnalytics(tool.name),
          isMcp: tool.isMcp ?? false,
          duration: durationMs,
          queryChainId: toolUseContext.queryTracking?.chainId,
          queryDepth: toolUseContext.queryTracking?.depth,
          ...mcpServerType ? {
            mcpServerType
          } : {},
          ...requestId ? {
            requestId
          } : {}
        });
        yield {
          type: "message",
          message: {
            message: createAttachmentMessage({
              type: "hook_error_during_execution",
              content: formatError(error),
              hookName: `PreToolUse:${tool.name}`,
              toolUseID,
              hookEvent: "PreToolUse"
            })
          }
        };
        yield { type: "stop" };
      }
    }
  } catch (error) {
    logError(error);
    yield { type: "stop" };
    return;
  }
}
export {
  resolveHookPermissionDecision,
  runPostToolUseFailureHooks,
  runPostToolUseHooks,
  runPreToolUseHooks
};
