import chalk from "chalk";
import { exec } from "child_process";
import { execa } from "execa";
import { mkdir, stat } from "fs/promises";
import memoize from "lodash-es/memoize.js";
import { join } from "path";
import { CLAUDE_AI_PROFILE_SCOPE } from "../constants/oauth.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { getModelStrings } from "./model/modelStrings.js";
import { getAPIProvider } from "./model/providers.js";
import {
  getIsNonInteractiveSession,
  preferThirdPartyAuthentication
} from "../bootstrap/state.js";
import {
  getMockSubscriptionType,
  shouldUseMockSubscription
} from "../services/mockRateLimits.js";
import {
  isOAuthTokenExpired,
  refreshOAuthToken,
  shouldUseClaudeAIAuth
} from "../services/oauth/client.js";
import { getOauthProfileFromOauthToken } from "../services/oauth/getOauthProfile.js";
import {
  getApiKeyFromFileDescriptor,
  getOAuthTokenFromFileDescriptor
} from "./authFileDescriptor.js";
import {
  maybeRemoveApiKeyFromMacOSKeychainThrows,
  normalizeApiKeyForConfig
} from "./authPortable.js";
import {
  checkStsCallerIdentity,
  clearAwsIniCache,
  isValidAwsStsOutput
} from "./aws.js";
import { AwsAuthStatusManager } from "./awsAuthStatusManager.js";
import { clearBetasCaches } from "./betas.js";
import {
  checkHasTrustDialogAccepted,
  getGlobalConfig,
  saveGlobalConfig
} from "./config.js";
import { logAntError, logForDebugging } from "./debug.js";
import {
  getClaudeConfigHomeDir,
  isBareMode,
  isEnvTruthy,
  isRunningOnHomespace
} from "./envUtils.js";
import { errorMessage } from "./errors.js";
import { execSyncWithDefaults_DEPRECATED } from "./execFileNoThrow.js";
import * as lockfile from "./lockfile.js";
import { logError } from "./log.js";
import { memoizeWithTTLAsync } from "./memoize.js";
import { getSecureStorage } from "./secureStorage/index.js";
import {
  clearLegacyApiKeyPrefetch,
  getLegacyApiKeyPrefetchResult
} from "./secureStorage/keychainPrefetch.js";
import {
  clearKeychainCache,
  getMacOsKeychainStorageServiceName,
  getUsername
} from "./secureStorage/macOsKeychainHelpers.js";
import {
  getSettings_DEPRECATED,
  getSettingsForSource
} from "./settings/settings.js";
import { sleep } from "./sleep.js";
import { jsonParse } from "./slowOperations.js";
import { clearToolSchemaCache } from "./toolSchemaCache.js";
const DEFAULT_API_KEY_HELPER_TTL = 5 * 60 * 1e3;
function isManagedOAuthContext() {
  return isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) || process.env.CLAUDE_CODE_ENTRYPOINT === "claude-desktop";
}
function isAnthropicAuthEnabled() {
  if (isBareMode()) return false;
  if (process.env.ANTHROPIC_UNIX_SOCKET) {
    return !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }
  const is3P = isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) || isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) || isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY);
  const settings = getSettings_DEPRECATED() || {};
  const apiKeyHelper = settings.apiKeyHelper;
  const hasExternalAuthToken = process.env.ANTHROPIC_AUTH_TOKEN || apiKeyHelper || process.env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR;
  const { source: apiKeySource } = getAnthropicApiKeyWithSource({
    skipRetrievingKeyFromApiKeyHelper: true
  });
  const hasExternalApiKey = apiKeySource === "ANTHROPIC_API_KEY" || apiKeySource === "apiKeyHelper";
  const shouldDisableAuth = is3P || hasExternalAuthToken && !isManagedOAuthContext() || hasExternalApiKey && !isManagedOAuthContext();
  return !shouldDisableAuth;
}
function getAuthTokenSource() {
  if (isBareMode()) {
    if (getConfiguredApiKeyHelper()) {
      return { source: "apiKeyHelper", hasToken: true };
    }
    return { source: "none", hasToken: false };
  }
  if (process.env.ANTHROPIC_AUTH_TOKEN && !isManagedOAuthContext()) {
    return { source: "ANTHROPIC_AUTH_TOKEN", hasToken: true };
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { source: "CLAUDE_CODE_OAUTH_TOKEN", hasToken: true };
  }
  const oauthTokenFromFd = getOAuthTokenFromFileDescriptor();
  if (oauthTokenFromFd) {
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR) {
      return {
        source: "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR",
        hasToken: true
      };
    }
    return {
      source: "CCR_OAUTH_TOKEN_FILE",
      hasToken: true
    };
  }
  const apiKeyHelper = getConfiguredApiKeyHelper();
  if (apiKeyHelper && !isManagedOAuthContext()) {
    return { source: "apiKeyHelper", hasToken: true };
  }
  const oauthTokens = getClaudeAIOAuthTokens();
  if (shouldUseClaudeAIAuth(oauthTokens?.scopes) && oauthTokens?.accessToken) {
    return { source: "claude.ai", hasToken: true };
  }
  return { source: "none", hasToken: false };
}
function getAnthropicApiKey() {
  const { key } = getAnthropicApiKeyWithSource();
  return key;
}
function hasAnthropicApiKeyAuth() {
  const { key, source } = getAnthropicApiKeyWithSource({
    skipRetrievingKeyFromApiKeyHelper: true
  });
  return key !== null && source !== "none";
}
function getAnthropicApiKeyWithSource(opts = {}) {
  if (isBareMode()) {
    if (process.env.ANTHROPIC_API_KEY) {
      return { key: process.env.ANTHROPIC_API_KEY, source: "ANTHROPIC_API_KEY" };
    }
    if (getConfiguredApiKeyHelper()) {
      return {
        key: opts.skipRetrievingKeyFromApiKeyHelper ? null : getApiKeyFromApiKeyHelperCached(),
        source: "apiKeyHelper"
      };
    }
    return { key: null, source: "none" };
  }
  const apiKeyEnv = isRunningOnHomespace() ? void 0 : process.env.ANTHROPIC_API_KEY;
  if (preferThirdPartyAuthentication() && apiKeyEnv) {
    return {
      key: apiKeyEnv,
      source: "ANTHROPIC_API_KEY"
    };
  }
  if (isEnvTruthy(process.env.CI) || process.env.NODE_ENV === "test") {
    const apiKeyFromFd2 = getApiKeyFromFileDescriptor();
    if (apiKeyFromFd2) {
      return {
        key: apiKeyFromFd2,
        source: "ANTHROPIC_API_KEY"
      };
    }
    if (!apiKeyEnv && !process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR) {
      throw new Error(
        "ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN env var is required"
      );
    }
    if (apiKeyEnv) {
      return {
        key: apiKeyEnv,
        source: "ANTHROPIC_API_KEY"
      };
    }
    return {
      key: null,
      source: "none"
    };
  }
  if (apiKeyEnv && getGlobalConfig().customApiKeyResponses?.approved?.includes(
    normalizeApiKeyForConfig(apiKeyEnv)
  )) {
    return {
      key: apiKeyEnv,
      source: "ANTHROPIC_API_KEY"
    };
  }
  const apiKeyFromFd = getApiKeyFromFileDescriptor();
  if (apiKeyFromFd) {
    return {
      key: apiKeyFromFd,
      source: "ANTHROPIC_API_KEY"
    };
  }
  const apiKeyHelperCommand = getConfiguredApiKeyHelper();
  if (apiKeyHelperCommand) {
    if (opts.skipRetrievingKeyFromApiKeyHelper) {
      return {
        key: null,
        source: "apiKeyHelper"
      };
    }
    return {
      key: getApiKeyFromApiKeyHelperCached(),
      source: "apiKeyHelper"
    };
  }
  const apiKeyFromConfigOrMacOSKeychain = getApiKeyFromConfigOrMacOSKeychain();
  if (apiKeyFromConfigOrMacOSKeychain) {
    return apiKeyFromConfigOrMacOSKeychain;
  }
  return {
    key: null,
    source: "none"
  };
}
function getConfiguredApiKeyHelper() {
  if (isBareMode()) {
    return getSettingsForSource("flagSettings")?.apiKeyHelper;
  }
  const mergedSettings = getSettings_DEPRECATED() || {};
  return mergedSettings.apiKeyHelper;
}
function isApiKeyHelperFromProjectOrLocalSettings() {
  const apiKeyHelper = getConfiguredApiKeyHelper();
  if (!apiKeyHelper) {
    return false;
  }
  const projectSettings = getSettingsForSource("projectSettings");
  const localSettings = getSettingsForSource("localSettings");
  return projectSettings?.apiKeyHelper === apiKeyHelper || localSettings?.apiKeyHelper === apiKeyHelper;
}
function getConfiguredAwsAuthRefresh() {
  const mergedSettings = getSettings_DEPRECATED() || {};
  return mergedSettings.awsAuthRefresh;
}
function isAwsAuthRefreshFromProjectSettings() {
  const awsAuthRefresh = getConfiguredAwsAuthRefresh();
  if (!awsAuthRefresh) {
    return false;
  }
  const projectSettings = getSettingsForSource("projectSettings");
  const localSettings = getSettingsForSource("localSettings");
  return projectSettings?.awsAuthRefresh === awsAuthRefresh || localSettings?.awsAuthRefresh === awsAuthRefresh;
}
function getConfiguredAwsCredentialExport() {
  const mergedSettings = getSettings_DEPRECATED() || {};
  return mergedSettings.awsCredentialExport;
}
function isAwsCredentialExportFromProjectSettings() {
  const awsCredentialExport = getConfiguredAwsCredentialExport();
  if (!awsCredentialExport) {
    return false;
  }
  const projectSettings = getSettingsForSource("projectSettings");
  const localSettings = getSettingsForSource("localSettings");
  return projectSettings?.awsCredentialExport === awsCredentialExport || localSettings?.awsCredentialExport === awsCredentialExport;
}
function calculateApiKeyHelperTTL() {
  const envTtl = process.env.CLAUDE_CODE_API_KEY_HELPER_TTL_MS;
  if (envTtl) {
    const parsed = parseInt(envTtl, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
    logForDebugging(
      `Found CLAUDE_CODE_API_KEY_HELPER_TTL_MS env var, but it was not a valid number. Got ${envTtl}`,
      { level: "error" }
    );
  }
  return DEFAULT_API_KEY_HELPER_TTL;
}
let _apiKeyHelperCache = null;
let _apiKeyHelperInflight = null;
let _apiKeyHelperEpoch = 0;
function getApiKeyHelperElapsedMs() {
  const startedAt = _apiKeyHelperInflight?.startedAt;
  return startedAt ? Date.now() - startedAt : 0;
}
async function getApiKeyFromApiKeyHelper(isNonInteractiveSession) {
  if (!getConfiguredApiKeyHelper()) return null;
  const ttl = calculateApiKeyHelperTTL();
  if (_apiKeyHelperCache) {
    if (Date.now() - _apiKeyHelperCache.timestamp < ttl) {
      return _apiKeyHelperCache.value;
    }
    if (!_apiKeyHelperInflight) {
      _apiKeyHelperInflight = {
        promise: _runAndCache(
          isNonInteractiveSession,
          false,
          _apiKeyHelperEpoch
        ),
        startedAt: null
      };
    }
    return _apiKeyHelperCache.value;
  }
  if (_apiKeyHelperInflight) return _apiKeyHelperInflight.promise;
  _apiKeyHelperInflight = {
    promise: _runAndCache(isNonInteractiveSession, true, _apiKeyHelperEpoch),
    startedAt: Date.now()
  };
  return _apiKeyHelperInflight.promise;
}
async function _runAndCache(isNonInteractiveSession, isCold, epoch) {
  try {
    const value = await _executeApiKeyHelper(isNonInteractiveSession);
    if (epoch !== _apiKeyHelperEpoch) return value;
    if (value !== null) {
      _apiKeyHelperCache = { value, timestamp: Date.now() };
    }
    return value;
  } catch (e) {
    if (epoch !== _apiKeyHelperEpoch) return " ";
    const detail = e instanceof Error ? e.message : String(e);
    console.error(chalk.red(`apiKeyHelper failed: ${detail}`));
    logForDebugging(`Error getting API key from apiKeyHelper: ${detail}`, {
      level: "error"
    });
    if (!isCold && _apiKeyHelperCache && _apiKeyHelperCache.value !== " ") {
      _apiKeyHelperCache = { ..._apiKeyHelperCache, timestamp: Date.now() };
      return _apiKeyHelperCache.value;
    }
    _apiKeyHelperCache = { value: " ", timestamp: Date.now() };
    return " ";
  } finally {
    if (epoch === _apiKeyHelperEpoch) {
      _apiKeyHelperInflight = null;
    }
  }
}
async function _executeApiKeyHelper(isNonInteractiveSession) {
  const apiKeyHelper = getConfiguredApiKeyHelper();
  if (!apiKeyHelper) {
    return null;
  }
  if (isApiKeyHelperFromProjectOrLocalSettings()) {
    const hasTrust = checkHasTrustDialogAccepted();
    if (!hasTrust && !isNonInteractiveSession) {
      const error = new Error(
        `Security: apiKeyHelper executed before workspace trust is confirmed. If you see this message, post in ${""}.`
      );
      logAntError("apiKeyHelper invoked before trust check", error);
      logEvent("tengu_apiKeyHelper_missing_trust11", {});
      return null;
    }
  }
  const result = await execa(apiKeyHelper, {
    shell: true,
    timeout: 10 * 60 * 1e3,
    reject: false
  });
  if (result.failed) {
    const why = result.timedOut ? "timed out" : `exited ${result.exitCode}`;
    const stderr = result.stderr?.trim();
    throw new Error(stderr ? `${why}: ${stderr}` : why);
  }
  const stdout = result.stdout?.trim();
  if (!stdout) {
    throw new Error("did not return a value");
  }
  return stdout;
}
function getApiKeyFromApiKeyHelperCached() {
  return _apiKeyHelperCache?.value ?? null;
}
function clearApiKeyHelperCache() {
  _apiKeyHelperEpoch++;
  _apiKeyHelperCache = null;
  _apiKeyHelperInflight = null;
}
function prefetchApiKeyFromApiKeyHelperIfSafe(isNonInteractiveSession) {
  if (isApiKeyHelperFromProjectOrLocalSettings() && !checkHasTrustDialogAccepted()) {
    return;
  }
  void getApiKeyFromApiKeyHelper(isNonInteractiveSession);
}
const DEFAULT_AWS_STS_TTL = 60 * 60 * 1e3;
async function runAwsAuthRefresh() {
  const awsAuthRefresh = getConfiguredAwsAuthRefresh();
  if (!awsAuthRefresh) {
    return false;
  }
  if (isAwsAuthRefreshFromProjectSettings()) {
    const hasTrust = checkHasTrustDialogAccepted();
    if (!hasTrust && !getIsNonInteractiveSession()) {
      const error = new Error(
        `Security: awsAuthRefresh executed before workspace trust is confirmed. If you see this message, post in ${""}.`
      );
      logAntError("awsAuthRefresh invoked before trust check", error);
      logEvent("tengu_awsAuthRefresh_missing_trust", {});
      return false;
    }
  }
  try {
    logForDebugging("Fetching AWS caller identity for AWS auth refresh command");
    await checkStsCallerIdentity();
    logForDebugging(
      "Fetched AWS caller identity, skipping AWS auth refresh command"
    );
    return false;
  } catch {
    return refreshAwsAuth(awsAuthRefresh);
  }
}
const AWS_AUTH_REFRESH_TIMEOUT_MS = 3 * 60 * 1e3;
function refreshAwsAuth(awsAuthRefresh) {
  logForDebugging("Running AWS auth refresh command");
  const authStatusManager = AwsAuthStatusManager.getInstance();
  authStatusManager.startAuthentication();
  return new Promise((resolve) => {
    const refreshProc = exec(awsAuthRefresh, {
      timeout: AWS_AUTH_REFRESH_TIMEOUT_MS
    });
    refreshProc.stdout.on("data", (data) => {
      const output = data.toString().trim();
      if (output) {
        authStatusManager.addOutput(output);
        logForDebugging(output, { level: "debug" });
      }
    });
    refreshProc.stderr.on("data", (data) => {
      const error = data.toString().trim();
      if (error) {
        authStatusManager.setError(error);
        logForDebugging(error, { level: "error" });
      }
    });
    refreshProc.on("close", (code, signal) => {
      if (code === 0) {
        logForDebugging("AWS auth refresh completed successfully");
        authStatusManager.endAuthentication(true);
        void resolve(true);
      } else {
        const timedOut = signal === "SIGTERM";
        const message = timedOut ? chalk.red(
          "AWS auth refresh timed out after 3 minutes. Run your auth command manually in a separate terminal."
        ) : chalk.red(
          "Error running awsAuthRefresh (in settings or ~/.claude.json):"
        );
        console.error(message);
        authStatusManager.endAuthentication(false);
        void resolve(false);
      }
    });
  });
}
async function getAwsCredsFromCredentialExport() {
  const awsCredentialExport = getConfiguredAwsCredentialExport();
  if (!awsCredentialExport) {
    return null;
  }
  if (isAwsCredentialExportFromProjectSettings()) {
    const hasTrust = checkHasTrustDialogAccepted();
    if (!hasTrust && !getIsNonInteractiveSession()) {
      const error = new Error(
        `Security: awsCredentialExport executed before workspace trust is confirmed. If you see this message, post in ${""}.`
      );
      logAntError("awsCredentialExport invoked before trust check", error);
      logEvent("tengu_awsCredentialExport_missing_trust", {});
      return null;
    }
  }
  try {
    logForDebugging(
      "Fetching AWS caller identity for credential export command"
    );
    await checkStsCallerIdentity();
    logForDebugging(
      "Fetched AWS caller identity, skipping AWS credential export command"
    );
    return null;
  } catch {
    try {
      logForDebugging("Running AWS credential export command");
      const result = await execa(awsCredentialExport, {
        shell: true,
        reject: false
      });
      if (result.exitCode !== 0 || !result.stdout) {
        throw new Error("awsCredentialExport did not return a valid value");
      }
      const awsOutput = jsonParse(result.stdout.trim());
      if (!isValidAwsStsOutput(awsOutput)) {
        throw new Error(
          "awsCredentialExport did not return valid AWS STS output structure"
        );
      }
      logForDebugging("AWS credentials retrieved from awsCredentialExport");
      return {
        accessKeyId: awsOutput.Credentials.AccessKeyId,
        secretAccessKey: awsOutput.Credentials.SecretAccessKey,
        sessionToken: awsOutput.Credentials.SessionToken
      };
    } catch (e) {
      const message = chalk.red(
        "Error getting AWS credentials from awsCredentialExport (in settings or ~/.claude.json):"
      );
      if (e instanceof Error) {
        console.error(message, e.message);
      } else {
        console.error(message, e);
      }
      return null;
    }
  }
}
const refreshAndGetAwsCredentials = memoizeWithTTLAsync(
  async () => {
    const refreshed = await runAwsAuthRefresh();
    const credentials = await getAwsCredsFromCredentialExport();
    if (refreshed || credentials) {
      await clearAwsIniCache();
    }
    return credentials;
  },
  DEFAULT_AWS_STS_TTL
);
function clearAwsCredentialsCache() {
  refreshAndGetAwsCredentials.cache.clear();
}
function getConfiguredGcpAuthRefresh() {
  const mergedSettings = getSettings_DEPRECATED() || {};
  return mergedSettings.gcpAuthRefresh;
}
function isGcpAuthRefreshFromProjectSettings() {
  const gcpAuthRefresh = getConfiguredGcpAuthRefresh();
  if (!gcpAuthRefresh) {
    return false;
  }
  const projectSettings = getSettingsForSource("projectSettings");
  const localSettings = getSettingsForSource("localSettings");
  return projectSettings?.gcpAuthRefresh === gcpAuthRefresh || localSettings?.gcpAuthRefresh === gcpAuthRefresh;
}
const GCP_CREDENTIALS_CHECK_TIMEOUT_MS = 5e3;
async function checkGcpCredentialsValid() {
  try {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    });
    const probe = (async () => {
      const client = await auth.getClient();
      await client.getAccessToken();
    })();
    const timeout = sleep(GCP_CREDENTIALS_CHECK_TIMEOUT_MS).then(() => {
      throw new GcpCredentialsTimeoutError("GCP credentials check timed out");
    });
    await Promise.race([probe, timeout]);
    return true;
  } catch {
    return false;
  }
}
const DEFAULT_GCP_CREDENTIAL_TTL = 60 * 60 * 1e3;
async function runGcpAuthRefresh() {
  const gcpAuthRefresh = getConfiguredGcpAuthRefresh();
  if (!gcpAuthRefresh) {
    return false;
  }
  if (isGcpAuthRefreshFromProjectSettings()) {
    const hasTrust = checkHasTrustDialogAccepted();
    if (!hasTrust && !getIsNonInteractiveSession()) {
      const error = new Error(
        `Security: gcpAuthRefresh executed before workspace trust is confirmed. If you see this message, post in ${""}.`
      );
      logAntError("gcpAuthRefresh invoked before trust check", error);
      logEvent("tengu_gcpAuthRefresh_missing_trust", {});
      return false;
    }
  }
  try {
    logForDebugging("Checking GCP credentials validity for auth refresh");
    const isValid = await checkGcpCredentialsValid();
    if (isValid) {
      logForDebugging(
        "GCP credentials are valid, skipping auth refresh command"
      );
      return false;
    }
  } catch {
  }
  return refreshGcpAuth(gcpAuthRefresh);
}
const GCP_AUTH_REFRESH_TIMEOUT_MS = 3 * 60 * 1e3;
function refreshGcpAuth(gcpAuthRefresh) {
  logForDebugging("Running GCP auth refresh command");
  const authStatusManager = AwsAuthStatusManager.getInstance();
  authStatusManager.startAuthentication();
  return new Promise((resolve) => {
    const refreshProc = exec(gcpAuthRefresh, {
      timeout: GCP_AUTH_REFRESH_TIMEOUT_MS
    });
    refreshProc.stdout.on("data", (data) => {
      const output = data.toString().trim();
      if (output) {
        authStatusManager.addOutput(output);
        logForDebugging(output, { level: "debug" });
      }
    });
    refreshProc.stderr.on("data", (data) => {
      const error = data.toString().trim();
      if (error) {
        authStatusManager.setError(error);
        logForDebugging(error, { level: "error" });
      }
    });
    refreshProc.on("close", (code, signal) => {
      if (code === 0) {
        logForDebugging("GCP auth refresh completed successfully");
        authStatusManager.endAuthentication(true);
        void resolve(true);
      } else {
        const timedOut = signal === "SIGTERM";
        const message = timedOut ? chalk.red(
          "GCP auth refresh timed out after 3 minutes. Run your auth command manually in a separate terminal."
        ) : chalk.red(
          "Error running gcpAuthRefresh (in settings or ~/.claude.json):"
        );
        console.error(message);
        authStatusManager.endAuthentication(false);
        void resolve(false);
      }
    });
  });
}
const refreshGcpCredentialsIfNeeded = memoizeWithTTLAsync(
  async () => {
    const refreshed = await runGcpAuthRefresh();
    return refreshed;
  },
  DEFAULT_GCP_CREDENTIAL_TTL
);
function clearGcpCredentialsCache() {
  refreshGcpCredentialsIfNeeded.cache.clear();
}
function prefetchGcpCredentialsIfSafe() {
  const gcpAuthRefresh = getConfiguredGcpAuthRefresh();
  if (!gcpAuthRefresh) {
    return;
  }
  if (isGcpAuthRefreshFromProjectSettings()) {
    const hasTrust = checkHasTrustDialogAccepted();
    if (!hasTrust && !getIsNonInteractiveSession()) {
      return;
    }
  }
  void refreshGcpCredentialsIfNeeded();
}
function prefetchAwsCredentialsAndBedRockInfoIfSafe() {
  const awsAuthRefresh = getConfiguredAwsAuthRefresh();
  const awsCredentialExport = getConfiguredAwsCredentialExport();
  if (!awsAuthRefresh && !awsCredentialExport) {
    return;
  }
  if (isAwsAuthRefreshFromProjectSettings() || isAwsCredentialExportFromProjectSettings()) {
    const hasTrust = checkHasTrustDialogAccepted();
    if (!hasTrust && !getIsNonInteractiveSession()) {
      return;
    }
  }
  void refreshAndGetAwsCredentials();
  getModelStrings();
}
const getApiKeyFromConfigOrMacOSKeychain = memoize(
  () => {
    if (isBareMode()) return null;
    if (process.platform === "darwin") {
      const prefetch = getLegacyApiKeyPrefetchResult();
      if (prefetch) {
        if (prefetch.stdout) {
          return { key: prefetch.stdout, source: "/login managed key" };
        }
      } else {
        const storageServiceName = getMacOsKeychainStorageServiceName();
        try {
          const result = execSyncWithDefaults_DEPRECATED(
            `security find-generic-password -a $USER -w -s "${storageServiceName}"`
          );
          if (result) {
            return { key: result, source: "/login managed key" };
          }
        } catch (e) {
          logError(e);
        }
      }
    }
    const config = getGlobalConfig();
    if (!config.primaryApiKey) {
      return null;
    }
    return { key: config.primaryApiKey, source: "/login managed key" };
  }
);
function isValidApiKey(apiKey) {
  return /^[a-zA-Z0-9-_]+$/.test(apiKey);
}
async function saveApiKey(apiKey) {
  if (!isValidApiKey(apiKey)) {
    throw new Error(
      "Invalid API key format. API key must contain only alphanumeric characters, dashes, and underscores."
    );
  }
  await maybeRemoveApiKeyFromMacOSKeychain();
  let savedToKeychain = false;
  if (process.platform === "darwin") {
    try {
      const storageServiceName = getMacOsKeychainStorageServiceName();
      const username = getUsername();
      const hexValue = Buffer.from(apiKey, "utf-8").toString("hex");
      const command = `add-generic-password -U -a "${username}" -s "${storageServiceName}" -X "${hexValue}"
`;
      await execa("security", ["-i"], {
        input: command,
        reject: false
      });
      logEvent("tengu_api_key_saved_to_keychain", {});
      savedToKeychain = true;
    } catch (e) {
      logError(e);
      logEvent("tengu_api_key_keychain_error", {
        error: errorMessage(
          e
        )
      });
      logEvent("tengu_api_key_saved_to_config", {});
    }
  } else {
    logEvent("tengu_api_key_saved_to_config", {});
  }
  const normalizedKey = normalizeApiKeyForConfig(apiKey);
  saveGlobalConfig((current) => {
    const approved = current.customApiKeyResponses?.approved ?? [];
    return {
      ...current,
      // Only save to config if keychain save failed or not on darwin
      primaryApiKey: savedToKeychain ? current.primaryApiKey : apiKey,
      customApiKeyResponses: {
        ...current.customApiKeyResponses,
        approved: approved.includes(normalizedKey) ? approved : [...approved, normalizedKey],
        rejected: current.customApiKeyResponses?.rejected ?? []
      }
    };
  });
  getApiKeyFromConfigOrMacOSKeychain.cache.clear?.();
  clearLegacyApiKeyPrefetch();
}
function isCustomApiKeyApproved(apiKey) {
  const config = getGlobalConfig();
  const normalizedKey = normalizeApiKeyForConfig(apiKey);
  return config.customApiKeyResponses?.approved?.includes(normalizedKey) ?? false;
}
async function removeApiKey() {
  await maybeRemoveApiKeyFromMacOSKeychain();
  saveGlobalConfig((current) => ({
    ...current,
    primaryApiKey: void 0
  }));
  getApiKeyFromConfigOrMacOSKeychain.cache.clear?.();
  clearLegacyApiKeyPrefetch();
}
async function maybeRemoveApiKeyFromMacOSKeychain() {
  try {
    await maybeRemoveApiKeyFromMacOSKeychainThrows();
  } catch (e) {
    logError(e);
  }
}
function saveOAuthTokensIfNeeded(tokens) {
  if (!shouldUseClaudeAIAuth(tokens.scopes)) {
    logEvent("tengu_oauth_tokens_not_claude_ai", {});
    return { success: true };
  }
  if (!tokens.refreshToken || !tokens.expiresAt) {
    logEvent("tengu_oauth_tokens_inference_only", {});
    return { success: true };
  }
  const secureStorage = getSecureStorage();
  const storageBackend = secureStorage.name;
  try {
    const storageData = secureStorage.read() || {};
    const existingOauth = storageData.claudeAiOauth;
    storageData.claudeAiOauth = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      // Profile fetch in refreshOAuthToken swallows errors and returns null on
      // transient failures (network, 5xx, rate limit). Don't clobber a valid
      // stored subscription with null — fall back to the existing value.
      subscriptionType: tokens.subscriptionType ?? existingOauth?.subscriptionType ?? null,
      rateLimitTier: tokens.rateLimitTier ?? existingOauth?.rateLimitTier ?? null
    };
    const updateStatus = secureStorage.update(storageData);
    if (updateStatus.success) {
      logEvent("tengu_oauth_tokens_saved", { storageBackend });
    } else {
      logEvent("tengu_oauth_tokens_save_failed", { storageBackend });
    }
    getClaudeAIOAuthTokens.cache?.clear?.();
    clearBetasCaches();
    clearToolSchemaCache();
    return updateStatus;
  } catch (error) {
    logError(error);
    logEvent("tengu_oauth_tokens_save_exception", {
      storageBackend,
      error: errorMessage(
        error
      )
    });
    return { success: false, warning: "Failed to save OAuth tokens" };
  }
}
const getClaudeAIOAuthTokens = memoize(() => {
  if (isBareMode()) return null;
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return {
      accessToken: process.env.CLAUDE_CODE_OAUTH_TOKEN,
      refreshToken: null,
      expiresAt: null,
      scopes: ["user:inference"],
      subscriptionType: null,
      rateLimitTier: null
    };
  }
  const oauthTokenFromFd = getOAuthTokenFromFileDescriptor();
  if (oauthTokenFromFd) {
    return {
      accessToken: oauthTokenFromFd,
      refreshToken: null,
      expiresAt: null,
      scopes: ["user:inference"],
      subscriptionType: null,
      rateLimitTier: null
    };
  }
  try {
    const secureStorage = getSecureStorage();
    const storageData = secureStorage.read();
    const oauthData = storageData?.claudeAiOauth;
    if (!oauthData?.accessToken) {
      return null;
    }
    return oauthData;
  } catch (error) {
    logError(error);
    return null;
  }
});
function clearOAuthTokenCache() {
  getClaudeAIOAuthTokens.cache?.clear?.();
  clearKeychainCache();
}
let lastCredentialsMtimeMs = 0;
async function invalidateOAuthCacheIfDiskChanged() {
  try {
    const { mtimeMs } = await stat(
      join(getClaudeConfigHomeDir(), ".credentials.json")
    );
    if (mtimeMs !== lastCredentialsMtimeMs) {
      lastCredentialsMtimeMs = mtimeMs;
      clearOAuthTokenCache();
    }
  } catch {
    getClaudeAIOAuthTokens.cache?.clear?.();
  }
}
const pending401Handlers = /* @__PURE__ */ new Map();
function handleOAuth401Error(failedAccessToken) {
  const pending = pending401Handlers.get(failedAccessToken);
  if (pending) return pending;
  const promise = handleOAuth401ErrorImpl(failedAccessToken).finally(() => {
    pending401Handlers.delete(failedAccessToken);
  });
  pending401Handlers.set(failedAccessToken, promise);
  return promise;
}
async function handleOAuth401ErrorImpl(failedAccessToken) {
  clearOAuthTokenCache();
  const currentTokens = await getClaudeAIOAuthTokensAsync();
  if (!currentTokens?.refreshToken) {
    return false;
  }
  if (currentTokens.accessToken !== failedAccessToken) {
    logEvent("tengu_oauth_401_recovered_from_keychain", {});
    return true;
  }
  return checkAndRefreshOAuthTokenIfNeeded(0, true);
}
async function getClaudeAIOAuthTokensAsync() {
  if (isBareMode()) return null;
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN || getOAuthTokenFromFileDescriptor()) {
    return getClaudeAIOAuthTokens();
  }
  try {
    const secureStorage = getSecureStorage();
    const storageData = await secureStorage.readAsync();
    const oauthData = storageData?.claudeAiOauth;
    if (!oauthData?.accessToken) {
      return null;
    }
    return oauthData;
  } catch (error) {
    logError(error);
    return null;
  }
}
let pendingRefreshCheck = null;
function checkAndRefreshOAuthTokenIfNeeded(retryCount = 0, force = false) {
  if (retryCount === 0 && !force) {
    if (pendingRefreshCheck) {
      return pendingRefreshCheck;
    }
    const promise = checkAndRefreshOAuthTokenIfNeededImpl(retryCount, force);
    pendingRefreshCheck = promise.finally(() => {
      pendingRefreshCheck = null;
    });
    return pendingRefreshCheck;
  }
  return checkAndRefreshOAuthTokenIfNeededImpl(retryCount, force);
}
async function checkAndRefreshOAuthTokenIfNeededImpl(retryCount, force) {
  const MAX_RETRIES = 5;
  await invalidateOAuthCacheIfDiskChanged();
  const tokens = getClaudeAIOAuthTokens();
  if (!force) {
    if (!tokens?.refreshToken || !isOAuthTokenExpired(tokens.expiresAt)) {
      return false;
    }
  }
  if (!tokens?.refreshToken) {
    return false;
  }
  if (!shouldUseClaudeAIAuth(tokens.scopes)) {
    return false;
  }
  getClaudeAIOAuthTokens.cache?.clear?.();
  clearKeychainCache();
  const freshTokens = await getClaudeAIOAuthTokensAsync();
  if (!freshTokens?.refreshToken || !isOAuthTokenExpired(freshTokens.expiresAt)) {
    return false;
  }
  const claudeDir = getClaudeConfigHomeDir();
  await mkdir(claudeDir, { recursive: true });
  let release;
  try {
    logEvent("tengu_oauth_token_refresh_lock_acquiring", {});
    release = await lockfile.lock(claudeDir);
    logEvent("tengu_oauth_token_refresh_lock_acquired", {});
  } catch (err) {
    if (err.code === "ELOCKED") {
      if (retryCount < MAX_RETRIES) {
        logEvent("tengu_oauth_token_refresh_lock_retry", {
          retryCount: retryCount + 1
        });
        await sleep(1e3 + Math.random() * 1e3);
        return checkAndRefreshOAuthTokenIfNeededImpl(retryCount + 1, force);
      }
      logEvent("tengu_oauth_token_refresh_lock_retry_limit_reached", {
        maxRetries: MAX_RETRIES
      });
      return false;
    }
    logError(err);
    logEvent("tengu_oauth_token_refresh_lock_error", {
      error: errorMessage(
        err
      )
    });
    return false;
  }
  try {
    getClaudeAIOAuthTokens.cache?.clear?.();
    clearKeychainCache();
    const lockedTokens = await getClaudeAIOAuthTokensAsync();
    if (!lockedTokens?.refreshToken || !isOAuthTokenExpired(lockedTokens.expiresAt)) {
      logEvent("tengu_oauth_token_refresh_race_resolved", {});
      return false;
    }
    logEvent("tengu_oauth_token_refresh_starting", {});
    const refreshedTokens = await refreshOAuthToken(lockedTokens.refreshToken, {
      // For Claude.ai subscribers, omit scopes so the default
      // CLAUDE_AI_OAUTH_SCOPES applies — this allows scope expansion
      // (e.g. adding user:file_upload) on refresh without re-login.
      scopes: shouldUseClaudeAIAuth(lockedTokens.scopes) ? void 0 : lockedTokens.scopes
    });
    saveOAuthTokensIfNeeded(refreshedTokens);
    getClaudeAIOAuthTokens.cache?.clear?.();
    clearKeychainCache();
    return true;
  } catch (error) {
    logError(error);
    getClaudeAIOAuthTokens.cache?.clear?.();
    clearKeychainCache();
    const currentTokens = await getClaudeAIOAuthTokensAsync();
    if (currentTokens && !isOAuthTokenExpired(currentTokens.expiresAt)) {
      logEvent("tengu_oauth_token_refresh_race_recovered", {});
      return true;
    }
    return false;
  } finally {
    logEvent("tengu_oauth_token_refresh_lock_releasing", {});
    await release();
    logEvent("tengu_oauth_token_refresh_lock_released", {});
  }
}
function isClaudeAISubscriber() {
  if (!isAnthropicAuthEnabled()) {
    return false;
  }
  return shouldUseClaudeAIAuth(getClaudeAIOAuthTokens()?.scopes);
}
function hasProfileScope() {
  return getClaudeAIOAuthTokens()?.scopes?.includes(CLAUDE_AI_PROFILE_SCOPE) ?? false;
}
function is1PApiCustomer() {
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) || isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) || isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) {
    return false;
  }
  if (isClaudeAISubscriber()) {
    return false;
  }
  return true;
}
function getOauthAccountInfo() {
  return isAnthropicAuthEnabled() ? getGlobalConfig().oauthAccount : void 0;
}
function isOverageProvisioningAllowed() {
  const accountInfo = getOauthAccountInfo();
  const billingType = accountInfo?.billingType;
  if (!isClaudeAISubscriber() || !billingType) {
    return false;
  }
  if (billingType !== "stripe_subscription" && billingType !== "stripe_subscription_contracted" && billingType !== "apple_subscription" && billingType !== "google_play_subscription") {
    return false;
  }
  return true;
}
function hasOpusAccess() {
  const subscriptionType = getSubscriptionType();
  return subscriptionType === "max" || subscriptionType === "enterprise" || subscriptionType === "team" || subscriptionType === "pro" || // subscriptionType === null covers both API users and the case where
  // subscribers do not have subscription type populated. For those
  // subscribers, when in doubt, we should not limit their access to Opus.
  subscriptionType === null;
}
function getSubscriptionType() {
  if (shouldUseMockSubscription()) {
    return getMockSubscriptionType();
  }
  if (!isAnthropicAuthEnabled()) {
    return null;
  }
  const oauthTokens = getClaudeAIOAuthTokens();
  if (!oauthTokens) {
    return null;
  }
  return oauthTokens.subscriptionType ?? null;
}
function isMaxSubscriber() {
  return getSubscriptionType() === "max";
}
function isTeamSubscriber() {
  return getSubscriptionType() === "team";
}
function isTeamPremiumSubscriber() {
  return getSubscriptionType() === "team" && getRateLimitTier() === "default_claude_max_5x";
}
function isEnterpriseSubscriber() {
  return getSubscriptionType() === "enterprise";
}
function isProSubscriber() {
  return getSubscriptionType() === "pro";
}
function getRateLimitTier() {
  if (!isAnthropicAuthEnabled()) {
    return null;
  }
  const oauthTokens = getClaudeAIOAuthTokens();
  if (!oauthTokens) {
    return null;
  }
  return oauthTokens.rateLimitTier ?? null;
}
function getSubscriptionName() {
  const subscriptionType = getSubscriptionType();
  switch (subscriptionType) {
    case "enterprise":
      return "Claude Enterprise";
    case "team":
      return "Claude Team";
    case "max":
      return "Claude Max";
    case "pro":
      return "Claude Pro";
    default:
      return "Claude API";
  }
}
function isUsing3PServices() {
  return !!(isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) || isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) || isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY));
}
function getConfiguredOtelHeadersHelper() {
  const mergedSettings = getSettings_DEPRECATED() || {};
  return mergedSettings.otelHeadersHelper;
}
function isOtelHeadersHelperFromProjectOrLocalSettings() {
  const otelHeadersHelper = getConfiguredOtelHeadersHelper();
  if (!otelHeadersHelper) {
    return false;
  }
  const projectSettings = getSettingsForSource("projectSettings");
  const localSettings = getSettingsForSource("localSettings");
  return projectSettings?.otelHeadersHelper === otelHeadersHelper || localSettings?.otelHeadersHelper === otelHeadersHelper;
}
let cachedOtelHeaders = null;
let cachedOtelHeadersTimestamp = 0;
const DEFAULT_OTEL_HEADERS_DEBOUNCE_MS = 29 * 60 * 1e3;
function getOtelHeadersFromHelper() {
  const otelHeadersHelper = getConfiguredOtelHeadersHelper();
  if (!otelHeadersHelper) {
    return {};
  }
  const debounceMs = parseInt(
    process.env.CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS || DEFAULT_OTEL_HEADERS_DEBOUNCE_MS.toString()
  );
  if (cachedOtelHeaders && Date.now() - cachedOtelHeadersTimestamp < debounceMs) {
    return cachedOtelHeaders;
  }
  if (isOtelHeadersHelperFromProjectOrLocalSettings()) {
    const hasTrust = checkHasTrustDialogAccepted();
    if (!hasTrust) {
      return {};
    }
  }
  try {
    const result = execSyncWithDefaults_DEPRECATED(otelHeadersHelper, {
      timeout: 3e4
      // 30 seconds - allows for auth service latency
    })?.toString().trim();
    if (!result) {
      throw new Error("otelHeadersHelper did not return a valid value");
    }
    const headers = jsonParse(result);
    if (typeof headers !== "object" || headers === null || Array.isArray(headers)) {
      throw new Error(
        "otelHeadersHelper must return a JSON object with string key-value pairs"
      );
    }
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== "string") {
        throw new Error(
          `otelHeadersHelper returned non-string value for key "${key}": ${typeof value}`
        );
      }
    }
    cachedOtelHeaders = headers;
    cachedOtelHeadersTimestamp = Date.now();
    return cachedOtelHeaders;
  } catch (error) {
    logError(
      new Error(
        `Error getting OpenTelemetry headers from otelHeadersHelper (in settings): ${errorMessage(error)}`
      )
    );
    throw error;
  }
}
function isConsumerPlan(plan) {
  return plan === "max" || plan === "pro";
}
function isConsumerSubscriber() {
  const subscriptionType = getSubscriptionType();
  return isClaudeAISubscriber() && subscriptionType !== null && isConsumerPlan(subscriptionType);
}
function getAccountInformation() {
  const apiProvider = getAPIProvider();
  if (apiProvider !== "firstParty") {
    return void 0;
  }
  const { source: authTokenSource } = getAuthTokenSource();
  const accountInfo = {};
  if (authTokenSource === "CLAUDE_CODE_OAUTH_TOKEN" || authTokenSource === "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR") {
    accountInfo.tokenSource = authTokenSource;
  } else if (isClaudeAISubscriber()) {
    accountInfo.subscription = getSubscriptionName();
  } else {
    accountInfo.tokenSource = authTokenSource;
  }
  const { key: apiKey, source: apiKeySource } = getAnthropicApiKeyWithSource();
  if (apiKey) {
    accountInfo.apiKeySource = apiKeySource;
  }
  if (authTokenSource === "claude.ai" || apiKeySource === "/login managed key") {
    const orgName = getOauthAccountInfo()?.organizationName;
    if (orgName) {
      accountInfo.organization = orgName;
    }
  }
  const email = getOauthAccountInfo()?.emailAddress;
  if ((authTokenSource === "claude.ai" || apiKeySource === "/login managed key") && email) {
    accountInfo.email = email;
  }
  return accountInfo;
}
async function validateForceLoginOrg() {
  if (process.env.ANTHROPIC_UNIX_SOCKET) {
    return { valid: true };
  }
  if (!isAnthropicAuthEnabled()) {
    return { valid: true };
  }
  const requiredOrgUuid = getSettingsForSource("policySettings")?.forceLoginOrgUUID;
  if (!requiredOrgUuid) {
    return { valid: true };
  }
  await checkAndRefreshOAuthTokenIfNeeded();
  const tokens = getClaudeAIOAuthTokens();
  if (!tokens) {
    return { valid: true };
  }
  const { source } = getAuthTokenSource();
  const isEnvVarToken = source === "CLAUDE_CODE_OAUTH_TOKEN" || source === "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR";
  const profile = await getOauthProfileFromOauthToken(tokens.accessToken);
  if (!profile) {
    return {
      valid: false,
      message: `Unable to verify organization for the current authentication token.
This machine requires organization ${requiredOrgUuid} but the profile could not be fetched.
This may be a network error, or the token may lack the user:profile scope required for
verification (tokens from 'claude setup-token' do not include this scope).
Try again, or obtain a full-scope token via 'claude auth login'.`
    };
  }
  const tokenOrgUuid = profile.organization.uuid;
  if (tokenOrgUuid === requiredOrgUuid) {
    return { valid: true };
  }
  if (isEnvVarToken) {
    const envVarName = source === "CLAUDE_CODE_OAUTH_TOKEN" ? "CLAUDE_CODE_OAUTH_TOKEN" : "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR";
    return {
      valid: false,
      message: `The ${envVarName} environment variable provides a token for a
different organization than required by this machine's managed settings.

Required organization: ${requiredOrgUuid}
Token organization:   ${tokenOrgUuid}

Remove the environment variable or obtain a token for the correct organization.`
    };
  }
  return {
    valid: false,
    message: `Your authentication token belongs to organization ${tokenOrgUuid},
but this machine requires organization ${requiredOrgUuid}.

Please log in with the correct organization: claude auth login`
  };
}
class GcpCredentialsTimeoutError extends Error {
}
export {
  calculateApiKeyHelperTTL,
  checkAndRefreshOAuthTokenIfNeeded,
  checkGcpCredentialsValid,
  clearApiKeyHelperCache,
  clearAwsCredentialsCache,
  clearGcpCredentialsCache,
  clearOAuthTokenCache,
  getAccountInformation,
  getAnthropicApiKey,
  getAnthropicApiKeyWithSource,
  getApiKeyFromApiKeyHelper,
  getApiKeyFromApiKeyHelperCached,
  getApiKeyFromConfigOrMacOSKeychain,
  getApiKeyHelperElapsedMs,
  getAuthTokenSource,
  getClaudeAIOAuthTokens,
  getClaudeAIOAuthTokensAsync,
  getConfiguredApiKeyHelper,
  getOauthAccountInfo,
  getOtelHeadersFromHelper,
  getRateLimitTier,
  getSubscriptionName,
  getSubscriptionType,
  handleOAuth401Error,
  hasAnthropicApiKeyAuth,
  hasOpusAccess,
  hasProfileScope,
  is1PApiCustomer,
  isAnthropicAuthEnabled,
  isAwsAuthRefreshFromProjectSettings,
  isAwsCredentialExportFromProjectSettings,
  isClaudeAISubscriber,
  isConsumerSubscriber,
  isCustomApiKeyApproved,
  isEnterpriseSubscriber,
  isGcpAuthRefreshFromProjectSettings,
  isMaxSubscriber,
  isOtelHeadersHelperFromProjectOrLocalSettings,
  isOverageProvisioningAllowed,
  isProSubscriber,
  isTeamPremiumSubscriber,
  isTeamSubscriber,
  isUsing3PServices,
  prefetchApiKeyFromApiKeyHelperIfSafe,
  prefetchAwsCredentialsAndBedRockInfoIfSafe,
  prefetchGcpCredentialsIfSafe,
  refreshAndGetAwsCredentials,
  refreshAwsAuth,
  refreshGcpAuth,
  refreshGcpCredentialsIfNeeded,
  removeApiKey,
  saveApiKey,
  saveOAuthTokensIfNeeded,
  validateForceLoginOrg
};
