import { randomUUID } from "crypto";
import { query } from "../query.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { accumulateUsage, updateUsage } from "../services/api/claude.js";
import { EMPTY_USAGE } from "../services/api/logging.js";
import { createChildAbortController } from "./abortController.js";
import { logForDebugging } from "./debug.js";
import { cloneFileStateCache } from "./fileStateCache.js";
import {
  createUserMessage,
  extractTextContent,
  getLastAssistantMessage
} from "./messages.js";
import { createDenialTrackingState } from "./permissions/denialTracking.js";
import { parseToolListFromCLI } from "./permissions/permissionSetup.js";
import { recordSidechainTranscript } from "./sessionStorage.js";
import {
  cloneContentReplacementState
} from "./toolResultStorage.js";
import { createAgentId } from "./uuid.js";
let lastCacheSafeParams = null;
function saveCacheSafeParams(params) {
  lastCacheSafeParams = params;
}
function getLastCacheSafeParams() {
  return lastCacheSafeParams;
}
function createCacheSafeParams(context) {
  return {
    systemPrompt: context.systemPrompt,
    userContext: context.userContext,
    systemContext: context.systemContext,
    toolUseContext: context.toolUseContext,
    forkContextMessages: context.messages
  };
}
function createGetAppStateWithAllowedTools(baseGetAppState, allowedTools) {
  if (allowedTools.length === 0) return baseGetAppState;
  return () => {
    const appState = baseGetAppState();
    return {
      ...appState,
      toolPermissionContext: {
        ...appState.toolPermissionContext,
        alwaysAllowRules: {
          ...appState.toolPermissionContext.alwaysAllowRules,
          command: [
            .../* @__PURE__ */ new Set([
              ...appState.toolPermissionContext.alwaysAllowRules.command || [],
              ...allowedTools
            ])
          ]
        }
      }
    };
  };
}
async function prepareForkedCommandContext(command, args, context) {
  const skillPrompt = await command.getPromptForCommand(args, context);
  const skillContent = skillPrompt.map((block) => block.type === "text" ? block.text : "").join("\n");
  const allowedTools = parseToolListFromCLI(command.allowedTools ?? []);
  const modifiedGetAppState = createGetAppStateWithAllowedTools(
    context.getAppState,
    allowedTools
  );
  const agentTypeName = command.agent ?? "general-purpose";
  const agents = context.options.agentDefinitions.activeAgents;
  const baseAgent = agents.find((a) => a.agentType === agentTypeName) ?? agents.find((a) => a.agentType === "general-purpose") ?? agents[0];
  if (!baseAgent) {
    throw new Error("No agent available for forked execution");
  }
  const promptMessages = [createUserMessage({ content: skillContent })];
  return {
    skillContent,
    modifiedGetAppState,
    baseAgent,
    promptMessages
  };
}
function extractResultText(agentMessages, defaultText = "Execution completed") {
  const lastAssistantMessage = getLastAssistantMessage(agentMessages);
  if (!lastAssistantMessage) return defaultText;
  const textContent = extractTextContent(
    lastAssistantMessage.message.content,
    "\n"
  );
  return textContent || defaultText;
}
function createSubagentContext(parentContext, overrides) {
  const abortController = overrides?.abortController ?? (overrides?.shareAbortController ? parentContext.abortController : createChildAbortController(parentContext.abortController));
  const getAppState = overrides?.getAppState ? overrides.getAppState : overrides?.shareAbortController ? parentContext.getAppState : () => {
    const state = parentContext.getAppState();
    if (state.toolPermissionContext.shouldAvoidPermissionPrompts) {
      return state;
    }
    return {
      ...state,
      toolPermissionContext: {
        ...state.toolPermissionContext,
        shouldAvoidPermissionPrompts: true
      }
    };
  };
  return {
    // Mutable state - cloned by default to maintain isolation
    // Clone overrides.readFileState if provided, otherwise clone from parent
    readFileState: cloneFileStateCache(
      overrides?.readFileState ?? parentContext.readFileState
    ),
    nestedMemoryAttachmentTriggers: /* @__PURE__ */ new Set(),
    loadedNestedMemoryPaths: /* @__PURE__ */ new Set(),
    dynamicSkillDirTriggers: /* @__PURE__ */ new Set(),
    // Per-subagent: tracks skills surfaced by discovery for was_discovered telemetry (SkillTool.ts:116)
    discoveredSkillNames: /* @__PURE__ */ new Set(),
    toolDecisions: void 0,
    // Budget decisions: override > clone of parent > undefined (feature off).
    //
    // Clone by default (not fresh): cache-sharing forks process parent
    // messages containing parent tool_use_ids. A fresh state would see
    // them as unseen and make divergent replacement decisions → wire
    // prefix differs → cache miss. A clone makes identical decisions →
    // cache hit. For non-forking subagents the parent UUIDs never match
    // — clone is a harmless no-op.
    //
    // Override: AgentTool resume (reconstructed from sidechain records)
    // and inProcessRunner (per-teammate persistent loop state).
    contentReplacementState: overrides?.contentReplacementState ?? (parentContext.contentReplacementState ? cloneContentReplacementState(parentContext.contentReplacementState) : void 0),
    // AbortController
    abortController,
    // AppState access
    getAppState,
    setAppState: overrides?.shareSetAppState ? parentContext.setAppState : () => {
    },
    // Task registration/kill must always reach the root store, even when
    // setAppState is a no-op — otherwise async agents' background bash tasks
    // are never registered and never killed (PPID=1 zombie).
    setAppStateForTasks: parentContext.setAppStateForTasks ?? parentContext.setAppState,
    // Async subagents whose setAppState is a no-op need local denial tracking
    // so the denial counter actually accumulates across retries.
    localDenialTracking: overrides?.shareSetAppState ? parentContext.localDenialTracking : createDenialTrackingState(),
    // Mutation callbacks - no-op by default
    setInProgressToolUseIDs: () => {
    },
    setResponseLength: overrides?.shareSetResponseLength ? parentContext.setResponseLength : () => {
    },
    pushApiMetricsEntry: overrides?.shareSetResponseLength ? parentContext.pushApiMetricsEntry : void 0,
    updateFileHistoryState: () => {
    },
    // Attribution is scoped and functional (prev => next) — safe to share even
    // when setAppState is stubbed. Concurrent calls compose via React's state queue.
    updateAttributionState: parentContext.updateAttributionState,
    // UI callbacks - undefined for subagents (can't control parent UI)
    addNotification: void 0,
    setToolJSX: void 0,
    setStreamMode: void 0,
    setSDKStatus: void 0,
    openMessageSelector: void 0,
    // Fields that can be overridden or copied from parent
    options: overrides?.options ?? parentContext.options,
    messages: overrides?.messages ?? parentContext.messages,
    // Generate new agentId for subagents (each subagent should have its own ID)
    agentId: overrides?.agentId ?? createAgentId(),
    agentType: overrides?.agentType,
    // Create new query tracking chain for subagent with incremented depth
    queryTracking: {
      chainId: randomUUID(),
      depth: (parentContext.queryTracking?.depth ?? -1) + 1
    },
    fileReadingLimits: parentContext.fileReadingLimits,
    userModified: parentContext.userModified,
    criticalSystemReminder_EXPERIMENTAL: overrides?.criticalSystemReminder_EXPERIMENTAL,
    requireCanUseTool: overrides?.requireCanUseTool
  };
}
async function runForkedAgent({
  promptMessages,
  cacheSafeParams,
  canUseTool,
  querySource,
  forkLabel,
  overrides,
  maxOutputTokens,
  maxTurns,
  onMessage,
  skipTranscript,
  skipCacheWrite
}) {
  const startTime = Date.now();
  const outputMessages = [];
  let totalUsage = { ...EMPTY_USAGE };
  const {
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext,
    forkContextMessages
  } = cacheSafeParams;
  const isolatedToolUseContext = createSubagentContext(
    toolUseContext,
    overrides
  );
  const initialMessages = [...forkContextMessages, ...promptMessages];
  const agentId = skipTranscript ? void 0 : createAgentId(forkLabel);
  let lastRecordedUuid = null;
  if (agentId) {
    await recordSidechainTranscript(initialMessages, agentId).catch(
      (err) => logForDebugging(
        `Forked agent [${forkLabel}] failed to record initial transcript: ${err}`
      )
    );
    lastRecordedUuid = initialMessages.length > 0 ? initialMessages[initialMessages.length - 1].uuid : null;
  }
  try {
    for await (const message of query({
      messages: initialMessages,
      systemPrompt,
      userContext,
      systemContext,
      canUseTool,
      toolUseContext: isolatedToolUseContext,
      querySource,
      maxOutputTokensOverride: maxOutputTokens,
      maxTurns,
      skipCacheWrite
    })) {
      if (message.type === "stream_event") {
        if ("event" in message && message.event?.type === "message_delta" && message.event.usage) {
          const turnUsage = updateUsage({ ...EMPTY_USAGE }, message.event.usage);
          totalUsage = accumulateUsage(totalUsage, turnUsage);
        }
        continue;
      }
      if (message.type === "stream_request_start") {
        continue;
      }
      logForDebugging(
        `Forked agent [${forkLabel}] received message: type=${message.type}`
      );
      outputMessages.push(message);
      onMessage?.(message);
      const msg = message;
      if (agentId && (msg.type === "assistant" || msg.type === "user" || msg.type === "progress")) {
        await recordSidechainTranscript([msg], agentId, lastRecordedUuid).catch(
          (err) => logForDebugging(
            `Forked agent [${forkLabel}] failed to record transcript: ${err}`
          )
        );
        if (msg.type !== "progress") {
          lastRecordedUuid = msg.uuid;
        }
      }
    }
  } finally {
    isolatedToolUseContext.readFileState.clear();
    initialMessages.length = 0;
  }
  logForDebugging(
    `Forked agent [${forkLabel}] finished: ${outputMessages.length} messages, types=[${outputMessages.map((m) => m.type).join(", ")}], totalUsage: input=${totalUsage.input_tokens} output=${totalUsage.output_tokens} cacheRead=${totalUsage.cache_read_input_tokens} cacheCreate=${totalUsage.cache_creation_input_tokens}`
  );
  const durationMs = Date.now() - startTime;
  logForkAgentQueryEvent({
    forkLabel,
    querySource,
    durationMs,
    messageCount: outputMessages.length,
    totalUsage,
    queryTracking: toolUseContext.queryTracking
  });
  return {
    messages: outputMessages,
    totalUsage
  };
}
function logForkAgentQueryEvent({
  forkLabel,
  querySource,
  durationMs,
  messageCount,
  totalUsage,
  queryTracking
}) {
  const totalInputTokens = totalUsage.input_tokens + totalUsage.cache_creation_input_tokens + totalUsage.cache_read_input_tokens;
  const cacheHitRate = totalInputTokens > 0 ? totalUsage.cache_read_input_tokens / totalInputTokens : 0;
  logEvent("tengu_fork_agent_query", {
    // Metadata
    forkLabel,
    querySource,
    durationMs,
    messageCount,
    // NonNullableUsage fields
    inputTokens: totalUsage.input_tokens,
    outputTokens: totalUsage.output_tokens,
    cacheReadInputTokens: totalUsage.cache_read_input_tokens,
    cacheCreationInputTokens: totalUsage.cache_creation_input_tokens,
    serviceTier: totalUsage.service_tier,
    cacheCreationEphemeral1hTokens: totalUsage.cache_creation.ephemeral_1h_input_tokens,
    cacheCreationEphemeral5mTokens: totalUsage.cache_creation.ephemeral_5m_input_tokens,
    // Derived metrics
    cacheHitRate,
    // Query tracking
    ...queryTracking ? {
      queryChainId: queryTracking.chainId,
      queryDepth: queryTracking.depth
    } : {}
  });
}
export {
  createCacheSafeParams,
  createGetAppStateWithAllowedTools,
  createSubagentContext,
  extractResultText,
  getLastCacheSafeParams,
  prepareForkedCommandContext,
  runForkedAgent,
  saveCacheSafeParams
};
