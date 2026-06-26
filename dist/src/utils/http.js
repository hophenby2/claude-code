import axios from "axios";
import { OAUTH_BETA_HEADER } from "../constants/oauth.js";
import {
  getAnthropicApiKey,
  getClaudeAIOAuthTokens,
  handleOAuth401Error,
  isClaudeAISubscriber
} from "./auth.js";
import { getClaudeCodeUserAgent } from "./userAgent.js";
import { getWorkload } from "./workloadContext.js";
function getUserAgent() {
  const agentSdkVersion = process.env.CLAUDE_AGENT_SDK_VERSION ? `, agent-sdk/${process.env.CLAUDE_AGENT_SDK_VERSION}` : "";
  const clientApp = process.env.CLAUDE_AGENT_SDK_CLIENT_APP ? `, client-app/${process.env.CLAUDE_AGENT_SDK_CLIENT_APP}` : "";
  const workload = getWorkload();
  const workloadSuffix = workload ? `, workload/${workload}` : "";
  return `claude-cli/${"0.0.0"} (${process.env.USER_TYPE}, ${process.env.CLAUDE_CODE_ENTRYPOINT ?? "cli"}${agentSdkVersion}${clientApp}${workloadSuffix})`;
}
function getMCPUserAgent() {
  const parts = [];
  if (process.env.CLAUDE_CODE_ENTRYPOINT) {
    parts.push(process.env.CLAUDE_CODE_ENTRYPOINT);
  }
  if (process.env.CLAUDE_AGENT_SDK_VERSION) {
    parts.push(`agent-sdk/${process.env.CLAUDE_AGENT_SDK_VERSION}`);
  }
  if (process.env.CLAUDE_AGENT_SDK_CLIENT_APP) {
    parts.push(`client-app/${process.env.CLAUDE_AGENT_SDK_CLIENT_APP}`);
  }
  const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `claude-code/${"0.0.0"}${suffix}`;
}
function getWebFetchUserAgent() {
  return `Claude-User (${getClaudeCodeUserAgent()}; +https://support.anthropic.com/)`;
}
function getAuthHeaders() {
  if (isClaudeAISubscriber()) {
    const oauthTokens = getClaudeAIOAuthTokens();
    if (!oauthTokens?.accessToken) {
      return {
        headers: {},
        error: "No OAuth token available"
      };
    }
    return {
      headers: {
        Authorization: `Bearer ${oauthTokens.accessToken}`,
        "anthropic-beta": OAUTH_BETA_HEADER
      }
    };
  }
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return {
      headers: {},
      error: "No API key available"
    };
  }
  return {
    headers: {
      "x-api-key": apiKey
    }
  };
}
async function withOAuth401Retry(request, opts) {
  try {
    return await request();
  } catch (err) {
    if (!axios.isAxiosError(err)) throw err;
    const status = err.response?.status;
    const isAuthError = status === 401 || opts?.also403Revoked && status === 403 && typeof err.response?.data === "string" && err.response.data.includes("OAuth token has been revoked");
    if (!isAuthError) throw err;
    const failedAccessToken = getClaudeAIOAuthTokens()?.accessToken;
    if (!failedAccessToken) throw err;
    await handleOAuth401Error(failedAccessToken);
    return await request();
  }
}
export {
  getAuthHeaders,
  getMCPUserAgent,
  getUserAgent,
  getWebFetchUserAgent,
  withOAuth401Retry
};
