import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import { randomUUID } from "crypto";
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl
} from "../../utils/model/providers.js";
import {
  getAttributionHeader,
  getCLISyspromptPrefix
} from "../../constants/system.js";
import {
  getEmptyToolPermissionContext,
  toolMatchesName
} from "../../Tool.js";
import "../../types/connectorText.js";
import {
  logAPIPrefix,
  splitSysPromptPrefix,
  toolToAPISchema
} from "../../utils/api.js";
import { getOauthAccountInfo } from "../../utils/auth.js";
import {
  getBedrockExtraBodyParamsBetas,
  getMergedBetas,
  getModelBetas
} from "../../utils/betas.js";
import { getOrCreateUserID } from "../../utils/config.js";
import {
  CAPPED_DEFAULT_MAX_TOKENS,
  getModelMaxOutputTokens,
  getSonnet1mExpTreatmentEnabled
} from "../../utils/context.js";
import { resolveAppliedEffort } from "../../utils/effort.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { errorMessage } from "../../utils/errors.js";
import { computeFingerprintFromMessages } from "../../utils/fingerprint.js";
import { captureAPIRequest, logError } from "../../utils/log.js";
import {
  logModelCommunicationEvent,
  shouldLogFullStreamDeltas
} from "../../utils/modelCommunicationLog.js";
import {
  createAssistantAPIErrorMessage,
  createUserMessage,
  ensureToolResultPairing,
  normalizeContentFromAPI,
  normalizeMessagesForAPI,
  stripAdvisorBlocks,
  stripCallerFieldFromAssistantMessage,
  stripToolReferenceBlocksFromUserMessage
} from "../../utils/messages.js";
import {
  getDefaultOpusModel,
  getDefaultSonnetModel,
  getSmallFastModel,
  isNonCustomOpusModel
} from "../../utils/model/model.js";
import {
  asSystemPrompt
} from "../../utils/systemPromptType.js";
import { tokenCountFromLastAPIResponse } from "../../utils/tokens.js";
import { getDynamicConfig_BLOCKS_ON_INIT } from "../analytics/growthbook.js";
import {
  currentLimits,
  extractQuotaStatusFromError,
  extractQuotaStatusFromHeaders
} from "../claudeAiLimits.js";
import { getAPIContextManagement } from "../compact/apiMicrocompact.js";
const autoModeStateModule = false ? require2("../../utils/permissions/autoModeState.js") : null;
const feature = (_name) => false;
import {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError
} from "@anthropic-ai/sdk/error";
import {
  getAfkModeHeaderLatched,
  getCacheEditingHeaderLatched,
  getFastModeHeaderLatched,
  getLastApiCompletionTimestamp,
  getPromptCache1hAllowlist,
  getPromptCache1hEligible,
  getSessionId,
  getThinkingClearLatched,
  setFastModeHeaderLatched,
  setLastMainRequestId,
  setPromptCache1hAllowlist,
  setPromptCache1hEligible,
  setThinkingClearLatched
} from "../../bootstrap/state.js";
import {
  CONTEXT_1M_BETA_HEADER,
  CONTEXT_MANAGEMENT_BETA_HEADER,
  EFFORT_BETA_HEADER,
  FAST_MODE_BETA_HEADER,
  PROMPT_CACHING_SCOPE_BETA_HEADER,
  REDACT_THINKING_BETA_HEADER,
  STRUCTURED_OUTPUTS_BETA_HEADER,
  TASK_BUDGETS_BETA_HEADER
} from "../../constants/betas.js";
import { addToTotalSessionCost } from "../../cost-tracker.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../analytics/growthbook.js";
import {
  ADVISOR_TOOL_INSTRUCTIONS,
  getExperimentAdvisorModels,
  isAdvisorEnabled,
  isValidAdvisorModel,
  modelSupportsAdvisor
} from "../../utils/advisor.js";
import { getAgentContext } from "../../utils/agentContext.js";
import { isClaudeAISubscriber } from "../../utils/auth.js";
import {
  getToolSearchBetaHeader,
  modelSupportsStructuredOutputs,
  shouldIncludeFirstPartyOnlyBetas,
  shouldUseGlobalCacheScope
} from "../../utils/betas.js";
import { CLAUDE_IN_CHROME_MCP_SERVER_NAME } from "../../utils/claudeInChrome/common.js";
import { CHROME_TOOL_SEARCH_INSTRUCTIONS } from "../../utils/claudeInChrome/prompt.js";
import { getMaxThinkingTokensForModel } from "../../utils/context.js";
import { logForDebugging } from "../../utils/debug.js";
import { logForDiagnosticsNoPII } from "../../utils/diagLogs.js";
import { modelSupportsEffort } from "../../utils/effort.js";
import {
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
  isFastModeSupportedByModel
} from "../../utils/fastMode.js";
import { returnValue } from "../../utils/generators.js";
import { headlessProfilerCheckpoint } from "../../utils/headlessProfiler.js";
import { isMcpInstructionsDeltaEnabled } from "../../utils/mcpInstructionsDelta.js";
import { calculateUSDCost } from "../../utils/modelCost.js";
import { endQueryProfile, queryCheckpoint } from "../../utils/queryProfiler.js";
import {
  modelSupportsAdaptiveThinking,
  modelSupportsThinking
} from "../../utils/thinking.js";
import {
  extractDiscoveredToolNames,
  isDeferredToolsDeltaEnabled,
  isToolSearchEnabled
} from "../../utils/toolSearch.js";
import { API_MAX_MEDIA_PER_REQUEST } from "../../constants/apiLimits.js";
import { ADVISOR_BETA_HEADER } from "../../constants/betas.js";
import {
  formatDeferredToolLine,
  isDeferredTool,
  TOOL_SEARCH_TOOL_NAME
} from "../../tools/ToolSearchTool/prompt.js";
import { count } from "../../utils/array.js";
import { insertBlockAfterToolResults } from "../../utils/contentArray.js";
import { validateBoundedIntEnvVar } from "../../utils/envValidation.js";
import { safeParseJSON } from "../../utils/json.js";
import { getInferenceProfileBackingModel } from "../../utils/model/bedrock.js";
import {
  normalizeModelStringForAPI,
  parseUserSpecifiedModel
} from "../../utils/model/model.js";
import {
  startSessionActivity,
  stopSessionActivity
} from "../../utils/sessionActivity.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import {
  isBetaTracingEnabled,
  startLLMRequestSpan
} from "../../utils/telemetry/sessionTracing.js";
import {
  logEvent
} from "../analytics/index.js";
import {
  consumePendingCacheEdits,
  getPinnedCacheEdits,
  pinCacheEdits
} from "../compact/microCompact.js";
import { getInitializationStatus } from "../lsp/manager.js";
import { isToolFromMcpServer } from "../mcp/utils.js";
import { withStreamingVCR, withVCR } from "../vcr.js";
import { CLIENT_REQUEST_ID_HEADER, getAnthropicClient } from "./client.js";
import {
  API_ERROR_MESSAGE_PREFIX,
  CUSTOM_OFF_SWITCH_MESSAGE,
  getAssistantMessageFromError,
  getErrorMessageIfRefusal
} from "./errors.js";
import {
  EMPTY_USAGE,
  logAPIError,
  logAPIQuery,
  logAPISuccessAndDuration
} from "./logging.js";
import {
  CACHE_TTL_1HOUR_MS
} from "./promptCacheBreakDetection.js";
import {
  CannotRetryError,
  FallbackTriggeredError,
  is529Error,
  withRetry
} from "./withRetry.js";
function getExtraBodyParams(betaHeaders) {
  const extraBodyStr = process.env.CLAUDE_CODE_EXTRA_BODY;
  let result = {};
  if (extraBodyStr) {
    try {
      const parsed = safeParseJSON(extraBodyStr);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        result = { ...parsed };
      } else {
        logForDebugging(
          `CLAUDE_CODE_EXTRA_BODY env var must be a JSON object, but was given ${extraBodyStr}`,
          { level: "error" }
        );
      }
    } catch (error) {
      logForDebugging(
        `Error parsing CLAUDE_CODE_EXTRA_BODY: ${errorMessage(error)}`,
        { level: "error" }
      );
    }
  }
  if (false ? process.env.CLAUDE_CODE_ENTRYPOINT === "cli" && shouldIncludeFirstPartyOnlyBetas() && getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_anti_distill_fake_tool_injection",
    false
  ) : false) {
    result.anti_distillation = ["fake_tools"];
  }
  if (betaHeaders && betaHeaders.length > 0) {
    if (result.anthropic_beta && Array.isArray(result.anthropic_beta)) {
      const existingHeaders = result.anthropic_beta;
      const newHeaders = betaHeaders.filter(
        (header) => !existingHeaders.includes(header)
      );
      result.anthropic_beta = [...existingHeaders, ...newHeaders];
    } else {
      result.anthropic_beta = betaHeaders;
    }
  }
  return result;
}
function getPromptCachingEnabled(model) {
  if (isEnvTruthy(process.env.DISABLE_PROMPT_CACHING)) return false;
  if (isEnvTruthy(process.env.DISABLE_PROMPT_CACHING_HAIKU)) {
    const smallFastModel = getSmallFastModel();
    if (model === smallFastModel) return false;
  }
  if (isEnvTruthy(process.env.DISABLE_PROMPT_CACHING_SONNET)) {
    const defaultSonnet = getDefaultSonnetModel();
    if (model === defaultSonnet) return false;
  }
  if (isEnvTruthy(process.env.DISABLE_PROMPT_CACHING_OPUS)) {
    const defaultOpus = getDefaultOpusModel();
    if (model === defaultOpus) return false;
  }
  return true;
}
function getCacheControl({
  scope,
  querySource
} = {}) {
  return {
    type: "ephemeral",
    ...should1hCacheTTL(querySource) && { ttl: "1h" },
    ...scope === "global" && { scope }
  };
}
function should1hCacheTTL(querySource) {
  if (getAPIProvider() === "bedrock" && isEnvTruthy(process.env.ENABLE_PROMPT_CACHING_1H_BEDROCK)) {
    return true;
  }
  let userEligible = getPromptCache1hEligible();
  if (userEligible === null) {
    userEligible = process.env.USER_TYPE === "ant" || isClaudeAISubscriber() && !currentLimits.isUsingOverage;
    setPromptCache1hEligible(userEligible);
  }
  if (!userEligible) return false;
  let allowlist = getPromptCache1hAllowlist();
  if (allowlist === null) {
    const config = getFeatureValue_CACHED_MAY_BE_STALE("tengu_prompt_cache_1h_config", {});
    allowlist = config.allowlist ?? [];
    setPromptCache1hAllowlist(allowlist);
  }
  return querySource !== void 0 && allowlist.some(
    (pattern) => pattern.endsWith("*") ? querySource.startsWith(pattern.slice(0, -1)) : querySource === pattern
  );
}
function configureEffortParams(effortValue, outputConfig, extraBodyParams, betas, model) {
  if (!modelSupportsEffort(model) || "effort" in outputConfig) {
    return;
  }
  if (effortValue === void 0) {
    betas.push(EFFORT_BETA_HEADER);
  } else if (typeof effortValue === "string") {
    outputConfig.effort = effortValue;
    betas.push(EFFORT_BETA_HEADER);
  } else if (process.env.USER_TYPE === "ant") {
    const existingInternal = extraBodyParams.anthropic_internal || {};
    extraBodyParams.anthropic_internal = {
      ...existingInternal,
      effort_override: effortValue
    };
  }
}
function configureTaskBudgetParams(taskBudget, outputConfig, betas) {
  if (!taskBudget || "task_budget" in outputConfig || !shouldIncludeFirstPartyOnlyBetas()) {
    return;
  }
  outputConfig.task_budget = {
    type: "tokens",
    total: taskBudget.total,
    ...taskBudget.remaining !== void 0 && {
      remaining: taskBudget.remaining
    }
  };
  if (!betas.includes(TASK_BUDGETS_BETA_HEADER)) {
    betas.push(TASK_BUDGETS_BETA_HEADER);
  }
}
function getAPIMetadata() {
  let extra = {};
  const extraStr = process.env.CLAUDE_CODE_EXTRA_METADATA;
  if (extraStr) {
    const parsed = safeParseJSON(extraStr, false);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      extra = parsed;
    } else {
      logForDebugging(
        `CLAUDE_CODE_EXTRA_METADATA env var must be a JSON object, but was given ${extraStr}`,
        { level: "error" }
      );
    }
  }
  return {
    user_id: jsonStringify({
      ...extra,
      device_id: getOrCreateUserID(),
      // Only include OAuth account UUID when actively using OAuth authentication
      account_uuid: getOauthAccountInfo()?.accountUuid ?? "",
      session_id: getSessionId()
    })
  };
}
async function verifyApiKey(apiKey, isNonInteractiveSession) {
  if (isNonInteractiveSession) {
    return true;
  }
  try {
    const model = getSmallFastModel();
    const betas = getModelBetas(model);
    return await returnValue(
      withRetry(
        () => getAnthropicClient({
          apiKey,
          maxRetries: 3,
          model,
          source: "verify_api_key"
        }),
        async (anthropic) => {
          const messages = [{ role: "user", content: "test" }];
          await anthropic.beta.messages.create({
            model,
            max_tokens: 1,
            messages,
            temperature: 1,
            ...betas.length > 0 && { betas },
            metadata: getAPIMetadata(),
            ...getExtraBodyParams()
          });
          return true;
        },
        { maxRetries: 2, model, thinkingConfig: { type: "disabled" } }
        // Use fewer retries for API key verification
      )
    );
  } catch (errorFromRetry) {
    let error = errorFromRetry;
    if (errorFromRetry instanceof CannotRetryError) {
      error = errorFromRetry.originalError;
    }
    logError(error);
    if (error instanceof Error && error.message.includes(
      '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
    )) {
      return false;
    }
    throw error;
  }
}
function userMessageToMessageParam(message, addCache = false, enablePromptCaching, querySource) {
  if (addCache) {
    if (typeof message.message.content === "string") {
      return {
        role: "user",
        content: [
          {
            type: "text",
            text: message.message.content,
            ...enablePromptCaching && {
              cache_control: getCacheControl({ querySource })
            }
          }
        ]
      };
    } else {
      return {
        role: "user",
        content: message.message.content.map((_, i) => ({
          ..._,
          ...i === message.message.content.length - 1 ? enablePromptCaching ? { cache_control: getCacheControl({ querySource }) } : {} : {}
        }))
      };
    }
  }
  return {
    role: "user",
    content: Array.isArray(message.message.content) ? [...message.message.content] : message.message.content
  };
}
function assistantMessageToMessageParam(message, addCache = false, enablePromptCaching, querySource) {
  if (addCache) {
    if (typeof message.message.content === "string") {
      return {
        role: "assistant",
        content: [
          {
            type: "text",
            text: message.message.content,
            ...enablePromptCaching && {
              cache_control: getCacheControl({ querySource })
            }
          }
        ]
      };
    } else {
      return {
        role: "assistant",
        content: message.message.content.map((_, i) => ({
          ..._,
          ...i === message.message.content.length - 1 && _.type !== "thinking" && _.type !== "redacted_thinking" && (false ? !isConnectorTextBlock(_) : true) ? enablePromptCaching ? { cache_control: getCacheControl({ querySource }) } : {} : {}
        }))
      };
    }
  }
  return {
    role: "assistant",
    content: message.message.content
  };
}
async function queryModelWithoutStreaming({
  messages,
  systemPrompt,
  thinkingConfig,
  tools,
  signal,
  options
}) {
  let assistantMessage;
  for await (const message of withStreamingVCR(messages, async function* () {
    yield* queryModel(
      messages,
      systemPrompt,
      thinkingConfig,
      tools,
      signal,
      options
    );
  })) {
    if (message.type === "assistant") {
      assistantMessage = message;
    }
  }
  if (!assistantMessage) {
    if (signal.aborted) {
      throw new APIUserAbortError();
    }
    throw new Error("No assistant message found");
  }
  return assistantMessage;
}
async function* queryModelWithStreaming({
  messages,
  systemPrompt,
  thinkingConfig,
  tools,
  signal,
  options
}) {
  return yield* withStreamingVCR(messages, async function* () {
    yield* queryModel(
      messages,
      systemPrompt,
      thinkingConfig,
      tools,
      signal,
      options
    );
  });
}
function shouldDeferLspTool(tool) {
  if (!("isLsp" in tool) || !tool.isLsp) {
    return false;
  }
  const status = getInitializationStatus();
  return status.status === "pending" || status.status === "not-started";
}
function getNonstreamingFallbackTimeoutMs() {
  const override = parseInt(process.env.API_TIMEOUT_MS || "", 10);
  if (override) return override;
  return isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ? 12e4 : 3e5;
}
function summarizeModelCommunicationStreamEvent(part) {
  if (shouldLogFullStreamDeltas()) return part;
  switch (part.type) {
    case "message_start":
      return {
        type: part.type,
        message: part.message ? {
          id: part.message.id,
          model: part.message.model,
          role: part.message.role,
          stop_reason: part.message.stop_reason,
          usage: part.message.usage,
          contentLength: part.message.content?.length
        } : void 0
      };
    case "content_block_start":
      return {
        type: part.type,
        index: part.index,
        content_block: summarizeStreamContentBlock(part.content_block)
      };
    case "content_block_delta":
      return {
        type: part.type,
        index: part.index,
        delta: summarizeStreamDelta(part.delta)
      };
    case "content_block_stop":
      return { type: part.type, index: part.index };
    case "message_delta":
      return {
        type: part.type,
        delta: part.delta,
        usage: part.usage
      };
    case "message_stop":
      return { type: part.type };
    default:
      return { type: part.type, event: part };
  }
}
function summarizeStreamContentBlock(block) {
  if (!block || typeof block !== "object") return block;
  const record = block;
  return {
    type: record.type,
    id: record.id,
    name: record.name,
    text: summarizeText(record.text),
    thinking: summarizeText(record.thinking),
    inputType: record.input === void 0 ? void 0 : typeof record.input,
    hasSignature: typeof record.signature === "string" && record.signature.length > 0
  };
}
function summarizeStreamDelta(delta) {
  if (!delta || typeof delta !== "object") return delta;
  const record = delta;
  return {
    type: record.type,
    text: summarizeText(record.text),
    partial_json: summarizeText(record.partial_json),
    thinking: summarizeText(record.thinking),
    connector_text: summarizeText(record.connector_text),
    signatureLength: typeof record.signature === "string" ? record.signature.length : void 0
  };
}
function summarizeText(value) {
  if (typeof value !== "string") return void 0;
  return {
    chars: value.length,
    preview: value.slice(0, 500)
  };
}
async function* executeNonStreamingRequest(clientOptions, retryOptions, paramsFromContext, onAttempt, captureRequest, originatingRequestId) {
  const fallbackTimeoutMs = getNonstreamingFallbackTimeoutMs();
  const generator = withRetry(
    () => getAnthropicClient({
      maxRetries: 0,
      model: clientOptions.model,
      fetchOverride: clientOptions.fetchOverride,
      source: clientOptions.source
    }),
    async (anthropic, attempt, context) => {
      const start = Date.now();
      const retryParams = paramsFromContext(context);
      captureRequest(retryParams);
      onAttempt(attempt, start, retryParams.max_tokens);
      const adjustedParams = adjustParamsForNonStreaming(
        retryParams,
        MAX_NON_STREAMING_TOKENS
      );
      const apiParams = {
        ...adjustedParams,
        model: normalizeModelStringForAPI(adjustedParams.model)
      };
      logModelCommunicationEvent({
        direction: "outgoing",
        stage: "api_request",
        source: "claude.ts:non_streaming_messages_create",
        requestId: originatingRequestId,
        model: apiParams.model,
        querySource: retryOptions.querySource,
        payload: {
          params: apiParams,
          requestOptions: {
            hasSignal: true,
            timeout: fallbackTimeoutMs
          },
          attempt,
          originatingRequestId
        }
      });
      try {
        return await anthropic.beta.messages.create(apiParams, {
          signal: retryOptions.signal,
          timeout: fallbackTimeoutMs
        });
      } catch (err) {
        if (err instanceof APIUserAbortError) throw err;
        logForDiagnosticsNoPII("error", "cli_nonstreaming_fallback_error");
        logEvent("tengu_nonstreaming_fallback_error", {
          model: clientOptions.model,
          error: err instanceof Error ? err.name : "unknown",
          attempt,
          timeout_ms: fallbackTimeoutMs,
          request_id: originatingRequestId ?? "unknown"
        });
        throw err;
      }
    },
    {
      model: retryOptions.model,
      fallbackModel: retryOptions.fallbackModel,
      thinkingConfig: retryOptions.thinkingConfig,
      ...isFastModeEnabled() && { fastMode: retryOptions.fastMode },
      signal: retryOptions.signal,
      initialConsecutive529Errors: retryOptions.initialConsecutive529Errors,
      querySource: retryOptions.querySource
    }
  );
  let e;
  do {
    e = await generator.next();
    if (!e.done && e.value.type === "system") {
      yield e.value;
    }
  } while (!e.done);
  return e.value;
}
function getPreviousRequestIdFromMessages(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === "assistant" && msg.requestId) {
      return msg.requestId;
    }
  }
  return void 0;
}
function isMedia(block) {
  return block.type === "image" || block.type === "document";
}
function isToolResult(block) {
  return block.type === "tool_result";
}
function stripExcessMediaItems(messages, limit) {
  let toRemove = 0;
  for (const msg of messages) {
    if (!Array.isArray(msg.message.content)) continue;
    for (const block of msg.message.content) {
      if (isMedia(block)) toRemove++;
      if (isToolResult(block) && Array.isArray(block.content)) {
        for (const nested of block.content) {
          if (isMedia(nested)) toRemove++;
        }
      }
    }
  }
  toRemove -= limit;
  if (toRemove <= 0) return messages;
  return messages.map((msg) => {
    if (toRemove <= 0) return msg;
    const content = msg.message.content;
    if (!Array.isArray(content)) return msg;
    const before = toRemove;
    const stripped = content.map((block) => {
      if (toRemove <= 0 || !isToolResult(block) || !Array.isArray(block.content))
        return block;
      const filtered = block.content.filter((n) => {
        if (toRemove > 0 && isMedia(n)) {
          toRemove--;
          return false;
        }
        return true;
      });
      return filtered.length === block.content.length ? block : { ...block, content: filtered };
    }).filter((block) => {
      if (toRemove > 0 && isMedia(block)) {
        toRemove--;
        return false;
      }
      return true;
    });
    return before === toRemove ? msg : {
      ...msg,
      message: { ...msg.message, content: stripped }
    };
  });
}
async function* queryModel(messages, systemPrompt, thinkingConfig, tools, signal, options) {
  if (!isClaudeAISubscriber() && isNonCustomOpusModel(options.model) && (await getDynamicConfig_BLOCKS_ON_INIT(
    "tengu-off-switch",
    {
      activated: false
    }
  )).activated) {
    logEvent("tengu_off_switch_query", {});
    yield getAssistantMessageFromError(
      new Error(CUSTOM_OFF_SWITCH_MESSAGE),
      options.model
    );
    return;
  }
  const previousRequestId = getPreviousRequestIdFromMessages(messages);
  const resolvedModel = getAPIProvider() === "bedrock" && options.model.includes("application-inference-profile") ? await getInferenceProfileBackingModel(options.model) ?? options.model : options.model;
  queryCheckpoint("query_tool_schema_build_start");
  const isAgenticQuery = options.querySource.startsWith("repl_main_thread") || options.querySource.startsWith("agent:") || options.querySource === "sdk" || options.querySource === "hook_agent" || options.querySource === "verification_agent";
  const betas = getMergedBetas(options.model, { isAgenticQuery });
  if (isAdvisorEnabled()) {
    betas.push(ADVISOR_BETA_HEADER);
  }
  let advisorModel;
  if (isAgenticQuery && isAdvisorEnabled()) {
    let advisorOption = options.advisorModel;
    const advisorExperiment = getExperimentAdvisorModels();
    if (advisorExperiment !== void 0) {
      if (normalizeModelStringForAPI(advisorExperiment.baseModel) === normalizeModelStringForAPI(options.model)) {
        advisorOption = advisorExperiment.advisorModel;
      }
    }
    if (advisorOption) {
      const normalizedAdvisorModel = normalizeModelStringForAPI(
        parseUserSpecifiedModel(advisorOption)
      );
      if (!modelSupportsAdvisor(options.model)) {
        logForDebugging(
          `[AdvisorTool] Skipping advisor - base model ${options.model} does not support advisor`
        );
      } else if (!isValidAdvisorModel(normalizedAdvisorModel)) {
        logForDebugging(
          `[AdvisorTool] Skipping advisor - ${normalizedAdvisorModel} is not a valid advisor model`
        );
      } else {
        advisorModel = normalizedAdvisorModel;
        logForDebugging(
          `[AdvisorTool] Server-side tool enabled with ${advisorModel} as the advisor model`
        );
      }
    }
  }
  let useToolSearch = await isToolSearchEnabled(
    options.model,
    tools,
    options.getToolPermissionContext,
    options.agents,
    "query"
  );
  const deferredToolNames = /* @__PURE__ */ new Set();
  if (useToolSearch) {
    for (const t of tools) {
      if (isDeferredTool(t)) deferredToolNames.add(t.name);
    }
  }
  if (useToolSearch && deferredToolNames.size === 0 && !options.hasPendingMcpServers) {
    logForDebugging(
      "Tool search disabled: no deferred tools available to search"
    );
    useToolSearch = false;
  }
  let filteredTools;
  if (useToolSearch) {
    const discoveredToolNames = extractDiscoveredToolNames(messages);
    filteredTools = tools.filter((tool) => {
      if (!deferredToolNames.has(tool.name)) return true;
      if (toolMatchesName(tool, TOOL_SEARCH_TOOL_NAME)) return true;
      return discoveredToolNames.has(tool.name);
    });
  } else {
    filteredTools = tools.filter(
      (t) => !toolMatchesName(t, TOOL_SEARCH_TOOL_NAME)
    );
  }
  const toolSearchHeader = useToolSearch ? getToolSearchBetaHeader() : null;
  if (toolSearchHeader && getAPIProvider() !== "bedrock") {
    if (!betas.includes(toolSearchHeader)) {
      betas.push(toolSearchHeader);
    }
  }
  let cachedMCEnabled = false;
  let cacheEditingBetaHeader = "";
  if (false) {
    const {
      isCachedMicrocompactEnabled,
      isModelSupportedForCacheEditing,
      getCachedMCConfig
    } = await null;
    const betas2 = await null;
    cacheEditingBetaHeader = betas2.CACHE_EDITING_BETA_HEADER;
    const featureEnabled = isCachedMicrocompactEnabled();
    const modelSupported = isModelSupportedForCacheEditing(options.model);
    cachedMCEnabled = featureEnabled && modelSupported;
    const config = getCachedMCConfig();
    logForDebugging(
      `Cached MC gate: enabled=${featureEnabled} modelSupported=${modelSupported} model=${options.model} supportedModels=${jsonStringify(config.supportedModels)}`
    );
  }
  const useGlobalCacheFeature = shouldUseGlobalCacheScope();
  const willDefer = (t) => useToolSearch && (deferredToolNames.has(t.name) || shouldDeferLspTool(t));
  const needsToolBasedCacheMarker = useGlobalCacheFeature && filteredTools.some((t) => t.isMcp === true && !willDefer(t));
  if (useGlobalCacheFeature && !betas.includes(PROMPT_CACHING_SCOPE_BETA_HEADER)) {
    betas.push(PROMPT_CACHING_SCOPE_BETA_HEADER);
  }
  const globalCacheStrategy = useGlobalCacheFeature ? needsToolBasedCacheMarker ? "none" : "system_prompt" : "none";
  const toolSchemas = await Promise.all(
    filteredTools.map(
      (tool) => toolToAPISchema(tool, {
        getToolPermissionContext: options.getToolPermissionContext,
        tools,
        agents: options.agents,
        allowedAgentTypes: options.allowedAgentTypes,
        model: options.model,
        deferLoading: willDefer(tool)
      })
    )
  );
  if (useToolSearch) {
    const includedDeferredTools = count(
      filteredTools,
      (t) => deferredToolNames.has(t.name)
    );
    logForDebugging(
      `Dynamic tool loading: ${includedDeferredTools}/${deferredToolNames.size} deferred tools included`
    );
  }
  queryCheckpoint("query_tool_schema_build_end");
  logEvent("tengu_api_before_normalize", {
    preNormalizedMessageCount: messages.length
  });
  queryCheckpoint("query_message_normalization_start");
  let messagesForAPI = normalizeMessagesForAPI(messages, filteredTools);
  queryCheckpoint("query_message_normalization_end");
  if (!useToolSearch) {
    messagesForAPI = messagesForAPI.map((msg) => {
      switch (msg.type) {
        case "user":
          return stripToolReferenceBlocksFromUserMessage(msg);
        case "assistant":
          return stripCallerFieldFromAssistantMessage(msg);
        default:
          return msg;
      }
    });
  }
  messagesForAPI = ensureToolResultPairing(messagesForAPI);
  if (!betas.includes(ADVISOR_BETA_HEADER)) {
    messagesForAPI = stripAdvisorBlocks(messagesForAPI);
  }
  messagesForAPI = stripExcessMediaItems(
    messagesForAPI,
    API_MAX_MEDIA_PER_REQUEST
  );
  logEvent("tengu_api_after_normalize", {
    postNormalizedMessageCount: messagesForAPI.length
  });
  const fingerprint = computeFingerprintFromMessages(messagesForAPI);
  if (useToolSearch && !isDeferredToolsDeltaEnabled()) {
    const deferredToolList = tools.filter((t) => deferredToolNames.has(t.name)).map(formatDeferredToolLine).sort().join("\n");
    if (deferredToolList) {
      messagesForAPI = [
        createUserMessage({
          content: `<available-deferred-tools>
${deferredToolList}
</available-deferred-tools>`,
          isMeta: true
        }),
        ...messagesForAPI
      ];
    }
  }
  const hasChromeTools = filteredTools.some(
    (t) => isToolFromMcpServer(t.name, CLAUDE_IN_CHROME_MCP_SERVER_NAME)
  );
  const injectChromeHere = useToolSearch && hasChromeTools && !isMcpInstructionsDeltaEnabled();
  systemPrompt = asSystemPrompt(
    [
      getAttributionHeader(fingerprint),
      getCLISyspromptPrefix({
        isNonInteractive: options.isNonInteractiveSession,
        hasAppendSystemPrompt: options.hasAppendSystemPrompt
      }),
      ...systemPrompt,
      ...advisorModel ? [ADVISOR_TOOL_INSTRUCTIONS] : [],
      ...injectChromeHere ? [CHROME_TOOL_SEARCH_INSTRUCTIONS] : []
    ].filter(Boolean)
  );
  logAPIPrefix(systemPrompt);
  const enablePromptCaching = options.enablePromptCaching ?? getPromptCachingEnabled(options.model);
  const system = buildSystemPromptBlocks(systemPrompt, enablePromptCaching, {
    skipGlobalCacheForSystemPrompt: needsToolBasedCacheMarker,
    querySource: options.querySource
  });
  const useBetas = betas.length > 0;
  const extraToolSchemas = [...options.extraToolSchemas ?? []];
  if (advisorModel) {
    extraToolSchemas.push({
      type: "advisor_20260301",
      name: "advisor",
      model: advisorModel
    });
  }
  const allTools = [...toolSchemas, ...extraToolSchemas];
  const isFastMode = isFastModeEnabled() && isFastModeAvailable() && !isFastModeCooldown() && isFastModeSupportedByModel(options.model) && !!options.fastMode;
  let afkHeaderLatched = getAfkModeHeaderLatched() === true;
  if (false) {
    if (!afkHeaderLatched && isAgenticQuery && shouldIncludeFirstPartyOnlyBetas() && (autoModeStateModule?.isAutoModeActive() ?? false)) {
      afkHeaderLatched = true;
      setAfkModeHeaderLatched(true);
    }
  }
  let fastModeHeaderLatched = getFastModeHeaderLatched() === true;
  if (!fastModeHeaderLatched && isFastMode) {
    fastModeHeaderLatched = true;
    setFastModeHeaderLatched(true);
  }
  let cacheEditingHeaderLatched = getCacheEditingHeaderLatched() === true;
  if (false) {
    if (!cacheEditingHeaderLatched && cachedMCEnabled && getAPIProvider() === "firstParty" && options.querySource === "repl_main_thread") {
      cacheEditingHeaderLatched = true;
      setCacheEditingHeaderLatched(true);
    }
  }
  let thinkingClearLatched = getThinkingClearLatched() === true;
  if (!thinkingClearLatched && isAgenticQuery) {
    const lastCompletion = getLastApiCompletionTimestamp();
    if (lastCompletion !== null && Date.now() - lastCompletion > CACHE_TTL_1HOUR_MS) {
      thinkingClearLatched = true;
      setThinkingClearLatched(true);
    }
  }
  const effort = resolveAppliedEffort(options.model, options.effortValue);
  if (false) {
    const toolsForCacheDetection = allTools.filter(
      (t) => !("defer_loading" in t && t.defer_loading)
    );
    recordPromptState({
      system,
      toolSchemas: toolsForCacheDetection,
      querySource: options.querySource,
      model: options.model,
      agentId: options.agentId,
      fastMode: fastModeHeaderLatched,
      globalCacheStrategy,
      betas,
      autoModeActive: afkHeaderLatched,
      isUsingOverage: currentLimits.isUsingOverage ?? false,
      cachedMCEnabled: cacheEditingHeaderLatched,
      effortValue: effort,
      extraBodyParams: getExtraBodyParams()
    });
  }
  const newContext = isBetaTracingEnabled() ? {
    systemPrompt: systemPrompt.join("\n\n"),
    querySource: options.querySource,
    tools: jsonStringify(allTools)
  } : void 0;
  const llmSpan = startLLMRequestSpan(
    options.model,
    newContext,
    messagesForAPI,
    isFastMode
  );
  const startIncludingRetries = Date.now();
  let start = Date.now();
  let attemptNumber = 0;
  const attemptStartTimes = [];
  let stream = void 0;
  let streamRequestId = void 0;
  let clientRequestId = void 0;
  let streamResponse = void 0;
  function releaseStreamResources() {
    cleanupStream(stream);
    stream = void 0;
    if (streamResponse) {
      streamResponse.body?.cancel().catch(() => {
      });
      streamResponse = void 0;
    }
  }
  const consumedCacheEdits = cachedMCEnabled ? consumePendingCacheEdits() : null;
  const consumedPinnedEdits = cachedMCEnabled ? getPinnedCacheEdits() : [];
  let lastRequestBetas;
  const paramsFromContext = (retryContext) => {
    const betasParams = [...betas];
    if (!betasParams.includes(CONTEXT_1M_BETA_HEADER) && getSonnet1mExpTreatmentEnabled(retryContext.model)) {
      betasParams.push(CONTEXT_1M_BETA_HEADER);
    }
    const bedrockBetas = getAPIProvider() === "bedrock" ? [
      ...getBedrockExtraBodyParamsBetas(retryContext.model),
      ...toolSearchHeader ? [toolSearchHeader] : []
    ] : [];
    const extraBodyParams = getExtraBodyParams(bedrockBetas);
    const outputConfig = {
      ...extraBodyParams.output_config ?? {}
    };
    configureEffortParams(
      effort,
      outputConfig,
      extraBodyParams,
      betasParams,
      options.model
    );
    configureTaskBudgetParams(
      options.taskBudget,
      outputConfig,
      betasParams
    );
    if (options.outputFormat && !("format" in outputConfig)) {
      outputConfig.format = options.outputFormat;
      if (modelSupportsStructuredOutputs(options.model) && !betasParams.includes(STRUCTURED_OUTPUTS_BETA_HEADER)) {
        betasParams.push(STRUCTURED_OUTPUTS_BETA_HEADER);
      }
    }
    const maxOutputTokens2 = retryContext?.maxTokensOverride || options.maxOutputTokensOverride || getMaxOutputTokensForModel(options.model);
    const hasThinking = thinkingConfig.type !== "disabled" && !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_THINKING);
    let thinking = void 0;
    if (hasThinking && modelSupportsThinking(options.model)) {
      if (!isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING) && modelSupportsAdaptiveThinking(options.model)) {
        thinking = {
          type: "adaptive"
        };
      } else {
        let thinkingBudget = getMaxThinkingTokensForModel(options.model);
        if (thinkingConfig.type === "enabled" && thinkingConfig.budgetTokens !== void 0) {
          thinkingBudget = thinkingConfig.budgetTokens;
        }
        thinkingBudget = Math.min(maxOutputTokens2 - 1, thinkingBudget);
        thinking = {
          budget_tokens: thinkingBudget,
          type: "enabled"
        };
      }
    }
    const contextManagement = getAPIContextManagement({
      hasThinking,
      isRedactThinkingActive: betasParams.includes(REDACT_THINKING_BETA_HEADER),
      clearAllThinking: thinkingClearLatched
    });
    const enablePromptCaching2 = options.enablePromptCaching ?? getPromptCachingEnabled(retryContext.model);
    let speed;
    const isFastModeForRetry = isFastModeEnabled() && isFastModeAvailable() && !isFastModeCooldown() && isFastModeSupportedByModel(options.model) && !!retryContext.fastMode;
    if (isFastModeForRetry) {
      speed = "fast";
    }
    if (fastModeHeaderLatched && !betasParams.includes(FAST_MODE_BETA_HEADER)) {
      betasParams.push(FAST_MODE_BETA_HEADER);
    }
    if (false) {
      if (afkHeaderLatched && shouldIncludeFirstPartyOnlyBetas() && isAgenticQuery && !betasParams.includes(AFK_MODE_BETA_HEADER)) {
        betasParams.push(AFK_MODE_BETA_HEADER);
      }
    }
    const useCachedMC = cachedMCEnabled && getAPIProvider() === "firstParty" && options.querySource === "repl_main_thread";
    if (cacheEditingHeaderLatched && getAPIProvider() === "firstParty" && options.querySource === "repl_main_thread" && !betasParams.includes(cacheEditingBetaHeader)) {
      betasParams.push(cacheEditingBetaHeader);
      logForDebugging(
        "Cache editing beta header enabled for cached microcompact"
      );
    }
    const temperature = !hasThinking ? options.temperatureOverride ?? 1 : void 0;
    lastRequestBetas = betasParams;
    return {
      model: normalizeModelStringForAPI(options.model),
      messages: addCacheBreakpoints(
        messagesForAPI,
        enablePromptCaching2,
        options.querySource,
        useCachedMC,
        consumedCacheEdits,
        consumedPinnedEdits,
        options.skipCacheWrite
      ),
      system,
      tools: allTools,
      tool_choice: options.toolChoice,
      ...useBetas && { betas: betasParams },
      metadata: getAPIMetadata(),
      max_tokens: maxOutputTokens2,
      thinking,
      ...temperature !== void 0 && { temperature },
      ...contextManagement && useBetas && betasParams.includes(CONTEXT_MANAGEMENT_BETA_HEADER) && {
        context_management: contextManagement
      },
      ...extraBodyParams,
      ...Object.keys(outputConfig).length > 0 && {
        output_config: outputConfig
      },
      ...speed !== void 0 && { speed }
    };
  };
  {
    const queryParams = paramsFromContext({
      model: options.model,
      thinkingConfig
    });
    const logMessagesLength = queryParams.messages.length;
    const logBetas = useBetas ? queryParams.betas ?? [] : [];
    const logThinkingType = queryParams.thinking?.type ?? "disabled";
    const logEffortValue = queryParams.output_config?.effort;
    void options.getToolPermissionContext().then((permissionContext) => {
      logAPIQuery({
        model: options.model,
        messagesLength: logMessagesLength,
        temperature: options.temperatureOverride ?? 1,
        betas: logBetas,
        permissionMode: permissionContext.mode,
        querySource: options.querySource,
        queryTracking: options.queryTracking,
        thinkingType: logThinkingType,
        effortValue: logEffortValue,
        fastMode: isFastMode,
        previousRequestId
      });
    });
  }
  const newMessages = [];
  let ttftMs = 0;
  let partialMessage = void 0;
  const contentBlocks = [];
  let usage = EMPTY_USAGE;
  let costUSD = 0;
  let stopReason = null;
  let didFallBackToNonStreaming = false;
  let fallbackMessage;
  let maxOutputTokens = 0;
  let responseHeaders = void 0;
  let research = void 0;
  let isFastModeRequest = isFastMode;
  let isAdvisorInProgress = false;
  try {
    let clearStreamIdleTimers = function() {
      if (streamIdleWarningTimer !== null) {
        clearTimeout(streamIdleWarningTimer);
        streamIdleWarningTimer = null;
      }
      if (streamIdleTimer !== null) {
        clearTimeout(streamIdleTimer);
        streamIdleTimer = null;
      }
    }, resetStreamIdleTimer = function() {
      clearStreamIdleTimers();
      if (!streamWatchdogEnabled) {
        return;
      }
      streamIdleWarningTimer = setTimeout(
        (warnMs) => {
          logForDebugging(
            `Streaming idle warning: no chunks received for ${warnMs / 1e3}s`,
            { level: "warn" }
          );
          logForDiagnosticsNoPII("warn", "cli_streaming_idle_warning");
        },
        STREAM_IDLE_WARNING_MS,
        STREAM_IDLE_WARNING_MS
      );
      streamIdleTimer = setTimeout(() => {
        streamIdleAborted = true;
        streamWatchdogFiredAt = performance.now();
        logForDebugging(
          `Streaming idle timeout: no chunks received for ${STREAM_IDLE_TIMEOUT_MS / 1e3}s, aborting stream`,
          { level: "error" }
        );
        logForDiagnosticsNoPII("error", "cli_streaming_idle_timeout");
        logEvent("tengu_streaming_idle_timeout", {
          model: options.model,
          request_id: streamRequestId ?? "unknown",
          timeout_ms: STREAM_IDLE_TIMEOUT_MS
        });
        releaseStreamResources();
      }, STREAM_IDLE_TIMEOUT_MS);
    };
    queryCheckpoint("query_client_creation_start");
    const generator = withRetry(
      () => getAnthropicClient({
        maxRetries: 0,
        // Disabled auto-retry in favor of manual implementation
        model: options.model,
        fetchOverride: options.fetchOverride,
        source: options.querySource
      }),
      async (anthropic, attempt, context) => {
        attemptNumber = attempt;
        isFastModeRequest = context.fastMode ?? false;
        start = Date.now();
        attemptStartTimes.push(start);
        queryCheckpoint("query_client_creation_end");
        const params = paramsFromContext(context);
        captureAPIRequest(params, options.querySource);
        maxOutputTokens = params.max_tokens;
        queryCheckpoint("query_api_request_sent");
        if (!options.agentId) {
          headlessProfilerCheckpoint("api_request_sent");
        }
        clientRequestId = getAPIProvider() === "firstParty" && isFirstPartyAnthropicBaseUrl() ? randomUUID() : void 0;
        logModelCommunicationEvent({
          direction: "outgoing",
          stage: "api_request",
          source: "claude.ts:streaming_messages_create",
          requestId: clientRequestId,
          model: params.model,
          querySource: options.querySource,
          payload: {
            params: { ...params, stream: true },
            requestOptions: {
              hasSignal: true,
              hasClientRequestId: !!clientRequestId
            }
          }
        });
        const result = await anthropic.beta.messages.create(
          { ...params, stream: true },
          {
            signal,
            ...clientRequestId && {
              headers: { [CLIENT_REQUEST_ID_HEADER]: clientRequestId }
            }
          }
        ).withResponse();
        queryCheckpoint("query_response_headers_received");
        streamRequestId = result.request_id;
        streamResponse = result.response;
        return result.data;
      },
      {
        model: options.model,
        fallbackModel: options.fallbackModel,
        thinkingConfig,
        ...isFastModeEnabled() ? { fastMode: isFastMode } : false,
        signal,
        querySource: options.querySource
      }
    );
    let e;
    do {
      e = await generator.next();
      if (!("controller" in e.value)) {
        yield e.value;
      }
    } while (!e.done);
    stream = e.value;
    newMessages.length = 0;
    ttftMs = 0;
    partialMessage = void 0;
    contentBlocks.length = 0;
    usage = EMPTY_USAGE;
    stopReason = null;
    isAdvisorInProgress = false;
    const streamWatchdogEnabled = isEnvTruthy(
      process.env.CLAUDE_ENABLE_STREAM_WATCHDOG
    );
    const STREAM_IDLE_TIMEOUT_MS = parseInt(process.env.CLAUDE_STREAM_IDLE_TIMEOUT_MS || "", 10) || 9e4;
    const STREAM_IDLE_WARNING_MS = STREAM_IDLE_TIMEOUT_MS / 2;
    let streamIdleAborted = false;
    let streamWatchdogFiredAt = null;
    let streamIdleWarningTimer = null;
    let streamIdleTimer = null;
    resetStreamIdleTimer();
    startSessionActivity("api_call");
    try {
      let isFirstChunk = true;
      let lastEventTime = null;
      const STALL_THRESHOLD_MS = 3e4;
      let totalStallTime = 0;
      let stallCount = 0;
      let modelCommunicationStreamSequence = 0;
      for await (const part of stream) {
        resetStreamIdleTimer();
        const now = Date.now();
        modelCommunicationStreamSequence++;
        logModelCommunicationEvent({
          direction: "incoming",
          stage: "api_stream_event",
          source: "claude.ts:raw_stream",
          requestId: streamRequestId ?? clientRequestId,
          sequence: modelCommunicationStreamSequence,
          model: options.model,
          querySource: options.querySource,
          payload: summarizeModelCommunicationStreamEvent(part)
        });
        if (lastEventTime !== null) {
          const timeSinceLastEvent = now - lastEventTime;
          if (timeSinceLastEvent > STALL_THRESHOLD_MS) {
            stallCount++;
            totalStallTime += timeSinceLastEvent;
            logForDebugging(
              `Streaming stall detected: ${(timeSinceLastEvent / 1e3).toFixed(1)}s gap between events (stall #${stallCount})`,
              { level: "warn" }
            );
            logEvent("tengu_streaming_stall", {
              stall_duration_ms: timeSinceLastEvent,
              stall_count: stallCount,
              total_stall_time_ms: totalStallTime,
              event_type: part.type,
              model: options.model,
              request_id: streamRequestId ?? "unknown"
            });
          }
        }
        lastEventTime = now;
        if (isFirstChunk) {
          logForDebugging("Stream started - received first chunk");
          queryCheckpoint("query_first_chunk_received");
          if (!options.agentId) {
            headlessProfilerCheckpoint("first_chunk");
          }
          endQueryProfile();
          isFirstChunk = false;
        }
        switch (part.type) {
          case "message_start": {
            partialMessage = part.message;
            ttftMs = Date.now() - start;
            usage = updateUsage(usage, part.message?.usage);
            if (process.env.USER_TYPE === "ant" && "research" in part.message) {
              research = part.message.research;
            }
            break;
          }
          case "content_block_start":
            switch (part.content_block.type) {
              case "tool_use":
                contentBlocks[part.index] = {
                  ...part.content_block,
                  input: ""
                };
                break;
              case "server_tool_use":
                contentBlocks[part.index] = {
                  ...part.content_block,
                  input: ""
                };
                if (part.content_block.name === "advisor") {
                  isAdvisorInProgress = true;
                  logForDebugging(`[AdvisorTool] Advisor tool called`);
                  logEvent("tengu_advisor_tool_call", {
                    model: options.model,
                    advisor_model: advisorModel ?? "unknown"
                  });
                }
                break;
              case "text":
                contentBlocks[part.index] = {
                  ...part.content_block,
                  // awkwardly, the sdk sometimes returns text as part of a
                  // content_block_start message, then returns the same text
                  // again in a content_block_delta message. we ignore it here
                  // since there doesn't seem to be a way to detect when a
                  // content_block_delta message duplicates the text.
                  text: ""
                };
                break;
              case "thinking":
                contentBlocks[part.index] = {
                  ...part.content_block,
                  // also awkward
                  thinking: "",
                  // initialize signature to ensure field exists even if signature_delta never arrives
                  signature: ""
                };
                break;
              default:
                contentBlocks[part.index] = { ...part.content_block };
                if (part.content_block.type === "advisor_tool_result") {
                  isAdvisorInProgress = false;
                  logForDebugging(`[AdvisorTool] Advisor tool result received`);
                }
                break;
            }
            break;
          case "content_block_delta": {
            const contentBlock = contentBlocks[part.index];
            const delta = part.delta;
            if (!contentBlock) {
              logEvent("tengu_streaming_error", {
                error_type: "content_block_not_found_delta",
                part_type: part.type,
                part_index: part.index
              });
              throw new RangeError("Content block not found");
            }
            if (false) {
              if (contentBlock.type !== "connector_text") {
                logEvent("tengu_streaming_error", {
                  error_type: "content_block_type_mismatch_connector_text",
                  expected_type: "connector_text",
                  actual_type: contentBlock.type
                });
                throw new Error("Content block is not a connector_text block");
              }
              contentBlock.connector_text += delta.connector_text;
            } else {
              switch (delta.type) {
                case "citations_delta":
                  break;
                case "input_json_delta":
                  if (contentBlock.type !== "tool_use" && contentBlock.type !== "server_tool_use") {
                    logEvent("tengu_streaming_error", {
                      error_type: "content_block_type_mismatch_input_json",
                      expected_type: "tool_use",
                      actual_type: contentBlock.type
                    });
                    throw new Error("Content block is not a input_json block");
                  }
                  if (typeof contentBlock.input !== "string") {
                    logEvent("tengu_streaming_error", {
                      error_type: "content_block_input_not_string",
                      input_type: typeof contentBlock.input
                    });
                    throw new Error("Content block input is not a string");
                  }
                  contentBlock.input += delta.partial_json;
                  break;
                case "text_delta":
                  if (contentBlock.type !== "text") {
                    logEvent("tengu_streaming_error", {
                      error_type: "content_block_type_mismatch_text",
                      expected_type: "text",
                      actual_type: contentBlock.type
                    });
                    throw new Error("Content block is not a text block");
                  }
                  contentBlock.text += delta.text;
                  break;
                case "signature_delta":
                  if (false) {
                    contentBlock.signature = delta.signature;
                    break;
                  }
                  if (contentBlock.type !== "thinking") {
                    logEvent("tengu_streaming_error", {
                      error_type: "content_block_type_mismatch_thinking_signature",
                      expected_type: "thinking",
                      actual_type: contentBlock.type
                    });
                    throw new Error("Content block is not a thinking block");
                  }
                  contentBlock.signature = delta.signature;
                  break;
                case "thinking_delta":
                  if (contentBlock.type !== "thinking") {
                    logEvent("tengu_streaming_error", {
                      error_type: "content_block_type_mismatch_thinking_delta",
                      expected_type: "thinking",
                      actual_type: contentBlock.type
                    });
                    throw new Error("Content block is not a thinking block");
                  }
                  contentBlock.thinking += delta.thinking;
                  break;
              }
            }
            if (process.env.USER_TYPE === "ant" && "research" in part) {
              research = part.research;
            }
            break;
          }
          case "content_block_stop": {
            const contentBlock = contentBlocks[part.index];
            if (!contentBlock) {
              logEvent("tengu_streaming_error", {
                error_type: "content_block_not_found_stop",
                part_type: part.type,
                part_index: part.index
              });
              throw new RangeError("Content block not found");
            }
            if (!partialMessage) {
              logEvent("tengu_streaming_error", {
                error_type: "partial_message_not_found",
                part_type: part.type
              });
              throw new Error("Message not found");
            }
            const normalizedContent = normalizeContentFromAPI(
              [contentBlock],
              tools,
              options.agentId
            );
            logModelCommunicationEvent({
              direction: "incoming",
              stage: "after_normalize",
              source: "claude.ts:content_block_stop_normalized",
              requestId: streamRequestId ?? clientRequestId,
              model: options.model,
              querySource: options.querySource,
              payload: {
                index: part.index,
                rawContentBlock: contentBlock,
                normalizedContent
              }
            });
            const m = {
              message: {
                ...partialMessage,
                content: normalizedContent
              },
              requestId: streamRequestId ?? void 0,
              type: "assistant",
              uuid: randomUUID(),
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              ...process.env.USER_TYPE === "ant" && research !== void 0 && { research },
              ...advisorModel && { advisorModel }
            };
            newMessages.push(m);
            yield m;
            break;
          }
          case "message_delta": {
            usage = updateUsage(usage, part.usage);
            if (process.env.USER_TYPE === "ant" && "research" in part) {
              research = part.research;
              for (const msg of newMessages) {
                msg.research = research;
              }
            }
            stopReason = part.delta.stop_reason;
            const lastMsg = newMessages.at(-1);
            if (lastMsg) {
              lastMsg.message.usage = usage;
              lastMsg.message.stop_reason = stopReason;
            }
            const costUSDForPart = calculateUSDCost(resolvedModel, usage);
            costUSD += addToTotalSessionCost(
              costUSDForPart,
              usage,
              options.model
            );
            const refusalMessage = getErrorMessageIfRefusal(
              part.delta.stop_reason,
              options.model
            );
            if (refusalMessage) {
              yield refusalMessage;
            }
            if (stopReason === "max_tokens") {
              logEvent("tengu_max_tokens_reached", {
                max_tokens: maxOutputTokens
              });
              yield createAssistantAPIErrorMessage({
                content: `${API_ERROR_MESSAGE_PREFIX}: Claude's response exceeded the ${maxOutputTokens} output token maximum. To configure this behavior, set the CLAUDE_CODE_MAX_OUTPUT_TOKENS environment variable.`,
                apiError: "max_output_tokens",
                error: "max_output_tokens"
              });
            }
            if (stopReason === "model_context_window_exceeded") {
              logEvent("tengu_context_window_exceeded", {
                max_tokens: maxOutputTokens,
                output_tokens: usage.output_tokens
              });
              yield createAssistantAPIErrorMessage({
                content: `${API_ERROR_MESSAGE_PREFIX}: The model has reached its context window limit.`,
                apiError: "max_output_tokens",
                error: "max_output_tokens"
              });
            }
            break;
          }
          case "message_stop":
            break;
        }
        yield {
          type: "stream_event",
          event: part,
          ...part.type === "message_start" ? { ttftMs } : void 0
        };
      }
      clearStreamIdleTimers();
      if (streamIdleAborted) {
        const exitDelayMs = streamWatchdogFiredAt !== null ? Math.round(performance.now() - streamWatchdogFiredAt) : -1;
        logForDiagnosticsNoPII(
          "info",
          "cli_stream_loop_exited_after_watchdog_clean"
        );
        logEvent("tengu_stream_loop_exited_after_watchdog", {
          request_id: streamRequestId ?? "unknown",
          exit_delay_ms: exitDelayMs,
          exit_path: "clean",
          model: options.model
        });
        streamWatchdogFiredAt = null;
        throw new Error("Stream idle timeout - no chunks received");
      }
      if (!partialMessage || newMessages.length === 0 && !stopReason) {
        logForDebugging(
          !partialMessage ? "Stream completed without receiving message_start event - triggering non-streaming fallback" : "Stream completed with message_start but no content blocks completed - triggering non-streaming fallback",
          { level: "error" }
        );
        logEvent("tengu_stream_no_events", {
          model: options.model,
          request_id: streamRequestId ?? "unknown"
        });
        throw new Error("Stream ended without receiving any events");
      }
      if (stallCount > 0) {
        logForDebugging(
          `Streaming completed with ${stallCount} stall(s), total stall time: ${(totalStallTime / 1e3).toFixed(1)}s`,
          { level: "warn" }
        );
        logEvent("tengu_streaming_stall_summary", {
          stall_count: stallCount,
          total_stall_time_ms: totalStallTime,
          model: options.model,
          request_id: streamRequestId ?? "unknown"
        });
      }
      if (false) {
        void checkResponseForCacheBreak(
          options.querySource,
          usage.cache_read_input_tokens,
          usage.cache_creation_input_tokens,
          messages,
          options.agentId,
          streamRequestId
        );
      }
      const resp = streamResponse;
      if (resp) {
        extractQuotaStatusFromHeaders(resp.headers);
        responseHeaders = resp.headers;
      }
    } catch (streamingError) {
      clearStreamIdleTimers();
      if (streamIdleAborted && streamWatchdogFiredAt !== null) {
        const exitDelayMs = Math.round(
          performance.now() - streamWatchdogFiredAt
        );
        logForDiagnosticsNoPII(
          "info",
          "cli_stream_loop_exited_after_watchdog_error"
        );
        logEvent("tengu_stream_loop_exited_after_watchdog", {
          request_id: streamRequestId ?? "unknown",
          exit_delay_ms: exitDelayMs,
          exit_path: "error",
          error_name: streamingError instanceof Error ? streamingError.name : "unknown",
          model: options.model
        });
      }
      if (streamingError instanceof APIUserAbortError) {
        if (signal.aborted) {
          logForDebugging(
            `Streaming aborted by user: ${errorMessage(streamingError)}`
          );
          if (isAdvisorInProgress) {
            logEvent("tengu_advisor_tool_interrupted", {
              model: options.model,
              advisor_model: advisorModel ?? "unknown"
            });
          }
          throw streamingError;
        } else {
          logForDebugging(
            `Streaming timeout (SDK abort): ${streamingError.message}`,
            { level: "error" }
          );
          throw new APIConnectionTimeoutError({ message: "Request timed out" });
        }
      }
      const disableFallback = isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK) || getFeatureValue_CACHED_MAY_BE_STALE(
        "tengu_disable_streaming_to_non_streaming_fallback",
        false
      );
      if (disableFallback) {
        logForDebugging(
          `Error streaming (non-streaming fallback disabled): ${errorMessage(streamingError)}`,
          { level: "error" }
        );
        logEvent("tengu_streaming_fallback_to_non_streaming", {
          model: options.model,
          error: streamingError instanceof Error ? streamingError.name : String(
            streamingError
          ),
          attemptNumber,
          maxOutputTokens,
          thinkingType: thinkingConfig.type,
          fallback_disabled: true,
          request_id: streamRequestId ?? "unknown",
          fallback_cause: streamIdleAborted ? "watchdog" : "other"
        });
        throw streamingError;
      }
      logForDebugging(
        `Error streaming, falling back to non-streaming mode: ${errorMessage(streamingError)}`,
        { level: "error" }
      );
      didFallBackToNonStreaming = true;
      if (options.onStreamingFallback) {
        options.onStreamingFallback();
      }
      logEvent("tengu_streaming_fallback_to_non_streaming", {
        model: options.model,
        error: streamingError instanceof Error ? streamingError.name : String(
          streamingError
        ),
        attemptNumber,
        maxOutputTokens,
        thinkingType: thinkingConfig.type,
        fallback_disabled: false,
        request_id: streamRequestId ?? "unknown",
        fallback_cause: streamIdleAborted ? "watchdog" : "other"
      });
      logForDiagnosticsNoPII("info", "cli_nonstreaming_fallback_started");
      logEvent("tengu_nonstreaming_fallback_started", {
        request_id: streamRequestId ?? "unknown",
        model: options.model,
        fallback_cause: streamIdleAborted ? "watchdog" : "other"
      });
      const result = yield* executeNonStreamingRequest(
        { model: options.model, source: options.querySource },
        {
          model: options.model,
          fallbackModel: options.fallbackModel,
          thinkingConfig,
          ...isFastModeEnabled() && { fastMode: isFastMode },
          signal,
          initialConsecutive529Errors: is529Error(streamingError) ? 1 : 0,
          querySource: options.querySource
        },
        paramsFromContext,
        (attempt, _startTime, tokens) => {
          attemptNumber = attempt;
          maxOutputTokens = tokens;
        },
        (params) => captureAPIRequest(params, options.querySource),
        streamRequestId
      );
      logModelCommunicationEvent({
        direction: "incoming",
        stage: "api_response",
        source: "claude.ts:non_streaming_response",
        requestId: streamRequestId,
        model: result.model ?? options.model,
        querySource: options.querySource,
        payload: result
      });
      const normalizedContent = normalizeContentFromAPI(
        result.content,
        tools,
        options.agentId
      );
      logModelCommunicationEvent({
        direction: "incoming",
        stage: "after_normalize",
        source: "claude.ts:non_streaming_normalized",
        requestId: streamRequestId,
        model: result.model ?? options.model,
        querySource: options.querySource,
        payload: {
          rawContent: result.content,
          normalizedContent,
          stopReason: result.stop_reason,
          usage: result.usage
        }
      });
      const m = {
        message: {
          ...result,
          content: normalizedContent
        },
        requestId: streamRequestId ?? void 0,
        type: "assistant",
        uuid: randomUUID(),
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        ...process.env.USER_TYPE === "ant" && research !== void 0 && {
          research
        },
        ...advisorModel && {
          advisorModel
        }
      };
      newMessages.push(m);
      fallbackMessage = m;
      yield m;
    } finally {
      clearStreamIdleTimers();
    }
  } catch (errorFromRetry) {
    if (errorFromRetry instanceof FallbackTriggeredError) {
      throw errorFromRetry;
    }
    const is404StreamCreationError = !didFallBackToNonStreaming && errorFromRetry instanceof CannotRetryError && errorFromRetry.originalError instanceof APIError && errorFromRetry.originalError.status === 404;
    if (is404StreamCreationError) {
      const failedRequestId = errorFromRetry.originalError.requestID ?? "unknown";
      logForDebugging(
        "Streaming endpoint returned 404, falling back to non-streaming mode",
        { level: "warn" }
      );
      didFallBackToNonStreaming = true;
      if (options.onStreamingFallback) {
        options.onStreamingFallback();
      }
      logEvent("tengu_streaming_fallback_to_non_streaming", {
        model: options.model,
        error: "404_stream_creation",
        attemptNumber,
        maxOutputTokens,
        thinkingType: thinkingConfig.type,
        request_id: failedRequestId,
        fallback_cause: "404_stream_creation"
      });
      try {
        const result = yield* executeNonStreamingRequest(
          { model: options.model, source: options.querySource },
          {
            model: options.model,
            fallbackModel: options.fallbackModel,
            thinkingConfig,
            ...isFastModeEnabled() && { fastMode: isFastMode },
            signal
          },
          paramsFromContext,
          (attempt, _startTime, tokens) => {
            attemptNumber = attempt;
            maxOutputTokens = tokens;
          },
          (params) => captureAPIRequest(params, options.querySource),
          failedRequestId
        );
        logModelCommunicationEvent({
          direction: "incoming",
          stage: "api_response",
          source: "claude.ts:non_streaming_response",
          requestId: failedRequestId,
          model: result.model ?? options.model,
          querySource: options.querySource,
          payload: result
        });
        const normalizedContent = normalizeContentFromAPI(
          result.content,
          tools,
          options.agentId
        );
        logModelCommunicationEvent({
          direction: "incoming",
          stage: "after_normalize",
          source: "claude.ts:non_streaming_normalized",
          requestId: failedRequestId,
          model: result.model ?? options.model,
          querySource: options.querySource,
          payload: {
            rawContent: result.content,
            normalizedContent,
            stopReason: result.stop_reason,
            usage: result.usage
          }
        });
        const m = {
          message: {
            ...result,
            content: normalizedContent
          },
          requestId: streamRequestId ?? void 0,
          type: "assistant",
          uuid: randomUUID(),
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          ...process.env.USER_TYPE === "ant" && research !== void 0 && { research },
          ...advisorModel && { advisorModel }
        };
        newMessages.push(m);
        fallbackMessage = m;
        yield m;
      } catch (fallbackError) {
        if (fallbackError instanceof FallbackTriggeredError) {
          throw fallbackError;
        }
        logForDebugging(
          `Non-streaming fallback also failed: ${errorMessage(fallbackError)}`,
          { level: "error" }
        );
        let error = fallbackError;
        let errorModel = options.model;
        if (fallbackError instanceof CannotRetryError) {
          error = fallbackError.originalError;
          errorModel = fallbackError.retryContext.model;
        }
        if (error instanceof APIError) {
          extractQuotaStatusFromError(error);
        }
        const requestId = streamRequestId || (error instanceof APIError ? error.requestID : void 0) || (error instanceof APIError ? error.error?.request_id : void 0);
        logAPIError({
          error,
          model: errorModel,
          messageCount: messagesForAPI.length,
          messageTokens: tokenCountFromLastAPIResponse(messagesForAPI),
          durationMs: Date.now() - start,
          durationMsIncludingRetries: Date.now() - startIncludingRetries,
          attempt: attemptNumber,
          requestId,
          clientRequestId,
          didFallBackToNonStreaming,
          queryTracking: options.queryTracking,
          querySource: options.querySource,
          llmSpan,
          fastMode: isFastModeRequest,
          previousRequestId
        });
        if (error instanceof APIUserAbortError) {
          releaseStreamResources();
          return;
        }
        yield getAssistantMessageFromError(error, errorModel, {
          messages,
          messagesForAPI
        });
        releaseStreamResources();
        return;
      }
    } else {
      logForDebugging(`Error in API request: ${errorMessage(errorFromRetry)}`, {
        level: "error"
      });
      let error = errorFromRetry;
      let errorModel = options.model;
      if (errorFromRetry instanceof CannotRetryError) {
        error = errorFromRetry.originalError;
        errorModel = errorFromRetry.retryContext.model;
      }
      if (error instanceof APIError) {
        extractQuotaStatusFromError(error);
      }
      const requestId = streamRequestId || (error instanceof APIError ? error.requestID : void 0) || (error instanceof APIError ? error.error?.request_id : void 0);
      logAPIError({
        error,
        model: errorModel,
        messageCount: messagesForAPI.length,
        messageTokens: tokenCountFromLastAPIResponse(messagesForAPI),
        durationMs: Date.now() - start,
        durationMsIncludingRetries: Date.now() - startIncludingRetries,
        attempt: attemptNumber,
        requestId,
        clientRequestId,
        didFallBackToNonStreaming,
        queryTracking: options.queryTracking,
        querySource: options.querySource,
        llmSpan,
        fastMode: isFastModeRequest,
        previousRequestId
      });
      if (error instanceof APIUserAbortError) {
        releaseStreamResources();
        return;
      }
      yield getAssistantMessageFromError(error, errorModel, {
        messages,
        messagesForAPI
      });
      releaseStreamResources();
      return;
    }
  } finally {
    stopSessionActivity("api_call");
    releaseStreamResources();
    if (fallbackMessage) {
      const fallbackUsage = fallbackMessage.message.usage;
      usage = updateUsage(EMPTY_USAGE, fallbackUsage);
      stopReason = fallbackMessage.message.stop_reason;
      const fallbackCost = calculateUSDCost(resolvedModel, fallbackUsage);
      costUSD += addToTotalSessionCost(
        fallbackCost,
        fallbackUsage,
        options.model
      );
    }
  }
  if (false) {
    markToolsSentToAPIState();
  }
  if (streamRequestId && !getAgentContext() && (options.querySource.startsWith("repl_main_thread") || options.querySource === "sdk")) {
    setLastMainRequestId(streamRequestId);
  }
  const logMessageCount = messagesForAPI.length;
  const logMessageTokens = tokenCountFromLastAPIResponse(messagesForAPI);
  void options.getToolPermissionContext().then((permissionContext) => {
    logAPISuccessAndDuration({
      model: newMessages[0]?.message.model ?? partialMessage?.model ?? options.model,
      preNormalizedModel: options.model,
      usage,
      start,
      startIncludingRetries,
      attempt: attemptNumber,
      messageCount: logMessageCount,
      messageTokens: logMessageTokens,
      requestId: streamRequestId ?? null,
      stopReason,
      ttftMs,
      didFallBackToNonStreaming,
      querySource: options.querySource,
      headers: responseHeaders,
      costUSD,
      queryTracking: options.queryTracking,
      permissionMode: permissionContext.mode,
      // Pass newMessages for beta tracing - extraction happens in logging.ts
      // only when beta tracing is enabled
      newMessages,
      llmSpan,
      globalCacheStrategy,
      requestSetupMs: start - startIncludingRetries,
      attemptStartTimes,
      fastMode: isFastModeRequest,
      previousRequestId,
      betas: lastRequestBetas
    });
  });
  releaseStreamResources();
}
function cleanupStream(stream) {
  if (!stream) {
    return;
  }
  try {
    if (!stream.controller.signal.aborted) {
      stream.controller.abort();
    }
  } catch {
  }
}
function updateUsage(usage, partUsage) {
  if (!partUsage) {
    return { ...usage };
  }
  return {
    input_tokens: partUsage.input_tokens !== null && partUsage.input_tokens > 0 ? partUsage.input_tokens : usage.input_tokens,
    cache_creation_input_tokens: partUsage.cache_creation_input_tokens !== null && partUsage.cache_creation_input_tokens > 0 ? partUsage.cache_creation_input_tokens : usage.cache_creation_input_tokens,
    cache_read_input_tokens: partUsage.cache_read_input_tokens !== null && partUsage.cache_read_input_tokens > 0 ? partUsage.cache_read_input_tokens : usage.cache_read_input_tokens,
    output_tokens: partUsage.output_tokens ?? usage.output_tokens,
    server_tool_use: {
      web_search_requests: partUsage.server_tool_use?.web_search_requests ?? usage.server_tool_use.web_search_requests,
      web_fetch_requests: partUsage.server_tool_use?.web_fetch_requests ?? usage.server_tool_use.web_fetch_requests
    },
    service_tier: usage.service_tier,
    cache_creation: {
      // SDK type BetaMessageDeltaUsage is missing cache_creation, but it's real!
      ephemeral_1h_input_tokens: partUsage.cache_creation?.ephemeral_1h_input_tokens ?? usage.cache_creation.ephemeral_1h_input_tokens,
      ephemeral_5m_input_tokens: partUsage.cache_creation?.ephemeral_5m_input_tokens ?? usage.cache_creation.ephemeral_5m_input_tokens
    },
    // cache_deleted_input_tokens: returned by the API when cache editing
    // deletes KV cache content, but not in SDK types. Kept off NonNullableUsage
    // so the string is eliminated from external builds by dead code elimination.
    // Uses the same > 0 guard as other token fields to prevent message_delta
    // from overwriting the real value with 0.
    ...false ? {
      cache_deleted_input_tokens: partUsage.cache_deleted_input_tokens != null && partUsage.cache_deleted_input_tokens > 0 ? partUsage.cache_deleted_input_tokens : usage.cache_deleted_input_tokens ?? 0
    } : {},
    inference_geo: usage.inference_geo,
    iterations: partUsage.iterations ?? usage.iterations,
    speed: partUsage.speed ?? usage.speed
  };
}
function accumulateUsage(totalUsage, messageUsage) {
  return {
    input_tokens: totalUsage.input_tokens + messageUsage.input_tokens,
    cache_creation_input_tokens: totalUsage.cache_creation_input_tokens + messageUsage.cache_creation_input_tokens,
    cache_read_input_tokens: totalUsage.cache_read_input_tokens + messageUsage.cache_read_input_tokens,
    output_tokens: totalUsage.output_tokens + messageUsage.output_tokens,
    server_tool_use: {
      web_search_requests: totalUsage.server_tool_use.web_search_requests + messageUsage.server_tool_use.web_search_requests,
      web_fetch_requests: totalUsage.server_tool_use.web_fetch_requests + messageUsage.server_tool_use.web_fetch_requests
    },
    service_tier: messageUsage.service_tier,
    // Use the most recent service tier
    cache_creation: {
      ephemeral_1h_input_tokens: totalUsage.cache_creation.ephemeral_1h_input_tokens + messageUsage.cache_creation.ephemeral_1h_input_tokens,
      ephemeral_5m_input_tokens: totalUsage.cache_creation.ephemeral_5m_input_tokens + messageUsage.cache_creation.ephemeral_5m_input_tokens
    },
    // See comment in updateUsage — field is not on NonNullableUsage to keep
    // the string out of external builds.
    ...false ? {
      cache_deleted_input_tokens: (totalUsage.cache_deleted_input_tokens ?? 0) + (messageUsage.cache_deleted_input_tokens ?? 0)
    } : {},
    inference_geo: messageUsage.inference_geo,
    // Use the most recent
    iterations: messageUsage.iterations,
    // Use the most recent
    speed: messageUsage.speed
    // Use the most recent
  };
}
function isToolResultBlock(block) {
  return block !== null && typeof block === "object" && "type" in block && block.type === "tool_result" && "tool_use_id" in block;
}
function addCacheBreakpoints(messages, enablePromptCaching, querySource, useCachedMC = false, newCacheEdits, pinnedEdits, skipCacheWrite = false) {
  logEvent("tengu_api_cache_breakpoints", {
    totalMessageCount: messages.length,
    cachingEnabled: enablePromptCaching,
    skipCacheWrite
  });
  const markerIndex = skipCacheWrite ? messages.length - 2 : messages.length - 1;
  const result = messages.map((msg, index) => {
    const addCache = index === markerIndex;
    if (msg.type === "user") {
      return userMessageToMessageParam(
        msg,
        addCache,
        enablePromptCaching,
        querySource
      );
    }
    return assistantMessageToMessageParam(
      msg,
      addCache,
      enablePromptCaching,
      querySource
    );
  });
  if (!useCachedMC) {
    return result;
  }
  const seenDeleteRefs = /* @__PURE__ */ new Set();
  const deduplicateEdits = (block) => {
    const uniqueEdits = block.edits.filter((edit) => {
      if (seenDeleteRefs.has(edit.cache_reference)) {
        return false;
      }
      seenDeleteRefs.add(edit.cache_reference);
      return true;
    });
    return { ...block, edits: uniqueEdits };
  };
  for (const pinned of pinnedEdits ?? []) {
    const msg = result[pinned.userMessageIndex];
    if (msg && msg.role === "user") {
      if (!Array.isArray(msg.content)) {
        msg.content = [{ type: "text", text: msg.content }];
      }
      const dedupedBlock = deduplicateEdits(pinned.block);
      if (dedupedBlock.edits.length > 0) {
        insertBlockAfterToolResults(msg.content, dedupedBlock);
      }
    }
  }
  if (newCacheEdits && result.length > 0) {
    const dedupedNewEdits = deduplicateEdits(newCacheEdits);
    if (dedupedNewEdits.edits.length > 0) {
      for (let i = result.length - 1; i >= 0; i--) {
        const msg = result[i];
        if (msg && msg.role === "user") {
          if (!Array.isArray(msg.content)) {
            msg.content = [{ type: "text", text: msg.content }];
          }
          insertBlockAfterToolResults(msg.content, dedupedNewEdits);
          pinCacheEdits(i, newCacheEdits);
          logForDebugging(
            `Added cache_edits block with ${dedupedNewEdits.edits.length} deletion(s) to message[${i}]: ${dedupedNewEdits.edits.map((e) => e.cache_reference).join(", ")}`
          );
          break;
        }
      }
    }
  }
  if (enablePromptCaching) {
    let lastCCMsg = -1;
    for (let i = 0; i < result.length; i++) {
      const msg = result[i];
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block && typeof block === "object" && "cache_control" in block) {
            lastCCMsg = i;
          }
        }
      }
    }
    if (lastCCMsg >= 0) {
      for (let i = 0; i < lastCCMsg; i++) {
        const msg = result[i];
        if (msg.role !== "user" || !Array.isArray(msg.content)) {
          continue;
        }
        let cloned = false;
        for (let j = 0; j < msg.content.length; j++) {
          const block = msg.content[j];
          if (block && isToolResultBlock(block)) {
            if (!cloned) {
              msg.content = [...msg.content];
              cloned = true;
            }
            msg.content[j] = Object.assign({}, block, {
              cache_reference: block.tool_use_id
            });
          }
        }
      }
    }
  }
  return result;
}
function buildSystemPromptBlocks(systemPrompt, enablePromptCaching, options) {
  return splitSysPromptPrefix(systemPrompt, {
    skipGlobalCacheForSystemPrompt: options?.skipGlobalCacheForSystemPrompt
  }).map((block) => {
    return {
      type: "text",
      text: block.text,
      ...enablePromptCaching && block.cacheScope !== null && {
        cache_control: getCacheControl({
          scope: block.cacheScope,
          querySource: options?.querySource
        })
      }
    };
  });
}
async function queryHaiku({
  systemPrompt = asSystemPrompt([]),
  userPrompt,
  outputFormat,
  signal,
  options
}) {
  const result = await withVCR(
    [
      createUserMessage({
        content: systemPrompt.map((text) => ({ type: "text", text }))
      }),
      createUserMessage({
        content: userPrompt
      })
    ],
    async () => {
      const messages = [
        createUserMessage({
          content: userPrompt
        })
      ];
      const result2 = await queryModelWithoutStreaming({
        messages,
        systemPrompt,
        thinkingConfig: { type: "disabled" },
        tools: [],
        signal,
        options: {
          ...options,
          model: getSmallFastModel(),
          enablePromptCaching: options.enablePromptCaching ?? false,
          outputFormat,
          async getToolPermissionContext() {
            return getEmptyToolPermissionContext();
          }
        }
      });
      return [result2];
    }
  );
  return result[0];
}
async function queryWithModel({
  systemPrompt = asSystemPrompt([]),
  userPrompt,
  outputFormat,
  signal,
  options
}) {
  const result = await withVCR(
    [
      createUserMessage({
        content: systemPrompt.map((text) => ({ type: "text", text }))
      }),
      createUserMessage({
        content: userPrompt
      })
    ],
    async () => {
      const messages = [
        createUserMessage({
          content: userPrompt
        })
      ];
      const result2 = await queryModelWithoutStreaming({
        messages,
        systemPrompt,
        thinkingConfig: { type: "disabled" },
        tools: [],
        signal,
        options: {
          ...options,
          enablePromptCaching: options.enablePromptCaching ?? false,
          outputFormat,
          async getToolPermissionContext() {
            return getEmptyToolPermissionContext();
          }
        }
      });
      return [result2];
    }
  );
  return result[0];
}
const MAX_NON_STREAMING_TOKENS = 64e3;
function adjustParamsForNonStreaming(params, maxTokensCap) {
  const cappedMaxTokens = Math.min(params.max_tokens, maxTokensCap);
  const adjustedParams = { ...params };
  if (adjustedParams.thinking?.type === "enabled" && adjustedParams.thinking.budget_tokens) {
    adjustedParams.thinking = {
      ...adjustedParams.thinking,
      budget_tokens: Math.min(
        adjustedParams.thinking.budget_tokens,
        cappedMaxTokens - 1
        // Must be at least 1 less than max_tokens
      )
    };
  }
  return {
    ...adjustedParams,
    max_tokens: cappedMaxTokens
  };
}
function isMaxTokensCapEnabled() {
  return getFeatureValue_CACHED_MAY_BE_STALE("tengu_otk_slot_v1", false);
}
function getMaxOutputTokensForModel(model) {
  const maxOutputTokens = getModelMaxOutputTokens(model);
  const defaultTokens = isMaxTokensCapEnabled() ? Math.min(maxOutputTokens.default, CAPPED_DEFAULT_MAX_TOKENS) : maxOutputTokens.default;
  const result = validateBoundedIntEnvVar(
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
    process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS,
    defaultTokens,
    maxOutputTokens.upperLimit
  );
  return result.effective;
}
export {
  MAX_NON_STREAMING_TOKENS,
  accumulateUsage,
  addCacheBreakpoints,
  adjustParamsForNonStreaming,
  assistantMessageToMessageParam,
  buildSystemPromptBlocks,
  cleanupStream,
  configureTaskBudgetParams,
  executeNonStreamingRequest,
  getAPIMetadata,
  getCacheControl,
  getExtraBodyParams,
  getMaxOutputTokensForModel,
  getPromptCachingEnabled,
  queryHaiku,
  queryModelWithStreaming,
  queryModelWithoutStreaming,
  queryWithModel,
  stripExcessMediaItems,
  updateUsage,
  userMessageToMessageParam,
  verifyApiKey
};
