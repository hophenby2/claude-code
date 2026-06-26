import { logEvent } from "../services/analytics/index.js";
import { setHasUnknownModelCost } from "../bootstrap/state.js";
import { isFastModeEnabled } from "./fastMode.js";
import {
  CLAUDE_3_5_HAIKU_CONFIG,
  CLAUDE_3_5_V2_SONNET_CONFIG,
  CLAUDE_3_7_SONNET_CONFIG,
  CLAUDE_HAIKU_4_5_CONFIG,
  CLAUDE_OPUS_4_1_CONFIG,
  CLAUDE_OPUS_4_5_CONFIG,
  CLAUDE_OPUS_4_6_CONFIG,
  CLAUDE_OPUS_4_CONFIG,
  CLAUDE_SONNET_4_5_CONFIG,
  CLAUDE_SONNET_4_6_CONFIG,
  CLAUDE_SONNET_4_CONFIG
} from "./model/configs.js";
import {
  firstPartyNameToCanonical,
  getCanonicalName,
  getDefaultMainLoopModelSetting
} from "./model/model.js";
const COST_TIER_3_15 = {
  inputTokens: 3,
  outputTokens: 15,
  promptCacheWriteTokens: 3.75,
  promptCacheReadTokens: 0.3,
  webSearchRequests: 0.01
};
const COST_TIER_15_75 = {
  inputTokens: 15,
  outputTokens: 75,
  promptCacheWriteTokens: 18.75,
  promptCacheReadTokens: 1.5,
  webSearchRequests: 0.01
};
const COST_TIER_5_25 = {
  inputTokens: 5,
  outputTokens: 25,
  promptCacheWriteTokens: 6.25,
  promptCacheReadTokens: 0.5,
  webSearchRequests: 0.01
};
const COST_TIER_30_150 = {
  inputTokens: 30,
  outputTokens: 150,
  promptCacheWriteTokens: 37.5,
  promptCacheReadTokens: 3,
  webSearchRequests: 0.01
};
const COST_HAIKU_35 = {
  inputTokens: 0.8,
  outputTokens: 4,
  promptCacheWriteTokens: 1,
  promptCacheReadTokens: 0.08,
  webSearchRequests: 0.01
};
const COST_HAIKU_45 = {
  inputTokens: 1,
  outputTokens: 5,
  promptCacheWriteTokens: 1.25,
  promptCacheReadTokens: 0.1,
  webSearchRequests: 0.01
};
const DEFAULT_UNKNOWN_MODEL_COST = COST_TIER_5_25;
function getOpus46CostTier(fastMode) {
  if (isFastModeEnabled() && fastMode) {
    return COST_TIER_30_150;
  }
  return COST_TIER_5_25;
}
const MODEL_COSTS = {
  [firstPartyNameToCanonical(CLAUDE_3_5_HAIKU_CONFIG.firstParty)]: COST_HAIKU_35,
  [firstPartyNameToCanonical(CLAUDE_HAIKU_4_5_CONFIG.firstParty)]: COST_HAIKU_45,
  [firstPartyNameToCanonical(CLAUDE_3_5_V2_SONNET_CONFIG.firstParty)]: COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_3_7_SONNET_CONFIG.firstParty)]: COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_SONNET_4_CONFIG.firstParty)]: COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_SONNET_4_5_CONFIG.firstParty)]: COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_SONNET_4_6_CONFIG.firstParty)]: COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_CONFIG.firstParty)]: COST_TIER_15_75,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_1_CONFIG.firstParty)]: COST_TIER_15_75,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_5_CONFIG.firstParty)]: COST_TIER_5_25,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_6_CONFIG.firstParty)]: COST_TIER_5_25
};
function tokensToUSDCost(modelCosts, usage) {
  return usage.input_tokens / 1e6 * modelCosts.inputTokens + usage.output_tokens / 1e6 * modelCosts.outputTokens + (usage.cache_read_input_tokens ?? 0) / 1e6 * modelCosts.promptCacheReadTokens + (usage.cache_creation_input_tokens ?? 0) / 1e6 * modelCosts.promptCacheWriteTokens + (usage.server_tool_use?.web_search_requests ?? 0) * modelCosts.webSearchRequests;
}
function getModelCosts(model, usage) {
  const shortName = getCanonicalName(model);
  if (shortName === firstPartyNameToCanonical(CLAUDE_OPUS_4_6_CONFIG.firstParty)) {
    const isFastMode = usage.speed === "fast";
    return getOpus46CostTier(isFastMode);
  }
  const costs = MODEL_COSTS[shortName];
  if (!costs) {
    trackUnknownModelCost(model, shortName);
    return MODEL_COSTS[getCanonicalName(getDefaultMainLoopModelSetting())] ?? DEFAULT_UNKNOWN_MODEL_COST;
  }
  return costs;
}
function trackUnknownModelCost(model, shortName) {
  logEvent("tengu_unknown_model_cost", {
    model,
    shortName
  });
  setHasUnknownModelCost();
}
function calculateUSDCost(resolvedModel, usage) {
  const modelCosts = getModelCosts(resolvedModel, usage);
  return tokensToUSDCost(modelCosts, usage);
}
function calculateCostFromTokens(model, tokens) {
  const usage = {
    input_tokens: tokens.inputTokens,
    output_tokens: tokens.outputTokens,
    cache_read_input_tokens: tokens.cacheReadInputTokens,
    cache_creation_input_tokens: tokens.cacheCreationInputTokens
  };
  return calculateUSDCost(model, usage);
}
function formatPrice(price) {
  if (Number.isInteger(price)) {
    return `$${price}`;
  }
  return `$${price.toFixed(2)}`;
}
function formatModelPricing(costs) {
  return `${formatPrice(costs.inputTokens)}/${formatPrice(costs.outputTokens)} per Mtok`;
}
function getModelPricingString(model) {
  const shortName = getCanonicalName(model);
  const costs = MODEL_COSTS[shortName];
  if (!costs) return void 0;
  return formatModelPricing(costs);
}
export {
  COST_HAIKU_35,
  COST_HAIKU_45,
  COST_TIER_15_75,
  COST_TIER_30_150,
  COST_TIER_3_15,
  COST_TIER_5_25,
  MODEL_COSTS,
  calculateCostFromTokens,
  calculateUSDCost,
  formatModelPricing,
  getModelCosts,
  getModelPricingString,
  getOpus46CostTier
};
