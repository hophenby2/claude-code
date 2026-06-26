import { isEnvTruthy } from "../envUtils.js";
function getAPIProvider() {
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ? "bedrock" : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ? "vertex" : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY) ? "foundry" : "firstParty";
}
function getAPIProviderForStatsig() {
  return getAPIProvider();
}
function isFirstPartyAnthropicBaseUrl() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl) {
    return true;
  }
  try {
    const host = new URL(baseUrl).host;
    const allowedHosts = ["api.anthropic.com"];
    if (process.env.USER_TYPE === "ant") {
      allowedHosts.push("api-staging.anthropic.com");
    }
    return allowedHosts.includes(host);
  } catch {
    return false;
  }
}
export {
  getAPIProvider,
  getAPIProviderForStatsig,
  isFirstPartyAnthropicBaseUrl
};
