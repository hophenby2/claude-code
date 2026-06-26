import { APIError } from "@anthropic-ai/sdk";
import {
  applyMockHeaders,
  checkMockFastModeRateLimit,
  getMockHeaderless429Message,
  getMockHeaders,
  isMockFastModeRateLimitScenario,
  shouldProcessMockLimits
} from "./mockRateLimits.js";
function processRateLimitHeaders(headers) {
  if (shouldProcessMockLimits()) {
    return applyMockHeaders(headers);
  }
  return headers;
}
function shouldProcessRateLimits(isSubscriber) {
  return isSubscriber || shouldProcessMockLimits();
}
function checkMockRateLimitError(currentModel, isFastModeActive) {
  if (!shouldProcessMockLimits()) {
    return null;
  }
  const headerlessMessage = getMockHeaderless429Message();
  if (headerlessMessage) {
    return new APIError(
      429,
      { error: { type: "rate_limit_error", message: headerlessMessage } },
      headerlessMessage,
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      new globalThis.Headers()
    );
  }
  const mockHeaders = getMockHeaders();
  if (!mockHeaders) {
    return null;
  }
  const status = mockHeaders["anthropic-ratelimit-unified-status"];
  const overageStatus = mockHeaders["anthropic-ratelimit-unified-overage-status"];
  const rateLimitType = mockHeaders["anthropic-ratelimit-unified-representative-claim"];
  const isOpusLimit = rateLimitType === "seven_day_opus";
  const isUsingOpus = currentModel.includes("opus");
  if (isOpusLimit && !isUsingOpus) {
    return null;
  }
  if (isMockFastModeRateLimitScenario()) {
    const fastModeHeaders = checkMockFastModeRateLimit(isFastModeActive);
    if (fastModeHeaders === null) {
      return null;
    }
    const error = new APIError(
      429,
      { error: { type: "rate_limit_error", message: "Rate limit exceeded" } },
      "Rate limit exceeded",
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      new globalThis.Headers(
        Object.entries(fastModeHeaders).filter(([_, v]) => v !== void 0)
      )
    );
    return error;
  }
  const shouldThrow429 = status === "rejected" && (!overageStatus || overageStatus === "rejected");
  if (shouldThrow429) {
    const error = new APIError(
      429,
      { error: { type: "rate_limit_error", message: "Rate limit exceeded" } },
      "Rate limit exceeded",
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      new globalThis.Headers(
        Object.entries(mockHeaders).filter(([_, v]) => v !== void 0)
      )
    );
    return error;
  }
  return null;
}
function isMockRateLimitError(error) {
  return shouldProcessMockLimits() && error.status === 429;
}
export {
  checkMockRateLimitError,
  isMockRateLimitError,
  processRateLimitHeaders,
  shouldProcessMockLimits,
  shouldProcessRateLimits
};
