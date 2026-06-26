const feature = (_name) => false;
import "../services/analytics/growthbook.js";
import {
  getClaudeAIOAuthTokens,
  isAnthropicAuthEnabled
} from "../utils/auth.js";
function isVoiceGrowthBookEnabled() {
  return false ? !getFeatureValue_CACHED_MAY_BE_STALE("tengu_amber_quartz_disabled", false) : false;
}
function hasVoiceAuth() {
  if (!isAnthropicAuthEnabled()) {
    return false;
  }
  const tokens = getClaudeAIOAuthTokens();
  return Boolean(tokens?.accessToken);
}
function isVoiceModeEnabled() {
  return hasVoiceAuth() && isVoiceGrowthBookEnabled();
}
export {
  hasVoiceAuth,
  isVoiceGrowthBookEnabled,
  isVoiceModeEnabled
};
