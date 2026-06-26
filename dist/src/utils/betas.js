const feature = (_name) => false;
import memoize from "lodash-es/memoize.js";
import {
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_MAY_BE_STALE
} from "../services/analytics/growthbook.js";
import { getIsNonInteractiveSession, getSdkBetas } from "../bootstrap/state.js";
import {
  BEDROCK_EXTRA_PARAMS_HEADERS,
  CLAUDE_CODE_20250219_BETA_HEADER,
  CLI_INTERNAL_BETA_HEADER,
  CONTEXT_1M_BETA_HEADER,
  CONTEXT_MANAGEMENT_BETA_HEADER,
  INTERLEAVED_THINKING_BETA_HEADER,
  PROMPT_CACHING_SCOPE_BETA_HEADER,
  REDACT_THINKING_BETA_HEADER,
  STRUCTURED_OUTPUTS_BETA_HEADER,
  SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER,
  TOKEN_EFFICIENT_TOOLS_BETA_HEADER,
  TOOL_SEARCH_BETA_HEADER_1P,
  TOOL_SEARCH_BETA_HEADER_3P,
  WEB_SEARCH_BETA_HEADER
} from "../constants/betas.js";
import { OAUTH_BETA_HEADER } from "../constants/oauth.js";
import { isClaudeAISubscriber } from "./auth.js";
import { has1mContext } from "./context.js";
import { isEnvDefinedFalsy, isEnvTruthy } from "./envUtils.js";
import { getCanonicalName } from "./model/model.js";
import { get3PModelCapabilityOverride } from "./model/modelSupportOverrides.js";
import { getAPIProvider } from "./model/providers.js";
import { getInitialSettings } from "./settings/settings.js";
const ALLOWED_SDK_BETAS = [CONTEXT_1M_BETA_HEADER];
function partitionBetasByAllowlist(betas) {
  const allowed = [];
  const disallowed = [];
  for (const beta of betas) {
    if (ALLOWED_SDK_BETAS.includes(beta)) {
      allowed.push(beta);
    } else {
      disallowed.push(beta);
    }
  }
  return { allowed, disallowed };
}
function filterAllowedSdkBetas(sdkBetas) {
  if (!sdkBetas || sdkBetas.length === 0) {
    return void 0;
  }
  if (isClaudeAISubscriber()) {
    console.warn(
      "Warning: Custom betas are only available for API key users. Ignoring provided betas."
    );
    return void 0;
  }
  const { allowed, disallowed } = partitionBetasByAllowlist(sdkBetas);
  for (const beta of disallowed) {
    console.warn(
      `Warning: Beta header '${beta}' is not allowed. Only the following betas are supported: ${ALLOWED_SDK_BETAS.join(", ")}`
    );
  }
  return allowed.length > 0 ? allowed : void 0;
}
function modelSupportsISP(model) {
  const supported3P = get3PModelCapabilityOverride(
    model,
    "interleaved_thinking"
  );
  if (supported3P !== void 0) {
    return supported3P;
  }
  const canonical = getCanonicalName(model);
  const provider = getAPIProvider();
  if (provider === "foundry") {
    return true;
  }
  if (provider === "firstParty") {
    return !canonical.includes("claude-3-");
  }
  return canonical.includes("claude-opus-4") || canonical.includes("claude-sonnet-4");
}
function vertexModelSupportsWebSearch(model) {
  const canonical = getCanonicalName(model);
  return canonical.includes("claude-opus-4") || canonical.includes("claude-sonnet-4") || canonical.includes("claude-haiku-4");
}
function modelSupportsContextManagement(model) {
  const canonical = getCanonicalName(model);
  const provider = getAPIProvider();
  if (provider === "foundry") {
    return true;
  }
  if (provider === "firstParty") {
    return !canonical.includes("claude-3-");
  }
  return canonical.includes("claude-opus-4") || canonical.includes("claude-sonnet-4") || canonical.includes("claude-haiku-4");
}
function modelSupportsStructuredOutputs(model) {
  const canonical = getCanonicalName(model);
  const provider = getAPIProvider();
  if (provider !== "firstParty" && provider !== "foundry") {
    return false;
  }
  return canonical.includes("claude-sonnet-4-6") || canonical.includes("claude-sonnet-4-5") || canonical.includes("claude-opus-4-1") || canonical.includes("claude-opus-4-5") || canonical.includes("claude-opus-4-6") || canonical.includes("claude-haiku-4-5");
}
function modelSupportsAutoMode(model) {
  if (false) {
    const m = getCanonicalName(model);
    if (process.env.USER_TYPE !== "ant" && getAPIProvider() !== "firstParty") {
      return false;
    }
    const config = getFeatureValue_CACHED_MAY_BE_STALE("tengu_auto_mode_config", {});
    const rawLower = model.toLowerCase();
    if (config?.allowModels?.some(
      (am) => am.toLowerCase() === rawLower || am.toLowerCase() === m
    )) {
      return true;
    }
    if (process.env.USER_TYPE === "ant") {
      if (m.includes("claude-3-")) return false;
      if (/claude-(opus|sonnet|haiku)-4(?!-[6-9])/.test(m)) return false;
      return true;
    }
    return /^claude-(opus|sonnet)-4-6/.test(m);
  }
  return false;
}
function getToolSearchBetaHeader() {
  const provider = getAPIProvider();
  if (provider === "vertex" || provider === "bedrock") {
    return TOOL_SEARCH_BETA_HEADER_3P;
  }
  return TOOL_SEARCH_BETA_HEADER_1P;
}
function shouldIncludeFirstPartyOnlyBetas() {
  return (getAPIProvider() === "firstParty" || getAPIProvider() === "foundry") && !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS);
}
function shouldUseGlobalCacheScope() {
  return getAPIProvider() === "firstParty" && !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS);
}
const getAllModelBetas = memoize((model) => {
  const betaHeaders = [];
  const isHaiku = getCanonicalName(model).includes("haiku");
  const provider = getAPIProvider();
  const includeFirstPartyOnlyBetas = shouldIncludeFirstPartyOnlyBetas();
  if (!isHaiku) {
    betaHeaders.push(CLAUDE_CODE_20250219_BETA_HEADER);
    if (process.env.USER_TYPE === "ant" && process.env.CLAUDE_CODE_ENTRYPOINT === "cli") {
      if (CLI_INTERNAL_BETA_HEADER) {
        betaHeaders.push(CLI_INTERNAL_BETA_HEADER);
      }
    }
  }
  if (isClaudeAISubscriber()) {
    betaHeaders.push(OAUTH_BETA_HEADER);
  }
  if (has1mContext(model)) {
    betaHeaders.push(CONTEXT_1M_BETA_HEADER);
  }
  if (!isEnvTruthy(process.env.DISABLE_INTERLEAVED_THINKING) && modelSupportsISP(model)) {
    betaHeaders.push(INTERLEAVED_THINKING_BETA_HEADER);
  }
  if (includeFirstPartyOnlyBetas && modelSupportsISP(model) && !getIsNonInteractiveSession() && getInitialSettings().showThinkingSummaries !== true) {
    betaHeaders.push(REDACT_THINKING_BETA_HEADER);
  }
  if (SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER && process.env.USER_TYPE === "ant" && includeFirstPartyOnlyBetas && !isEnvDefinedFalsy(process.env.USE_CONNECTOR_TEXT_SUMMARIZATION) && (isEnvTruthy(process.env.USE_CONNECTOR_TEXT_SUMMARIZATION) || getFeatureValue_CACHED_MAY_BE_STALE("tengu_slate_prism", false))) {
    betaHeaders.push(SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER);
  }
  const antOptedIntoToolClearing = isEnvTruthy(process.env.USE_API_CONTEXT_MANAGEMENT) && process.env.USER_TYPE === "ant";
  const thinkingPreservationEnabled = modelSupportsContextManagement(model);
  if (shouldIncludeFirstPartyOnlyBetas() && (antOptedIntoToolClearing || thinkingPreservationEnabled)) {
    betaHeaders.push(CONTEXT_MANAGEMENT_BETA_HEADER);
  }
  const strictToolsEnabled = checkStatsigFeatureGate_CACHED_MAY_BE_STALE("tengu_tool_pear");
  const tokenEfficientToolsEnabled = !strictToolsEnabled && getFeatureValue_CACHED_MAY_BE_STALE("tengu_amber_json_tools", false);
  if (includeFirstPartyOnlyBetas && modelSupportsStructuredOutputs(model) && strictToolsEnabled) {
    betaHeaders.push(STRUCTURED_OUTPUTS_BETA_HEADER);
  }
  if (process.env.USER_TYPE === "ant" && includeFirstPartyOnlyBetas && tokenEfficientToolsEnabled) {
    betaHeaders.push(TOKEN_EFFICIENT_TOOLS_BETA_HEADER);
  }
  if (provider === "vertex" && vertexModelSupportsWebSearch(model)) {
    betaHeaders.push(WEB_SEARCH_BETA_HEADER);
  }
  if (provider === "foundry") {
    betaHeaders.push(WEB_SEARCH_BETA_HEADER);
  }
  if (includeFirstPartyOnlyBetas) {
    betaHeaders.push(PROMPT_CACHING_SCOPE_BETA_HEADER);
  }
  if (process.env.ANTHROPIC_BETAS) {
    betaHeaders.push(
      ...process.env.ANTHROPIC_BETAS.split(",").map((_) => _.trim()).filter(Boolean)
    );
  }
  return betaHeaders;
});
const getModelBetas = memoize((model) => {
  const modelBetas = getAllModelBetas(model);
  if (getAPIProvider() === "bedrock") {
    return modelBetas.filter((b) => !BEDROCK_EXTRA_PARAMS_HEADERS.has(b));
  }
  return modelBetas;
});
const getBedrockExtraBodyParamsBetas = memoize(
  (model) => {
    const modelBetas = getAllModelBetas(model);
    return modelBetas.filter((b) => BEDROCK_EXTRA_PARAMS_HEADERS.has(b));
  }
);
function getMergedBetas(model, options) {
  const baseBetas = [...getModelBetas(model)];
  if (options?.isAgenticQuery) {
    if (!baseBetas.includes(CLAUDE_CODE_20250219_BETA_HEADER)) {
      baseBetas.push(CLAUDE_CODE_20250219_BETA_HEADER);
    }
    if (process.env.USER_TYPE === "ant" && process.env.CLAUDE_CODE_ENTRYPOINT === "cli" && CLI_INTERNAL_BETA_HEADER && !baseBetas.includes(CLI_INTERNAL_BETA_HEADER)) {
      baseBetas.push(CLI_INTERNAL_BETA_HEADER);
    }
  }
  const sdkBetas = getSdkBetas();
  if (!sdkBetas || sdkBetas.length === 0) {
    return baseBetas;
  }
  return [...baseBetas, ...sdkBetas.filter((b) => !baseBetas.includes(b))];
}
function clearBetasCaches() {
  getAllModelBetas.cache?.clear?.();
  getModelBetas.cache?.clear?.();
  getBedrockExtraBodyParamsBetas.cache?.clear?.();
}
export {
  clearBetasCaches,
  filterAllowedSdkBetas,
  getAllModelBetas,
  getBedrockExtraBodyParamsBetas,
  getMergedBetas,
  getModelBetas,
  getToolSearchBetaHeader,
  modelSupportsAutoMode,
  modelSupportsContextManagement,
  modelSupportsISP,
  modelSupportsStructuredOutputs,
  shouldIncludeFirstPartyOnlyBetas,
  shouldUseGlobalCacheScope
};
