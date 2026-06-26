const feature = (_name) => false;
import {
  logEvent
} from "../analytics/index.js";
import {
  extractMcpToolDetails,
  extractSkillName,
  extractToolInputForTelemetry,
  getFileExtensionForAnalytics,
  getFileExtensionsFromBashCommand,
  isToolDetailsLoggingEnabled,
  mcpToolDetailsForAnalytics,
  sanitizeToolNameForAnalytics
} from "../analytics/metadata.js";
import {
  addToToolDuration,
  getCodeEditToolDecisionCounter,
  getStatsStore
} from "../../bootstrap/state.js";
import {
  buildCodeEditToolAttributes,
  isCodeEditingTool
} from "../../hooks/toolPermission/permissionLogging.js";
import {
  findToolByName
} from "../../Tool.js";
import { startSpeculativeClassifierCheck } from "../../tools/BashTool/bashPermissions.js";
import { BASH_TOOL_NAME } from "../../tools/BashTool/toolName.js";
import { FILE_EDIT_TOOL_NAME } from "../../tools/FileEditTool/constants.js";
import { FILE_READ_TOOL_NAME } from "../../tools/FileReadTool/prompt.js";
import { FILE_WRITE_TOOL_NAME } from "../../tools/FileWriteTool/prompt.js";
import { NOTEBOOK_EDIT_TOOL_NAME } from "../../tools/NotebookEditTool/constants.js";
import { POWERSHELL_TOOL_NAME } from "../../tools/PowerShellTool/toolName.js";
import { parseGitCommitId } from "../../tools/shared/gitOperationTracking.js";
import {
  isDeferredTool,
  TOOL_SEARCH_TOOL_NAME
} from "../../tools/ToolSearchTool/prompt.js";
import { getAllBaseTools } from "../../tools.js";
import { count } from "../../utils/array.js";
import { createAttachmentMessage } from "../../utils/attachments.js";
import { logForDebugging } from "../../utils/debug.js";
import {
  AbortError,
  errorMessage,
  getErrnoCode,
  ShellError,
  TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
} from "../../utils/errors.js";
import "../../utils/hooks.js";
import { logError } from "../../utils/log.js";
import {
  CANCEL_MESSAGE,
  createProgressMessage,
  createStopHookSummaryMessage,
  createToolResultStopMessage,
  createUserMessage,
  withMemoryCorrectionHint
} from "../../utils/messages.js";
import {
  startSessionActivity,
  stopSessionActivity
} from "../../utils/sessionActivity.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { Stream } from "../../utils/stream.js";
import { logOTelEvent } from "../../utils/telemetry/events.js";
import {
  addToolContentEvent,
  endToolBlockedOnUserSpan,
  endToolExecutionSpan,
  endToolSpan,
  isBetaTracingEnabled,
  startToolBlockedOnUserSpan,
  startToolExecutionSpan,
  startToolSpan
} from "../../utils/telemetry/sessionTracing.js";
import {
  formatError,
  formatZodValidationError
} from "../../utils/toolErrors.js";
import {
  processPreMappedToolResultBlock,
  processToolResultBlock
} from "../../utils/toolResultStorage.js";
import {
  extractDiscoveredToolNames,
  isToolSearchEnabledOptimistic,
  isToolSearchToolAvailable
} from "../../utils/toolSearch.js";
import {
  McpAuthError,
  McpToolCallError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
} from "../mcp/client.js";
import { mcpInfoFromString } from "../mcp/mcpStringUtils.js";
import { normalizeNameForMCP } from "../mcp/normalization.js";
import {
  getLoggingSafeMcpBaseUrl,
  getMcpServerScopeFromToolName,
  isMcpTool
} from "../mcp/utils.js";
import {
  resolveHookPermissionDecision,
  runPostToolUseFailureHooks,
  runPostToolUseHooks,
  runPreToolUseHooks
} from "./toolHooks.js";
const HOOK_TIMING_DISPLAY_THRESHOLD_MS = 500;
const SLOW_PHASE_LOG_THRESHOLD_MS = 2e3;
function classifyToolError(error) {
  if (error instanceof TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS) {
    return error.telemetryMessage.slice(0, 200);
  }
  if (error instanceof Error) {
    const errnoCode = getErrnoCode(error);
    if (typeof errnoCode === "string") {
      return `Error:${errnoCode}`;
    }
    if (error.name && error.name !== "Error" && error.name.length > 3) {
      return error.name.slice(0, 60);
    }
    return "Error";
  }
  return "UnknownError";
}
function ruleSourceToOTelSource(ruleSource, behavior) {
  switch (ruleSource) {
    case "session":
      return behavior === "allow" ? "user_temporary" : "user_reject";
    case "localSettings":
    case "userSettings":
      return behavior === "allow" ? "user_permanent" : "user_reject";
    default:
      return "config";
  }
}
function decisionReasonToOTelSource(reason, behavior) {
  if (!reason) {
    return "config";
  }
  switch (reason.type) {
    case "permissionPromptTool": {
      const toolResult = reason.toolResult;
      const classified = toolResult?.decisionClassification;
      if (classified === "user_temporary" || classified === "user_permanent" || classified === "user_reject") {
        return classified;
      }
      return behavior === "allow" ? "user_temporary" : "user_reject";
    }
    case "rule":
      return ruleSourceToOTelSource(reason.rule.source, behavior);
    case "hook":
      return "hook";
    case "mode":
    case "classifier":
    case "subcommandResults":
    case "asyncAgent":
    case "sandboxOverride":
    case "workingDir":
    case "safetyCheck":
    case "other":
      return "config";
    default: {
      const _exhaustive = reason;
      return "config";
    }
  }
}
function getNextImagePasteId(messages) {
  let maxId = 0;
  for (const message of messages) {
    if (message.type === "user" && message.imagePasteIds) {
      for (const id of message.imagePasteIds) {
        if (id > maxId) maxId = id;
      }
    }
  }
  return maxId + 1;
}
function findMcpServerConnection(toolName, mcpClients) {
  if (!toolName.startsWith("mcp__")) {
    return void 0;
  }
  const mcpInfo = mcpInfoFromString(toolName);
  if (!mcpInfo) {
    return void 0;
  }
  return mcpClients.find(
    (client) => normalizeNameForMCP(client.name) === mcpInfo.serverName
  );
}
function getMcpServerType(toolName, mcpClients) {
  const serverConnection = findMcpServerConnection(toolName, mcpClients);
  if (serverConnection?.type === "connected") {
    return serverConnection.config.type ?? "stdio";
  }
  return void 0;
}
function getMcpServerBaseUrlFromToolName(toolName, mcpClients) {
  const serverConnection = findMcpServerConnection(toolName, mcpClients);
  if (serverConnection?.type !== "connected") {
    return void 0;
  }
  return getLoggingSafeMcpBaseUrl(serverConnection.config);
}
async function* runToolUse(toolUse, assistantMessage, canUseTool, toolUseContext) {
  const toolName = toolUse.name;
  let tool = findToolByName(toolUseContext.options.tools, toolName);
  if (!tool) {
    const fallbackTool = findToolByName(getAllBaseTools(), toolName);
    if (fallbackTool && fallbackTool.aliases?.includes(toolName)) {
      tool = fallbackTool;
    }
  }
  const messageId = assistantMessage.message.id;
  const requestId = assistantMessage.requestId;
  const mcpServerType = getMcpServerType(
    toolName,
    toolUseContext.options.mcpClients
  );
  const mcpServerBaseUrl = getMcpServerBaseUrlFromToolName(
    toolName,
    toolUseContext.options.mcpClients
  );
  if (!tool) {
    const sanitizedToolName = sanitizeToolNameForAnalytics(toolName);
    logForDebugging(`Unknown tool ${toolName}: ${toolUse.id}`);
    logEvent("tengu_tool_use_error", {
      error: `No such tool available: ${sanitizedToolName}`,
      toolName: sanitizedToolName,
      toolUseID: toolUse.id,
      isMcp: toolName.startsWith("mcp__"),
      queryChainId: toolUseContext.queryTracking?.chainId,
      queryDepth: toolUseContext.queryTracking?.depth,
      ...mcpServerType && {
        mcpServerType
      },
      ...mcpServerBaseUrl && {
        mcpServerBaseUrl
      },
      ...requestId && {
        requestId
      },
      ...mcpToolDetailsForAnalytics(toolName, mcpServerType, mcpServerBaseUrl)
    });
    yield {
      message: createUserMessage({
        content: [
          {
            type: "tool_result",
            content: `<tool_use_error>Error: No such tool available: ${toolName}</tool_use_error>`,
            is_error: true,
            tool_use_id: toolUse.id
          }
        ],
        toolUseResult: `Error: No such tool available: ${toolName}`,
        sourceToolAssistantUUID: assistantMessage.uuid
      })
    };
    return;
  }
  const toolInput = toolUse.input;
  try {
    if (toolUseContext.abortController.signal.aborted) {
      logEvent("tengu_tool_use_cancelled", {
        toolName: sanitizeToolNameForAnalytics(tool.name),
        toolUseID: toolUse.id,
        isMcp: tool.isMcp ?? false,
        queryChainId: toolUseContext.queryTracking?.chainId,
        queryDepth: toolUseContext.queryTracking?.depth,
        ...mcpServerType && {
          mcpServerType
        },
        ...mcpServerBaseUrl && {
          mcpServerBaseUrl
        },
        ...requestId && {
          requestId
        },
        ...mcpToolDetailsForAnalytics(
          tool.name,
          mcpServerType,
          mcpServerBaseUrl
        )
      });
      const content = createToolResultStopMessage(toolUse.id);
      content.content = withMemoryCorrectionHint(CANCEL_MESSAGE);
      yield {
        message: createUserMessage({
          content: [content],
          toolUseResult: CANCEL_MESSAGE,
          sourceToolAssistantUUID: assistantMessage.uuid
        })
      };
      return;
    }
    for await (const update of streamedCheckPermissionsAndCallTool(
      tool,
      toolUse.id,
      toolInput,
      toolUseContext,
      canUseTool,
      assistantMessage,
      messageId,
      requestId,
      mcpServerType,
      mcpServerBaseUrl
    )) {
      yield update;
    }
  } catch (error) {
    logError(error);
    const errorMessage2 = error instanceof Error ? error.message : String(error);
    const toolInfo = tool ? ` (${tool.name})` : "";
    const detailedError = `Error calling tool${toolInfo}: ${errorMessage2}`;
    yield {
      message: createUserMessage({
        content: [
          {
            type: "tool_result",
            content: `<tool_use_error>${detailedError}</tool_use_error>`,
            is_error: true,
            tool_use_id: toolUse.id
          }
        ],
        toolUseResult: detailedError,
        sourceToolAssistantUUID: assistantMessage.uuid
      })
    };
  }
}
function streamedCheckPermissionsAndCallTool(tool, toolUseID, input, toolUseContext, canUseTool, assistantMessage, messageId, requestId, mcpServerType, mcpServerBaseUrl) {
  const stream = new Stream();
  checkPermissionsAndCallTool(
    tool,
    toolUseID,
    input,
    toolUseContext,
    canUseTool,
    assistantMessage,
    messageId,
    requestId,
    mcpServerType,
    mcpServerBaseUrl,
    (progress) => {
      logEvent("tengu_tool_use_progress", {
        messageID: messageId,
        toolName: sanitizeToolNameForAnalytics(tool.name),
        isMcp: tool.isMcp ?? false,
        queryChainId: toolUseContext.queryTracking?.chainId,
        queryDepth: toolUseContext.queryTracking?.depth,
        ...mcpServerType && {
          mcpServerType
        },
        ...mcpServerBaseUrl && {
          mcpServerBaseUrl
        },
        ...requestId && {
          requestId
        },
        ...mcpToolDetailsForAnalytics(
          tool.name,
          mcpServerType,
          mcpServerBaseUrl
        )
      });
      stream.enqueue({
        message: createProgressMessage({
          toolUseID: progress.toolUseID,
          parentToolUseID: toolUseID,
          data: progress.data
        })
      });
    }
  ).then((results) => {
    for (const result of results) {
      stream.enqueue(result);
    }
  }).catch((error) => {
    stream.error(error);
  }).finally(() => {
    stream.done();
  });
  return stream;
}
function buildSchemaNotSentHint(tool, messages, tools) {
  if (!isToolSearchEnabledOptimistic()) return null;
  if (!isToolSearchToolAvailable(tools)) return null;
  if (!isDeferredTool(tool)) return null;
  const discovered = extractDiscoveredToolNames(messages);
  if (discovered.has(tool.name)) return null;
  return `

This tool's schema was not sent to the API \u2014 it was not in the discovered-tool set derived from message history. Without the schema in your prompt, typed parameters (arrays, numbers, booleans) get emitted as strings and the client-side parser rejects them. Load the tool first: call ${TOOL_SEARCH_TOOL_NAME} with query "select:${tool.name}", then retry this call.`;
}
async function checkPermissionsAndCallTool(tool, toolUseID, input, toolUseContext, canUseTool, assistantMessage, messageId, requestId, mcpServerType, mcpServerBaseUrl, onToolProgress) {
  const parsedInput = tool.inputSchema.safeParse(input);
  if (!parsedInput.success) {
    let errorContent = formatZodValidationError(tool.name, parsedInput.error);
    const schemaHint = buildSchemaNotSentHint(
      tool,
      toolUseContext.messages,
      toolUseContext.options.tools
    );
    if (schemaHint) {
      logEvent("tengu_deferred_tool_schema_not_sent", {
        toolName: sanitizeToolNameForAnalytics(tool.name),
        isMcp: tool.isMcp ?? false
      });
      errorContent += schemaHint;
    }
    logForDebugging(
      `${tool.name} tool input error: ${errorContent.slice(0, 200)}`
    );
    logEvent("tengu_tool_use_error", {
      error: "InputValidationError",
      errorDetails: errorContent.slice(
        0,
        2e3
      ),
      messageID: messageId,
      toolName: sanitizeToolNameForAnalytics(tool.name),
      isMcp: tool.isMcp ?? false,
      queryChainId: toolUseContext.queryTracking?.chainId,
      queryDepth: toolUseContext.queryTracking?.depth,
      ...mcpServerType && {
        mcpServerType
      },
      ...mcpServerBaseUrl && {
        mcpServerBaseUrl
      },
      ...requestId && {
        requestId
      },
      ...mcpToolDetailsForAnalytics(tool.name, mcpServerType, mcpServerBaseUrl)
    });
    return [
      {
        message: createUserMessage({
          content: [
            {
              type: "tool_result",
              content: `<tool_use_error>InputValidationError: ${errorContent}</tool_use_error>`,
              is_error: true,
              tool_use_id: toolUseID
            }
          ],
          toolUseResult: `InputValidationError: ${parsedInput.error.message}`,
          sourceToolAssistantUUID: assistantMessage.uuid
        })
      }
    ];
  }
  const isValidCall = await tool.validateInput?.(
    parsedInput.data,
    toolUseContext
  );
  if (isValidCall?.result === false) {
    logForDebugging(
      `${tool.name} tool validation error: ${isValidCall.message?.slice(0, 200)}`
    );
    logEvent("tengu_tool_use_error", {
      messageID: messageId,
      toolName: sanitizeToolNameForAnalytics(tool.name),
      error: isValidCall.message,
      errorCode: isValidCall.errorCode,
      isMcp: tool.isMcp ?? false,
      queryChainId: toolUseContext.queryTracking?.chainId,
      queryDepth: toolUseContext.queryTracking?.depth,
      ...mcpServerType && {
        mcpServerType
      },
      ...mcpServerBaseUrl && {
        mcpServerBaseUrl
      },
      ...requestId && {
        requestId
      },
      ...mcpToolDetailsForAnalytics(tool.name, mcpServerType, mcpServerBaseUrl)
    });
    return [
      {
        message: createUserMessage({
          content: [
            {
              type: "tool_result",
              content: `<tool_use_error>${isValidCall.message}</tool_use_error>`,
              is_error: true,
              tool_use_id: toolUseID
            }
          ],
          toolUseResult: `Error: ${isValidCall.message}`,
          sourceToolAssistantUUID: assistantMessage.uuid
        })
      }
    ];
  }
  if (tool.name === BASH_TOOL_NAME && parsedInput.data && "command" in parsedInput.data) {
    const appState = toolUseContext.getAppState();
    startSpeculativeClassifierCheck(
      parsedInput.data.command,
      appState.toolPermissionContext,
      toolUseContext.abortController.signal,
      toolUseContext.options.isNonInteractiveSession
    );
  }
  const resultingMessages = [];
  let processedInput = parsedInput.data;
  if (tool.name === BASH_TOOL_NAME && processedInput && typeof processedInput === "object" && "_simulatedSedEdit" in processedInput) {
    const { _simulatedSedEdit: _, ...rest } = processedInput;
    processedInput = rest;
  }
  let callInput = processedInput;
  const backfilledClone = tool.backfillObservableInput && typeof processedInput === "object" && processedInput !== null ? { ...processedInput } : null;
  if (backfilledClone) {
    tool.backfillObservableInput(backfilledClone);
    processedInput = backfilledClone;
  }
  let shouldPreventContinuation = false;
  let stopReason;
  let hookPermissionResult;
  const preToolHookInfos = [];
  const preToolHookStart = Date.now();
  for await (const result of runPreToolUseHooks(
    toolUseContext,
    tool,
    processedInput,
    toolUseID,
    assistantMessage.message.id,
    requestId,
    mcpServerType,
    mcpServerBaseUrl
  )) {
    switch (result.type) {
      case "message":
        if (result.message.message.type === "progress") {
          onToolProgress(result.message.message);
        } else {
          resultingMessages.push(result.message);
          const att = result.message.message.attachment;
          if (att && "command" in att && att.command !== void 0 && "durationMs" in att && att.durationMs !== void 0) {
            preToolHookInfos.push({
              command: att.command,
              durationMs: att.durationMs
            });
          }
        }
        break;
      case "hookPermissionResult":
        hookPermissionResult = result.hookPermissionResult;
        break;
      case "hookUpdatedInput":
        processedInput = result.updatedInput;
        break;
      case "preventContinuation":
        shouldPreventContinuation = result.shouldPreventContinuation;
        break;
      case "stopReason":
        stopReason = result.stopReason;
        break;
      case "additionalContext":
        resultingMessages.push(result.message);
        break;
      case "stop":
        getStatsStore()?.observe(
          "pre_tool_hook_duration_ms",
          Date.now() - preToolHookStart
        );
        resultingMessages.push({
          message: createUserMessage({
            content: [createToolResultStopMessage(toolUseID)],
            toolUseResult: `Error: ${stopReason}`,
            sourceToolAssistantUUID: assistantMessage.uuid
          })
        });
        return resultingMessages;
    }
  }
  const preToolHookDurationMs = Date.now() - preToolHookStart;
  getStatsStore()?.observe("pre_tool_hook_duration_ms", preToolHookDurationMs);
  if (preToolHookDurationMs >= SLOW_PHASE_LOG_THRESHOLD_MS) {
    logForDebugging(
      `Slow PreToolUse hooks: ${preToolHookDurationMs}ms for ${tool.name} (${preToolHookInfos.length} hooks)`,
      { level: "info" }
    );
  }
  if (process.env.USER_TYPE === "ant" && preToolHookInfos.length > 0) {
    if (preToolHookDurationMs > HOOK_TIMING_DISPLAY_THRESHOLD_MS) {
      resultingMessages.push({
        message: createStopHookSummaryMessage(
          preToolHookInfos.length,
          preToolHookInfos,
          [],
          false,
          void 0,
          false,
          "suggestion",
          void 0,
          "PreToolUse",
          preToolHookDurationMs
        )
      });
    }
  }
  const toolAttributes = {};
  if (processedInput && typeof processedInput === "object") {
    if (tool.name === FILE_READ_TOOL_NAME && "file_path" in processedInput) {
      toolAttributes.file_path = String(processedInput.file_path);
    } else if ((tool.name === FILE_EDIT_TOOL_NAME || tool.name === FILE_WRITE_TOOL_NAME) && "file_path" in processedInput) {
      toolAttributes.file_path = String(processedInput.file_path);
    } else if (tool.name === BASH_TOOL_NAME && "command" in processedInput) {
      const bashInput = processedInput;
      toolAttributes.full_command = bashInput.command;
    }
  }
  startToolSpan(
    tool.name,
    toolAttributes,
    isBetaTracingEnabled() ? jsonStringify(processedInput) : void 0
  );
  startToolBlockedOnUserSpan();
  const permissionMode = toolUseContext.getAppState().toolPermissionContext.mode;
  const permissionStart = Date.now();
  const resolved = await resolveHookPermissionDecision(
    hookPermissionResult,
    tool,
    processedInput,
    toolUseContext,
    canUseTool,
    assistantMessage,
    toolUseID
  );
  const permissionDecision = resolved.decision;
  processedInput = resolved.input;
  const permissionDurationMs = Date.now() - permissionStart;
  if (permissionDurationMs >= SLOW_PHASE_LOG_THRESHOLD_MS && permissionMode === "auto") {
    logForDebugging(
      `Slow permission decision: ${permissionDurationMs}ms for ${tool.name} (mode=${permissionMode}, behavior=${permissionDecision.behavior})`,
      { level: "info" }
    );
  }
  if (permissionDecision.behavior !== "ask" && !toolUseContext.toolDecisions?.has(toolUseID)) {
    const decision = permissionDecision.behavior === "allow" ? "accept" : "reject";
    const source = decisionReasonToOTelSource(
      permissionDecision.decisionReason,
      permissionDecision.behavior
    );
    void logOTelEvent("tool_decision", {
      decision,
      source,
      tool_name: sanitizeToolNameForAnalytics(tool.name)
    });
    if (isCodeEditingTool(tool.name)) {
      void buildCodeEditToolAttributes(
        tool,
        processedInput,
        decision,
        source
      ).then((attributes) => getCodeEditToolDecisionCounter()?.add(1, attributes));
    }
  }
  if (permissionDecision.decisionReason?.type === "hook" && permissionDecision.decisionReason.hookName === "PermissionRequest" && permissionDecision.behavior !== "ask") {
    resultingMessages.push({
      message: createAttachmentMessage({
        type: "hook_permission_decision",
        decision: permissionDecision.behavior,
        toolUseID,
        hookEvent: "PermissionRequest"
      })
    });
  }
  if (permissionDecision.behavior !== "allow") {
    logForDebugging(`${tool.name} tool permission denied`);
    const decisionInfo2 = toolUseContext.toolDecisions?.get(toolUseID);
    endToolBlockedOnUserSpan("reject", decisionInfo2?.source || "unknown");
    endToolSpan();
    logEvent("tengu_tool_use_can_use_tool_rejected", {
      messageID: messageId,
      toolName: sanitizeToolNameForAnalytics(tool.name),
      queryChainId: toolUseContext.queryTracking?.chainId,
      queryDepth: toolUseContext.queryTracking?.depth,
      ...mcpServerType && {
        mcpServerType
      },
      ...mcpServerBaseUrl && {
        mcpServerBaseUrl
      },
      ...requestId && {
        requestId
      },
      ...mcpToolDetailsForAnalytics(tool.name, mcpServerType, mcpServerBaseUrl)
    });
    let errorMessage2 = permissionDecision.message;
    if (shouldPreventContinuation && !errorMessage2) {
      errorMessage2 = `Execution stopped by PreToolUse hook${stopReason ? `: ${stopReason}` : ""}`;
    }
    const messageContent = [
      {
        type: "tool_result",
        content: errorMessage2,
        is_error: true,
        tool_use_id: toolUseID
      }
    ];
    const rejectContentBlocks = permissionDecision.behavior === "ask" ? permissionDecision.contentBlocks : void 0;
    if (rejectContentBlocks?.length) {
      messageContent.push(...rejectContentBlocks);
    }
    let rejectImageIds;
    if (rejectContentBlocks?.length) {
      const imageCount = count(
        rejectContentBlocks,
        (b) => b.type === "image"
      );
      if (imageCount > 0) {
        const startId = getNextImagePasteId(toolUseContext.messages);
        rejectImageIds = Array.from(
          { length: imageCount },
          (_, i) => startId + i
        );
      }
    }
    resultingMessages.push({
      message: createUserMessage({
        content: messageContent,
        imagePasteIds: rejectImageIds,
        toolUseResult: `Error: ${errorMessage2}`,
        sourceToolAssistantUUID: assistantMessage.uuid
      })
    });
    if (false) {
      let hookSaysRetry = false;
      for await (const result of executePermissionDeniedHooks(
        tool.name,
        toolUseID,
        processedInput,
        permissionDecision.decisionReason.reason ?? "Permission denied",
        toolUseContext,
        permissionMode,
        toolUseContext.abortController.signal
      )) {
        if (result.retry) hookSaysRetry = true;
      }
      if (hookSaysRetry) {
        resultingMessages.push({
          message: createUserMessage({
            content: "The PermissionDenied hook indicated this command is now approved. You may retry it if you would like.",
            isMeta: true
          })
        });
      }
    }
    return resultingMessages;
  }
  logEvent("tengu_tool_use_can_use_tool_allowed", {
    messageID: messageId,
    toolName: sanitizeToolNameForAnalytics(tool.name),
    queryChainId: toolUseContext.queryTracking?.chainId,
    queryDepth: toolUseContext.queryTracking?.depth,
    ...mcpServerType && {
      mcpServerType
    },
    ...mcpServerBaseUrl && {
      mcpServerBaseUrl
    },
    ...requestId && {
      requestId
    },
    ...mcpToolDetailsForAnalytics(tool.name, mcpServerType, mcpServerBaseUrl)
  });
  if (permissionDecision.updatedInput !== void 0) {
    processedInput = permissionDecision.updatedInput;
  }
  const telemetryToolInput = extractToolInputForTelemetry(processedInput);
  let toolParameters = {};
  if (isToolDetailsLoggingEnabled()) {
    if (tool.name === BASH_TOOL_NAME && "command" in processedInput) {
      const bashInput = processedInput;
      const commandParts = bashInput.command.trim().split(/\s+/);
      const bashCommand = commandParts[0] || "";
      toolParameters = {
        bash_command: bashCommand,
        full_command: bashInput.command,
        ...bashInput.timeout !== void 0 && {
          timeout: bashInput.timeout
        },
        ...bashInput.description !== void 0 && {
          description: bashInput.description
        },
        ..."dangerouslyDisableSandbox" in bashInput && {
          dangerouslyDisableSandbox: bashInput.dangerouslyDisableSandbox
        }
      };
    }
    const mcpDetails = extractMcpToolDetails(tool.name);
    if (mcpDetails) {
      toolParameters.mcp_server_name = mcpDetails.serverName;
      toolParameters.mcp_tool_name = mcpDetails.mcpToolName;
    }
    const skillName = extractSkillName(tool.name, processedInput);
    if (skillName) {
      toolParameters.skill_name = skillName;
    }
  }
  const decisionInfo = toolUseContext.toolDecisions?.get(toolUseID);
  endToolBlockedOnUserSpan(
    decisionInfo?.decision || "unknown",
    decisionInfo?.source || "unknown"
  );
  startToolExecutionSpan();
  const startTime = Date.now();
  startSessionActivity("tool_exec");
  if (backfilledClone && processedInput !== callInput && typeof processedInput === "object" && processedInput !== null && "file_path" in processedInput && "file_path" in callInput && processedInput.file_path === backfilledClone.file_path) {
    callInput = {
      ...processedInput,
      file_path: callInput.file_path
    };
  } else if (processedInput !== backfilledClone) {
    callInput = processedInput;
  }
  try {
    const result = await tool.call(
      callInput,
      {
        ...toolUseContext,
        toolUseId: toolUseID,
        userModified: permissionDecision.userModified ?? false
      },
      canUseTool,
      assistantMessage,
      (progress) => {
        onToolProgress({
          toolUseID: progress.toolUseID,
          data: progress.data
        });
      }
    );
    const durationMs = Date.now() - startTime;
    addToToolDuration(durationMs);
    if (result.data && typeof result.data === "object") {
      const contentAttributes = {};
      if (tool.name === FILE_READ_TOOL_NAME && "content" in result.data) {
        if ("file_path" in processedInput) {
          contentAttributes.file_path = String(processedInput.file_path);
        }
        contentAttributes.content = String(result.data.content);
      }
      if ((tool.name === FILE_EDIT_TOOL_NAME || tool.name === FILE_WRITE_TOOL_NAME) && "file_path" in processedInput) {
        contentAttributes.file_path = String(processedInput.file_path);
        if (tool.name === FILE_EDIT_TOOL_NAME && "diff" in result.data) {
          contentAttributes.diff = String(result.data.diff);
        }
        if (tool.name === FILE_WRITE_TOOL_NAME && "content" in processedInput) {
          contentAttributes.content = String(processedInput.content);
        }
      }
      if (tool.name === BASH_TOOL_NAME && "command" in processedInput) {
        const bashInput = processedInput;
        contentAttributes.bash_command = bashInput.command;
        if ("output" in result.data) {
          contentAttributes.output = String(result.data.output);
        }
      }
      if (Object.keys(contentAttributes).length > 0) {
        addToolContentEvent("tool.output", contentAttributes);
      }
    }
    if (typeof result === "object" && "structured_output" in result) {
      resultingMessages.push({
        message: createAttachmentMessage({
          type: "structured_output",
          data: result.structured_output
        })
      });
    }
    endToolExecutionSpan({ success: true });
    const toolResultStr = result.data && typeof result.data === "object" ? jsonStringify(result.data) : String(result.data ?? "");
    endToolSpan(toolResultStr);
    const mappedToolResultBlock = tool.mapToolResultToToolResultBlockParam(
      result.data,
      toolUseID
    );
    const mappedContent = mappedToolResultBlock.content;
    const toolResultSizeBytes = !mappedContent ? 0 : typeof mappedContent === "string" ? mappedContent.length : jsonStringify(mappedContent).length;
    let fileExtension;
    if (processedInput && typeof processedInput === "object") {
      if ((tool.name === FILE_READ_TOOL_NAME || tool.name === FILE_EDIT_TOOL_NAME || tool.name === FILE_WRITE_TOOL_NAME) && "file_path" in processedInput) {
        fileExtension = getFileExtensionForAnalytics(
          String(processedInput.file_path)
        );
      } else if (tool.name === NOTEBOOK_EDIT_TOOL_NAME && "notebook_path" in processedInput) {
        fileExtension = getFileExtensionForAnalytics(
          String(processedInput.notebook_path)
        );
      } else if (tool.name === BASH_TOOL_NAME && "command" in processedInput) {
        const bashInput = processedInput;
        fileExtension = getFileExtensionsFromBashCommand(
          bashInput.command,
          bashInput._simulatedSedEdit?.filePath
        );
      }
    }
    logEvent("tengu_tool_use_success", {
      messageID: messageId,
      toolName: sanitizeToolNameForAnalytics(tool.name),
      isMcp: tool.isMcp ?? false,
      durationMs,
      preToolHookDurationMs,
      toolResultSizeBytes,
      ...fileExtension !== void 0 && { fileExtension },
      queryChainId: toolUseContext.queryTracking?.chainId,
      queryDepth: toolUseContext.queryTracking?.depth,
      ...mcpServerType && {
        mcpServerType
      },
      ...mcpServerBaseUrl && {
        mcpServerBaseUrl
      },
      ...requestId && {
        requestId
      },
      ...mcpToolDetailsForAnalytics(tool.name, mcpServerType, mcpServerBaseUrl)
    });
    if (isToolDetailsLoggingEnabled() && (tool.name === BASH_TOOL_NAME || tool.name === POWERSHELL_TOOL_NAME) && "command" in processedInput && typeof processedInput.command === "string" && processedInput.command.match(/\bgit\s+commit\b/) && result.data && typeof result.data === "object" && "stdout" in result.data) {
      const gitCommitId = parseGitCommitId(String(result.data.stdout));
      if (gitCommitId) {
        toolParameters.git_commit_id = gitCommitId;
      }
    }
    const mcpServerScope = isMcpTool(tool) ? getMcpServerScopeFromToolName(tool.name) : null;
    void logOTelEvent("tool_result", {
      tool_name: sanitizeToolNameForAnalytics(tool.name),
      success: "true",
      duration_ms: String(durationMs),
      ...Object.keys(toolParameters).length > 0 && {
        tool_parameters: jsonStringify(toolParameters)
      },
      ...telemetryToolInput && { tool_input: telemetryToolInput },
      tool_result_size_bytes: String(toolResultSizeBytes),
      ...decisionInfo && {
        decision_source: decisionInfo.source,
        decision_type: decisionInfo.decision
      },
      ...mcpServerScope && { mcp_server_scope: mcpServerScope }
    });
    let toolOutput = result.data;
    const hookResults = [];
    const toolContextModifier = result.contextModifier;
    const mcpMeta = result.mcpMeta;
    async function addToolResult(toolUseResult, preMappedBlock) {
      const toolResultBlock = preMappedBlock ? await processPreMappedToolResultBlock(
        preMappedBlock,
        tool.name,
        tool.maxResultSizeChars
      ) : await processToolResultBlock(tool, toolUseResult, toolUseID);
      const contentBlocks = [toolResultBlock];
      if ("acceptFeedback" in permissionDecision && permissionDecision.acceptFeedback) {
        contentBlocks.push({
          type: "text",
          text: permissionDecision.acceptFeedback
        });
      }
      const allowContentBlocks = "contentBlocks" in permissionDecision ? permissionDecision.contentBlocks : void 0;
      if (allowContentBlocks?.length) {
        contentBlocks.push(...allowContentBlocks);
      }
      let allowImageIds;
      if (allowContentBlocks?.length) {
        const imageCount = count(
          allowContentBlocks,
          (b) => b.type === "image"
        );
        if (imageCount > 0) {
          const startId = getNextImagePasteId(toolUseContext.messages);
          allowImageIds = Array.from(
            { length: imageCount },
            (_, i) => startId + i
          );
        }
      }
      resultingMessages.push({
        message: createUserMessage({
          content: contentBlocks,
          imagePasteIds: allowImageIds,
          toolUseResult: toolUseContext.agentId && !toolUseContext.preserveToolUseResults ? void 0 : toolUseResult,
          mcpMeta: toolUseContext.agentId ? void 0 : mcpMeta,
          sourceToolAssistantUUID: assistantMessage.uuid
        }),
        contextModifier: toolContextModifier ? {
          toolUseID,
          modifyContext: toolContextModifier
        } : void 0
      });
    }
    if (!isMcpTool(tool)) {
      await addToolResult(toolOutput, mappedToolResultBlock);
    }
    const postToolHookInfos = [];
    const postToolHookStart = Date.now();
    for await (const hookResult of runPostToolUseHooks(
      toolUseContext,
      tool,
      toolUseID,
      assistantMessage.message.id,
      processedInput,
      toolOutput,
      requestId,
      mcpServerType,
      mcpServerBaseUrl
    )) {
      if ("updatedMCPToolOutput" in hookResult) {
        if (isMcpTool(tool)) {
          toolOutput = hookResult.updatedMCPToolOutput;
        }
      } else if (isMcpTool(tool)) {
        hookResults.push(hookResult);
        if (hookResult.message.type === "attachment") {
          const att = hookResult.message.attachment;
          if ("command" in att && att.command !== void 0 && "durationMs" in att && att.durationMs !== void 0) {
            postToolHookInfos.push({
              command: att.command,
              durationMs: att.durationMs
            });
          }
        }
      } else {
        resultingMessages.push(hookResult);
        if (hookResult.message.type === "attachment") {
          const att = hookResult.message.attachment;
          if ("command" in att && att.command !== void 0 && "durationMs" in att && att.durationMs !== void 0) {
            postToolHookInfos.push({
              command: att.command,
              durationMs: att.durationMs
            });
          }
        }
      }
    }
    const postToolHookDurationMs = Date.now() - postToolHookStart;
    if (postToolHookDurationMs >= SLOW_PHASE_LOG_THRESHOLD_MS) {
      logForDebugging(
        `Slow PostToolUse hooks: ${postToolHookDurationMs}ms for ${tool.name} (${postToolHookInfos.length} hooks)`,
        { level: "info" }
      );
    }
    if (isMcpTool(tool)) {
      await addToolResult(toolOutput);
    }
    if (process.env.USER_TYPE === "ant" && postToolHookInfos.length > 0) {
      if (postToolHookDurationMs > HOOK_TIMING_DISPLAY_THRESHOLD_MS) {
        resultingMessages.push({
          message: createStopHookSummaryMessage(
            postToolHookInfos.length,
            postToolHookInfos,
            [],
            false,
            void 0,
            false,
            "suggestion",
            void 0,
            "PostToolUse",
            postToolHookDurationMs
          )
        });
      }
    }
    if (result.newMessages && result.newMessages.length > 0) {
      for (const message of result.newMessages) {
        resultingMessages.push({ message });
      }
    }
    if (shouldPreventContinuation) {
      resultingMessages.push({
        message: createAttachmentMessage({
          type: "hook_stopped_continuation",
          message: stopReason || "Execution stopped by hook",
          hookName: `PreToolUse:${tool.name}`,
          toolUseID,
          hookEvent: "PreToolUse"
        })
      });
    }
    for (const hookResult of hookResults) {
      resultingMessages.push(hookResult);
    }
    return resultingMessages;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    addToToolDuration(durationMs);
    endToolExecutionSpan({
      success: false,
      error: errorMessage(error)
    });
    endToolSpan();
    if (error instanceof McpAuthError) {
      toolUseContext.setAppState((prevState) => {
        const serverName = error.serverName;
        const existingClientIndex = prevState.mcp.clients.findIndex(
          (c) => c.name === serverName
        );
        if (existingClientIndex === -1) {
          return prevState;
        }
        const existingClient = prevState.mcp.clients[existingClientIndex];
        if (!existingClient || existingClient.type !== "connected") {
          return prevState;
        }
        const updatedClients = [...prevState.mcp.clients];
        updatedClients[existingClientIndex] = {
          name: serverName,
          type: "needs-auth",
          config: existingClient.config
        };
        return {
          ...prevState,
          mcp: {
            ...prevState.mcp,
            clients: updatedClients
          }
        };
      });
    }
    if (!(error instanceof AbortError)) {
      const errorMsg = errorMessage(error);
      logForDebugging(
        `${tool.name} tool error (${durationMs}ms): ${errorMsg.slice(0, 200)}`
      );
      if (!(error instanceof ShellError)) {
        logError(error);
      }
      logEvent("tengu_tool_use_error", {
        messageID: messageId,
        toolName: sanitizeToolNameForAnalytics(tool.name),
        error: classifyToolError(
          error
        ),
        isMcp: tool.isMcp ?? false,
        queryChainId: toolUseContext.queryTracking?.chainId,
        queryDepth: toolUseContext.queryTracking?.depth,
        ...mcpServerType && {
          mcpServerType
        },
        ...mcpServerBaseUrl && {
          mcpServerBaseUrl
        },
        ...requestId && {
          requestId
        },
        ...mcpToolDetailsForAnalytics(
          tool.name,
          mcpServerType,
          mcpServerBaseUrl
        )
      });
      const mcpServerScope = isMcpTool(tool) ? getMcpServerScopeFromToolName(tool.name) : null;
      void logOTelEvent("tool_result", {
        tool_name: sanitizeToolNameForAnalytics(tool.name),
        use_id: toolUseID,
        success: "false",
        duration_ms: String(durationMs),
        error: errorMessage(error),
        ...Object.keys(toolParameters).length > 0 && {
          tool_parameters: jsonStringify(toolParameters)
        },
        ...telemetryToolInput && { tool_input: telemetryToolInput },
        ...decisionInfo && {
          decision_source: decisionInfo.source,
          decision_type: decisionInfo.decision
        },
        ...mcpServerScope && { mcp_server_scope: mcpServerScope }
      });
    }
    const content = formatError(error);
    const isInterrupt = error instanceof AbortError;
    const hookMessages = [];
    for await (const hookResult of runPostToolUseFailureHooks(
      toolUseContext,
      tool,
      toolUseID,
      messageId,
      processedInput,
      content,
      isInterrupt,
      requestId,
      mcpServerType,
      mcpServerBaseUrl
    )) {
      hookMessages.push(hookResult);
    }
    return [
      {
        message: createUserMessage({
          content: [
            {
              type: "tool_result",
              content,
              is_error: true,
              tool_use_id: toolUseID
            }
          ],
          toolUseResult: `Error: ${content}`,
          mcpMeta: toolUseContext.agentId ? void 0 : error instanceof McpToolCallError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS ? error.mcpMeta : void 0,
          sourceToolAssistantUUID: assistantMessage.uuid
        })
      },
      ...hookMessages
    ];
  } finally {
    stopSessionActivity("tool_exec");
    if (decisionInfo) {
      toolUseContext.toolDecisions?.delete(toolUseID);
    }
  }
}
export {
  HOOK_TIMING_DISPLAY_THRESHOLD_MS,
  buildSchemaNotSentHint,
  classifyToolError,
  runToolUse
};
