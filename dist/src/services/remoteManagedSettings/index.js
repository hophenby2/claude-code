import axios from "axios";
import { createHash } from "crypto";
import { open, unlink } from "fs/promises";
import { getOauthConfig, OAUTH_BETA_HEADER } from "../../constants/oauth.js";
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getAnthropicApiKeyWithSource,
  getClaudeAIOAuthTokens
} from "../../utils/auth.js";
import { registerCleanup } from "../../utils/cleanupRegistry.js";
import { logForDebugging } from "../../utils/debug.js";
import { classifyAxiosError, getErrnoCode } from "../../utils/errors.js";
import { settingsChangeDetector } from "../../utils/settings/changeDetector.js";
import {
  SettingsSchema
} from "../../utils/settings/types.js";
import { sleep } from "../../utils/sleep.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { getClaudeCodeUserAgent } from "../../utils/userAgent.js";
import { getRetryDelay } from "../api/withRetry.js";
import {
  checkManagedSettingsSecurity,
  handleSecurityCheckResult
} from "./securityCheck.js";
import { isRemoteManagedSettingsEligible, resetSyncCache } from "./syncCache.js";
import {
  getRemoteManagedSettingsSyncFromCache,
  getSettingsPath,
  setSessionCache
} from "./syncCacheState.js";
import {
  RemoteManagedSettingsResponseSchema
} from "./types.js";
const SETTINGS_TIMEOUT_MS = 1e4;
const DEFAULT_MAX_RETRIES = 5;
const POLLING_INTERVAL_MS = 60 * 60 * 1e3;
let pollingIntervalId = null;
let loadingCompletePromise = null;
let loadingCompleteResolve = null;
const LOADING_PROMISE_TIMEOUT_MS = 3e4;
function initializeRemoteManagedSettingsLoadingPromise() {
  if (loadingCompletePromise) {
    return;
  }
  if (isRemoteManagedSettingsEligible()) {
    loadingCompletePromise = new Promise((resolve) => {
      loadingCompleteResolve = resolve;
      setTimeout(() => {
        if (loadingCompleteResolve) {
          logForDebugging(
            "Remote settings: Loading promise timed out, resolving anyway"
          );
          loadingCompleteResolve();
          loadingCompleteResolve = null;
        }
      }, LOADING_PROMISE_TIMEOUT_MS);
    });
  }
}
function getRemoteManagedSettingsEndpoint() {
  return `${getOauthConfig().BASE_API_URL}/api/claude_code/settings`;
}
function sortKeysDeep(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sortKeysDeep);
  }
  if (obj !== null && typeof obj === "object") {
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }
  return obj;
}
function computeChecksumFromSettings(settings) {
  const sorted = sortKeysDeep(settings);
  const normalized = jsonStringify(sorted);
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `sha256:${hash}`;
}
function isEligibleForRemoteManagedSettings() {
  return isRemoteManagedSettingsEligible();
}
async function waitForRemoteManagedSettingsToLoad() {
  if (loadingCompletePromise) {
    await loadingCompletePromise;
  }
}
function getRemoteSettingsAuthHeaders() {
  try {
    const { key: apiKey } = getAnthropicApiKeyWithSource({
      skipRetrievingKeyFromApiKeyHelper: true
    });
    if (apiKey) {
      return {
        headers: {
          "x-api-key": apiKey
        }
      };
    }
  } catch {
  }
  const oauthTokens = getClaudeAIOAuthTokens();
  if (oauthTokens?.accessToken) {
    return {
      headers: {
        Authorization: `Bearer ${oauthTokens.accessToken}`,
        "anthropic-beta": OAUTH_BETA_HEADER
      }
    };
  }
  return {
    headers: {},
    error: "No authentication available"
  };
}
async function fetchWithRetry(cachedChecksum) {
  let lastResult = null;
  for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES + 1; attempt++) {
    lastResult = await fetchRemoteManagedSettings(cachedChecksum);
    if (lastResult.success) {
      return lastResult;
    }
    if (lastResult.skipRetry) {
      return lastResult;
    }
    if (attempt > DEFAULT_MAX_RETRIES) {
      return lastResult;
    }
    const delayMs = getRetryDelay(attempt);
    logForDebugging(
      `Remote settings: Retry ${attempt}/${DEFAULT_MAX_RETRIES} after ${delayMs}ms`
    );
    await sleep(delayMs);
  }
  return lastResult;
}
async function fetchRemoteManagedSettings(cachedChecksum) {
  try {
    await checkAndRefreshOAuthTokenIfNeeded();
    const authHeaders = getRemoteSettingsAuthHeaders();
    if (authHeaders.error) {
      return {
        success: false,
        error: `Authentication required for remote settings`,
        skipRetry: true
      };
    }
    const endpoint = getRemoteManagedSettingsEndpoint();
    const headers = {
      ...authHeaders.headers,
      "User-Agent": getClaudeCodeUserAgent()
    };
    if (cachedChecksum) {
      headers["If-None-Match"] = `"${cachedChecksum}"`;
    }
    const response = await axios.get(endpoint, {
      headers,
      timeout: SETTINGS_TIMEOUT_MS,
      // Allow 204, 304, and 404 responses without treating them as errors.
      // 204/404 are returned when no settings exist for the user or the feature flag is off.
      validateStatus: (status) => status === 200 || status === 204 || status === 304 || status === 404
    });
    if (response.status === 304) {
      logForDebugging("Remote settings: Using cached settings (304)");
      return {
        success: true,
        settings: null,
        // Signal that cache is valid
        checksum: cachedChecksum
      };
    }
    if (response.status === 204 || response.status === 404) {
      logForDebugging(`Remote settings: No settings found (${response.status})`);
      return {
        success: true,
        settings: {},
        checksum: void 0
      };
    }
    const parsed = RemoteManagedSettingsResponseSchema().safeParse(
      response.data
    );
    if (!parsed.success) {
      logForDebugging(
        `Remote settings: Invalid response format - ${parsed.error.message}`
      );
      return {
        success: false,
        error: "Invalid remote settings format"
      };
    }
    const settingsValidation = SettingsSchema().safeParse(parsed.data.settings);
    if (!settingsValidation.success) {
      logForDebugging(
        `Remote settings: Settings validation failed - ${settingsValidation.error.message}`
      );
      return {
        success: false,
        error: "Invalid settings structure"
      };
    }
    logForDebugging("Remote settings: Fetched successfully");
    return {
      success: true,
      settings: settingsValidation.data,
      checksum: parsed.data.checksum
    };
  } catch (error) {
    const { kind, status, message } = classifyAxiosError(error);
    if (status === 404) {
      return { success: true, settings: {}, checksum: "" };
    }
    switch (kind) {
      case "auth":
        return {
          success: false,
          error: "Not authorized for remote settings",
          skipRetry: true
        };
      case "timeout":
        return { success: false, error: "Remote settings request timeout" };
      case "network":
        return { success: false, error: "Cannot connect to server" };
      default:
        return { success: false, error: message };
    }
  }
}
async function saveSettings(settings) {
  try {
    const path = getSettingsPath();
    const handle = await open(path, "w", 384);
    try {
      await handle.writeFile(jsonStringify(settings, null, 2), {
        encoding: "utf-8"
      });
      await handle.datasync();
    } finally {
      await handle.close();
    }
    logForDebugging(`Remote settings: Saved to ${path}`);
  } catch (error) {
    logForDebugging(
      `Remote settings: Failed to save - ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}
async function clearRemoteManagedSettingsCache() {
  stopBackgroundPolling();
  resetSyncCache();
  loadingCompletePromise = null;
  loadingCompleteResolve = null;
  try {
    const path = getSettingsPath();
    await unlink(path);
  } catch {
  }
}
async function fetchAndLoadRemoteManagedSettings() {
  if (!isRemoteManagedSettingsEligible()) {
    return null;
  }
  const cachedSettings = getRemoteManagedSettingsSyncFromCache();
  const cachedChecksum = cachedSettings ? computeChecksumFromSettings(cachedSettings) : void 0;
  try {
    const result = await fetchWithRetry(cachedChecksum);
    if (!result.success) {
      if (cachedSettings) {
        logForDebugging(
          "Remote settings: Using stale cache after fetch failure"
        );
        setSessionCache(cachedSettings);
        return cachedSettings;
      }
      return null;
    }
    if (result.settings === null && cachedSettings) {
      logForDebugging("Remote settings: Cache still valid (304 Not Modified)");
      setSessionCache(cachedSettings);
      return cachedSettings;
    }
    const newSettings = result.settings || {};
    const hasContent = Object.keys(newSettings).length > 0;
    if (hasContent) {
      const securityResult = await checkManagedSettingsSecurity(
        cachedSettings,
        newSettings
      );
      if (!handleSecurityCheckResult(securityResult)) {
        logForDebugging(
          "Remote settings: User rejected new settings, using cached settings"
        );
        return cachedSettings;
      }
      setSessionCache(newSettings);
      await saveSettings(newSettings);
      logForDebugging("Remote settings: Applied new settings successfully");
      return newSettings;
    }
    setSessionCache(newSettings);
    try {
      const path = getSettingsPath();
      await unlink(path);
      logForDebugging("Remote settings: Deleted cached file (404 response)");
    } catch (e) {
      const code = getErrnoCode(e);
      if (code !== "ENOENT") {
        logForDebugging(
          `Remote settings: Failed to delete cached file - ${e instanceof Error ? e.message : "unknown error"}`
        );
      }
    }
    return newSettings;
  } catch {
    if (cachedSettings) {
      logForDebugging("Remote settings: Using stale cache after error");
      setSessionCache(cachedSettings);
      return cachedSettings;
    }
    return null;
  }
}
async function loadRemoteManagedSettings() {
  if (isRemoteManagedSettingsEligible() && !loadingCompletePromise) {
    loadingCompletePromise = new Promise((resolve) => {
      loadingCompleteResolve = resolve;
    });
  }
  if (getRemoteManagedSettingsSyncFromCache() && loadingCompleteResolve) {
    loadingCompleteResolve();
    loadingCompleteResolve = null;
  }
  try {
    const settings = await fetchAndLoadRemoteManagedSettings();
    if (isRemoteManagedSettingsEligible()) {
      startBackgroundPolling();
    }
    if (settings !== null) {
      settingsChangeDetector.notifyChange("policySettings");
    }
  } finally {
    if (loadingCompleteResolve) {
      loadingCompleteResolve();
      loadingCompleteResolve = null;
    }
  }
}
async function refreshRemoteManagedSettings() {
  await clearRemoteManagedSettingsCache();
  if (!isRemoteManagedSettingsEligible()) {
    settingsChangeDetector.notifyChange("policySettings");
    return;
  }
  await fetchAndLoadRemoteManagedSettings();
  logForDebugging("Remote settings: Refreshed after auth change");
  settingsChangeDetector.notifyChange("policySettings");
}
async function pollRemoteSettings() {
  if (!isRemoteManagedSettingsEligible()) {
    return;
  }
  const prevCache = getRemoteManagedSettingsSyncFromCache();
  const previousSettings = prevCache ? jsonStringify(prevCache) : null;
  try {
    await fetchAndLoadRemoteManagedSettings();
    const newCache = getRemoteManagedSettingsSyncFromCache();
    const newSettings = newCache ? jsonStringify(newCache) : null;
    if (newSettings !== previousSettings) {
      logForDebugging("Remote settings: Changed during background poll");
      settingsChangeDetector.notifyChange("policySettings");
    }
  } catch {
  }
}
function startBackgroundPolling() {
  if (pollingIntervalId !== null) {
    return;
  }
  if (!isRemoteManagedSettingsEligible()) {
    return;
  }
  pollingIntervalId = setInterval(() => {
    void pollRemoteSettings();
  }, POLLING_INTERVAL_MS);
  pollingIntervalId.unref();
  registerCleanup(async () => stopBackgroundPolling());
}
function stopBackgroundPolling() {
  if (pollingIntervalId !== null) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
}
export {
  clearRemoteManagedSettingsCache,
  computeChecksumFromSettings,
  initializeRemoteManagedSettingsLoadingPromise,
  isEligibleForRemoteManagedSettings,
  loadRemoteManagedSettings,
  refreshRemoteManagedSettings,
  startBackgroundPolling,
  stopBackgroundPolling,
  waitForRemoteManagedSettingsToLoad
};
