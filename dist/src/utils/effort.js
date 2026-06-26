import { isUltrathinkEnabled } from "./thinking.js";
import { getInitialSettings } from "./settings/settings.js";
import { isProSubscriber, isMaxSubscriber, isTeamSubscriber } from "./auth.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import { getAPIProvider } from "./model/providers.js";
import { get3PModelCapabilityOverride } from "./model/modelSupportOverrides.js";
import { isEnvTruthy } from "./envUtils.js";
const EFFORT_LEVELS = [
  "low",
  "medium",
  "high",
  "max"
];
function modelSupportsEffort(model) {
  const m = model.toLowerCase();
  if (isEnvTruthy(process.env.CLAUDE_CODE_ALWAYS_ENABLE_EFFORT)) {
    return true;
  }
  const supported3P = get3PModelCapabilityOverride(model, "effort");
  if (supported3P !== void 0) {
    return supported3P;
  }
  if (m.includes("opus-4-6") || m.includes("sonnet-4-6")) {
    return true;
  }
  if (m.includes("haiku") || m.includes("sonnet") || m.includes("opus")) {
    return false;
  }
  return getAPIProvider() === "firstParty";
}
function modelSupportsMaxEffort(model) {
  const supported3P = get3PModelCapabilityOverride(model, "max_effort");
  if (supported3P !== void 0) {
    return supported3P;
  }
  if (model.toLowerCase().includes("opus-4-6")) {
    return true;
  }
  if (process.env.USER_TYPE === "ant" && resolveAntModel(model)) {
    return true;
  }
  return false;
}
function isEffortLevel(value) {
  return EFFORT_LEVELS.includes(value);
}
function parseEffortValue(value) {
  if (value === void 0 || value === null || value === "") {
    return void 0;
  }
  if (typeof value === "number" && isValidNumericEffort(value)) {
    return value;
  }
  const str = String(value).toLowerCase();
  if (isEffortLevel(str)) {
    return str;
  }
  const numericValue = parseInt(str, 10);
  if (!isNaN(numericValue) && isValidNumericEffort(numericValue)) {
    return numericValue;
  }
  return void 0;
}
function toPersistableEffort(value) {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  if (value === "max" && process.env.USER_TYPE === "ant") {
    return value;
  }
  return void 0;
}
function getInitialEffortSetting() {
  return toPersistableEffort(getInitialSettings().effortLevel);
}
function resolvePickerEffortPersistence(picked, modelDefault, priorPersisted, toggledInPicker) {
  const hadExplicit = priorPersisted !== void 0 || toggledInPicker;
  return hadExplicit || picked !== modelDefault ? picked : void 0;
}
function getEffortEnvOverride() {
  const envOverride = process.env.CLAUDE_CODE_EFFORT_LEVEL;
  return envOverride?.toLowerCase() === "unset" || envOverride?.toLowerCase() === "auto" ? null : parseEffortValue(envOverride);
}
function resolveAppliedEffort(model, appStateEffortValue) {
  const envOverride = getEffortEnvOverride();
  if (envOverride === null) {
    return void 0;
  }
  const resolved = envOverride ?? appStateEffortValue ?? getDefaultEffortForModel(model);
  if (resolved === "max" && !modelSupportsMaxEffort(model)) {
    return "high";
  }
  return resolved;
}
function getDisplayedEffortLevel(model, appStateEffort) {
  const resolved = resolveAppliedEffort(model, appStateEffort) ?? "high";
  return convertEffortValueToLevel(resolved);
}
function getEffortSuffix(model, effortValue) {
  if (effortValue === void 0) return "";
  const resolved = resolveAppliedEffort(model, effortValue);
  if (resolved === void 0) return "";
  return ` with ${convertEffortValueToLevel(resolved)} effort`;
}
function isValidNumericEffort(value) {
  return Number.isInteger(value);
}
function convertEffortValueToLevel(value) {
  if (typeof value === "string") {
    return isEffortLevel(value) ? value : "high";
  }
  if (process.env.USER_TYPE === "ant" && typeof value === "number") {
    if (value <= 50) return "low";
    if (value <= 85) return "medium";
    if (value <= 100) return "high";
    return "max";
  }
  return "high";
}
function getEffortLevelDescription(level) {
  switch (level) {
    case "low":
      return "Quick, straightforward implementation with minimal overhead";
    case "medium":
      return "Balanced approach with standard implementation and testing";
    case "high":
      return "Comprehensive implementation with extensive testing and documentation";
    case "max":
      return "Maximum capability with deepest reasoning (Opus 4.6 only)";
  }
}
function getEffortValueDescription(value) {
  if (process.env.USER_TYPE === "ant" && typeof value === "number") {
    return `[ANT-ONLY] Numeric effort value of ${value}`;
  }
  if (typeof value === "string") {
    return getEffortLevelDescription(value);
  }
  return "Balanced approach with standard implementation and testing";
}
const OPUS_DEFAULT_EFFORT_CONFIG_DEFAULT = {
  enabled: true,
  dialogTitle: "We recommend medium effort for Opus",
  dialogDescription: "Effort determines how long Claude thinks for when completing your task. We recommend medium effort for most tasks to balance speed and intelligence and maximize rate limits. Use ultrathink to trigger high effort when needed."
};
function getOpusDefaultEffortConfig() {
  const config = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_grey_step2",
    OPUS_DEFAULT_EFFORT_CONFIG_DEFAULT
  );
  return {
    ...OPUS_DEFAULT_EFFORT_CONFIG_DEFAULT,
    ...config
  };
}
function getDefaultEffortForModel(model) {
  if (process.env.USER_TYPE === "ant") {
    const config = getAntModelOverrideConfig();
    const isDefaultModel = config?.defaultModel !== void 0 && model.toLowerCase() === config.defaultModel.toLowerCase();
    if (isDefaultModel && config?.defaultModelEffortLevel) {
      return config.defaultModelEffortLevel;
    }
    const antModel = resolveAntModel(model);
    if (antModel) {
      if (antModel.defaultEffortLevel) {
        return antModel.defaultEffortLevel;
      }
      if (antModel.defaultEffortValue !== void 0) {
        return antModel.defaultEffortValue;
      }
    }
    return void 0;
  }
  if (model.toLowerCase().includes("opus-4-6")) {
    if (isProSubscriber()) {
      return "medium";
    }
    if (getOpusDefaultEffortConfig().enabled && (isMaxSubscriber() || isTeamSubscriber())) {
      return "medium";
    }
  }
  if (isUltrathinkEnabled() && modelSupportsEffort(model)) {
    return "medium";
  }
  return void 0;
}
export {
  EFFORT_LEVELS,
  convertEffortValueToLevel,
  getDefaultEffortForModel,
  getDisplayedEffortLevel,
  getEffortEnvOverride,
  getEffortLevelDescription,
  getEffortSuffix,
  getEffortValueDescription,
  getInitialEffortSetting,
  getOpusDefaultEffortConfig,
  isEffortLevel,
  isValidNumericEffort,
  modelSupportsEffort,
  modelSupportsMaxEffort,
  parseEffortValue,
  resolveAppliedEffort,
  resolvePickerEffortPersistence,
  toPersistableEffort
};
