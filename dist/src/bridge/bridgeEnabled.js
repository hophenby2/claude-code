const feature = (_name) => false;
import "../services/analytics/growthbook.js";
import * as authModule from "../utils/auth.js";
import "../utils/envUtils.js";
import "../utils/semver.js";
function isBridgeEnabled() {
  return false ? isClaudeAISubscriber() && getFeatureValue_CACHED_MAY_BE_STALE("tengu_ccr_bridge", false) : false;
}
async function isBridgeEnabledBlocking() {
  return false ? isClaudeAISubscriber() && await checkGate_CACHED_OR_BLOCKING("tengu_ccr_bridge") : false;
}
async function getBridgeDisabledReason() {
  if (false) {
    if (!isClaudeAISubscriber()) {
      return "Remote Control requires a claude.ai subscription. Run `claude auth login` to sign in with your claude.ai account.";
    }
    if (!hasProfileScope()) {
      return "Remote Control requires a full-scope login token. Long-lived tokens (from `claude setup-token` or CLAUDE_CODE_OAUTH_TOKEN) are limited to inference-only for security reasons. Run `claude auth login` to use Remote Control.";
    }
    if (!getOauthAccountInfo()?.organizationUuid) {
      return "Unable to determine your organization for Remote Control eligibility. Run `claude auth login` to refresh your account information.";
    }
    if (!await checkGate_CACHED_OR_BLOCKING("tengu_ccr_bridge")) {
      return "Remote Control is not yet enabled for your account.";
    }
    return null;
  }
  return "Remote Control is not available in this build.";
}
function isClaudeAISubscriber() {
  try {
    return authModule.isClaudeAISubscriber();
  } catch {
    return false;
  }
}
function hasProfileScope() {
  try {
    return authModule.hasProfileScope();
  } catch {
    return false;
  }
}
function getOauthAccountInfo() {
  try {
    return authModule.getOauthAccountInfo();
  } catch {
    return void 0;
  }
}
function isEnvLessBridgeEnabled() {
  return false ? getFeatureValue_CACHED_MAY_BE_STALE("tengu_bridge_repl_v2", false) : false;
}
function isCseShimEnabled() {
  return false ? getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_bridge_repl_v2_cse_shim_enabled",
    true
  ) : true;
}
function checkBridgeMinVersion() {
  if (false) {
    const config = getDynamicConfig_CACHED_MAY_BE_STALE("tengu_bridge_min_version", { minVersion: "0.0.0" });
    if (config.minVersion && lt("0.0.0-dev", config.minVersion)) {
      return `Your version of Claude Code (${"0.0.0-dev"}) is too old for Remote Control.
Version ${config.minVersion} or higher is required. Run \`claude update\` to update.`;
    }
  }
  return null;
}
function getCcrAutoConnectDefault() {
  return false ? getFeatureValue_CACHED_MAY_BE_STALE("tengu_cobalt_harbor", false) : false;
}
function isCcrMirrorEnabled() {
  return false ? isEnvTruthy(process.env.CLAUDE_CODE_CCR_MIRROR) || getFeatureValue_CACHED_MAY_BE_STALE("tengu_ccr_mirror", false) : false;
}
export {
  checkBridgeMinVersion,
  getBridgeDisabledReason,
  getCcrAutoConnectDefault,
  isBridgeEnabled,
  isBridgeEnabledBlocking,
  isCcrMirrorEnabled,
  isCseShimEnabled,
  isEnvLessBridgeEnabled
};
