import axios from "axios";
import { getOauthConfig, OAUTH_BETA_HEADER } from "../../constants/oauth.js";
import { getAnthropicApiKey } from "../../utils/auth.js";
import { getGlobalConfig } from "../../utils/config.js";
import { logError } from "../../utils/log.js";
async function getOauthProfileFromApiKey() {
  const config = getGlobalConfig();
  const accountUuid = config.oauthAccount?.accountUuid;
  const apiKey = getAnthropicApiKey();
  if (!accountUuid || !apiKey) {
    return;
  }
  const endpoint = `${getOauthConfig().BASE_API_URL}/api/claude_cli_profile`;
  try {
    const response = await axios.get(endpoint, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-beta": OAUTH_BETA_HEADER
      },
      params: {
        account_uuid: accountUuid
      },
      timeout: 1e4
    });
    return response.data;
  } catch (error) {
    logError(error);
  }
}
async function getOauthProfileFromOauthToken(accessToken) {
  const endpoint = `${getOauthConfig().BASE_API_URL}/api/oauth/profile`;
  try {
    const response = await axios.get(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      timeout: 1e4
    });
    return response.data;
  } catch (error) {
    logError(error);
  }
}
export {
  getOauthProfileFromApiKey,
  getOauthProfileFromOauthToken
};
