import axios from "axios";
import { getOauthConfig, OAUTH_BETA_HEADER } from "../constants/oauth.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import {
  getIsNonInteractiveSession,
  getKairosActive,
  preferThirdPartyAuthentication
} from "../bootstrap/state.js";
import {
  logEvent
} from "../services/analytics/index.js";
import {
  getAnthropicApiKey,
  getClaudeAIOAuthTokens,
  handleOAuth401Error,
  hasProfileScope
} from "./auth.js";
import { isInBundledMode } from "./bundledMode.js";
import { getGlobalConfig, saveGlobalConfig } from "./config.js";
import { logForDebugging } from "./debug.js";
import { isEnvTruthy } from "./envUtils.js";
import {
  getDefaultMainLoopModelSetting,
  isOpus1mMergeEnabled,
  parseUserSpecifiedModel
} from "./model/model.js";
import { getAPIProvider } from "./model/providers.js";
import { isEssentialTrafficOnly } from "./privacyLevel.js";
import {
  getInitialSettings,
  getSettingsForSource,
  updateSettingsForSource
} from "./settings/settings.js";
import { createSignal } from "./signal.js";
function isFastModeEnabled() {
  return !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FAST_MODE);
}
function isFastModeAvailable() {
  if (!isFastModeEnabled()) {
    return false;
  }
  return getFastModeUnavailableReason() === null;
}
function getDisabledReasonMessage(disabledReason, authType) {
  switch (disabledReason) {
    case "free":
      return authType === "oauth" ? "Fast mode requires a paid subscription" : "Fast mode unavailable during evaluation. Please purchase credits.";
    case "preference":
      return "Fast mode has been disabled by your organization";
    case "extra_usage_disabled":
      return "Fast mode requires extra usage billing \xB7 /extra-usage to enable";
    case "network_error":
      return "Fast mode unavailable due to network connectivity issues";
    case "unknown":
      return "Fast mode is currently unavailable";
  }
}
function getFastModeUnavailableReason() {
  if (!isFastModeEnabled()) {
    return "Fast mode is not available";
  }
  const statigReason = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_penguins_off",
    null
  );
  if (statigReason !== null) {
    logForDebugging(`Fast mode unavailable: ${statigReason}`);
    return statigReason;
  }
  if (!isInBundledMode() && getFeatureValue_CACHED_MAY_BE_STALE("tengu_marble_sandcastle", false)) {
    return "Fast mode requires the native binary \xB7 Install from: https://claude.com/product/claude-code";
  }
  if (getIsNonInteractiveSession() && preferThirdPartyAuthentication() && !getKairosActive()) {
    const flagFastMode = getSettingsForSource("flagSettings")?.fastMode;
    if (!flagFastMode) {
      const reason = "Fast mode is not available in the Agent SDK";
      logForDebugging(`Fast mode unavailable: ${reason}`);
      return reason;
    }
  }
  if (getAPIProvider() !== "firstParty") {
    const reason = "Fast mode is not available on Bedrock, Vertex, or Foundry";
    logForDebugging(`Fast mode unavailable: ${reason}`);
    return reason;
  }
  if (orgStatus.status === "disabled") {
    if (orgStatus.reason === "network_error" || orgStatus.reason === "unknown") {
      if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_FAST_MODE_NETWORK_ERRORS)) {
        return null;
      }
    }
    const authType = getClaudeAIOAuthTokens() !== null ? "oauth" : "api-key";
    const reason = getDisabledReasonMessage(orgStatus.reason, authType);
    logForDebugging(`Fast mode unavailable: ${reason}`);
    return reason;
  }
  return null;
}
const FAST_MODE_MODEL_DISPLAY = "Opus 4.6";
function getFastModeModel() {
  return "opus" + (isOpus1mMergeEnabled() ? "[1m]" : "");
}
function getInitialFastModeSetting(model) {
  if (!isFastModeEnabled()) {
    return false;
  }
  if (!isFastModeAvailable()) {
    return false;
  }
  if (!isFastModeSupportedByModel(model)) {
    return false;
  }
  const settings = getInitialSettings();
  if (settings.fastModePerSessionOptIn) {
    return false;
  }
  return settings.fastMode === true;
}
function isFastModeSupportedByModel(modelSetting) {
  if (!isFastModeEnabled()) {
    return false;
  }
  const model = modelSetting ?? getDefaultMainLoopModelSetting();
  const parsedModel = parseUserSpecifiedModel(model);
  return parsedModel.toLowerCase().includes("opus-4-6");
}
let runtimeState = { status: "active" };
let hasLoggedCooldownExpiry = false;
const cooldownTriggered = createSignal();
const cooldownExpired = createSignal();
const onCooldownTriggered = cooldownTriggered.subscribe;
const onCooldownExpired = cooldownExpired.subscribe;
function getFastModeRuntimeState() {
  if (runtimeState.status === "cooldown" && Date.now() >= runtimeState.resetAt) {
    if (isFastModeEnabled() && !hasLoggedCooldownExpiry) {
      logForDebugging("Fast mode cooldown expired, re-enabling fast mode");
      hasLoggedCooldownExpiry = true;
      cooldownExpired.emit();
    }
    runtimeState = { status: "active" };
  }
  return runtimeState;
}
function triggerFastModeCooldown(resetTimestamp, reason) {
  if (!isFastModeEnabled()) {
    return;
  }
  runtimeState = { status: "cooldown", resetAt: resetTimestamp, reason };
  hasLoggedCooldownExpiry = false;
  const cooldownDurationMs = resetTimestamp - Date.now();
  logForDebugging(
    `Fast mode cooldown triggered (${reason}), duration ${Math.round(cooldownDurationMs / 1e3)}s`
  );
  logEvent("tengu_fast_mode_fallback_triggered", {
    cooldown_duration_ms: cooldownDurationMs,
    cooldown_reason: reason
  });
  cooldownTriggered.emit(resetTimestamp, reason);
}
function clearFastModeCooldown() {
  runtimeState = { status: "active" };
}
function handleFastModeRejectedByAPI() {
  if (orgStatus.status === "disabled") {
    return;
  }
  orgStatus = { status: "disabled", reason: "preference" };
  updateSettingsForSource("userSettings", { fastMode: void 0 });
  saveGlobalConfig((current) => ({
    ...current,
    penguinModeOrgEnabled: false
  }));
  orgFastModeChange.emit(false);
}
const overageRejection = createSignal();
const onFastModeOverageRejection = overageRejection.subscribe;
function getOverageDisabledMessage(reason) {
  switch (reason) {
    case "out_of_credits":
      return "Fast mode disabled \xB7 extra usage credits exhausted";
    case "org_level_disabled":
    case "org_service_level_disabled":
      return "Fast mode disabled \xB7 extra usage disabled by your organization";
    case "org_level_disabled_until":
      return "Fast mode disabled \xB7 extra usage spending cap reached";
    case "member_level_disabled":
      return "Fast mode disabled \xB7 extra usage disabled for your account";
    case "seat_tier_level_disabled":
    case "seat_tier_zero_credit_limit":
    case "member_zero_credit_limit":
      return "Fast mode disabled \xB7 extra usage not available for your plan";
    case "overage_not_provisioned":
    case "no_limits_configured":
      return "Fast mode requires extra usage billing \xB7 /extra-usage to enable";
    default:
      return "Fast mode disabled \xB7 extra usage not available";
  }
}
function isOutOfCreditsReason(reason) {
  return reason === "org_level_disabled_until" || reason === "out_of_credits";
}
function handleFastModeOverageRejection(reason) {
  const message = getOverageDisabledMessage(reason);
  logForDebugging(
    `Fast mode overage rejection: ${reason ?? "unknown"} \u2014 ${message}`
  );
  logEvent("tengu_fast_mode_overage_rejected", {
    overage_disabled_reason: reason ?? "unknown"
  });
  if (!isOutOfCreditsReason(reason)) {
    updateSettingsForSource("userSettings", { fastMode: void 0 });
    saveGlobalConfig((current) => ({
      ...current,
      penguinModeOrgEnabled: false
    }));
  }
  overageRejection.emit(message);
}
function isFastModeCooldown() {
  return getFastModeRuntimeState().status === "cooldown";
}
function getFastModeState(model, fastModeUserEnabled) {
  const enabled = isFastModeEnabled() && isFastModeAvailable() && !!fastModeUserEnabled && isFastModeSupportedByModel(model);
  if (enabled && isFastModeCooldown()) {
    return "cooldown";
  }
  if (enabled) {
    return "on";
  }
  return "off";
}
let orgStatus = { status: "pending" };
const orgFastModeChange = createSignal();
const onOrgFastModeChanged = orgFastModeChange.subscribe;
async function fetchFastModeStatus(auth) {
  const endpoint = `${getOauthConfig().BASE_API_URL}/api/claude_code_penguin_mode`;
  const headers = "accessToken" in auth ? {
    Authorization: `Bearer ${auth.accessToken}`,
    "anthropic-beta": OAUTH_BETA_HEADER
  } : { "x-api-key": auth.apiKey };
  const response = await axios.get(endpoint, { headers });
  return response.data;
}
const PREFETCH_MIN_INTERVAL_MS = 3e4;
let lastPrefetchAt = 0;
let inflightPrefetch = null;
function resolveFastModeStatusFromCache() {
  if (!isFastModeEnabled()) {
    return;
  }
  if (orgStatus.status !== "pending") {
    return;
  }
  const isAnt = process.env.USER_TYPE === "ant";
  const cachedEnabled = getGlobalConfig().penguinModeOrgEnabled === true;
  orgStatus = isAnt || cachedEnabled ? { status: "enabled" } : { status: "disabled", reason: "unknown" };
}
async function prefetchFastModeStatus() {
  if (isEssentialTrafficOnly()) {
    return;
  }
  if (!isFastModeEnabled()) {
    return;
  }
  if (inflightPrefetch) {
    logForDebugging(
      "Fast mode prefetch in progress, returning in-flight promise"
    );
    return inflightPrefetch;
  }
  const apiKey = getAnthropicApiKey();
  const hasUsableOAuth = getClaudeAIOAuthTokens()?.accessToken && hasProfileScope();
  if (!hasUsableOAuth && !apiKey) {
    const isAnt = process.env.USER_TYPE === "ant";
    const cachedEnabled = getGlobalConfig().penguinModeOrgEnabled === true;
    orgStatus = isAnt || cachedEnabled ? { status: "enabled" } : { status: "disabled", reason: "preference" };
    return;
  }
  const now = Date.now();
  if (now - lastPrefetchAt < PREFETCH_MIN_INTERVAL_MS) {
    logForDebugging("Skipping fast mode prefetch, fetched recently");
    return;
  }
  lastPrefetchAt = now;
  const fetchWithCurrentAuth = async () => {
    const currentTokens = getClaudeAIOAuthTokens();
    const auth = currentTokens?.accessToken && hasProfileScope() ? { accessToken: currentTokens.accessToken } : apiKey ? { apiKey } : null;
    if (!auth) {
      throw new Error("No auth available");
    }
    return fetchFastModeStatus(auth);
  };
  async function doFetch() {
    try {
      let status;
      try {
        status = await fetchWithCurrentAuth();
      } catch (err) {
        const isAuthError = axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403 && typeof err.response?.data === "string" && err.response.data.includes("OAuth token has been revoked"));
        if (isAuthError) {
          const failedAccessToken = getClaudeAIOAuthTokens()?.accessToken;
          if (failedAccessToken) {
            await handleOAuth401Error(failedAccessToken);
            status = await fetchWithCurrentAuth();
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      const previousEnabled = orgStatus.status !== "pending" ? orgStatus.status === "enabled" : getGlobalConfig().penguinModeOrgEnabled;
      orgStatus = status.enabled ? { status: "enabled" } : {
        status: "disabled",
        reason: status.disabled_reason ?? "preference"
      };
      if (previousEnabled !== status.enabled) {
        if (!status.enabled) {
          updateSettingsForSource("userSettings", { fastMode: void 0 });
        }
        saveGlobalConfig((current) => ({
          ...current,
          penguinModeOrgEnabled: status.enabled
        }));
        orgFastModeChange.emit(status.enabled);
      }
      logForDebugging(
        `Org fast mode: ${status.enabled ? "enabled" : `disabled (${status.disabled_reason ?? "preference"})`}`
      );
    } catch (err) {
      const isAnt = process.env.USER_TYPE === "ant";
      const cachedEnabled = getGlobalConfig().penguinModeOrgEnabled === true;
      orgStatus = isAnt || cachedEnabled ? { status: "enabled" } : { status: "disabled", reason: "network_error" };
      logForDebugging(
        `Failed to fetch org fast mode status, defaulting to ${orgStatus.status === "enabled" ? "enabled (cached)" : "disabled (network_error)"}: ${err}`,
        { level: "error" }
      );
      logEvent("tengu_org_penguin_mode_fetch_failed", {});
    } finally {
      inflightPrefetch = null;
    }
  }
  inflightPrefetch = doFetch();
  return inflightPrefetch;
}
export {
  FAST_MODE_MODEL_DISPLAY,
  clearFastModeCooldown,
  getFastModeModel,
  getFastModeRuntimeState,
  getFastModeState,
  getFastModeUnavailableReason,
  getInitialFastModeSetting,
  handleFastModeOverageRejection,
  handleFastModeRejectedByAPI,
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
  isFastModeSupportedByModel,
  onCooldownExpired,
  onCooldownTriggered,
  onFastModeOverageRejection,
  onOrgFastModeChanged,
  prefetchFastModeStatus,
  resolveFastModeStatusFromCache,
  triggerFastModeCooldown
};
