import { getOauthConfig } from "../constants/oauth.js";
import { getClaudeAIOAuthTokens } from "../utils/auth.js";
function getBridgeTokenOverride() {
  return process.env.USER_TYPE === "ant" && process.env.CLAUDE_BRIDGE_OAUTH_TOKEN || void 0;
}
function getBridgeBaseUrlOverride() {
  return process.env.USER_TYPE === "ant" && process.env.CLAUDE_BRIDGE_BASE_URL || void 0;
}
function getBridgeAccessToken() {
  return getBridgeTokenOverride() ?? getClaudeAIOAuthTokens()?.accessToken;
}
function getBridgeBaseUrl() {
  return getBridgeBaseUrlOverride() ?? getOauthConfig().BASE_API_URL;
}
export {
  getBridgeAccessToken,
  getBridgeBaseUrl,
  getBridgeBaseUrlOverride,
  getBridgeTokenOverride
};
