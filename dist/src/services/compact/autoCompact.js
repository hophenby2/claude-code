import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import { markPostCompaction } from "../../bootstrap/state.js";
import { getSdkBetas } from "../../bootstrap/state.js";
import { getGlobalConfig } from "../../utils/config.js";
import { getContextWindowForModel } from "../../utils/context.js";
import { logForDebugging } from "../../utils/debug.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { hasExactErrorMessage } from "../../utils/errors.js";
import { logError } from "../../utils/log.js";
import { tokenCountWithEstimation } from "../../utils/tokens.js";
import "../analytics/growthbook.js";
import { getMaxOutputTokensForModel } from "../api/claude.js";
import "../api/promptCacheBreakDetection.js";
import { setLastSummarizedMessageId } from "../SessionMemory/sessionMemoryUtils.js";
import {
  compactConversation,
  ERROR_MESSAGE_USER_ABORT
} from "./compact.js";
import { runPostCompactCleanup } from "./postCompactCleanup.js";
import { trySessionMemoryCompaction } from "./sessionMemoryCompact.js";
const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 2e4;
function getEffectiveContextWindowSize(model) {
  const reservedTokensForSummary = Math.min(
    getMaxOutputTokensForModel(model),
    MAX_OUTPUT_TOKENS_FOR_SUMMARY
  );
  let contextWindow = getContextWindowForModel(model, getSdkBetas());
  const autoCompactWindow = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
  if (autoCompactWindow) {
    const parsed = parseInt(autoCompactWindow, 10);
    if (!isNaN(parsed) && parsed > 0) {
      contextWindow = Math.min(contextWindow, parsed);
    }
  }
  return contextWindow - reservedTokensForSummary;
}
const AUTOCOMPACT_BUFFER_TOKENS = 13e3;
const WARNING_THRESHOLD_BUFFER_TOKENS = 2e4;
const ERROR_THRESHOLD_BUFFER_TOKENS = 2e4;
const MANUAL_COMPACT_BUFFER_TOKENS = 3e3;
const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3;
function getAutoCompactThreshold(model) {
  const effectiveContextWindow = getEffectiveContextWindowSize(model);
  const autocompactThreshold = effectiveContextWindow - AUTOCOMPACT_BUFFER_TOKENS;
  const envPercent = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
  if (envPercent) {
    const parsed = parseFloat(envPercent);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      const percentageThreshold = Math.floor(
        effectiveContextWindow * (parsed / 100)
      );
      return Math.min(percentageThreshold, autocompactThreshold);
    }
  }
  return autocompactThreshold;
}
function calculateTokenWarningState(tokenUsage, model) {
  const autoCompactThreshold = getAutoCompactThreshold(model);
  const threshold = isAutoCompactEnabled() ? autoCompactThreshold : getEffectiveContextWindowSize(model);
  const percentLeft = Math.max(
    0,
    Math.round((threshold - tokenUsage) / threshold * 100)
  );
  const warningThreshold = threshold - WARNING_THRESHOLD_BUFFER_TOKENS;
  const errorThreshold = threshold - ERROR_THRESHOLD_BUFFER_TOKENS;
  const isAboveWarningThreshold = tokenUsage >= warningThreshold;
  const isAboveErrorThreshold = tokenUsage >= errorThreshold;
  const isAboveAutoCompactThreshold = isAutoCompactEnabled() && tokenUsage >= autoCompactThreshold;
  const actualContextWindow = getEffectiveContextWindowSize(model);
  const defaultBlockingLimit = actualContextWindow - MANUAL_COMPACT_BUFFER_TOKENS;
  const blockingLimitOverride = process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE;
  const parsedOverride = blockingLimitOverride ? parseInt(blockingLimitOverride, 10) : NaN;
  const blockingLimit = !isNaN(parsedOverride) && parsedOverride > 0 ? parsedOverride : defaultBlockingLimit;
  const isAtBlockingLimit = tokenUsage >= blockingLimit;
  return {
    percentLeft,
    isAboveWarningThreshold,
    isAboveErrorThreshold,
    isAboveAutoCompactThreshold,
    isAtBlockingLimit
  };
}
function isAutoCompactEnabled() {
  if (isEnvTruthy(process.env.DISABLE_COMPACT)) {
    return false;
  }
  if (isEnvTruthy(process.env.DISABLE_AUTO_COMPACT)) {
    return false;
  }
  const userConfig = getGlobalConfig();
  return userConfig.autoCompactEnabled;
}
async function shouldAutoCompact(messages, model, querySource, snipTokensFreed = 0) {
  if (querySource === "session_memory" || querySource === "compact") {
    return false;
  }
  if (false) {
    if (querySource === "marble_origami") {
      return false;
    }
  }
  if (!isAutoCompactEnabled()) {
    return false;
  }
  if (false) {
    if (getFeatureValue_CACHED_MAY_BE_STALE("tengu_cobalt_raccoon", false)) {
      return false;
    }
  }
  if (false) {
    const { isContextCollapseEnabled } = require2("../contextCollapse/index.js");
    if (isContextCollapseEnabled()) {
      return false;
    }
  }
  const tokenCount = tokenCountWithEstimation(messages) - snipTokensFreed;
  const threshold = getAutoCompactThreshold(model);
  const effectiveWindow = getEffectiveContextWindowSize(model);
  logForDebugging(
    `autocompact: tokens=${tokenCount} threshold=${threshold} effectiveWindow=${effectiveWindow}${snipTokensFreed > 0 ? ` snipFreed=${snipTokensFreed}` : ""}`
  );
  const { isAboveAutoCompactThreshold } = calculateTokenWarningState(
    tokenCount,
    model
  );
  return isAboveAutoCompactThreshold;
}
async function autoCompactIfNeeded(messages, toolUseContext, cacheSafeParams, querySource, tracking, snipTokensFreed) {
  if (isEnvTruthy(process.env.DISABLE_COMPACT)) {
    return { wasCompacted: false };
  }
  if (tracking?.consecutiveFailures !== void 0 && tracking.consecutiveFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES) {
    return { wasCompacted: false };
  }
  const model = toolUseContext.options.mainLoopModel;
  const shouldCompact = await shouldAutoCompact(
    messages,
    model,
    querySource,
    snipTokensFreed
  );
  if (!shouldCompact) {
    return { wasCompacted: false };
  }
  const recompactionInfo = {
    isRecompactionInChain: tracking?.compacted === true,
    turnsSincePreviousCompact: tracking?.turnCounter ?? -1,
    previousCompactTurnId: tracking?.turnId,
    autoCompactThreshold: getAutoCompactThreshold(model),
    querySource
  };
  const sessionMemoryResult = await trySessionMemoryCompaction(
    messages,
    toolUseContext.agentId,
    recompactionInfo.autoCompactThreshold
  );
  if (sessionMemoryResult) {
    setLastSummarizedMessageId(void 0);
    runPostCompactCleanup(querySource);
    if (false) {
      notifyCompaction(querySource ?? "compact", toolUseContext.agentId);
    }
    markPostCompaction();
    return {
      wasCompacted: true,
      compactionResult: sessionMemoryResult
    };
  }
  try {
    const compactionResult = await compactConversation(
      messages,
      toolUseContext,
      cacheSafeParams,
      true,
      // Suppress user questions for autocompact
      void 0,
      // No custom instructions for autocompact
      true,
      // isAutoCompact
      recompactionInfo
    );
    setLastSummarizedMessageId(void 0);
    runPostCompactCleanup(querySource);
    return {
      wasCompacted: true,
      compactionResult,
      // Reset failure count on success
      consecutiveFailures: 0
    };
  } catch (error) {
    if (!hasExactErrorMessage(error, ERROR_MESSAGE_USER_ABORT)) {
      logError(error);
    }
    const prevFailures = tracking?.consecutiveFailures ?? 0;
    const nextFailures = prevFailures + 1;
    if (nextFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES) {
      logForDebugging(
        `autocompact: circuit breaker tripped after ${nextFailures} consecutive failures \u2014 skipping future attempts this session`,
        { level: "warn" }
      );
    }
    return { wasCompacted: false, consecutiveFailures: nextFailures };
  }
}
export {
  AUTOCOMPACT_BUFFER_TOKENS,
  ERROR_THRESHOLD_BUFFER_TOKENS,
  MANUAL_COMPACT_BUFFER_TOKENS,
  WARNING_THRESHOLD_BUFFER_TOKENS,
  autoCompactIfNeeded,
  calculateTokenWarningState,
  getAutoCompactThreshold,
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
  shouldAutoCompact
};
