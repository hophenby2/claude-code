import { setMockBillingAccessOverride } from "../utils/billing.js";
let mockHeaders = {};
let mockEnabled = false;
let mockHeaderless429Message = null;
let mockSubscriptionType = null;
let mockFastModeRateLimitDurationMs = null;
let mockFastModeRateLimitExpiresAt = null;
const DEFAULT_MOCK_SUBSCRIPTION = "max";
let exceededLimits = [];
function setMockHeader(key, value) {
  if (process.env.USER_TYPE !== "ant") {
    return;
  }
  mockEnabled = true;
  const fullKey = key === "retry-after" ? "retry-after" : `anthropic-ratelimit-unified-${key}`;
  if (value === void 0 || value === "clear") {
    delete mockHeaders[fullKey];
    if (key === "claim") {
      exceededLimits = [];
    }
    if (key === "status" || key === "overage-status") {
      updateRetryAfter();
    }
    return;
  } else {
    if (key === "reset" || key === "overage-reset") {
      const hours = Number(value);
      if (!isNaN(hours)) {
        value = String(Math.floor(Date.now() / 1e3) + hours * 3600);
      }
    }
    if (key === "claim") {
      const validClaims = [
        "five_hour",
        "seven_day",
        "seven_day_opus",
        "seven_day_sonnet"
      ];
      if (validClaims.includes(value)) {
        let resetsAt;
        if (value === "five_hour") {
          resetsAt = Math.floor(Date.now() / 1e3) + 5 * 3600;
        } else if (value === "seven_day" || value === "seven_day_opus" || value === "seven_day_sonnet") {
          resetsAt = Math.floor(Date.now() / 1e3) + 7 * 24 * 3600;
        } else {
          resetsAt = Math.floor(Date.now() / 1e3) + 3600;
        }
        exceededLimits = exceededLimits.filter((l) => l.type !== value);
        exceededLimits.push({ type: value, resetsAt });
        updateRepresentativeClaim();
        return;
      }
    }
    const headers = mockHeaders;
    headers[fullKey] = value;
    if (key === "status" || key === "overage-status") {
      updateRetryAfter();
    }
  }
  if (Object.keys(mockHeaders).length === 0) {
    mockEnabled = false;
  }
}
function updateRetryAfter() {
  const status = mockHeaders["anthropic-ratelimit-unified-status"];
  const overageStatus = mockHeaders["anthropic-ratelimit-unified-overage-status"];
  const reset = mockHeaders["anthropic-ratelimit-unified-reset"];
  if (status === "rejected" && (!overageStatus || overageStatus === "rejected") && reset) {
    const resetTimestamp = Number(reset);
    const secondsUntilReset = Math.max(
      0,
      resetTimestamp - Math.floor(Date.now() / 1e3)
    );
    mockHeaders["retry-after"] = String(secondsUntilReset);
  } else {
    delete mockHeaders["retry-after"];
  }
}
function updateRepresentativeClaim() {
  if (exceededLimits.length === 0) {
    delete mockHeaders["anthropic-ratelimit-unified-representative-claim"];
    delete mockHeaders["anthropic-ratelimit-unified-reset"];
    delete mockHeaders["retry-after"];
    return;
  }
  const furthest = exceededLimits.reduce(
    (prev, curr) => curr.resetsAt > prev.resetsAt ? curr : prev
  );
  mockHeaders["anthropic-ratelimit-unified-representative-claim"] = furthest.type;
  mockHeaders["anthropic-ratelimit-unified-reset"] = String(furthest.resetsAt);
  if (mockHeaders["anthropic-ratelimit-unified-status"] === "rejected") {
    const overageStatus = mockHeaders["anthropic-ratelimit-unified-overage-status"];
    if (!overageStatus || overageStatus === "rejected") {
      const secondsUntilReset = Math.max(
        0,
        furthest.resetsAt - Math.floor(Date.now() / 1e3)
      );
      mockHeaders["retry-after"] = String(secondsUntilReset);
    } else {
      delete mockHeaders["retry-after"];
    }
  } else {
    delete mockHeaders["retry-after"];
  }
}
function addExceededLimit(type, hoursFromNow) {
  if (process.env.USER_TYPE !== "ant") {
    return;
  }
  mockEnabled = true;
  const resetsAt = Math.floor(Date.now() / 1e3) + hoursFromNow * 3600;
  exceededLimits = exceededLimits.filter((l) => l.type !== type);
  exceededLimits.push({ type, resetsAt });
  if (exceededLimits.length > 0) {
    mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
  }
  updateRepresentativeClaim();
}
function setMockEarlyWarning(claimAbbrev, utilization, hoursFromNow) {
  if (process.env.USER_TYPE !== "ant") {
    return;
  }
  mockEnabled = true;
  clearMockEarlyWarning();
  const defaultHours = claimAbbrev === "5h" ? 4 : 5 * 24;
  const hours = hoursFromNow ?? defaultHours;
  const resetsAt = Math.floor(Date.now() / 1e3) + hours * 3600;
  mockHeaders[`anthropic-ratelimit-unified-${claimAbbrev}-utilization`] = String(utilization);
  mockHeaders[`anthropic-ratelimit-unified-${claimAbbrev}-reset`] = String(resetsAt);
  mockHeaders[`anthropic-ratelimit-unified-${claimAbbrev}-surpassed-threshold`] = String(utilization);
  if (!mockHeaders["anthropic-ratelimit-unified-status"]) {
    mockHeaders["anthropic-ratelimit-unified-status"] = "allowed";
  }
}
function clearMockEarlyWarning() {
  delete mockHeaders["anthropic-ratelimit-unified-5h-utilization"];
  delete mockHeaders["anthropic-ratelimit-unified-5h-reset"];
  delete mockHeaders["anthropic-ratelimit-unified-5h-surpassed-threshold"];
  delete mockHeaders["anthropic-ratelimit-unified-7d-utilization"];
  delete mockHeaders["anthropic-ratelimit-unified-7d-reset"];
  delete mockHeaders["anthropic-ratelimit-unified-7d-surpassed-threshold"];
}
function setMockRateLimitScenario(scenario) {
  if (process.env.USER_TYPE !== "ant") {
    return;
  }
  if (scenario === "clear") {
    mockHeaders = {};
    mockHeaderless429Message = null;
    mockEnabled = false;
    return;
  }
  mockEnabled = true;
  const fiveHoursFromNow = Math.floor(Date.now() / 1e3) + 5 * 3600;
  const sevenDaysFromNow = Math.floor(Date.now() / 1e3) + 7 * 24 * 3600;
  mockHeaders = {};
  mockHeaderless429Message = null;
  const preserveExceededLimits = [
    "overage-active",
    "overage-warning",
    "overage-exhausted"
  ].includes(scenario);
  if (!preserveExceededLimits) {
    exceededLimits = [];
  }
  switch (scenario) {
    case "normal":
      mockHeaders = {
        "anthropic-ratelimit-unified-status": "allowed",
        "anthropic-ratelimit-unified-reset": String(fiveHoursFromNow)
      };
      break;
    case "session-limit-reached":
      exceededLimits = [{ type: "five_hour", resetsAt: fiveHoursFromNow }];
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      break;
    case "approaching-weekly-limit":
      mockHeaders = {
        "anthropic-ratelimit-unified-status": "allowed_warning",
        "anthropic-ratelimit-unified-reset": String(sevenDaysFromNow),
        "anthropic-ratelimit-unified-representative-claim": "seven_day"
      };
      break;
    case "weekly-limit-reached":
      exceededLimits = [{ type: "seven_day", resetsAt: sevenDaysFromNow }];
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      break;
    case "overage-active": {
      if (exceededLimits.length === 0) {
        exceededLimits = [{ type: "five_hour", resetsAt: fiveHoursFromNow }];
      }
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-status"] = "allowed";
      const endOfMonthActive = /* @__PURE__ */ new Date();
      endOfMonthActive.setMonth(endOfMonthActive.getMonth() + 1, 1);
      endOfMonthActive.setHours(0, 0, 0, 0);
      mockHeaders["anthropic-ratelimit-unified-overage-reset"] = String(
        Math.floor(endOfMonthActive.getTime() / 1e3)
      );
      break;
    }
    case "overage-warning": {
      if (exceededLimits.length === 0) {
        exceededLimits = [{ type: "five_hour", resetsAt: fiveHoursFromNow }];
      }
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-status"] = "allowed_warning";
      const endOfMonth = /* @__PURE__ */ new Date();
      endOfMonth.setMonth(endOfMonth.getMonth() + 1, 1);
      endOfMonth.setHours(0, 0, 0, 0);
      mockHeaders["anthropic-ratelimit-unified-overage-reset"] = String(
        Math.floor(endOfMonth.getTime() / 1e3)
      );
      break;
    }
    case "overage-exhausted": {
      if (exceededLimits.length === 0) {
        exceededLimits = [{ type: "five_hour", resetsAt: fiveHoursFromNow }];
      }
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-status"] = "rejected";
      const endOfMonthExhausted = /* @__PURE__ */ new Date();
      endOfMonthExhausted.setMonth(endOfMonthExhausted.getMonth() + 1, 1);
      endOfMonthExhausted.setHours(0, 0, 0, 0);
      mockHeaders["anthropic-ratelimit-unified-overage-reset"] = String(
        Math.floor(endOfMonthExhausted.getTime() / 1e3)
      );
      break;
    }
    case "out-of-credits": {
      if (exceededLimits.length === 0) {
        exceededLimits = [{ type: "five_hour", resetsAt: fiveHoursFromNow }];
      }
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-disabled-reason"] = "out_of_credits";
      const endOfMonth = /* @__PURE__ */ new Date();
      endOfMonth.setMonth(endOfMonth.getMonth() + 1, 1);
      endOfMonth.setHours(0, 0, 0, 0);
      mockHeaders["anthropic-ratelimit-unified-overage-reset"] = String(
        Math.floor(endOfMonth.getTime() / 1e3)
      );
      break;
    }
    case "org-zero-credit-limit": {
      if (exceededLimits.length === 0) {
        exceededLimits = [{ type: "five_hour", resetsAt: fiveHoursFromNow }];
      }
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-disabled-reason"] = "org_service_zero_credit_limit";
      const endOfMonthZero = /* @__PURE__ */ new Date();
      endOfMonthZero.setMonth(endOfMonthZero.getMonth() + 1, 1);
      endOfMonthZero.setHours(0, 0, 0, 0);
      mockHeaders["anthropic-ratelimit-unified-overage-reset"] = String(
        Math.floor(endOfMonthZero.getTime() / 1e3)
      );
      break;
    }
    case "org-spend-cap-hit": {
      if (exceededLimits.length === 0) {
        exceededLimits = [{ type: "five_hour", resetsAt: fiveHoursFromNow }];
      }
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-disabled-reason"] = "org_level_disabled_until";
      const endOfMonthHit = /* @__PURE__ */ new Date();
      endOfMonthHit.setMonth(endOfMonthHit.getMonth() + 1, 1);
      endOfMonthHit.setHours(0, 0, 0, 0);
      mockHeaders["anthropic-ratelimit-unified-overage-reset"] = String(
        Math.floor(endOfMonthHit.getTime() / 1e3)
      );
      break;
    }
    case "member-zero-credit-limit": {
      if (exceededLimits.length === 0) {
        exceededLimits = [{ type: "five_hour", resetsAt: fiveHoursFromNow }];
      }
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-disabled-reason"] = "member_zero_credit_limit";
      const endOfMonthMember = /* @__PURE__ */ new Date();
      endOfMonthMember.setMonth(endOfMonthMember.getMonth() + 1, 1);
      endOfMonthMember.setHours(0, 0, 0, 0);
      mockHeaders["anthropic-ratelimit-unified-overage-reset"] = String(
        Math.floor(endOfMonthMember.getTime() / 1e3)
      );
      break;
    }
    case "seat-tier-zero-credit-limit": {
      if (exceededLimits.length === 0) {
        exceededLimits = [{ type: "five_hour", resetsAt: fiveHoursFromNow }];
      }
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-status"] = "rejected";
      mockHeaders["anthropic-ratelimit-unified-overage-disabled-reason"] = "seat_tier_zero_credit_limit";
      const endOfMonthSeatTier = /* @__PURE__ */ new Date();
      endOfMonthSeatTier.setMonth(endOfMonthSeatTier.getMonth() + 1, 1);
      endOfMonthSeatTier.setHours(0, 0, 0, 0);
      mockHeaders["anthropic-ratelimit-unified-overage-reset"] = String(
        Math.floor(endOfMonthSeatTier.getTime() / 1e3)
      );
      break;
    }
    case "opus-limit": {
      exceededLimits = [{ type: "seven_day_opus", resetsAt: sevenDaysFromNow }];
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      break;
    }
    case "opus-warning": {
      mockHeaders = {
        "anthropic-ratelimit-unified-status": "allowed_warning",
        "anthropic-ratelimit-unified-reset": String(sevenDaysFromNow),
        "anthropic-ratelimit-unified-representative-claim": "seven_day_opus"
      };
      break;
    }
    case "sonnet-limit": {
      exceededLimits = [
        { type: "seven_day_sonnet", resetsAt: sevenDaysFromNow }
      ];
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      break;
    }
    case "sonnet-warning": {
      mockHeaders = {
        "anthropic-ratelimit-unified-status": "allowed_warning",
        "anthropic-ratelimit-unified-reset": String(sevenDaysFromNow),
        "anthropic-ratelimit-unified-representative-claim": "seven_day_sonnet"
      };
      break;
    }
    case "fast-mode-limit": {
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      mockFastModeRateLimitDurationMs = 10 * 60 * 1e3;
      break;
    }
    case "fast-mode-short-limit": {
      updateRepresentativeClaim();
      mockHeaders["anthropic-ratelimit-unified-status"] = "rejected";
      mockFastModeRateLimitDurationMs = 10 * 1e3;
      break;
    }
    case "extra-usage-required": {
      mockHeaderless429Message = "Extra usage is required for long context requests.";
      break;
    }
    default:
      break;
  }
}
function getMockHeaderless429Message() {
  if (process.env.USER_TYPE !== "ant") {
    return null;
  }
  if (process.env.CLAUDE_MOCK_HEADERLESS_429) {
    return process.env.CLAUDE_MOCK_HEADERLESS_429;
  }
  if (!mockEnabled) {
    return null;
  }
  return mockHeaderless429Message;
}
function getMockHeaders() {
  if (!mockEnabled || process.env.USER_TYPE !== "ant" || Object.keys(mockHeaders).length === 0) {
    return null;
  }
  return mockHeaders;
}
function getMockStatus() {
  if (!mockEnabled || Object.keys(mockHeaders).length === 0 && !mockSubscriptionType) {
    return "No mock headers active (using real limits)";
  }
  const lines = [];
  lines.push("Active mock headers:");
  const effectiveSubscription = mockSubscriptionType || DEFAULT_MOCK_SUBSCRIPTION;
  if (mockSubscriptionType) {
    lines.push(`  Subscription Type: ${mockSubscriptionType} (explicitly set)`);
  } else {
    lines.push(`  Subscription Type: ${effectiveSubscription} (default)`);
  }
  Object.entries(mockHeaders).forEach(([key, value]) => {
    if (value !== void 0) {
      const formattedKey = key.replace("anthropic-ratelimit-unified-", "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      if (key.includes("reset") && value) {
        const timestamp = Number(value);
        const date = new Date(timestamp * 1e3);
        lines.push(`  ${formattedKey}: ${value} (${date.toLocaleString()})`);
      } else {
        lines.push(`  ${formattedKey}: ${value}`);
      }
    }
  });
  if (exceededLimits.length > 0) {
    lines.push("\nExceeded limits (contributing to representative claim):");
    exceededLimits.forEach((limit) => {
      const date = new Date(limit.resetsAt * 1e3);
      lines.push(`  ${limit.type}: resets at ${date.toLocaleString()}`);
    });
  }
  return lines.join("\n");
}
function clearMockHeaders() {
  mockHeaders = {};
  exceededLimits = [];
  mockSubscriptionType = null;
  mockFastModeRateLimitDurationMs = null;
  mockFastModeRateLimitExpiresAt = null;
  mockHeaderless429Message = null;
  setMockBillingAccessOverride(null);
  mockEnabled = false;
}
function applyMockHeaders(headers) {
  const mock = getMockHeaders();
  if (!mock) {
    return headers;
  }
  const newHeaders = new globalThis.Headers(headers);
  Object.entries(mock).forEach(([key, value]) => {
    if (value !== void 0) {
      newHeaders.set(key, value);
    }
  });
  return newHeaders;
}
function shouldProcessMockLimits() {
  if (process.env.USER_TYPE !== "ant") {
    return false;
  }
  return mockEnabled || Boolean(process.env.CLAUDE_MOCK_HEADERLESS_429);
}
function getCurrentMockScenario() {
  if (!mockEnabled) {
    return null;
  }
  if (!mockHeaders) return null;
  const status = mockHeaders["anthropic-ratelimit-unified-status"];
  const overage = mockHeaders["anthropic-ratelimit-unified-overage-status"];
  const claim = mockHeaders["anthropic-ratelimit-unified-representative-claim"];
  if (claim === "seven_day_opus") {
    return status === "rejected" ? "opus-limit" : "opus-warning";
  }
  if (claim === "seven_day_sonnet") {
    return status === "rejected" ? "sonnet-limit" : "sonnet-warning";
  }
  if (overage === "rejected") return "overage-exhausted";
  if (overage === "allowed_warning") return "overage-warning";
  if (overage === "allowed") return "overage-active";
  if (status === "rejected") {
    if (claim === "five_hour") return "session-limit-reached";
    if (claim === "seven_day") return "weekly-limit-reached";
  }
  if (status === "allowed_warning") {
    if (claim === "seven_day") return "approaching-weekly-limit";
  }
  if (status === "allowed") return "normal";
  return null;
}
function getScenarioDescription(scenario) {
  switch (scenario) {
    case "normal":
      return "Normal usage, no limits";
    case "session-limit-reached":
      return "Session rate limit exceeded";
    case "approaching-weekly-limit":
      return "Approaching weekly aggregate limit";
    case "weekly-limit-reached":
      return "Weekly aggregate limit exceeded";
    case "overage-active":
      return "Using extra usage (overage active)";
    case "overage-warning":
      return "Approaching extra usage limit";
    case "overage-exhausted":
      return "Both subscription and extra usage limits exhausted";
    case "out-of-credits":
      return "Out of extra usage credits (wallet empty)";
    case "org-zero-credit-limit":
      return "Org spend cap is zero (no extra usage budget)";
    case "org-spend-cap-hit":
      return "Org spend cap hit for the month";
    case "member-zero-credit-limit":
      return "Member limit is zero (admin can allocate more)";
    case "seat-tier-zero-credit-limit":
      return "Seat tier limit is zero (admin can allocate more)";
    case "opus-limit":
      return "Opus limit reached";
    case "opus-warning":
      return "Approaching Opus limit";
    case "sonnet-limit":
      return "Sonnet limit reached";
    case "sonnet-warning":
      return "Approaching Sonnet limit";
    case "fast-mode-limit":
      return "Fast mode rate limit";
    case "fast-mode-short-limit":
      return "Fast mode rate limit (short)";
    case "extra-usage-required":
      return "Headerless 429: Extra usage required for 1M context";
    case "clear":
      return "Clear mock headers (use real limits)";
    default:
      return "Unknown scenario";
  }
}
function setMockSubscriptionType(subscriptionType) {
  if (process.env.USER_TYPE !== "ant") {
    return;
  }
  mockEnabled = true;
  mockSubscriptionType = subscriptionType;
}
function getMockSubscriptionType() {
  if (!mockEnabled || process.env.USER_TYPE !== "ant") {
    return null;
  }
  return mockSubscriptionType || DEFAULT_MOCK_SUBSCRIPTION;
}
function shouldUseMockSubscription() {
  return mockEnabled && mockSubscriptionType !== null && process.env.USER_TYPE === "ant";
}
function setMockBillingAccess(hasAccess) {
  if (process.env.USER_TYPE !== "ant") {
    return;
  }
  mockEnabled = true;
  setMockBillingAccessOverride(hasAccess);
}
function isMockFastModeRateLimitScenario() {
  return mockFastModeRateLimitDurationMs !== null;
}
function checkMockFastModeRateLimit(isFastModeActive) {
  if (mockFastModeRateLimitDurationMs === null) {
    return null;
  }
  if (!isFastModeActive) {
    return null;
  }
  if (mockFastModeRateLimitExpiresAt !== null && Date.now() >= mockFastModeRateLimitExpiresAt) {
    clearMockHeaders();
    return null;
  }
  if (mockFastModeRateLimitExpiresAt === null) {
    mockFastModeRateLimitExpiresAt = Date.now() + mockFastModeRateLimitDurationMs;
  }
  const remainingMs = mockFastModeRateLimitExpiresAt - Date.now();
  const headersToSend = { ...mockHeaders };
  headersToSend["retry-after"] = String(
    Math.max(1, Math.ceil(remainingMs / 1e3))
  );
  return headersToSend;
}
export {
  addExceededLimit,
  applyMockHeaders,
  checkMockFastModeRateLimit,
  clearMockEarlyWarning,
  clearMockHeaders,
  getCurrentMockScenario,
  getMockHeaderless429Message,
  getMockHeaders,
  getMockStatus,
  getMockSubscriptionType,
  getScenarioDescription,
  isMockFastModeRateLimitScenario,
  setMockBillingAccess,
  setMockEarlyWarning,
  setMockHeader,
  setMockRateLimitScenario,
  setMockSubscriptionType,
  shouldProcessMockLimits,
  shouldUseMockSubscription
};
