import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const PRODUCT_URL = "https://claude.com/claude-code";
const CLAUDE_AI_BASE_URL = "https://claude.ai";
const CLAUDE_AI_STAGING_BASE_URL = "https://claude-ai.staging.ant.dev";
const CLAUDE_AI_LOCAL_BASE_URL = "http://localhost:4000";
function isRemoteSessionStaging(sessionId, ingressUrl) {
  return sessionId?.includes("_staging_") === true || ingressUrl?.includes("staging") === true;
}
function isRemoteSessionLocal(sessionId, ingressUrl) {
  return sessionId?.includes("_local_") === true || ingressUrl?.includes("localhost") === true;
}
function getClaudeAiBaseUrl(sessionId, ingressUrl) {
  if (isRemoteSessionLocal(sessionId, ingressUrl)) {
    return CLAUDE_AI_LOCAL_BASE_URL;
  }
  if (isRemoteSessionStaging(sessionId, ingressUrl)) {
    return CLAUDE_AI_STAGING_BASE_URL;
  }
  return CLAUDE_AI_BASE_URL;
}
function getRemoteSessionUrl(sessionId, ingressUrl) {
  const { toCompatSessionId } = require2("../bridge/sessionIdCompat.js");
  const compatId = toCompatSessionId(sessionId);
  const baseUrl = getClaudeAiBaseUrl(compatId, ingressUrl);
  return `${baseUrl}/code/${compatId}`;
}
export {
  CLAUDE_AI_BASE_URL,
  CLAUDE_AI_LOCAL_BASE_URL,
  CLAUDE_AI_STAGING_BASE_URL,
  PRODUCT_URL,
  getClaudeAiBaseUrl,
  getRemoteSessionUrl,
  isRemoteSessionLocal,
  isRemoteSessionStaging
};
