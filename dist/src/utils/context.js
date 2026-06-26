import { CONTEXT_1M_BETA_HEADER } from "../constants/betas.js";
import { getGlobalConfig } from "./config.js";
import { isEnvTruthy } from "./envUtils.js";
import { getCanonicalName } from "./model/model.js";
import { getModelCapability } from "./model/modelCapabilities.js";
const MODEL_CONTEXT_WINDOW_DEFAULT = 2e5;
const COMPACT_MAX_OUTPUT_TOKENS = 2e4;
const MAX_OUTPUT_TOKENS_DEFAULT = 32e3;
const MAX_OUTPUT_TOKENS_UPPER_LIMIT = 64e3;
const CAPPED_DEFAULT_MAX_TOKENS = 8e3;
const ESCALATED_MAX_TOKENS = 64e3;
function is1mContextDisabled() {
  return isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT);
}
function has1mContext(model) {
  if (is1mContextDisabled()) {
    return false;
  }
  return /\[1m\]/i.test(model);
}
function modelSupports1M(model) {
  if (is1mContextDisabled()) {
    return false;
  }
  const canonical = getCanonicalName(model);
  return canonical.includes("claude-sonnet-4") || canonical.includes("opus-4-6");
}
function getContextWindowForModel(model, betas) {
  if (process.env.USER_TYPE === "ant" && process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS) {
    const override = parseInt(process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, 10);
    if (!isNaN(override) && override > 0) {
      return override;
    }
  }
  if (has1mContext(model)) {
    return 1e6;
  }
  const cap = getModelCapability(model);
  if (cap?.max_input_tokens && cap.max_input_tokens >= 1e5) {
    if (cap.max_input_tokens > MODEL_CONTEXT_WINDOW_DEFAULT && is1mContextDisabled()) {
      return MODEL_CONTEXT_WINDOW_DEFAULT;
    }
    return cap.max_input_tokens;
  }
  if (betas?.includes(CONTEXT_1M_BETA_HEADER) && modelSupports1M(model)) {
    return 1e6;
  }
  if (getSonnet1mExpTreatmentEnabled(model)) {
    return 1e6;
  }
  if (process.env.USER_TYPE === "ant") {
    const antModel = resolveAntModel(model);
    if (antModel?.contextWindow) {
      return antModel.contextWindow;
    }
  }
  return MODEL_CONTEXT_WINDOW_DEFAULT;
}
function getSonnet1mExpTreatmentEnabled(model) {
  if (is1mContextDisabled()) {
    return false;
  }
  if (has1mContext(model)) {
    return false;
  }
  if (!getCanonicalName(model).includes("sonnet-4-6")) {
    return false;
  }
  return getGlobalConfig().clientDataCache?.["coral_reef_sonnet"] === "true";
}
function calculateContextPercentages(currentUsage, contextWindowSize) {
  if (!currentUsage) {
    return { used: null, remaining: null };
  }
  const totalInputTokens = currentUsage.input_tokens + currentUsage.cache_creation_input_tokens + currentUsage.cache_read_input_tokens;
  const usedPercentage = Math.round(
    totalInputTokens / contextWindowSize * 100
  );
  const clampedUsed = Math.min(100, Math.max(0, usedPercentage));
  return {
    used: clampedUsed,
    remaining: 100 - clampedUsed
  };
}
function getModelMaxOutputTokens(model) {
  let defaultTokens;
  let upperLimit;
  if (process.env.USER_TYPE === "ant") {
    const antModel = resolveAntModel(model.toLowerCase());
    if (antModel) {
      defaultTokens = antModel.defaultMaxTokens ?? MAX_OUTPUT_TOKENS_DEFAULT;
      upperLimit = antModel.upperMaxTokensLimit ?? MAX_OUTPUT_TOKENS_UPPER_LIMIT;
      return { default: defaultTokens, upperLimit };
    }
  }
  const m = getCanonicalName(model);
  if (m.includes("opus-4-6")) {
    defaultTokens = 64e3;
    upperLimit = 128e3;
  } else if (m.includes("sonnet-4-6")) {
    defaultTokens = 32e3;
    upperLimit = 128e3;
  } else if (m.includes("opus-4-5") || m.includes("sonnet-4") || m.includes("haiku-4")) {
    defaultTokens = 32e3;
    upperLimit = 64e3;
  } else if (m.includes("opus-4-1") || m.includes("opus-4")) {
    defaultTokens = 32e3;
    upperLimit = 32e3;
  } else if (m.includes("claude-3-opus")) {
    defaultTokens = 4096;
    upperLimit = 4096;
  } else if (m.includes("claude-3-sonnet")) {
    defaultTokens = 8192;
    upperLimit = 8192;
  } else if (m.includes("claude-3-haiku")) {
    defaultTokens = 4096;
    upperLimit = 4096;
  } else if (m.includes("3-5-sonnet") || m.includes("3-5-haiku")) {
    defaultTokens = 8192;
    upperLimit = 8192;
  } else if (m.includes("3-7-sonnet")) {
    defaultTokens = 32e3;
    upperLimit = 64e3;
  } else {
    defaultTokens = MAX_OUTPUT_TOKENS_DEFAULT;
    upperLimit = MAX_OUTPUT_TOKENS_UPPER_LIMIT;
  }
  const cap = getModelCapability(model);
  if (cap?.max_tokens && cap.max_tokens >= 4096) {
    upperLimit = cap.max_tokens;
    defaultTokens = Math.min(defaultTokens, upperLimit);
  }
  return { default: defaultTokens, upperLimit };
}
function getMaxThinkingTokensForModel(model) {
  return getModelMaxOutputTokens(model).upperLimit - 1;
}
export {
  CAPPED_DEFAULT_MAX_TOKENS,
  COMPACT_MAX_OUTPUT_TOKENS,
  ESCALATED_MAX_TOKENS,
  MODEL_CONTEXT_WINDOW_DEFAULT,
  calculateContextPercentages,
  getContextWindowForModel,
  getMaxThinkingTokensForModel,
  getModelMaxOutputTokens,
  getSonnet1mExpTreatmentEnabled,
  has1mContext,
  is1mContextDisabled,
  modelSupports1M
};
