import { GrowthBook } from "@growthbook/growthbook";
import { isEqual, memoize } from "lodash-es";
import {
  getIsNonInteractiveSession,
  getSessionTrustAccepted
} from "../../bootstrap/state.js";
import { getGrowthBookClientKey } from "../../constants/keys.js";
import {
  checkHasTrustDialogAccepted,
  getGlobalConfig,
  saveGlobalConfig
} from "../../utils/config.js";
import { logForDebugging } from "../../utils/debug.js";
import { toError } from "../../utils/errors.js";
import { getAuthHeaders } from "../../utils/http.js";
import { logError } from "../../utils/log.js";
import { createSignal } from "../../utils/signal.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import {
  getUserForGrowthBook
} from "../../utils/user.js";
import {
  is1PEventLoggingEnabled,
  logGrowthBookExperimentTo1P
} from "./firstPartyEventLogger.js";
let client = null;
let currentBeforeExitHandler = null;
let currentExitHandler = null;
let clientCreatedWithAuth = false;
const experimentDataByFeature = /* @__PURE__ */ new Map();
const remoteEvalFeatureValues = /* @__PURE__ */ new Map();
const pendingExposures = /* @__PURE__ */ new Set();
const loggedExposures = /* @__PURE__ */ new Set();
let reinitializingPromise = null;
const refreshed = createSignal();
function callSafe(listener) {
  try {
    void Promise.resolve(listener()).catch((e) => {
      logError(e);
    });
  } catch (e) {
    logError(e);
  }
}
function onGrowthBookRefresh(listener) {
  let subscribed = true;
  const unsubscribe = refreshed.subscribe(() => callSafe(listener));
  if (remoteEvalFeatureValues.size > 0) {
    queueMicrotask(() => {
      if (subscribed && remoteEvalFeatureValues.size > 0) {
        callSafe(listener);
      }
    });
  }
  return () => {
    subscribed = false;
    unsubscribe();
  };
}
let envOverrides = null;
let envOverridesParsed = false;
function getEnvOverrides() {
  if (!envOverridesParsed) {
    envOverridesParsed = true;
    if (process.env.USER_TYPE === "ant") {
      const raw = process.env.CLAUDE_INTERNAL_FC_OVERRIDES;
      if (raw) {
        try {
          envOverrides = JSON.parse(raw);
          logForDebugging(
            `GrowthBook: Using env var overrides for ${Object.keys(envOverrides).length} features: ${Object.keys(envOverrides).join(", ")}`
          );
        } catch {
          logError(
            new Error(
              `GrowthBook: Failed to parse CLAUDE_INTERNAL_FC_OVERRIDES: ${raw}`
            )
          );
        }
      }
    }
  }
  return envOverrides;
}
function hasGrowthBookEnvOverride(feature) {
  const overrides = getEnvOverrides();
  return overrides !== null && feature in overrides;
}
function getConfigOverrides() {
  if (process.env.USER_TYPE !== "ant") return void 0;
  try {
    return getGlobalConfig().growthBookOverrides;
  } catch {
    return void 0;
  }
}
function getAllGrowthBookFeatures() {
  if (remoteEvalFeatureValues.size > 0) {
    return Object.fromEntries(remoteEvalFeatureValues);
  }
  return getGlobalConfig().cachedGrowthBookFeatures ?? {};
}
function getGrowthBookConfigOverrides() {
  return getConfigOverrides() ?? {};
}
function setGrowthBookConfigOverride(feature, value) {
  if (process.env.USER_TYPE !== "ant") return;
  try {
    saveGlobalConfig((c) => {
      const current = c.growthBookOverrides ?? {};
      if (value === void 0) {
        if (!(feature in current)) return c;
        const { [feature]: _, ...rest } = current;
        if (Object.keys(rest).length === 0) {
          const { growthBookOverrides: __, ...configWithout } = c;
          return configWithout;
        }
        return { ...c, growthBookOverrides: rest };
      }
      if (isEqual(current[feature], value)) return c;
      return { ...c, growthBookOverrides: { ...current, [feature]: value } };
    });
    refreshed.emit();
  } catch (e) {
    logError(e);
  }
}
function clearGrowthBookConfigOverrides() {
  if (process.env.USER_TYPE !== "ant") return;
  try {
    saveGlobalConfig((c) => {
      if (!c.growthBookOverrides || Object.keys(c.growthBookOverrides).length === 0) {
        return c;
      }
      const { growthBookOverrides: _, ...rest } = c;
      return rest;
    });
    refreshed.emit();
  } catch (e) {
    logError(e);
  }
}
function logExposureForFeature(feature) {
  if (loggedExposures.has(feature)) {
    return;
  }
  const expData = experimentDataByFeature.get(feature);
  if (expData) {
    loggedExposures.add(feature);
    logGrowthBookExperimentTo1P({
      experimentId: expData.experimentId,
      variationId: expData.variationId,
      userAttributes: getUserAttributes(),
      experimentMetadata: {
        feature_id: feature
      }
    });
  }
}
async function processRemoteEvalPayload(gbClient) {
  const payload = gbClient.getPayload();
  if (!payload?.features || Object.keys(payload.features).length === 0) {
    return false;
  }
  experimentDataByFeature.clear();
  const transformedFeatures = {};
  for (const [key, feature] of Object.entries(payload.features)) {
    const f = feature;
    if ("value" in f && !("defaultValue" in f)) {
      transformedFeatures[key] = {
        ...f,
        defaultValue: f.value
      };
    } else {
      transformedFeatures[key] = f;
    }
    if (f.source === "experiment" && f.experimentResult) {
      const expResult = f.experimentResult;
      const exp = f.experiment;
      if (exp?.key && expResult.variationId !== void 0) {
        experimentDataByFeature.set(key, {
          experimentId: exp.key,
          variationId: expResult.variationId
        });
      }
    }
  }
  await gbClient.setPayload({
    ...payload,
    features: transformedFeatures
  });
  remoteEvalFeatureValues.clear();
  for (const [key, feature] of Object.entries(transformedFeatures)) {
    const v = "value" in feature ? feature.value : feature.defaultValue;
    if (v !== void 0) {
      remoteEvalFeatureValues.set(key, v);
    }
  }
  return true;
}
function syncRemoteEvalToDisk() {
  const fresh = Object.fromEntries(remoteEvalFeatureValues);
  const config = getGlobalConfig();
  if (isEqual(config.cachedGrowthBookFeatures, fresh)) {
    return;
  }
  saveGlobalConfig((current) => ({
    ...current,
    cachedGrowthBookFeatures: fresh
  }));
}
function isGrowthBookEnabled() {
  return is1PEventLoggingEnabled();
}
function getApiBaseUrlHost() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl) return void 0;
  try {
    const host = new URL(baseUrl).host;
    if (host === "api.anthropic.com") return void 0;
    return host;
  } catch {
    return void 0;
  }
}
function getUserAttributes() {
  const user = getUserForGrowthBook();
  let email = user.email;
  if (!email && process.env.USER_TYPE === "ant") {
    email = getGlobalConfig().oauthAccount?.emailAddress;
  }
  const apiBaseUrlHost = getApiBaseUrlHost();
  const attributes = {
    id: user.deviceId,
    sessionId: user.sessionId,
    deviceID: user.deviceId,
    platform: user.platform,
    ...apiBaseUrlHost && { apiBaseUrlHost },
    ...user.organizationUuid && { organizationUUID: user.organizationUuid },
    ...user.accountUuid && { accountUUID: user.accountUuid },
    ...user.userType && { userType: user.userType },
    ...user.subscriptionType && { subscriptionType: user.subscriptionType },
    ...user.rateLimitTier && { rateLimitTier: user.rateLimitTier },
    ...user.firstTokenTime && { firstTokenTime: user.firstTokenTime },
    ...email && { email },
    ...user.appVersion && { appVersion: user.appVersion },
    ...user.githubActionsMetadata && {
      githubActionsMetadata: user.githubActionsMetadata
    }
  };
  return attributes;
}
const getGrowthBookClient = memoize(
  () => {
    if (!isGrowthBookEnabled()) {
      return null;
    }
    const attributes = getUserAttributes();
    const clientKey = getGrowthBookClientKey();
    if (process.env.USER_TYPE === "ant") {
      logForDebugging(
        `GrowthBook: Creating client with clientKey=${clientKey}, attributes: ${jsonStringify(attributes)}`
      );
    }
    const baseUrl = process.env.USER_TYPE === "ant" ? process.env.CLAUDE_CODE_GB_BASE_URL || "https://api.anthropic.com/" : "https://api.anthropic.com/";
    const hasTrust = checkHasTrustDialogAccepted() || getSessionTrustAccepted() || getIsNonInteractiveSession();
    const authHeaders = hasTrust ? getAuthHeaders() : { headers: {}, error: "trust not established" };
    const hasAuth = !authHeaders.error;
    clientCreatedWithAuth = hasAuth;
    const thisClient = new GrowthBook({
      apiHost: baseUrl,
      clientKey,
      attributes,
      remoteEval: true,
      // Re-fetch when user ID or org changes (org change = login to different org)
      cacheKeyAttributes: ["id", "organizationUUID"],
      // Add auth headers if available
      ...authHeaders.error ? {} : { apiHostRequestHeaders: authHeaders.headers },
      // Debug logging for Ants
      ...process.env.USER_TYPE === "ant" ? {
        log: (msg, ctx) => {
          logForDebugging(`GrowthBook: ${msg} ${jsonStringify(ctx)}`);
        }
      } : {}
    });
    client = thisClient;
    if (!hasAuth) {
      return { client: thisClient, initialized: Promise.resolve() };
    }
    const initialized = thisClient.init({ timeout: 5e3 }).then(async (result) => {
      if (client !== thisClient) {
        if (process.env.USER_TYPE === "ant") {
          logForDebugging(
            "GrowthBook: Skipping init callback for replaced client"
          );
        }
        return;
      }
      if (process.env.USER_TYPE === "ant") {
        logForDebugging(
          `GrowthBook initialized successfully, source: ${result.source}, success: ${result.success}`
        );
      }
      const hadFeatures = await processRemoteEvalPayload(thisClient);
      if (client !== thisClient) return;
      if (hadFeatures) {
        for (const feature of pendingExposures) {
          logExposureForFeature(feature);
        }
        pendingExposures.clear();
        syncRemoteEvalToDisk();
        refreshed.emit();
      }
      if (process.env.USER_TYPE === "ant") {
        const features = thisClient.getFeatures();
        if (features) {
          const featureKeys = Object.keys(features);
          logForDebugging(
            `GrowthBook loaded ${featureKeys.length} features: ${featureKeys.slice(0, 10).join(", ")}${featureKeys.length > 10 ? "..." : ""}`
          );
        }
      }
    }).catch((error) => {
      if (process.env.USER_TYPE === "ant") {
        logError(toError(error));
      }
    });
    currentBeforeExitHandler = () => client?.destroy();
    currentExitHandler = () => client?.destroy();
    process.on("beforeExit", currentBeforeExitHandler);
    process.on("exit", currentExitHandler);
    return { client: thisClient, initialized };
  }
);
const initializeGrowthBook = memoize(
  async () => {
    let clientWrapper = getGrowthBookClient();
    if (!clientWrapper) {
      return null;
    }
    if (!clientCreatedWithAuth) {
      const hasTrust = checkHasTrustDialogAccepted() || getSessionTrustAccepted() || getIsNonInteractiveSession();
      if (hasTrust) {
        const currentAuth = getAuthHeaders();
        if (!currentAuth.error) {
          if (process.env.USER_TYPE === "ant") {
            logForDebugging(
              "GrowthBook: Auth became available after client creation, reinitializing"
            );
          }
          resetGrowthBook();
          clientWrapper = getGrowthBookClient();
          if (!clientWrapper) {
            return null;
          }
        }
      }
    }
    await clientWrapper.initialized;
    setupPeriodicGrowthBookRefresh();
    return clientWrapper.client;
  }
);
async function getFeatureValueInternal(feature, defaultValue, logExposure) {
  const overrides = getEnvOverrides();
  if (overrides && feature in overrides) {
    return overrides[feature];
  }
  const configOverrides = getConfigOverrides();
  if (configOverrides && feature in configOverrides) {
    return configOverrides[feature];
  }
  if (!isGrowthBookEnabled()) {
    return defaultValue;
  }
  const growthBookClient = await initializeGrowthBook();
  if (!growthBookClient) {
    return defaultValue;
  }
  let result;
  if (remoteEvalFeatureValues.has(feature)) {
    result = remoteEvalFeatureValues.get(feature);
  } else {
    result = growthBookClient.getFeatureValue(feature, defaultValue);
  }
  if (logExposure) {
    logExposureForFeature(feature);
  }
  if (process.env.USER_TYPE === "ant") {
    logForDebugging(
      `GrowthBook: getFeatureValue("${feature}") = ${jsonStringify(result)}`
    );
  }
  return result;
}
async function getFeatureValue_DEPRECATED(feature, defaultValue) {
  return getFeatureValueInternal(feature, defaultValue, true);
}
function getFeatureValue_CACHED_MAY_BE_STALE(feature, defaultValue) {
  const overrides = getEnvOverrides();
  if (overrides && feature in overrides) {
    return overrides[feature];
  }
  const configOverrides = getConfigOverrides();
  if (configOverrides && feature in configOverrides) {
    return configOverrides[feature];
  }
  if (!isGrowthBookEnabled()) {
    return defaultValue;
  }
  if (experimentDataByFeature.has(feature)) {
    logExposureForFeature(feature);
  } else {
    pendingExposures.add(feature);
  }
  if (remoteEvalFeatureValues.has(feature)) {
    return remoteEvalFeatureValues.get(feature);
  }
  try {
    const cached = getGlobalConfig().cachedGrowthBookFeatures?.[feature];
    return cached !== void 0 ? cached : defaultValue;
  } catch {
    return defaultValue;
  }
}
function getFeatureValue_CACHED_WITH_REFRESH(feature, defaultValue, _refreshIntervalMs) {
  return getFeatureValue_CACHED_MAY_BE_STALE(feature, defaultValue);
}
function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(gate) {
  const overrides = getEnvOverrides();
  if (overrides && gate in overrides) {
    return Boolean(overrides[gate]);
  }
  const configOverrides = getConfigOverrides();
  if (configOverrides && gate in configOverrides) {
    return Boolean(configOverrides[gate]);
  }
  if (!isGrowthBookEnabled()) {
    return false;
  }
  if (experimentDataByFeature.has(gate)) {
    logExposureForFeature(gate);
  } else {
    pendingExposures.add(gate);
  }
  const config = getGlobalConfig();
  const gbCached = config.cachedGrowthBookFeatures?.[gate];
  if (gbCached !== void 0) {
    return Boolean(gbCached);
  }
  return config.cachedStatsigGates?.[gate] ?? false;
}
async function checkSecurityRestrictionGate(gate) {
  const overrides = getEnvOverrides();
  if (overrides && gate in overrides) {
    return Boolean(overrides[gate]);
  }
  const configOverrides = getConfigOverrides();
  if (configOverrides && gate in configOverrides) {
    return Boolean(configOverrides[gate]);
  }
  if (!isGrowthBookEnabled()) {
    return false;
  }
  if (reinitializingPromise) {
    await reinitializingPromise;
  }
  const config = getGlobalConfig();
  const statsigCached = config.cachedStatsigGates?.[gate];
  if (statsigCached !== void 0) {
    return Boolean(statsigCached);
  }
  const gbCached = config.cachedGrowthBookFeatures?.[gate];
  if (gbCached !== void 0) {
    return Boolean(gbCached);
  }
  return false;
}
async function checkGate_CACHED_OR_BLOCKING(gate) {
  const overrides = getEnvOverrides();
  if (overrides && gate in overrides) {
    return Boolean(overrides[gate]);
  }
  const configOverrides = getConfigOverrides();
  if (configOverrides && gate in configOverrides) {
    return Boolean(configOverrides[gate]);
  }
  if (!isGrowthBookEnabled()) {
    return false;
  }
  const cached = getGlobalConfig().cachedGrowthBookFeatures?.[gate];
  if (cached === true) {
    if (experimentDataByFeature.has(gate)) {
      logExposureForFeature(gate);
    } else {
      pendingExposures.add(gate);
    }
    return true;
  }
  return getFeatureValueInternal(gate, false, true);
}
function refreshGrowthBookAfterAuthChange() {
  if (!isGrowthBookEnabled()) {
    return;
  }
  try {
    resetGrowthBook();
    refreshed.emit();
    reinitializingPromise = initializeGrowthBook().catch((error) => {
      logError(toError(error));
      return null;
    }).finally(() => {
      reinitializingPromise = null;
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      throw error;
    }
    logError(toError(error));
  }
}
function resetGrowthBook() {
  stopPeriodicGrowthBookRefresh();
  if (currentBeforeExitHandler) {
    process.off("beforeExit", currentBeforeExitHandler);
    currentBeforeExitHandler = null;
  }
  if (currentExitHandler) {
    process.off("exit", currentExitHandler);
    currentExitHandler = null;
  }
  client?.destroy();
  client = null;
  clientCreatedWithAuth = false;
  reinitializingPromise = null;
  experimentDataByFeature.clear();
  pendingExposures.clear();
  loggedExposures.clear();
  remoteEvalFeatureValues.clear();
  getGrowthBookClient.cache?.clear?.();
  initializeGrowthBook.cache?.clear?.();
  envOverrides = null;
  envOverridesParsed = false;
}
const GROWTHBOOK_REFRESH_INTERVAL_MS = process.env.USER_TYPE !== "ant" ? 6 * 60 * 60 * 1e3 : 20 * 60 * 1e3;
let refreshInterval = null;
let beforeExitListener = null;
async function refreshGrowthBookFeatures() {
  if (!isGrowthBookEnabled()) {
    return;
  }
  try {
    const growthBookClient = await initializeGrowthBook();
    if (!growthBookClient) {
      return;
    }
    await growthBookClient.refreshFeatures();
    if (growthBookClient !== client) {
      if (process.env.USER_TYPE === "ant") {
        logForDebugging(
          "GrowthBook: Skipping refresh processing for replaced client"
        );
      }
      return;
    }
    const hadFeatures = await processRemoteEvalPayload(growthBookClient);
    if (growthBookClient !== client) return;
    if (process.env.USER_TYPE === "ant") {
      logForDebugging("GrowthBook: Light refresh completed");
    }
    if (hadFeatures) {
      syncRemoteEvalToDisk();
      refreshed.emit();
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      throw error;
    }
    logError(toError(error));
  }
}
function setupPeriodicGrowthBookRefresh() {
  if (!isGrowthBookEnabled()) {
    return;
  }
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  refreshInterval = setInterval(() => {
    void refreshGrowthBookFeatures();
  }, GROWTHBOOK_REFRESH_INTERVAL_MS);
  refreshInterval.unref?.();
  if (!beforeExitListener) {
    beforeExitListener = () => {
      stopPeriodicGrowthBookRefresh();
    };
    process.once("beforeExit", beforeExitListener);
  }
}
function stopPeriodicGrowthBookRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  if (beforeExitListener) {
    process.removeListener("beforeExit", beforeExitListener);
    beforeExitListener = null;
  }
}
async function getDynamicConfig_BLOCKS_ON_INIT(configName, defaultValue) {
  return getFeatureValue_DEPRECATED(configName, defaultValue);
}
function getDynamicConfig_CACHED_MAY_BE_STALE(configName, defaultValue) {
  return getFeatureValue_CACHED_MAY_BE_STALE(configName, defaultValue);
}
export {
  checkGate_CACHED_OR_BLOCKING,
  checkSecurityRestrictionGate,
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE,
  clearGrowthBookConfigOverrides,
  getAllGrowthBookFeatures,
  getApiBaseUrlHost,
  getDynamicConfig_BLOCKS_ON_INIT,
  getDynamicConfig_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_WITH_REFRESH,
  getFeatureValue_DEPRECATED,
  getGrowthBookConfigOverrides,
  hasGrowthBookEnvOverride,
  initializeGrowthBook,
  onGrowthBookRefresh,
  refreshGrowthBookAfterAuthChange,
  refreshGrowthBookFeatures,
  resetGrowthBook,
  setGrowthBookConfigOverride,
  setupPeriodicGrowthBookRefresh,
  stopPeriodicGrowthBookRefresh
};
