import { execa } from "execa";
import memoize from "lodash-es/memoize.js";
import { getSessionId } from "../bootstrap/state.js";
import {
  getOauthAccountInfo,
  getRateLimitTier,
  getSubscriptionType
} from "./auth.js";
import { getGlobalConfig, getOrCreateUserID } from "./config.js";
import { getCwd } from "./cwd.js";
import { getHostPlatformForAnalytics } from "./env.js";
import { isEnvTruthy } from "./envUtils.js";
let cachedEmail = null;
let emailFetchPromise = null;
async function initUser() {
  if (cachedEmail === null && !emailFetchPromise) {
    emailFetchPromise = getEmailAsync();
    cachedEmail = await emailFetchPromise;
    emailFetchPromise = null;
    getCoreUserData.cache.clear?.();
  }
}
function resetUserCache() {
  cachedEmail = null;
  emailFetchPromise = null;
  getCoreUserData.cache.clear?.();
  getGitEmail.cache.clear?.();
}
const getCoreUserData = memoize(
  (includeAnalyticsMetadata) => {
    const deviceId = getOrCreateUserID();
    const config = getGlobalConfig();
    let subscriptionType;
    let rateLimitTier;
    let firstTokenTime;
    if (includeAnalyticsMetadata) {
      subscriptionType = getSubscriptionType() ?? void 0;
      rateLimitTier = getRateLimitTier() ?? void 0;
      if (subscriptionType && config.claudeCodeFirstTokenDate) {
        const configFirstTokenTime = new Date(
          config.claudeCodeFirstTokenDate
        ).getTime();
        if (!isNaN(configFirstTokenTime)) {
          firstTokenTime = configFirstTokenTime;
        }
      }
    }
    const oauthAccount = getOauthAccountInfo();
    const organizationUuid = oauthAccount?.organizationUuid;
    const accountUuid = oauthAccount?.accountUuid;
    return {
      deviceId,
      sessionId: getSessionId(),
      email: getEmail(),
      appVersion: "0.0.0-dev",
      platform: getHostPlatformForAnalytics(),
      organizationUuid,
      accountUuid,
      userType: process.env.USER_TYPE,
      subscriptionType,
      rateLimitTier,
      firstTokenTime,
      ...isEnvTruthy(process.env.GITHUB_ACTIONS) && {
        githubActionsMetadata: {
          actor: process.env.GITHUB_ACTOR,
          actorId: process.env.GITHUB_ACTOR_ID,
          repository: process.env.GITHUB_REPOSITORY,
          repositoryId: process.env.GITHUB_REPOSITORY_ID,
          repositoryOwner: process.env.GITHUB_REPOSITORY_OWNER,
          repositoryOwnerId: process.env.GITHUB_REPOSITORY_OWNER_ID
        }
      }
    };
  }
);
function getUserForGrowthBook() {
  return getCoreUserData(true);
}
function getEmail() {
  if (cachedEmail !== null) {
    return cachedEmail;
  }
  const oauthAccount = getOauthAccountInfo();
  if (oauthAccount?.emailAddress) {
    return oauthAccount.emailAddress;
  }
  if (process.env.USER_TYPE !== "ant") {
    return void 0;
  }
  if (process.env.COO_CREATOR) {
    return `${process.env.COO_CREATOR}@anthropic.com`;
  }
  return void 0;
}
async function getEmailAsync() {
  const oauthAccount = getOauthAccountInfo();
  if (oauthAccount?.emailAddress) {
    return oauthAccount.emailAddress;
  }
  if (process.env.USER_TYPE !== "ant") {
    return void 0;
  }
  if (process.env.COO_CREATOR) {
    return `${process.env.COO_CREATOR}@anthropic.com`;
  }
  return getGitEmail();
}
const getGitEmail = memoize(async () => {
  const result = await execa("git config --get user.email", {
    shell: true,
    reject: false,
    cwd: getCwd()
  });
  return result.exitCode === 0 && result.stdout ? result.stdout.trim() : void 0;
});
export {
  getCoreUserData,
  getGitEmail,
  getUserForGrowthBook,
  initUser,
  resetUserCache
};
