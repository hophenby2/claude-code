import axios from "axios";
import {
  logEvent
} from "../analytics/index.js";
import {
  ALL_OAUTH_SCOPES,
  CLAUDE_AI_INFERENCE_SCOPE,
  CLAUDE_AI_OAUTH_SCOPES,
  getOauthConfig
} from "../../constants/oauth.js";
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  hasProfileScope,
  isClaudeAISubscriber,
  saveApiKey
} from "../../utils/auth.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
import { logForDebugging } from "../../utils/debug.js";
import { getOauthProfileFromOauthToken } from "./getOauthProfile.js";
function shouldUseClaudeAIAuth(scopes) {
  return Boolean(scopes?.includes(CLAUDE_AI_INFERENCE_SCOPE));
}
function parseScopes(scopeString) {
  return scopeString?.split(" ").filter(Boolean) ?? [];
}
function buildAuthUrl({
  codeChallenge,
  state,
  port,
  isManual,
  loginWithClaudeAi,
  inferenceOnly,
  orgUUID,
  loginHint,
  loginMethod
}) {
  const authUrlBase = loginWithClaudeAi ? getOauthConfig().CLAUDE_AI_AUTHORIZE_URL : getOauthConfig().CONSOLE_AUTHORIZE_URL;
  const authUrl = new URL(authUrlBase);
  authUrl.searchParams.append("code", "true");
  authUrl.searchParams.append("client_id", getOauthConfig().CLIENT_ID);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append(
    "redirect_uri",
    isManual ? getOauthConfig().MANUAL_REDIRECT_URL : `http://localhost:${port}/callback`
  );
  const scopesToUse = inferenceOnly ? [CLAUDE_AI_INFERENCE_SCOPE] : ALL_OAUTH_SCOPES;
  authUrl.searchParams.append("scope", scopesToUse.join(" "));
  authUrl.searchParams.append("code_challenge", codeChallenge);
  authUrl.searchParams.append("code_challenge_method", "S256");
  authUrl.searchParams.append("state", state);
  if (orgUUID) {
    authUrl.searchParams.append("orgUUID", orgUUID);
  }
  if (loginHint) {
    authUrl.searchParams.append("login_hint", loginHint);
  }
  if (loginMethod) {
    authUrl.searchParams.append("login_method", loginMethod);
  }
  return authUrl.toString();
}
async function exchangeCodeForTokens(authorizationCode, state, codeVerifier, port, useManualRedirect = false, expiresIn) {
  const requestBody = {
    grant_type: "authorization_code",
    code: authorizationCode,
    redirect_uri: useManualRedirect ? getOauthConfig().MANUAL_REDIRECT_URL : `http://localhost:${port}/callback`,
    client_id: getOauthConfig().CLIENT_ID,
    code_verifier: codeVerifier,
    state
  };
  if (expiresIn !== void 0) {
    requestBody.expires_in = expiresIn;
  }
  const response = await axios.post(getOauthConfig().TOKEN_URL, requestBody, {
    headers: { "Content-Type": "application/json" },
    timeout: 15e3
  });
  if (response.status !== 200) {
    throw new Error(
      response.status === 401 ? "Authentication failed: Invalid authorization code" : `Token exchange failed (${response.status}): ${response.statusText}`
    );
  }
  logEvent("tengu_oauth_token_exchange_success", {});
  return response.data;
}
async function refreshOAuthToken(refreshToken, { scopes: requestedScopes } = {}) {
  const requestBody = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: getOauthConfig().CLIENT_ID,
    // Request specific scopes, defaulting to the full Claude AI set. The
    // backend's refresh-token grant allows scope expansion beyond what the
    // initial authorize granted (see ALLOWED_SCOPE_EXPANSIONS), so this is
    // safe even for tokens issued before scopes were added to the app's
    // registered oauth_scope.
    scope: (requestedScopes?.length ? requestedScopes : CLAUDE_AI_OAUTH_SCOPES).join(" ")
  };
  try {
    const response = await axios.post(getOauthConfig().TOKEN_URL, requestBody, {
      headers: { "Content-Type": "application/json" },
      timeout: 15e3
    });
    if (response.status !== 200) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }
    const data = response.data;
    const {
      access_token: accessToken,
      refresh_token: newRefreshToken = refreshToken,
      expires_in: expiresIn
    } = data;
    const expiresAt = Date.now() + expiresIn * 1e3;
    const scopes = parseScopes(data.scope);
    logEvent("tengu_oauth_token_refresh_success", {});
    const config = getGlobalConfig();
    const existing = getClaudeAIOAuthTokens();
    const haveProfileAlready = config.oauthAccount?.billingType !== void 0 && config.oauthAccount?.accountCreatedAt !== void 0 && config.oauthAccount?.subscriptionCreatedAt !== void 0 && existing?.subscriptionType != null && existing?.rateLimitTier != null;
    const profileInfo = haveProfileAlready ? null : await fetchProfileInfo(accessToken);
    if (profileInfo && config.oauthAccount) {
      const updates = {};
      if (profileInfo.displayName !== void 0) {
        updates.displayName = profileInfo.displayName;
      }
      if (typeof profileInfo.hasExtraUsageEnabled === "boolean") {
        updates.hasExtraUsageEnabled = profileInfo.hasExtraUsageEnabled;
      }
      if (profileInfo.billingType !== null) {
        updates.billingType = profileInfo.billingType;
      }
      if (profileInfo.accountCreatedAt !== void 0) {
        updates.accountCreatedAt = profileInfo.accountCreatedAt;
      }
      if (profileInfo.subscriptionCreatedAt !== void 0) {
        updates.subscriptionCreatedAt = profileInfo.subscriptionCreatedAt;
      }
      if (Object.keys(updates).length > 0) {
        saveGlobalConfig((current) => ({
          ...current,
          oauthAccount: current.oauthAccount ? { ...current.oauthAccount, ...updates } : current.oauthAccount
        }));
      }
    }
    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresAt,
      scopes,
      subscriptionType: profileInfo?.subscriptionType ?? existing?.subscriptionType ?? null,
      rateLimitTier: profileInfo?.rateLimitTier ?? existing?.rateLimitTier ?? null,
      profile: profileInfo?.rawProfile,
      tokenAccount: data.account ? {
        uuid: data.account.uuid,
        emailAddress: data.account.email_address,
        organizationUuid: data.organization?.uuid
      } : void 0
    };
  } catch (error) {
    const responseBody = axios.isAxiosError(error) && error.response?.data ? JSON.stringify(error.response.data) : void 0;
    logEvent("tengu_oauth_token_refresh_failure", {
      error: error.message,
      ...responseBody && {
        responseBody
      }
    });
    throw error;
  }
}
async function fetchAndStoreUserRoles(accessToken) {
  const response = await axios.get(getOauthConfig().ROLES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (response.status !== 200) {
    throw new Error(`Failed to fetch user roles: ${response.statusText}`);
  }
  const data = response.data;
  const config = getGlobalConfig();
  if (!config.oauthAccount) {
    throw new Error("OAuth account information not found in config");
  }
  saveGlobalConfig((current) => ({
    ...current,
    oauthAccount: current.oauthAccount ? {
      ...current.oauthAccount,
      organizationRole: data.organization_role,
      workspaceRole: data.workspace_role,
      organizationName: data.organization_name
    } : current.oauthAccount
  }));
  logEvent("tengu_oauth_roles_stored", {
    org_role: data.organization_role
  });
}
async function createAndStoreApiKey(accessToken) {
  try {
    const response = await axios.post(getOauthConfig().API_KEY_URL, null, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const apiKey = response.data?.raw_key;
    if (apiKey) {
      await saveApiKey(apiKey);
      logEvent("tengu_oauth_api_key", {
        status: "success",
        statusCode: response.status
      });
      return apiKey;
    }
    return null;
  } catch (error) {
    logEvent("tengu_oauth_api_key", {
      status: "failure",
      error: error instanceof Error ? error.message : String(
        error
      )
    });
    throw error;
  }
}
function isOAuthTokenExpired(expiresAt) {
  if (expiresAt === null) {
    return false;
  }
  const bufferTime = 5 * 60 * 1e3;
  const now = Date.now();
  const expiresWithBuffer = now + bufferTime;
  return expiresWithBuffer >= expiresAt;
}
async function fetchProfileInfo(accessToken) {
  const profile = await getOauthProfileFromOauthToken(accessToken);
  const orgType = profile?.organization?.organization_type;
  let subscriptionType = null;
  switch (orgType) {
    case "claude_max":
      subscriptionType = "max";
      break;
    case "claude_pro":
      subscriptionType = "pro";
      break;
    case "claude_enterprise":
      subscriptionType = "enterprise";
      break;
    case "claude_team":
      subscriptionType = "team";
      break;
    default:
      subscriptionType = null;
      break;
  }
  const result = {
    subscriptionType,
    rateLimitTier: profile?.organization?.rate_limit_tier ?? null,
    hasExtraUsageEnabled: profile?.organization?.has_extra_usage_enabled ?? null,
    billingType: profile?.organization?.billing_type ?? null
  };
  if (profile?.account?.display_name) {
    result.displayName = profile.account.display_name;
  }
  if (profile?.account?.created_at) {
    result.accountCreatedAt = profile.account.created_at;
  }
  if (profile?.organization?.subscription_created_at) {
    result.subscriptionCreatedAt = profile.organization.subscription_created_at;
  }
  logEvent("tengu_oauth_profile_fetch_success", {});
  return { ...result, rawProfile: profile };
}
async function getOrganizationUUID() {
  const globalConfig = getGlobalConfig();
  const orgUUID = globalConfig.oauthAccount?.organizationUuid;
  if (orgUUID) {
    return orgUUID;
  }
  const accessToken = getClaudeAIOAuthTokens()?.accessToken;
  if (accessToken === void 0 || !hasProfileScope()) {
    return null;
  }
  const profile = await getOauthProfileFromOauthToken(accessToken);
  const profileOrgUUID = profile?.organization?.uuid;
  if (!profileOrgUUID) {
    return null;
  }
  return profileOrgUUID;
}
async function populateOAuthAccountInfoIfNeeded() {
  const envAccountUuid = process.env.CLAUDE_CODE_ACCOUNT_UUID;
  const envUserEmail = process.env.CLAUDE_CODE_USER_EMAIL;
  const envOrganizationUuid = process.env.CLAUDE_CODE_ORGANIZATION_UUID;
  const hasEnvVars = Boolean(
    envAccountUuid && envUserEmail && envOrganizationUuid
  );
  if (envAccountUuid && envUserEmail && envOrganizationUuid) {
    if (!getGlobalConfig().oauthAccount) {
      storeOAuthAccountInfo({
        accountUuid: envAccountUuid,
        emailAddress: envUserEmail,
        organizationUuid: envOrganizationUuid
      });
    }
  }
  await checkAndRefreshOAuthTokenIfNeeded();
  const config = getGlobalConfig();
  if (config.oauthAccount && config.oauthAccount.billingType !== void 0 && config.oauthAccount.accountCreatedAt !== void 0 && config.oauthAccount.subscriptionCreatedAt !== void 0 || !isClaudeAISubscriber() || !hasProfileScope()) {
    return false;
  }
  const tokens = getClaudeAIOAuthTokens();
  if (tokens?.accessToken) {
    const profile = await getOauthProfileFromOauthToken(tokens.accessToken);
    if (profile) {
      if (hasEnvVars) {
        logForDebugging(
          "OAuth profile fetch succeeded, overriding env var account info",
          { level: "info" }
        );
      }
      storeOAuthAccountInfo({
        accountUuid: profile.account.uuid,
        emailAddress: profile.account.email,
        organizationUuid: profile.organization.uuid,
        displayName: profile.account.display_name || void 0,
        hasExtraUsageEnabled: profile.organization.has_extra_usage_enabled ?? false,
        billingType: profile.organization.billing_type ?? void 0,
        accountCreatedAt: profile.account.created_at,
        subscriptionCreatedAt: profile.organization.subscription_created_at ?? void 0
      });
      return true;
    }
  }
  return false;
}
function storeOAuthAccountInfo({
  accountUuid,
  emailAddress,
  organizationUuid,
  displayName,
  hasExtraUsageEnabled,
  billingType,
  accountCreatedAt,
  subscriptionCreatedAt
}) {
  const accountInfo = {
    accountUuid,
    emailAddress,
    organizationUuid,
    hasExtraUsageEnabled,
    billingType,
    accountCreatedAt,
    subscriptionCreatedAt
  };
  if (displayName) {
    accountInfo.displayName = displayName;
  }
  saveGlobalConfig((current) => {
    if (current.oauthAccount?.accountUuid === accountInfo.accountUuid && current.oauthAccount?.emailAddress === accountInfo.emailAddress && current.oauthAccount?.organizationUuid === accountInfo.organizationUuid && current.oauthAccount?.displayName === accountInfo.displayName && current.oauthAccount?.hasExtraUsageEnabled === accountInfo.hasExtraUsageEnabled && current.oauthAccount?.billingType === accountInfo.billingType && current.oauthAccount?.accountCreatedAt === accountInfo.accountCreatedAt && current.oauthAccount?.subscriptionCreatedAt === accountInfo.subscriptionCreatedAt) {
      return current;
    }
    return { ...current, oauthAccount: accountInfo };
  });
}
export {
  buildAuthUrl,
  createAndStoreApiKey,
  exchangeCodeForTokens,
  fetchAndStoreUserRoles,
  fetchProfileInfo,
  getOrganizationUUID,
  isOAuthTokenExpired,
  parseScopes,
  populateOAuthAccountInfoIfNeeded,
  refreshOAuthToken,
  shouldUseClaudeAIAuth,
  storeOAuthAccountInfo
};
