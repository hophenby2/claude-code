import { getMainLoopModelOverride } from "../../bootstrap/state.js";
import {
  getSubscriptionType,
  isClaudeAISubscriber,
  isMaxSubscriber,
  isProSubscriber,
  isTeamPremiumSubscriber
} from "../auth.js";
import {
  has1mContext,
  is1mContextDisabled,
  modelSupports1M
} from "../context.js";
import { isEnvTruthy } from "../envUtils.js";
import { getModelStrings, resolveOverriddenModel } from "./modelStrings.js";
import { formatModelPricing, getOpus46CostTier } from "../modelCost.js";
import { getSettings_DEPRECATED } from "../settings/settings.js";
import { getAPIProvider } from "./providers.js";
import { LIGHTNING_BOLT } from "../../constants/figures.js";
import { isModelAllowed } from "./modelAllowlist.js";
import { isModelAlias } from "./aliases.js";
import { capitalize } from "../stringUtils.js";
function getSmallFastModel() {
  return process.env.ANTHROPIC_SMALL_FAST_MODEL || getDefaultHaikuModel();
}
function isNonCustomOpusModel(model) {
  return model === getModelStrings().opus40 || model === getModelStrings().opus41 || model === getModelStrings().opus45 || model === getModelStrings().opus46;
}
function getUserSpecifiedModelSetting() {
  let specifiedModel;
  const modelOverride = getMainLoopModelOverride();
  if (modelOverride !== void 0) {
    specifiedModel = modelOverride;
  } else {
    const settings = getSettings_DEPRECATED() || {};
    specifiedModel = process.env.ANTHROPIC_MODEL || settings.model || void 0;
  }
  if (specifiedModel && !isModelAllowed(specifiedModel)) {
    return void 0;
  }
  return specifiedModel;
}
function getMainLoopModel() {
  const model = getUserSpecifiedModelSetting();
  if (model !== void 0 && model !== null) {
    return parseUserSpecifiedModel(model);
  }
  return getDefaultMainLoopModel();
}
function getBestModel() {
  return getDefaultOpusModel();
}
function getDefaultOpusModel() {
  if (process.env.ANTHROPIC_DEFAULT_OPUS_MODEL) {
    return process.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
  }
  if (getAPIProvider() !== "firstParty") {
    return getModelStrings().opus46;
  }
  return getModelStrings().opus46;
}
function getDefaultSonnetModel() {
  if (process.env.ANTHROPIC_DEFAULT_SONNET_MODEL) {
    return process.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
  }
  if (getAPIProvider() !== "firstParty") {
    return getModelStrings().sonnet45;
  }
  return getModelStrings().sonnet46;
}
function getDefaultHaikuModel() {
  if (process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL) {
    return process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
  }
  return getModelStrings().haiku45;
}
function getRuntimeMainLoopModel(params) {
  const { permissionMode, mainLoopModel, exceeds200kTokens = false } = params;
  if (getUserSpecifiedModelSetting() === "opusplan" && permissionMode === "plan" && !exceeds200kTokens) {
    return getDefaultOpusModel();
  }
  if (getUserSpecifiedModelSetting() === "haiku" && permissionMode === "plan") {
    return getDefaultSonnetModel();
  }
  return mainLoopModel;
}
function getDefaultMainLoopModelSetting() {
  if (process.env.USER_TYPE === "ant") {
    return getAntModelOverrideConfig()?.defaultModel ?? getDefaultOpusModel() + "[1m]";
  }
  if (isMaxSubscriber()) {
    return getDefaultOpusModel() + (isOpus1mMergeEnabled() ? "[1m]" : "");
  }
  if (isTeamPremiumSubscriber()) {
    return getDefaultOpusModel() + (isOpus1mMergeEnabled() ? "[1m]" : "");
  }
  return getDefaultSonnetModel();
}
function getDefaultMainLoopModel() {
  return parseUserSpecifiedModel(getDefaultMainLoopModelSetting());
}
function firstPartyNameToCanonical(name) {
  name = name.toLowerCase();
  if (name.includes("claude-opus-4-6")) {
    return "claude-opus-4-6";
  }
  if (name.includes("claude-opus-4-5")) {
    return "claude-opus-4-5";
  }
  if (name.includes("claude-opus-4-1")) {
    return "claude-opus-4-1";
  }
  if (name.includes("claude-opus-4")) {
    return "claude-opus-4";
  }
  if (name.includes("claude-sonnet-4-6")) {
    return "claude-sonnet-4-6";
  }
  if (name.includes("claude-sonnet-4-5")) {
    return "claude-sonnet-4-5";
  }
  if (name.includes("claude-sonnet-4")) {
    return "claude-sonnet-4";
  }
  if (name.includes("claude-haiku-4-5")) {
    return "claude-haiku-4-5";
  }
  if (name.includes("claude-3-7-sonnet")) {
    return "claude-3-7-sonnet";
  }
  if (name.includes("claude-3-5-sonnet")) {
    return "claude-3-5-sonnet";
  }
  if (name.includes("claude-3-5-haiku")) {
    return "claude-3-5-haiku";
  }
  if (name.includes("claude-3-opus")) {
    return "claude-3-opus";
  }
  if (name.includes("claude-3-sonnet")) {
    return "claude-3-sonnet";
  }
  if (name.includes("claude-3-haiku")) {
    return "claude-3-haiku";
  }
  const match = name.match(/(claude-(\d+-\d+-)?\w+)/);
  if (match && match[1]) {
    return match[1];
  }
  return name;
}
function getCanonicalName(fullModelName) {
  return firstPartyNameToCanonical(resolveOverriddenModel(fullModelName));
}
function getClaudeAiUserDefaultModelDescription(fastMode = false) {
  if (isMaxSubscriber() || isTeamPremiumSubscriber()) {
    if (isOpus1mMergeEnabled()) {
      return `Opus 4.6 with 1M context \xB7 Most capable for complex work${fastMode ? getOpus46PricingSuffix(true) : ""}`;
    }
    return `Opus 4.6 \xB7 Most capable for complex work${fastMode ? getOpus46PricingSuffix(true) : ""}`;
  }
  return "Sonnet 4.6 \xB7 Best for everyday tasks";
}
function renderDefaultModelSetting(setting) {
  if (setting === "opusplan") {
    return "Opus 4.6 in plan mode, else Sonnet 4.6";
  }
  return renderModelName(parseUserSpecifiedModel(setting));
}
function getOpus46PricingSuffix(fastMode) {
  if (getAPIProvider() !== "firstParty") return "";
  const pricing = formatModelPricing(getOpus46CostTier(fastMode));
  const fastModeIndicator = fastMode ? ` (${LIGHTNING_BOLT})` : "";
  return ` \xB7${fastModeIndicator} ${pricing}`;
}
function isOpus1mMergeEnabled() {
  if (is1mContextDisabled() || isProSubscriber() || getAPIProvider() !== "firstParty") {
    return false;
  }
  if (isClaudeAISubscriber() && getSubscriptionType() === null) {
    return false;
  }
  return true;
}
function renderModelSetting(setting) {
  if (setting === "opusplan") {
    return "Opus Plan";
  }
  if (isModelAlias(setting)) {
    return capitalize(setting);
  }
  return renderModelName(setting);
}
function getPublicModelDisplayName(model) {
  switch (model) {
    case getModelStrings().opus46:
      return "Opus 4.6";
    case getModelStrings().opus46 + "[1m]":
      return "Opus 4.6 (1M context)";
    case getModelStrings().opus45:
      return "Opus 4.5";
    case getModelStrings().opus41:
      return "Opus 4.1";
    case getModelStrings().opus40:
      return "Opus 4";
    case getModelStrings().sonnet46 + "[1m]":
      return "Sonnet 4.6 (1M context)";
    case getModelStrings().sonnet46:
      return "Sonnet 4.6";
    case getModelStrings().sonnet45 + "[1m]":
      return "Sonnet 4.5 (1M context)";
    case getModelStrings().sonnet45:
      return "Sonnet 4.5";
    case getModelStrings().sonnet40:
      return "Sonnet 4";
    case getModelStrings().sonnet40 + "[1m]":
      return "Sonnet 4 (1M context)";
    case getModelStrings().sonnet37:
      return "Sonnet 3.7";
    case getModelStrings().sonnet35:
      return "Sonnet 3.5";
    case getModelStrings().haiku45:
      return "Haiku 4.5";
    case getModelStrings().haiku35:
      return "Haiku 3.5";
    default:
      return null;
  }
}
function maskModelCodename(baseName) {
  const [codename = "", ...rest] = baseName.split("-");
  const masked = codename.slice(0, 3) + "*".repeat(Math.max(0, codename.length - 3));
  return [masked, ...rest].join("-");
}
function renderModelName(model) {
  const publicName = getPublicModelDisplayName(model);
  if (publicName) {
    return publicName;
  }
  if (process.env.USER_TYPE === "ant") {
    const resolved = parseUserSpecifiedModel(model);
    const antModel = resolveAntModel(model);
    if (antModel) {
      const baseName = antModel.model.replace(/\[1m\]$/i, "");
      const masked = maskModelCodename(baseName);
      const suffix = has1mContext(resolved) ? "[1m]" : "";
      return masked + suffix;
    }
    if (resolved !== model) {
      return `${model} (${resolved})`;
    }
    return resolved;
  }
  return model;
}
function getPublicModelName(model) {
  const publicName = getPublicModelDisplayName(model);
  if (publicName) {
    return `Claude ${publicName}`;
  }
  return `Claude (${model})`;
}
function parseUserSpecifiedModel(modelInput) {
  const modelInputTrimmed = modelInput.trim();
  const normalizedModel = modelInputTrimmed.toLowerCase();
  const has1mTag = has1mContext(normalizedModel);
  const modelString = has1mTag ? normalizedModel.replace(/\[1m]$/i, "").trim() : normalizedModel;
  if (isModelAlias(modelString)) {
    switch (modelString) {
      case "opusplan":
        return getDefaultSonnetModel() + (has1mTag ? "[1m]" : "");
      // Sonnet is default, Opus in plan mode
      case "sonnet":
        return getDefaultSonnetModel() + (has1mTag ? "[1m]" : "");
      case "haiku":
        return getDefaultHaikuModel() + (has1mTag ? "[1m]" : "");
      case "opus":
        return getDefaultOpusModel() + (has1mTag ? "[1m]" : "");
      case "best":
        return getBestModel();
      default:
    }
  }
  if (getAPIProvider() === "firstParty" && isLegacyOpusFirstParty(modelString) && isLegacyModelRemapEnabled()) {
    return getDefaultOpusModel() + (has1mTag ? "[1m]" : "");
  }
  if (process.env.USER_TYPE === "ant") {
    const has1mAntTag = has1mContext(normalizedModel);
    const baseAntModel = normalizedModel.replace(/\[1m]$/i, "").trim();
    const antModel = resolveAntModel(baseAntModel);
    if (antModel) {
      const suffix = has1mAntTag ? "[1m]" : "";
      return antModel.model + suffix;
    }
  }
  if (has1mTag) {
    return modelInputTrimmed.replace(/\[1m\]$/i, "").trim() + "[1m]";
  }
  return modelInputTrimmed;
}
function resolveSkillModelOverride(skillModel, currentModel) {
  if (has1mContext(skillModel) || !has1mContext(currentModel)) {
    return skillModel;
  }
  if (modelSupports1M(parseUserSpecifiedModel(skillModel))) {
    return skillModel + "[1m]";
  }
  return skillModel;
}
const LEGACY_OPUS_FIRSTPARTY = [
  "claude-opus-4-20250514",
  "claude-opus-4-1-20250805",
  "claude-opus-4-0",
  "claude-opus-4-1"
];
function isLegacyOpusFirstParty(model) {
  return LEGACY_OPUS_FIRSTPARTY.includes(model);
}
function isLegacyModelRemapEnabled() {
  return !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP);
}
function modelDisplayString(model) {
  if (model === null) {
    if (process.env.USER_TYPE === "ant") {
      return `Default for Ants (${renderDefaultModelSetting(getDefaultMainLoopModelSetting())})`;
    } else if (isClaudeAISubscriber()) {
      return `Default (${getClaudeAiUserDefaultModelDescription()})`;
    }
    return `Default (${getDefaultMainLoopModel()})`;
  }
  const resolvedModel = parseUserSpecifiedModel(model);
  return model === resolvedModel ? resolvedModel : `${model} (${resolvedModel})`;
}
function getMarketingNameForModel(modelId) {
  if (getAPIProvider() === "foundry") {
    return void 0;
  }
  const has1m = modelId.toLowerCase().includes("[1m]");
  const canonical = getCanonicalName(modelId);
  if (canonical.includes("claude-opus-4-6")) {
    return has1m ? "Opus 4.6 (with 1M context)" : "Opus 4.6";
  }
  if (canonical.includes("claude-opus-4-5")) {
    return "Opus 4.5";
  }
  if (canonical.includes("claude-opus-4-1")) {
    return "Opus 4.1";
  }
  if (canonical.includes("claude-opus-4")) {
    return "Opus 4";
  }
  if (canonical.includes("claude-sonnet-4-6")) {
    return has1m ? "Sonnet 4.6 (with 1M context)" : "Sonnet 4.6";
  }
  if (canonical.includes("claude-sonnet-4-5")) {
    return has1m ? "Sonnet 4.5 (with 1M context)" : "Sonnet 4.5";
  }
  if (canonical.includes("claude-sonnet-4")) {
    return has1m ? "Sonnet 4 (with 1M context)" : "Sonnet 4";
  }
  if (canonical.includes("claude-3-7-sonnet")) {
    return "Claude 3.7 Sonnet";
  }
  if (canonical.includes("claude-3-5-sonnet")) {
    return "Claude 3.5 Sonnet";
  }
  if (canonical.includes("claude-haiku-4-5")) {
    return "Haiku 4.5";
  }
  if (canonical.includes("claude-3-5-haiku")) {
    return "Claude 3.5 Haiku";
  }
  return void 0;
}
function normalizeModelStringForAPI(model) {
  return model.replace(/\[(1|2)m\]/gi, "");
}
export {
  firstPartyNameToCanonical,
  getBestModel,
  getCanonicalName,
  getClaudeAiUserDefaultModelDescription,
  getDefaultHaikuModel,
  getDefaultMainLoopModel,
  getDefaultMainLoopModelSetting,
  getDefaultOpusModel,
  getDefaultSonnetModel,
  getMainLoopModel,
  getMarketingNameForModel,
  getOpus46PricingSuffix,
  getPublicModelDisplayName,
  getPublicModelName,
  getRuntimeMainLoopModel,
  getSmallFastModel,
  getUserSpecifiedModelSetting,
  isLegacyModelRemapEnabled,
  isNonCustomOpusModel,
  isOpus1mMergeEnabled,
  modelDisplayString,
  normalizeModelStringForAPI,
  parseUserSpecifiedModel,
  renderDefaultModelSetting,
  renderModelName,
  renderModelSetting,
  resolveSkillModelOverride
};
