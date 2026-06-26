import axios from "axios";
import { getOauthConfig } from "../../constants/oauth.js";
import {
  getClaudeAIOAuthTokens,
  hasProfileScope,
  isClaudeAISubscriber
} from "../../utils/auth.js";
import { getAuthHeaders } from "../../utils/http.js";
import { getClaudeCodeUserAgent } from "../../utils/userAgent.js";
import { isOAuthTokenExpired } from "../oauth/client.js";
async function fetchUtilization() {
  if (!isClaudeAISubscriber() || !hasProfileScope()) {
    return {};
  }
  const tokens = getClaudeAIOAuthTokens();
  if (tokens && isOAuthTokenExpired(tokens.expiresAt)) {
    return null;
  }
  const authResult = getAuthHeaders();
  if (authResult.error) {
    throw new Error(`Auth error: ${authResult.error}`);
  }
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": getClaudeCodeUserAgent(),
    ...authResult.headers
  };
  const url = `${getOauthConfig().BASE_API_URL}/api/oauth/usage`;
  const response = await axios.get(url, {
    headers,
    timeout: 5e3
    // 5 second timeout
  });
  return response.data;
}
export {
  fetchUtilization
};
