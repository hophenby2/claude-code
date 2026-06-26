import axios from "axios";
import memoize from "lodash-es/memoize.js";
import { getOauthConfig } from "../../constants/oauth.js";
import {
  logEvent
} from "../analytics/index.js";
import { getClaudeAIOAuthTokens } from "../../utils/auth.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
import { logForDebugging } from "../../utils/debug.js";
import { isEnvDefinedFalsy } from "../../utils/envUtils.js";
import { clearMcpAuthCache } from "./client.js";
import { normalizeNameForMCP } from "./normalization.js";
const FETCH_TIMEOUT_MS = 5e3;
const MCP_SERVERS_BETA_HEADER = "mcp-servers-2025-12-04";
const fetchClaudeAIMcpConfigsIfEligible = memoize(
  async () => {
    try {
      if (isEnvDefinedFalsy(process.env.ENABLE_CLAUDEAI_MCP_SERVERS)) {
        logForDebugging("[claudeai-mcp] Disabled via env var");
        logEvent("tengu_claudeai_mcp_eligibility", {
          state: "disabled_env_var"
        });
        return {};
      }
      const tokens = getClaudeAIOAuthTokens();
      if (!tokens?.accessToken) {
        logForDebugging("[claudeai-mcp] No access token");
        logEvent("tengu_claudeai_mcp_eligibility", {
          state: "no_oauth_token"
        });
        return {};
      }
      if (!tokens.scopes?.includes("user:mcp_servers")) {
        logForDebugging(
          `[claudeai-mcp] Missing user:mcp_servers scope (scopes=${tokens.scopes?.join(",") || "none"})`
        );
        logEvent("tengu_claudeai_mcp_eligibility", {
          state: "missing_scope"
        });
        return {};
      }
      const baseUrl = getOauthConfig().BASE_API_URL;
      const url = `${baseUrl}/v1/mcp_servers?limit=1000`;
      logForDebugging(`[claudeai-mcp] Fetching from ${url}`);
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
          "anthropic-beta": MCP_SERVERS_BETA_HEADER,
          "anthropic-version": "2023-06-01"
        },
        timeout: FETCH_TIMEOUT_MS
      });
      const configs = {};
      const usedNormalizedNames = /* @__PURE__ */ new Set();
      for (const server of response.data.data) {
        const baseName = `claude.ai ${server.display_name}`;
        let finalName = baseName;
        let finalNormalized = normalizeNameForMCP(finalName);
        let count = 1;
        while (usedNormalizedNames.has(finalNormalized)) {
          count++;
          finalName = `${baseName} (${count})`;
          finalNormalized = normalizeNameForMCP(finalName);
        }
        usedNormalizedNames.add(finalNormalized);
        configs[finalName] = {
          type: "claudeai-proxy",
          url: server.url,
          id: server.id,
          scope: "claudeai"
        };
      }
      logForDebugging(
        `[claudeai-mcp] Fetched ${Object.keys(configs).length} servers`
      );
      logEvent("tengu_claudeai_mcp_eligibility", {
        state: "eligible"
      });
      return configs;
    } catch {
      logForDebugging(`[claudeai-mcp] Fetch failed`);
      return {};
    }
  }
);
function clearClaudeAIMcpConfigsCache() {
  fetchClaudeAIMcpConfigsIfEligible.cache.clear?.();
  clearMcpAuthCache();
}
function markClaudeAiMcpConnected(name) {
  saveGlobalConfig((current) => {
    const seen = current.claudeAiMcpEverConnected ?? [];
    if (seen.includes(name)) return current;
    return { ...current, claudeAiMcpEverConnected: [...seen, name] };
  });
}
function hasClaudeAiMcpEverConnected(name) {
  return (getGlobalConfig().claudeAiMcpEverConnected ?? []).includes(name);
}
export {
  clearClaudeAIMcpConfigsCache,
  fetchClaudeAIMcpConfigsIfEligible,
  hasClaudeAiMcpEverConnected,
  markClaudeAiMcpConnected
};
