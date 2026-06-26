import { resolveAntModel } from "./model/antModels.js";
const feature = (_name) => false;
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import { getCanonicalName } from "./model/model.js";
import { get3PModelCapabilityOverride } from "./model/modelSupportOverrides.js";
import { getAPIProvider } from "./model/providers.js";
import { getSettingsWithErrors } from "./settings/settings.js";
function isUltrathinkEnabled() {
  if (true) {
    return false;
  }
  return getFeatureValue_CACHED_MAY_BE_STALE("tengu_turtle_carbon", true);
}
function hasUltrathinkKeyword(text) {
  return /\bultrathink\b/i.test(text);
}
function findThinkingTriggerPositions(text) {
  const positions = [];
  const matches = text.matchAll(/\bultrathink\b/gi);
  for (const match of matches) {
    if (match.index !== void 0) {
      positions.push({
        word: match[0],
        start: match.index,
        end: match.index + match[0].length
      });
    }
  }
  return positions;
}
const RAINBOW_COLORS = [
  "rainbow_red",
  "rainbow_orange",
  "rainbow_yellow",
  "rainbow_green",
  "rainbow_blue",
  "rainbow_indigo",
  "rainbow_violet"
];
const RAINBOW_SHIMMER_COLORS = [
  "rainbow_red_shimmer",
  "rainbow_orange_shimmer",
  "rainbow_yellow_shimmer",
  "rainbow_green_shimmer",
  "rainbow_blue_shimmer",
  "rainbow_indigo_shimmer",
  "rainbow_violet_shimmer"
];
function getRainbowColor(charIndex, shimmer = false) {
  const colors = shimmer ? RAINBOW_SHIMMER_COLORS : RAINBOW_COLORS;
  return colors[charIndex % colors.length];
}
function modelSupportsThinking(model) {
  const supported3P = get3PModelCapabilityOverride(model, "thinking");
  if (supported3P !== void 0) {
    return supported3P;
  }
  if (process.env.USER_TYPE === "ant") {
    if (resolveAntModel(model.toLowerCase())) {
      return true;
    }
  }
  const canonical = getCanonicalName(model);
  const provider = getAPIProvider();
  if (provider === "foundry" || provider === "firstParty") {
    return !canonical.includes("claude-3-");
  }
  return canonical.includes("sonnet-4") || canonical.includes("opus-4");
}
function modelSupportsAdaptiveThinking(model) {
  const supported3P = get3PModelCapabilityOverride(model, "adaptive_thinking");
  if (supported3P !== void 0) {
    return supported3P;
  }
  const canonical = getCanonicalName(model);
  if (canonical.includes("opus-4-6") || canonical.includes("sonnet-4-6")) {
    return true;
  }
  if (canonical.includes("opus") || canonical.includes("sonnet") || canonical.includes("haiku")) {
    return false;
  }
  const provider = getAPIProvider();
  return provider === "firstParty" || provider === "foundry";
}
function shouldEnableThinkingByDefault() {
  if (process.env.MAX_THINKING_TOKENS) {
    return parseInt(process.env.MAX_THINKING_TOKENS, 10) > 0;
  }
  const { settings } = getSettingsWithErrors();
  if (settings.alwaysThinkingEnabled === false) {
    return false;
  }
  return true;
}
export {
  findThinkingTriggerPositions,
  getRainbowColor,
  hasUltrathinkKeyword,
  isUltrathinkEnabled,
  modelSupportsAdaptiveThinking,
  modelSupportsThinking,
  shouldEnableThinkingByDefault
};
