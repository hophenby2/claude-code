import axios from "axios";
import { getOauthConfig } from "../../../constants/oauth.js";
import { getOrganizationUUID } from "../../../services/oauth/client.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../../services/analytics/growthbook.js";
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  isClaudeAISubscriber
} from "../../auth.js";
import { getCwd } from "../../cwd.js";
import { logForDebugging } from "../../debug.js";
import { detectCurrentRepository } from "../../detectRepository.js";
import { errorMessage } from "../../errors.js";
import { findGitRoot, getIsClean } from "../../git.js";
import { getOAuthHeaders } from "../../teleport/api.js";
import { fetchEnvironments } from "../../teleport/environments.js";
async function checkNeedsClaudeAiLogin() {
  if (!isClaudeAISubscriber()) {
    return false;
  }
  return checkAndRefreshOAuthTokenIfNeeded();
}
async function checkIsGitClean() {
  const isClean = await getIsClean({ ignoreUntracked: true });
  return isClean;
}
async function checkHasRemoteEnvironment() {
  try {
    const environments = await fetchEnvironments();
    return environments.length > 0;
  } catch (error) {
    logForDebugging(`checkHasRemoteEnvironment failed: ${errorMessage(error)}`);
    return false;
  }
}
function checkIsInGitRepo() {
  return findGitRoot(getCwd()) !== null;
}
async function checkHasGitRemote() {
  const repository = await detectCurrentRepository();
  return repository !== null;
}
async function checkGithubAppInstalled(owner, repo, signal) {
  try {
    const accessToken = getClaudeAIOAuthTokens()?.accessToken;
    if (!accessToken) {
      logForDebugging(
        "checkGithubAppInstalled: No access token found, assuming app not installed"
      );
      return false;
    }
    const orgUUID = await getOrganizationUUID();
    if (!orgUUID) {
      logForDebugging(
        "checkGithubAppInstalled: No org UUID found, assuming app not installed"
      );
      return false;
    }
    const url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/code/repos/${owner}/${repo}`;
    const headers = {
      ...getOAuthHeaders(accessToken),
      "x-organization-uuid": orgUUID
    };
    logForDebugging(`Checking GitHub app installation for ${owner}/${repo}`);
    const response = await axios.get(url, {
      headers,
      timeout: 15e3,
      signal
    });
    if (response.status === 200) {
      if (response.data.status) {
        const installed = response.data.status.app_installed;
        logForDebugging(
          `GitHub app ${installed ? "is" : "is not"} installed on ${owner}/${repo}`
        );
        return installed;
      }
      logForDebugging(
        `GitHub app is not installed on ${owner}/${repo} (status is null)`
      );
      return false;
    }
    logForDebugging(
      `checkGithubAppInstalled: Unexpected response status ${response.status}`
    );
    return false;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status && status >= 400 && status < 500) {
        logForDebugging(
          `checkGithubAppInstalled: Got ${status} error, app likely not installed on ${owner}/${repo}`
        );
        return false;
      }
    }
    logForDebugging(`checkGithubAppInstalled error: ${errorMessage(error)}`);
    return false;
  }
}
async function checkGithubTokenSynced() {
  try {
    const accessToken = getClaudeAIOAuthTokens()?.accessToken;
    if (!accessToken) {
      logForDebugging("checkGithubTokenSynced: No access token found");
      return false;
    }
    const orgUUID = await getOrganizationUUID();
    if (!orgUUID) {
      logForDebugging("checkGithubTokenSynced: No org UUID found");
      return false;
    }
    const url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/sync/github/auth`;
    const headers = {
      ...getOAuthHeaders(accessToken),
      "x-organization-uuid": orgUUID
    };
    logForDebugging("Checking if GitHub token is synced via web-setup");
    const response = await axios.get(url, {
      headers,
      timeout: 15e3
    });
    const synced = response.status === 200 && response.data?.is_authenticated === true;
    logForDebugging(
      `GitHub token synced: ${synced} (status=${response.status}, data=${JSON.stringify(response.data)})`
    );
    return synced;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status && status >= 400 && status < 500) {
        logForDebugging(
          `checkGithubTokenSynced: Got ${status}, token not synced`
        );
        return false;
      }
    }
    logForDebugging(`checkGithubTokenSynced error: ${errorMessage(error)}`);
    return false;
  }
}
async function checkRepoForRemoteAccess(owner, repo) {
  if (await checkGithubAppInstalled(owner, repo)) {
    return { hasAccess: true, method: "github-app" };
  }
  if (getFeatureValue_CACHED_MAY_BE_STALE("tengu_cobalt_lantern", false) && await checkGithubTokenSynced()) {
    return { hasAccess: true, method: "token-sync" };
  }
  return { hasAccess: false, method: "none" };
}
export {
  checkGithubAppInstalled,
  checkGithubTokenSynced,
  checkHasGitRemote,
  checkHasRemoteEnvironment,
  checkIsGitClean,
  checkIsInGitRepo,
  checkNeedsClaudeAiLogin,
  checkRepoForRemoteAccess
};
