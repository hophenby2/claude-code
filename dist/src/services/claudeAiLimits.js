import { APIError } from "@anthropic-ai/sdk";
import isEqual from "lodash-es/isEqual.js";
import { getIsNonInteractiveSession } from "../bootstrap/state.js";
import { isClaudeAISubscriber } from "../utils/auth.js";
import { getModelBetas } from "../utils/betas.js";
import { getGlobalConfig, saveGlobalConfig } from "../utils/config.js";
import { logError } from "../utils/log.js";
import { getSmallFastModel } from "../utils/model/model.js";
import { isEssentialTrafficOnly } from "../utils/privacyLevel.js";
import { logEvent } from "./analytics/index.js";
import { getAPIMetadata } from "./api/claude.js";
import { getAnthropicClient } from "./api/client.js";
import {
  processRateLimitHeaders,
  shouldProcessRateLimits
} from "./rateLimitMocking.js";
import {
  getRateLimitErrorMessage,
  getRateLimitWarning,
  getUsingOverageText
} from "./rateLimitMessages.js";
const EARLY_WARNING_CONFIGS = [
  {
    rateLimitType: "five_hour",
    claimAbbrev: "5h",
    windowSeconds: 5 * 60 * 60,
    thresholds: [{ utilization: 0.9, timePct: 0.72 }]
  },
  {
    rateLimitType: "seven_day",
    claimAbbrev: "7d",
    windowSeconds: 7 * 24 * 60 * 60,
    thresholds: [
      { utilization: 0.75, timePct: 0.6 },
      { utilization: 0.5, timePct: 0.35 },
      { utilization: 0.25, timePct: 0.15 }
    ]
  }
];
const EARLY_WARNING_CLAIM_MAP = {
  "5h": "five_hour",
  "7d": "seven_day",
  overage: "overage"
};
const RATE_LIMIT_DISPLAY_NAMES = {
  five_hour: "session limit",
  seven_day: "weekly limit",
  seven_day_opus: "Opus limit",
  seven_day_sonnet: "Sonnet limit",
  overage: "extra usage limit"
};
function getRateLimitDisplayName(type) {
  return RATE_LIMIT_DISPLAY_NAMES[type] || type;
}
function computeTimeProgress(resetsAt, windowSeconds) {
  const nowSeconds = Date.now() / 1e3;
  const windowStart = resetsAt - windowSeconds;
  const elapsed = nowSeconds - windowStart;
  return Math.max(0, Math.min(1, elapsed / windowSeconds));
}
let currentLimits = {
  status: "allowed",
  unifiedRateLimitFallbackAvailable: false,
  isUsingOverage: false
};
let rawUtilization = {};
function getRawUtilization() {
  return rawUtilization;
}
function extractRawUtilization(headers) {
  const result = {};
  for (const [key, abbrev] of [
    ["five_hour", "5h"],
    ["seven_day", "7d"]
  ]) {
    const util = headers.get(
      `anthropic-ratelimit-unified-${abbrev}-utilization`
    );
    const reset = headers.get(`anthropic-ratelimit-unified-${abbrev}-reset`);
    if (util !== null && reset !== null) {
      result[key] = { utilization: Number(util), resets_at: Number(reset) };
    }
  }
  return result;
}
const statusListeners = /* @__PURE__ */ new Set();
function emitStatusChange(limits) {
  currentLimits = limits;
  statusListeners.forEach((listener) => listener(limits));
  const hoursTillReset = Math.round(
    (limits.resetsAt ? limits.resetsAt - Date.now() / 1e3 : 0) / (60 * 60)
  );
  logEvent("tengu_claudeai_limits_status_changed", {
    status: limits.status,
    unifiedRateLimitFallbackAvailable: limits.unifiedRateLimitFallbackAvailable,
    hoursTillReset
  });
}
async function makeTestQuery() {
  const model = getSmallFastModel();
  const anthropic = await getAnthropicClient({
    maxRetries: 0,
    model,
    source: "quota_check"
  });
  const messages = [{ role: "user", content: "quota" }];
  const betas = getModelBetas(model);
  return anthropic.beta.messages.create({
    model,
    max_tokens: 1,
    messages,
    metadata: getAPIMetadata(),
    ...betas.length > 0 ? { betas } : {}
  }).asResponse();
}
async function checkQuotaStatus() {
  if (isEssentialTrafficOnly()) {
    return;
  }
  if (!shouldProcessRateLimits(isClaudeAISubscriber())) {
    return;
  }
  if (getIsNonInteractiveSession()) {
    return;
  }
  try {
    const raw = await makeTestQuery();
    extractQuotaStatusFromHeaders(raw.headers);
  } catch (error) {
    if (error instanceof APIError) {
      extractQuotaStatusFromError(error);
    }
  }
}
function getHeaderBasedEarlyWarning(headers, unifiedRateLimitFallbackAvailable) {
  for (const [claimAbbrev, rateLimitType] of Object.entries(
    EARLY_WARNING_CLAIM_MAP
  )) {
    const surpassedThreshold = headers.get(
      `anthropic-ratelimit-unified-${claimAbbrev}-surpassed-threshold`
    );
    if (surpassedThreshold !== null) {
      const utilizationHeader = headers.get(
        `anthropic-ratelimit-unified-${claimAbbrev}-utilization`
      );
      const resetHeader = headers.get(
        `anthropic-ratelimit-unified-${claimAbbrev}-reset`
      );
      const utilization = utilizationHeader ? Number(utilizationHeader) : void 0;
      const resetsAt = resetHeader ? Number(resetHeader) : void 0;
      return {
        status: "allowed_warning",
        resetsAt,
        rateLimitType,
        utilization,
        unifiedRateLimitFallbackAvailable,
        isUsingOverage: false,
        surpassedThreshold: Number(surpassedThreshold)
      };
    }
  }
  return null;
}
function getTimeRelativeEarlyWarning(headers, config, unifiedRateLimitFallbackAvailable) {
  const { rateLimitType, claimAbbrev, windowSeconds, thresholds } = config;
  const utilizationHeader = headers.get(
    `anthropic-ratelimit-unified-${claimAbbrev}-utilization`
  );
  const resetHeader = headers.get(
    `anthropic-ratelimit-unified-${claimAbbrev}-reset`
  );
  if (utilizationHeader === null || resetHeader === null) {
    return null;
  }
  const utilization = Number(utilizationHeader);
  const resetsAt = Number(resetHeader);
  const timeProgress = computeTimeProgress(resetsAt, windowSeconds);
  const shouldWarn = thresholds.some(
    (t) => utilization >= t.utilization && timeProgress <= t.timePct
  );
  if (!shouldWarn) {
    return null;
  }
  return {
    status: "allowed_warning",
    resetsAt,
    rateLimitType,
    utilization,
    unifiedRateLimitFallbackAvailable,
    isUsingOverage: false
  };
}
function getEarlyWarningFromHeaders(headers, unifiedRateLimitFallbackAvailable) {
  const headerBasedWarning = getHeaderBasedEarlyWarning(
    headers,
    unifiedRateLimitFallbackAvailable
  );
  if (headerBasedWarning) {
    return headerBasedWarning;
  }
  for (const config of EARLY_WARNING_CONFIGS) {
    const timeRelativeWarning = getTimeRelativeEarlyWarning(
      headers,
      config,
      unifiedRateLimitFallbackAvailable
    );
    if (timeRelativeWarning) {
      return timeRelativeWarning;
    }
  }
  return null;
}
function computeNewLimitsFromHeaders(headers) {
  const status = headers.get("anthropic-ratelimit-unified-status") || "allowed";
  const resetsAtHeader = headers.get("anthropic-ratelimit-unified-reset");
  const resetsAt = resetsAtHeader ? Number(resetsAtHeader) : void 0;
  const unifiedRateLimitFallbackAvailable = headers.get("anthropic-ratelimit-unified-fallback") === "available";
  const rateLimitType = headers.get(
    "anthropic-ratelimit-unified-representative-claim"
  );
  const overageStatus = headers.get(
    "anthropic-ratelimit-unified-overage-status"
  );
  const overageResetsAtHeader = headers.get(
    "anthropic-ratelimit-unified-overage-reset"
  );
  const overageResetsAt = overageResetsAtHeader ? Number(overageResetsAtHeader) : void 0;
  const overageDisabledReason = headers.get(
    "anthropic-ratelimit-unified-overage-disabled-reason"
  );
  const isUsingOverage = status === "rejected" && (overageStatus === "allowed" || overageStatus === "allowed_warning");
  let finalStatus = status;
  if (status === "allowed" || status === "allowed_warning") {
    const earlyWarning = getEarlyWarningFromHeaders(
      headers,
      unifiedRateLimitFallbackAvailable
    );
    if (earlyWarning) {
      return earlyWarning;
    }
    finalStatus = "allowed";
  }
  return {
    status: finalStatus,
    resetsAt,
    unifiedRateLimitFallbackAvailable,
    ...rateLimitType && { rateLimitType },
    ...overageStatus && { overageStatus },
    ...overageResetsAt && { overageResetsAt },
    ...overageDisabledReason && { overageDisabledReason },
    isUsingOverage
  };
}
function cacheExtraUsageDisabledReason(headers) {
  const reason = headers.get("anthropic-ratelimit-unified-overage-disabled-reason") ?? null;
  const cached = getGlobalConfig().cachedExtraUsageDisabledReason;
  if (cached !== reason) {
    saveGlobalConfig((current) => ({
      ...current,
      cachedExtraUsageDisabledReason: reason
    }));
  }
}
function extractQuotaStatusFromHeaders(headers) {
  const isSubscriber = isClaudeAISubscriber();
  if (!shouldProcessRateLimits(isSubscriber)) {
    rawUtilization = {};
    if (currentLimits.status !== "allowed" || currentLimits.resetsAt) {
      const defaultLimits = {
        status: "allowed",
        unifiedRateLimitFallbackAvailable: false,
        isUsingOverage: false
      };
      emitStatusChange(defaultLimits);
    }
    return;
  }
  const headersToUse = processRateLimitHeaders(headers);
  rawUtilization = extractRawUtilization(headersToUse);
  const newLimits = computeNewLimitsFromHeaders(headersToUse);
  cacheExtraUsageDisabledReason(headersToUse);
  if (!isEqual(currentLimits, newLimits)) {
    emitStatusChange(newLimits);
  }
}
function extractQuotaStatusFromError(error) {
  if (!shouldProcessRateLimits(isClaudeAISubscriber()) || error.status !== 429) {
    return;
  }
  try {
    let newLimits = { ...currentLimits };
    if (error.headers) {
      const headersToUse = processRateLimitHeaders(error.headers);
      rawUtilization = extractRawUtilization(headersToUse);
      newLimits = computeNewLimitsFromHeaders(headersToUse);
      cacheExtraUsageDisabledReason(headersToUse);
    }
    newLimits.status = "rejected";
    if (!isEqual(currentLimits, newLimits)) {
      emitStatusChange(newLimits);
    }
  } catch (e) {
    logError(e);
  }
}
export {
  checkQuotaStatus,
  currentLimits,
  emitStatusChange,
  extractQuotaStatusFromError,
  extractQuotaStatusFromHeaders,
  getRateLimitDisplayName,
  getRateLimitErrorMessage,
  getRateLimitWarning,
  getRawUtilization,
  getUsingOverageText,
  statusListeners
};
