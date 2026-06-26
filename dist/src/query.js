var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose, inner;
    if (async) dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) {
      dispose = value[__knownSymbol("dispose")];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") __typeError("Object not disposable");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};
import { FallbackTriggeredError } from "./services/api/withRetry.js";
import {
  calculateTokenWarningState,
  isAutoCompactEnabled
} from "./services/compact/autoCompact.js";
import { buildPostCompactMessages } from "./services/compact/compact.js";
const reactiveCompact = false ? null : null;
const contextCollapse = false ? null : null;
import {
  logEvent
} from "./services/analytics/index.js";
import { ImageSizeError } from "./utils/imageValidation.js";
import { ImageResizeError } from "./utils/imageResizer.js";
import { findToolByName } from "./Tool.js";
import { asSystemPrompt } from "./utils/systemPromptType.js";
import { logError } from "./utils/log.js";
import {
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  isPromptTooLongMessage
} from "./services/api/errors.js";
import { logAntError } from "./utils/debug.js";
import {
  createUserMessage,
  createUserInterruptionMessage,
  normalizeMessagesForAPI,
  createSystemMessage,
  createAssistantAPIErrorMessage,
  getMessagesAfterCompactBoundary,
  createToolUseSummaryMessage,
  stripSignatureBlocks
} from "./utils/messages.js";
import { generateToolUseSummary } from "./services/toolUseSummary/toolUseSummaryGenerator.js";
import { prependUserContext, appendSystemContext } from "./utils/api.js";
import {
  createAttachmentMessage,
  filterDuplicateMemoryAttachments,
  getAttachmentMessages,
  startRelevantMemoryPrefetch
} from "./utils/attachments.js";
const skillPrefetch = false ? null : null;
const jobClassifier = false ? null : null;
import {
  remove as removeFromQueue,
  getCommandsByMaxPriority,
  isSlashCommand
} from "./utils/messageQueueManager.js";
import { notifyCommandLifecycle } from "./utils/commandLifecycle.js";
import { headlessProfilerCheckpoint } from "./utils/headlessProfiler.js";
import {
  getRuntimeMainLoopModel,
  renderModelName
} from "./utils/model/model.js";
import {
  doesMostRecentAssistantMessageExceed200k,
  finalContextTokensFromLastResponse,
  tokenCountWithEstimation
} from "./utils/tokens.js";
import { ESCALATED_MAX_TOKENS } from "./utils/context.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "./services/analytics/growthbook.js";
import { SLEEP_TOOL_NAME } from "./tools/SleepTool/prompt.js";
import { executePostSamplingHooks } from "./utils/hooks/postSamplingHooks.js";
import { executeStopFailureHooks } from "./utils/hooks.js";
import { createDumpPromptsFetch } from "./services/api/dumpPrompts.js";
import { StreamingToolExecutor } from "./services/tools/StreamingToolExecutor.js";
import { queryCheckpoint } from "./utils/queryProfiler.js";
import { runTools } from "./services/tools/toolOrchestration.js";
import { applyToolResultBudget } from "./utils/toolResultStorage.js";
import { recordContentReplacement } from "./utils/sessionStorage.js";
import { handleStopHooks } from "./query/stopHooks.js";
import { buildQueryConfig } from "./query/config.js";
import { productionDeps } from "./query/deps.js";
const feature = (_name) => false;
import "./bootstrap/state.js";
import "./query/tokenBudget.js";
import { count } from "./utils/array.js";
const snipModule = false ? null : null;
const taskSummaryModule = false ? null : null;
function* yieldMissingToolResultBlocks(assistantMessages, errorMessage) {
  for (const assistantMessage of assistantMessages) {
    const toolUseBlocks = assistantMessage.message.content.filter(
      (content) => content.type === "tool_use"
    );
    for (const toolUse of toolUseBlocks) {
      yield createUserMessage({
        content: [
          {
            type: "tool_result",
            content: errorMessage,
            is_error: true,
            tool_use_id: toolUse.id
          }
        ],
        toolUseResult: errorMessage,
        sourceToolAssistantUUID: assistantMessage.uuid
      });
    }
  }
}
const MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3;
function isWithheldMaxOutputTokens(msg) {
  return msg?.type === "assistant" && msg.apiError === "max_output_tokens";
}
async function* query(params) {
  const consumedCommandUuids = [];
  const terminal = yield* queryLoop(params, consumedCommandUuids);
  for (const uuid of consumedCommandUuids) {
    notifyCommandLifecycle(uuid, "completed");
  }
  return terminal;
}
async function* queryLoop(params, consumedCommandUuids) {
  var _stack = [];
  try {
    const {
      systemPrompt,
      userContext,
      systemContext,
      canUseTool,
      fallbackModel,
      querySource,
      maxTurns,
      skipCacheWrite
    } = params;
    const deps = params.deps ?? productionDeps();
    let state = {
      messages: params.messages,
      toolUseContext: params.toolUseContext,
      maxOutputTokensOverride: params.maxOutputTokensOverride,
      autoCompactTracking: void 0,
      stopHookActive: void 0,
      maxOutputTokensRecoveryCount: 0,
      hasAttemptedReactiveCompact: false,
      turnCount: 1,
      pendingToolUseSummary: void 0,
      transition: void 0
    };
    const budgetTracker = false ? createBudgetTracker() : null;
    let taskBudgetRemaining = void 0;
    const config = buildQueryConfig();
    const pendingMemoryPrefetch = __using(_stack, startRelevantMemoryPrefetch(
      state.messages,
      state.toolUseContext
    ));
    while (true) {
      let { toolUseContext } = state;
      const {
        messages,
        autoCompactTracking,
        maxOutputTokensRecoveryCount,
        hasAttemptedReactiveCompact,
        maxOutputTokensOverride,
        pendingToolUseSummary,
        stopHookActive,
        turnCount
      } = state;
      const pendingSkillPrefetch = skillPrefetch?.startSkillDiscoveryPrefetch(
        null,
        messages,
        toolUseContext
      );
      yield { type: "stream_request_start" };
      queryCheckpoint("query_fn_entry");
      if (!toolUseContext.agentId) {
        headlessProfilerCheckpoint("query_started");
      }
      const queryTracking = toolUseContext.queryTracking ? {
        chainId: toolUseContext.queryTracking.chainId,
        depth: toolUseContext.queryTracking.depth + 1
      } : {
        chainId: deps.uuid(),
        depth: 0
      };
      const queryChainIdForAnalytics = queryTracking.chainId;
      toolUseContext = {
        ...toolUseContext,
        queryTracking
      };
      let messagesForQuery = [...getMessagesAfterCompactBoundary(messages)];
      let tracking = autoCompactTracking;
      const persistReplacements = querySource.startsWith("agent:") || querySource.startsWith("repl_main_thread");
      messagesForQuery = await applyToolResultBudget(
        messagesForQuery,
        toolUseContext.contentReplacementState,
        persistReplacements ? (records) => void recordContentReplacement(
          records,
          toolUseContext.agentId
        ).catch(logError) : void 0,
        new Set(
          toolUseContext.options.tools.filter((t) => !Number.isFinite(t.maxResultSizeChars)).map((t) => t.name)
        )
      );
      let snipTokensFreed = 0;
      if (false) {
        queryCheckpoint("query_snip_start");
        const snipResult = snipModule.snipCompactIfNeeded(messagesForQuery);
        messagesForQuery = snipResult.messages;
        snipTokensFreed = snipResult.tokensFreed;
        if (snipResult.boundaryMessage) {
          yield snipResult.boundaryMessage;
        }
        queryCheckpoint("query_snip_end");
      }
      queryCheckpoint("query_microcompact_start");
      const microcompactResult = await deps.microcompact(
        messagesForQuery,
        toolUseContext,
        querySource
      );
      messagesForQuery = microcompactResult.messages;
      const pendingCacheEdits = false ? microcompactResult.compactionInfo?.pendingCacheEdits : void 0;
      queryCheckpoint("query_microcompact_end");
      if (false) {
        const collapseResult = await contextCollapse.applyCollapsesIfNeeded(
          messagesForQuery,
          toolUseContext,
          querySource
        );
        messagesForQuery = collapseResult.messages;
      }
      const fullSystemPrompt = asSystemPrompt(
        appendSystemContext(systemPrompt, systemContext)
      );
      queryCheckpoint("query_autocompact_start");
      const { compactionResult, consecutiveFailures } = await deps.autocompact(
        messagesForQuery,
        toolUseContext,
        {
          systemPrompt,
          userContext,
          systemContext,
          toolUseContext,
          forkContextMessages: messagesForQuery
        },
        querySource,
        tracking,
        snipTokensFreed
      );
      queryCheckpoint("query_autocompact_end");
      if (compactionResult) {
        const {
          preCompactTokenCount,
          postCompactTokenCount,
          truePostCompactTokenCount,
          compactionUsage
        } = compactionResult;
        logEvent("tengu_auto_compact_succeeded", {
          originalMessageCount: messages.length,
          compactedMessageCount: compactionResult.summaryMessages.length + compactionResult.attachments.length + compactionResult.hookResults.length,
          preCompactTokenCount,
          postCompactTokenCount,
          truePostCompactTokenCount,
          compactionInputTokens: compactionUsage?.input_tokens,
          compactionOutputTokens: compactionUsage?.output_tokens,
          compactionCacheReadTokens: compactionUsage?.cache_read_input_tokens ?? 0,
          compactionCacheCreationTokens: compactionUsage?.cache_creation_input_tokens ?? 0,
          compactionTotalTokens: compactionUsage ? compactionUsage.input_tokens + (compactionUsage.cache_creation_input_tokens ?? 0) + (compactionUsage.cache_read_input_tokens ?? 0) + compactionUsage.output_tokens : 0,
          queryChainId: queryChainIdForAnalytics,
          queryDepth: queryTracking.depth
        });
        if (params.taskBudget) {
          const preCompactContext = finalContextTokensFromLastResponse(messagesForQuery);
          taskBudgetRemaining = Math.max(
            0,
            (taskBudgetRemaining ?? params.taskBudget.total) - preCompactContext
          );
        }
        tracking = {
          compacted: true,
          turnId: deps.uuid(),
          turnCounter: 0,
          consecutiveFailures: 0
        };
        const postCompactMessages = buildPostCompactMessages(compactionResult);
        for (const message of postCompactMessages) {
          yield message;
        }
        messagesForQuery = postCompactMessages;
      } else if (consecutiveFailures !== void 0) {
        tracking = {
          ...tracking ?? { compacted: false, turnId: "", turnCounter: 0 },
          consecutiveFailures
        };
      }
      toolUseContext = {
        ...toolUseContext,
        messages: messagesForQuery
      };
      const assistantMessages = [];
      const toolResults = [];
      const toolUseBlocks = [];
      let needsFollowUp = false;
      queryCheckpoint("query_setup_start");
      const useStreamingToolExecution = config.gates.streamingToolExecution;
      let streamingToolExecutor = useStreamingToolExecution ? new StreamingToolExecutor(
        toolUseContext.options.tools,
        canUseTool,
        toolUseContext
      ) : null;
      const appState = toolUseContext.getAppState();
      const permissionMode = appState.toolPermissionContext.mode;
      let currentModel = getRuntimeMainLoopModel({
        permissionMode,
        mainLoopModel: toolUseContext.options.mainLoopModel,
        exceeds200kTokens: permissionMode === "plan" && doesMostRecentAssistantMessageExceed200k(messagesForQuery)
      });
      queryCheckpoint("query_setup_end");
      const dumpPromptsFetch = config.gates.isAnt ? createDumpPromptsFetch(toolUseContext.agentId ?? config.sessionId) : void 0;
      let collapseOwnsIt = false;
      if (false) {
        collapseOwnsIt = (contextCollapse?.isContextCollapseEnabled() ?? false) && isAutoCompactEnabled();
      }
      const mediaRecoveryEnabled = reactiveCompact?.isReactiveCompactEnabled() ?? false;
      if (!compactionResult && querySource !== "compact" && querySource !== "session_memory" && !(reactiveCompact?.isReactiveCompactEnabled() && isAutoCompactEnabled()) && !collapseOwnsIt) {
        const { isAtBlockingLimit } = calculateTokenWarningState(
          tokenCountWithEstimation(messagesForQuery) - snipTokensFreed,
          toolUseContext.options.mainLoopModel
        );
        if (isAtBlockingLimit) {
          yield createAssistantAPIErrorMessage({
            content: PROMPT_TOO_LONG_ERROR_MESSAGE,
            error: "invalid_request"
          });
          return { reason: "blocking_limit" };
        }
      }
      let attemptWithFallback = true;
      queryCheckpoint("query_api_loop_start");
      try {
        while (attemptWithFallback) {
          attemptWithFallback = false;
          try {
            let streamingFallbackOccured = false;
            queryCheckpoint("query_api_streaming_start");
            for await (const message of deps.callModel({
              messages: prependUserContext(messagesForQuery, userContext),
              systemPrompt: fullSystemPrompt,
              thinkingConfig: toolUseContext.options.thinkingConfig,
              tools: toolUseContext.options.tools,
              signal: toolUseContext.abortController.signal,
              options: {
                async getToolPermissionContext() {
                  const appState2 = toolUseContext.getAppState();
                  return appState2.toolPermissionContext;
                },
                model: currentModel,
                ...config.gates.fastModeEnabled && {
                  fastMode: appState.fastMode
                },
                toolChoice: void 0,
                isNonInteractiveSession: toolUseContext.options.isNonInteractiveSession,
                fallbackModel,
                onStreamingFallback: () => {
                  streamingFallbackOccured = true;
                },
                querySource,
                agents: toolUseContext.options.agentDefinitions.activeAgents,
                allowedAgentTypes: toolUseContext.options.agentDefinitions.allowedAgentTypes,
                hasAppendSystemPrompt: !!toolUseContext.options.appendSystemPrompt,
                maxOutputTokensOverride,
                fetchOverride: dumpPromptsFetch,
                mcpTools: appState.mcp.tools,
                hasPendingMcpServers: appState.mcp.clients.some(
                  (c) => c.type === "pending"
                ),
                queryTracking,
                effortValue: appState.effortValue,
                advisorModel: appState.advisorModel,
                skipCacheWrite,
                agentId: toolUseContext.agentId,
                addNotification: toolUseContext.addNotification,
                ...params.taskBudget && {
                  taskBudget: {
                    total: params.taskBudget.total,
                    ...taskBudgetRemaining !== void 0 && {
                      remaining: taskBudgetRemaining
                    }
                  }
                }
              }
            })) {
              if (streamingFallbackOccured) {
                for (const msg of assistantMessages) {
                  yield { type: "tombstone", message: msg };
                }
                logEvent("tengu_orphaned_messages_tombstoned", {
                  orphanedMessageCount: assistantMessages.length,
                  queryChainId: queryChainIdForAnalytics,
                  queryDepth: queryTracking.depth
                });
                assistantMessages.length = 0;
                toolResults.length = 0;
                toolUseBlocks.length = 0;
                needsFollowUp = false;
                if (streamingToolExecutor) {
                  streamingToolExecutor.discard();
                  streamingToolExecutor = new StreamingToolExecutor(
                    toolUseContext.options.tools,
                    canUseTool,
                    toolUseContext
                  );
                }
              }
              let yieldMessage = message;
              if (message.type === "assistant") {
                let clonedContent;
                for (let i = 0; i < message.message.content.length; i++) {
                  const block = message.message.content[i];
                  if (block.type === "tool_use" && typeof block.input === "object" && block.input !== null) {
                    const tool = findToolByName(
                      toolUseContext.options.tools,
                      block.name
                    );
                    if (tool?.backfillObservableInput) {
                      const originalInput = block.input;
                      const inputCopy = { ...originalInput };
                      tool.backfillObservableInput(inputCopy);
                      const addedFields = Object.keys(inputCopy).some(
                        (k) => !(k in originalInput)
                      );
                      if (addedFields) {
                        clonedContent ??= [...message.message.content];
                        clonedContent[i] = { ...block, input: inputCopy };
                      }
                    }
                  }
                }
                if (clonedContent) {
                  yieldMessage = {
                    ...message,
                    message: { ...message.message, content: clonedContent }
                  };
                }
              }
              let withheld = false;
              if (false) {
                if (contextCollapse?.isWithheldPromptTooLong(
                  message,
                  isPromptTooLongMessage,
                  querySource
                )) {
                  withheld = true;
                }
              }
              if (reactiveCompact?.isWithheldPromptTooLong(message)) {
                withheld = true;
              }
              if (mediaRecoveryEnabled && reactiveCompact?.isWithheldMediaSizeError(message)) {
                withheld = true;
              }
              if (isWithheldMaxOutputTokens(message)) {
                withheld = true;
              }
              if (!withheld) {
                yield yieldMessage;
              }
              if (message.type === "assistant") {
                assistantMessages.push(message);
                const msgToolUseBlocks = message.message.content.filter(
                  (content) => content.type === "tool_use"
                );
                if (msgToolUseBlocks.length > 0) {
                  toolUseBlocks.push(...msgToolUseBlocks);
                  needsFollowUp = true;
                }
                if (streamingToolExecutor && !toolUseContext.abortController.signal.aborted) {
                  for (const toolBlock of msgToolUseBlocks) {
                    streamingToolExecutor.addTool(toolBlock, message);
                  }
                }
              }
              if (streamingToolExecutor && !toolUseContext.abortController.signal.aborted) {
                for (const result of streamingToolExecutor.getCompletedResults()) {
                  if (result.message) {
                    yield result.message;
                    toolResults.push(
                      ...normalizeMessagesForAPI(
                        [result.message],
                        toolUseContext.options.tools
                      ).filter((_2) => _2.type === "user")
                    );
                  }
                }
              }
            }
            queryCheckpoint("query_api_streaming_end");
            if (false) {
              const lastAssistant = assistantMessages.at(-1);
              const usage = lastAssistant?.message.usage;
              const cumulativeDeleted = usage ? usage.cache_deleted_input_tokens ?? 0 : 0;
              const deletedTokens = Math.max(
                0,
                cumulativeDeleted - pendingCacheEdits.baselineCacheDeletedTokens
              );
              if (deletedTokens > 0) {
                yield createMicrocompactBoundaryMessage(
                  pendingCacheEdits.trigger,
                  0,
                  deletedTokens,
                  pendingCacheEdits.deletedToolIds,
                  []
                );
              }
            }
          } catch (innerError) {
            if (innerError instanceof FallbackTriggeredError && fallbackModel) {
              currentModel = fallbackModel;
              attemptWithFallback = true;
              yield* yieldMissingToolResultBlocks(
                assistantMessages,
                "Model fallback triggered"
              );
              assistantMessages.length = 0;
              toolResults.length = 0;
              toolUseBlocks.length = 0;
              needsFollowUp = false;
              if (streamingToolExecutor) {
                streamingToolExecutor.discard();
                streamingToolExecutor = new StreamingToolExecutor(
                  toolUseContext.options.tools,
                  canUseTool,
                  toolUseContext
                );
              }
              toolUseContext.options.mainLoopModel = fallbackModel;
              if (process.env.USER_TYPE === "ant") {
                messagesForQuery = stripSignatureBlocks(messagesForQuery);
              }
              logEvent("tengu_model_fallback_triggered", {
                original_model: innerError.originalModel,
                fallback_model: fallbackModel,
                entrypoint: "cli",
                queryChainId: queryChainIdForAnalytics,
                queryDepth: queryTracking.depth
              });
              yield createSystemMessage(
                `Switched to ${renderModelName(innerError.fallbackModel)} due to high demand for ${renderModelName(innerError.originalModel)}`,
                "warning"
              );
              continue;
            }
            throw innerError;
          }
        }
      } catch (error) {
        logError(error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        logEvent("tengu_query_error", {
          assistantMessages: assistantMessages.length,
          toolUses: assistantMessages.flatMap(
            (_2) => _2.message.content.filter((content) => content.type === "tool_use")
          ).length,
          queryChainId: queryChainIdForAnalytics,
          queryDepth: queryTracking.depth
        });
        if (error instanceof ImageSizeError || error instanceof ImageResizeError) {
          yield createAssistantAPIErrorMessage({
            content: error.message
          });
          return { reason: "image_error" };
        }
        yield* yieldMissingToolResultBlocks(assistantMessages, errorMessage);
        yield createAssistantAPIErrorMessage({
          content: errorMessage
        });
        logAntError("Query error", error);
        return { reason: "model_error", error };
      }
      if (assistantMessages.length > 0) {
        void executePostSamplingHooks(
          [...messagesForQuery, ...assistantMessages],
          systemPrompt,
          userContext,
          systemContext,
          toolUseContext,
          querySource
        );
      }
      if (toolUseContext.abortController.signal.aborted) {
        if (streamingToolExecutor) {
          for await (const update of streamingToolExecutor.getRemainingResults()) {
            if (update.message) {
              yield update.message;
            }
          }
        } else {
          yield* yieldMissingToolResultBlocks(
            assistantMessages,
            "Interrupted by user"
          );
        }
        if (false) {
          try {
            const { cleanupComputerUseAfterTurn } = await null;
            await cleanupComputerUseAfterTurn(toolUseContext);
          } catch {
          }
        }
        if (toolUseContext.abortController.signal.reason !== "interrupt") {
          yield createUserInterruptionMessage({
            toolUse: false
          });
        }
        return { reason: "aborted_streaming" };
      }
      if (pendingToolUseSummary) {
        const summary = await pendingToolUseSummary;
        if (summary) {
          yield summary;
        }
      }
      if (!needsFollowUp) {
        const lastMessage = assistantMessages.at(-1);
        const isWithheld413 = lastMessage?.type === "assistant" && lastMessage.isApiErrorMessage && isPromptTooLongMessage(lastMessage);
        const isWithheldMedia = mediaRecoveryEnabled && reactiveCompact?.isWithheldMediaSizeError(lastMessage);
        if (isWithheld413) {
          if (false) {
            const drained = contextCollapse.recoverFromOverflow(
              messagesForQuery,
              querySource
            );
            if (drained.committed > 0) {
              const next2 = {
                messages: drained.messages,
                toolUseContext,
                autoCompactTracking: tracking,
                maxOutputTokensRecoveryCount,
                hasAttemptedReactiveCompact,
                maxOutputTokensOverride: void 0,
                pendingToolUseSummary: void 0,
                stopHookActive: void 0,
                turnCount,
                transition: {
                  reason: "collapse_drain_retry",
                  committed: drained.committed
                }
              };
              state = next2;
              continue;
            }
          }
        }
        if ((isWithheld413 || isWithheldMedia) && reactiveCompact) {
          const compacted = await reactiveCompact.tryReactiveCompact({
            hasAttempted: hasAttemptedReactiveCompact,
            querySource,
            aborted: toolUseContext.abortController.signal.aborted,
            messages: messagesForQuery,
            cacheSafeParams: {
              systemPrompt,
              userContext,
              systemContext,
              toolUseContext,
              forkContextMessages: messagesForQuery
            }
          });
          if (compacted) {
            if (params.taskBudget) {
              const preCompactContext = finalContextTokensFromLastResponse(messagesForQuery);
              taskBudgetRemaining = Math.max(
                0,
                (taskBudgetRemaining ?? params.taskBudget.total) - preCompactContext
              );
            }
            const postCompactMessages = buildPostCompactMessages(compacted);
            for (const msg of postCompactMessages) {
              yield msg;
            }
            const next2 = {
              messages: postCompactMessages,
              toolUseContext,
              autoCompactTracking: void 0,
              maxOutputTokensRecoveryCount,
              hasAttemptedReactiveCompact: true,
              maxOutputTokensOverride: void 0,
              pendingToolUseSummary: void 0,
              stopHookActive: void 0,
              turnCount,
              transition: { reason: "reactive_compact_retry" }
            };
            state = next2;
            continue;
          }
          yield lastMessage;
          void executeStopFailureHooks(lastMessage, toolUseContext);
          return { reason: isWithheldMedia ? "image_error" : "prompt_too_long" };
        } else if (false) {
          yield lastMessage;
          void executeStopFailureHooks(lastMessage, toolUseContext);
          return { reason: "prompt_too_long" };
        }
        if (isWithheldMaxOutputTokens(lastMessage)) {
          const capEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
            "tengu_otk_slot_v1",
            false
          );
          if (capEnabled && maxOutputTokensOverride === void 0 && !process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS) {
            logEvent("tengu_max_tokens_escalate", {
              escalatedTo: ESCALATED_MAX_TOKENS
            });
            const next2 = {
              messages: messagesForQuery,
              toolUseContext,
              autoCompactTracking: tracking,
              maxOutputTokensRecoveryCount,
              hasAttemptedReactiveCompact,
              maxOutputTokensOverride: ESCALATED_MAX_TOKENS,
              pendingToolUseSummary: void 0,
              stopHookActive: void 0,
              turnCount,
              transition: { reason: "max_output_tokens_escalate" }
            };
            state = next2;
            continue;
          }
          if (maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT) {
            const recoveryMessage = createUserMessage({
              content: `Output token limit hit. Resume directly \u2014 no apology, no recap of what you were doing. Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces.`,
              isMeta: true
            });
            const next2 = {
              messages: [
                ...messagesForQuery,
                ...assistantMessages,
                recoveryMessage
              ],
              toolUseContext,
              autoCompactTracking: tracking,
              maxOutputTokensRecoveryCount: maxOutputTokensRecoveryCount + 1,
              hasAttemptedReactiveCompact,
              maxOutputTokensOverride: void 0,
              pendingToolUseSummary: void 0,
              stopHookActive: void 0,
              turnCount,
              transition: {
                reason: "max_output_tokens_recovery",
                attempt: maxOutputTokensRecoveryCount + 1
              }
            };
            state = next2;
            continue;
          }
          yield lastMessage;
        }
        if (lastMessage?.isApiErrorMessage) {
          void executeStopFailureHooks(lastMessage, toolUseContext);
          return { reason: "completed" };
        }
        const stopHookResult = yield* handleStopHooks(
          messagesForQuery,
          assistantMessages,
          systemPrompt,
          userContext,
          systemContext,
          toolUseContext,
          querySource,
          stopHookActive
        );
        if (stopHookResult.preventContinuation) {
          return { reason: "stop_hook_prevented" };
        }
        if (stopHookResult.blockingErrors.length > 0) {
          const next2 = {
            messages: [
              ...messagesForQuery,
              ...assistantMessages,
              ...stopHookResult.blockingErrors
            ],
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount: 0,
            // Preserve the reactive compact guard — if compact already ran and
            // couldn't recover from prompt-too-long, retrying after a stop-hook
            // blocking error will produce the same result. Resetting to false
            // here caused an infinite loop: compact → still too long → error →
            // stop hook blocking → compact → … burning thousands of API calls.
            hasAttemptedReactiveCompact,
            maxOutputTokensOverride: void 0,
            pendingToolUseSummary: void 0,
            stopHookActive: true,
            turnCount,
            transition: { reason: "stop_hook_blocking" }
          };
          state = next2;
          continue;
        }
        if (false) {
          const decision = checkTokenBudget(
            budgetTracker,
            toolUseContext.agentId,
            getCurrentTurnTokenBudget(),
            getTurnOutputTokens()
          );
          if (decision.action === "continue") {
            incrementBudgetContinuationCount();
            logForDebugging(
              `Token budget continuation #${decision.continuationCount}: ${decision.pct}% (${decision.turnTokens.toLocaleString()} / ${decision.budget.toLocaleString()})`
            );
            state = {
              messages: [
                ...messagesForQuery,
                ...assistantMessages,
                createUserMessage({
                  content: decision.nudgeMessage,
                  isMeta: true
                })
              ],
              toolUseContext,
              autoCompactTracking: tracking,
              maxOutputTokensRecoveryCount: 0,
              hasAttemptedReactiveCompact: false,
              maxOutputTokensOverride: void 0,
              pendingToolUseSummary: void 0,
              stopHookActive: void 0,
              turnCount,
              transition: { reason: "token_budget_continuation" }
            };
            continue;
          }
          if (decision.completionEvent) {
            if (decision.completionEvent.diminishingReturns) {
              logForDebugging(
                `Token budget early stop: diminishing returns at ${decision.completionEvent.pct}%`
              );
            }
            logEvent("tengu_token_budget_completed", {
              ...decision.completionEvent,
              queryChainId: queryChainIdForAnalytics,
              queryDepth: queryTracking.depth
            });
          }
        }
        return { reason: "completed" };
      }
      let shouldPreventContinuation = false;
      let updatedToolUseContext = toolUseContext;
      queryCheckpoint("query_tool_execution_start");
      if (streamingToolExecutor) {
        logEvent("tengu_streaming_tool_execution_used", {
          tool_count: toolUseBlocks.length,
          queryChainId: queryChainIdForAnalytics,
          queryDepth: queryTracking.depth
        });
      } else {
        logEvent("tengu_streaming_tool_execution_not_used", {
          tool_count: toolUseBlocks.length,
          queryChainId: queryChainIdForAnalytics,
          queryDepth: queryTracking.depth
        });
      }
      const toolUpdates = streamingToolExecutor ? streamingToolExecutor.getRemainingResults() : runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext);
      for await (const update of toolUpdates) {
        if (update.message) {
          yield update.message;
          if (update.message.type === "attachment" && update.message.attachment.type === "hook_stopped_continuation") {
            shouldPreventContinuation = true;
          }
          toolResults.push(
            ...normalizeMessagesForAPI(
              [update.message],
              toolUseContext.options.tools
            ).filter((_2) => _2.type === "user")
          );
        }
        if (update.newContext) {
          updatedToolUseContext = {
            ...update.newContext,
            queryTracking
          };
        }
      }
      queryCheckpoint("query_tool_execution_end");
      let nextPendingToolUseSummary;
      if (config.gates.emitToolUseSummaries && toolUseBlocks.length > 0 && !toolUseContext.abortController.signal.aborted && !toolUseContext.agentId) {
        const lastAssistantMessage = assistantMessages.at(-1);
        let lastAssistantText;
        if (lastAssistantMessage) {
          const textBlocks = lastAssistantMessage.message.content.filter(
            (block) => block.type === "text"
          );
          if (textBlocks.length > 0) {
            const lastTextBlock = textBlocks.at(-1);
            if (lastTextBlock && "text" in lastTextBlock) {
              lastAssistantText = lastTextBlock.text;
            }
          }
        }
        const toolUseIds = toolUseBlocks.map((block) => block.id);
        const toolInfoForSummary = toolUseBlocks.map((block) => {
          const toolResult = toolResults.find(
            (result) => result.type === "user" && Array.isArray(result.message.content) && result.message.content.some(
              (content) => content.type === "tool_result" && content.tool_use_id === block.id
            )
          );
          const resultContent = toolResult?.type === "user" && Array.isArray(toolResult.message.content) ? toolResult.message.content.find(
            (c) => c.type === "tool_result" && c.tool_use_id === block.id
          ) : void 0;
          return {
            name: block.name,
            input: block.input,
            output: resultContent && "content" in resultContent ? resultContent.content : null
          };
        });
        nextPendingToolUseSummary = generateToolUseSummary({
          tools: toolInfoForSummary,
          signal: toolUseContext.abortController.signal,
          isNonInteractiveSession: toolUseContext.options.isNonInteractiveSession,
          lastAssistantText
        }).then((summary) => {
          if (summary) {
            return createToolUseSummaryMessage(summary, toolUseIds);
          }
          return null;
        }).catch(() => null);
      }
      if (toolUseContext.abortController.signal.aborted) {
        if (false) {
          try {
            const { cleanupComputerUseAfterTurn } = await null;
            await cleanupComputerUseAfterTurn(toolUseContext);
          } catch {
          }
        }
        if (toolUseContext.abortController.signal.reason !== "interrupt") {
          yield createUserInterruptionMessage({
            toolUse: true
          });
        }
        const nextTurnCountOnAbort = turnCount + 1;
        if (maxTurns && nextTurnCountOnAbort > maxTurns) {
          yield createAttachmentMessage({
            type: "max_turns_reached",
            maxTurns,
            turnCount: nextTurnCountOnAbort
          });
        }
        return { reason: "aborted_tools" };
      }
      if (shouldPreventContinuation) {
        return { reason: "hook_stopped" };
      }
      if (tracking?.compacted) {
        tracking.turnCounter++;
        logEvent("tengu_post_autocompact_turn", {
          turnId: tracking.turnId,
          turnCounter: tracking.turnCounter,
          queryChainId: queryChainIdForAnalytics,
          queryDepth: queryTracking.depth
        });
      }
      logEvent("tengu_query_before_attachments", {
        messagesForQueryCount: messagesForQuery.length,
        assistantMessagesCount: assistantMessages.length,
        toolResultsCount: toolResults.length,
        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth
      });
      const sleepRan = toolUseBlocks.some((b) => b.name === SLEEP_TOOL_NAME);
      const isMainThread = querySource.startsWith("repl_main_thread") || querySource === "sdk";
      const currentAgentId = toolUseContext.agentId;
      const queuedCommandsSnapshot = getCommandsByMaxPriority(
        sleepRan ? "later" : "next"
      ).filter((cmd) => {
        if (isSlashCommand(cmd)) return false;
        if (isMainThread) return cmd.agentId === void 0;
        return cmd.mode === "task-notification" && cmd.agentId === currentAgentId;
      });
      for await (const attachment of getAttachmentMessages(
        null,
        updatedToolUseContext,
        null,
        queuedCommandsSnapshot,
        [...messagesForQuery, ...assistantMessages, ...toolResults],
        querySource
      )) {
        yield attachment;
        toolResults.push(attachment);
      }
      if (pendingMemoryPrefetch && pendingMemoryPrefetch.settledAt !== null && pendingMemoryPrefetch.consumedOnIteration === -1) {
        const memoryAttachments = filterDuplicateMemoryAttachments(
          await pendingMemoryPrefetch.promise,
          toolUseContext.readFileState
        );
        for (const memAttachment of memoryAttachments) {
          const msg = createAttachmentMessage(memAttachment);
          yield msg;
          toolResults.push(msg);
        }
        pendingMemoryPrefetch.consumedOnIteration = turnCount - 1;
      }
      if (skillPrefetch && pendingSkillPrefetch) {
        const skillAttachments = await skillPrefetch.collectSkillDiscoveryPrefetch(pendingSkillPrefetch);
        for (const att of skillAttachments) {
          const msg = createAttachmentMessage(att);
          yield msg;
          toolResults.push(msg);
        }
      }
      const consumedCommands = queuedCommandsSnapshot.filter(
        (cmd) => cmd.mode === "prompt" || cmd.mode === "task-notification"
      );
      if (consumedCommands.length > 0) {
        for (const cmd of consumedCommands) {
          if (cmd.uuid) {
            consumedCommandUuids.push(cmd.uuid);
            notifyCommandLifecycle(cmd.uuid, "started");
          }
        }
        removeFromQueue(consumedCommands);
      }
      const fileChangeAttachmentCount = count(
        toolResults,
        (tr) => tr.type === "attachment" && tr.attachment.type === "edited_text_file"
      );
      logEvent("tengu_query_after_attachments", {
        totalToolResultsCount: toolResults.length,
        fileChangeAttachmentCount,
        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth
      });
      if (updatedToolUseContext.options.refreshTools) {
        const refreshedTools = updatedToolUseContext.options.refreshTools();
        if (refreshedTools !== updatedToolUseContext.options.tools) {
          updatedToolUseContext = {
            ...updatedToolUseContext,
            options: {
              ...updatedToolUseContext.options,
              tools: refreshedTools
            }
          };
        }
      }
      const toolUseContextWithQueryTracking = {
        ...updatedToolUseContext,
        queryTracking
      };
      const nextTurnCount = turnCount + 1;
      if (false) {
        if (!toolUseContext.agentId && taskSummaryModule.shouldGenerateTaskSummary()) {
          taskSummaryModule.maybeGenerateTaskSummary({
            systemPrompt,
            userContext,
            systemContext,
            toolUseContext,
            forkContextMessages: [
              ...messagesForQuery,
              ...assistantMessages,
              ...toolResults
            ]
          });
        }
      }
      if (maxTurns && nextTurnCount > maxTurns) {
        yield createAttachmentMessage({
          type: "max_turns_reached",
          maxTurns,
          turnCount: nextTurnCount
        });
        return { reason: "max_turns", turnCount: nextTurnCount };
      }
      queryCheckpoint("query_recursive_call");
      const next = {
        messages: [...messagesForQuery, ...assistantMessages, ...toolResults],
        toolUseContext: toolUseContextWithQueryTracking,
        autoCompactTracking: tracking,
        turnCount: nextTurnCount,
        maxOutputTokensRecoveryCount: 0,
        hasAttemptedReactiveCompact: false,
        pendingToolUseSummary: nextPendingToolUseSummary,
        maxOutputTokensOverride: void 0,
        stopHookActive,
        transition: { reason: "next_turn" }
      };
      state = next;
    }
  } catch (_) {
    var _error = _, _hasError = true;
  } finally {
    __callDispose(_stack, _error, _hasError);
  }
}
export {
  query
};
