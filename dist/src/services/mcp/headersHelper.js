import { getIsNonInteractiveSession } from "../../bootstrap/state.js";
import { checkHasTrustDialogAccepted } from "../../utils/config.js";
import { logAntError } from "../../utils/debug.js";
import { errorMessage } from "../../utils/errors.js";
import { execFileNoThrowWithCwd } from "../../utils/execFileNoThrow.js";
import { logError, logMCPDebug, logMCPError } from "../../utils/log.js";
import { jsonParse } from "../../utils/slowOperations.js";
import { logEvent } from "../analytics/index.js";
function isMcpServerFromProjectOrLocalSettings(config) {
  return config.scope === "project" || config.scope === "local";
}
async function getMcpHeadersFromHelper(serverName, config) {
  if (!config.headersHelper) {
    return null;
  }
  if ("scope" in config && isMcpServerFromProjectOrLocalSettings(config) && !getIsNonInteractiveSession()) {
    const hasTrust = checkHasTrustDialogAccepted();
    if (!hasTrust) {
      const error = new Error(
        `Security: headersHelper for MCP server '${serverName}' executed before workspace trust is confirmed. If you see this message, post in ${""}.`
      );
      logAntError("MCP headersHelper invoked before trust check", error);
      logEvent("tengu_mcp_headersHelper_missing_trust", {});
      return null;
    }
  }
  try {
    logMCPDebug(serverName, "Executing headersHelper to get dynamic headers");
    const execResult = await execFileNoThrowWithCwd(config.headersHelper, [], {
      shell: true,
      timeout: 1e4,
      // Pass server context so one helper script can serve multiple MCP servers
      // (git credential-helper style). See deshaw/anthropic-issues#28.
      env: {
        ...process.env,
        CLAUDE_CODE_MCP_SERVER_NAME: serverName,
        CLAUDE_CODE_MCP_SERVER_URL: config.url
      }
    });
    if (execResult.code !== 0 || !execResult.stdout) {
      throw new Error(
        `headersHelper for MCP server '${serverName}' did not return a valid value`
      );
    }
    const result = execResult.stdout.trim();
    const headers = jsonParse(result);
    if (typeof headers !== "object" || headers === null || Array.isArray(headers)) {
      throw new Error(
        `headersHelper for MCP server '${serverName}' must return a JSON object with string key-value pairs`
      );
    }
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== "string") {
        throw new Error(
          `headersHelper for MCP server '${serverName}' returned non-string value for key "${key}": ${typeof value}`
        );
      }
    }
    logMCPDebug(
      serverName,
      `Successfully retrieved ${Object.keys(headers).length} headers from headersHelper`
    );
    return headers;
  } catch (error) {
    logMCPError(
      serverName,
      `Error getting headers from headersHelper: ${errorMessage(error)}`
    );
    logError(
      new Error(
        `Error getting MCP headers from headersHelper for server '${serverName}': ${errorMessage(error)}`
      )
    );
    return null;
  }
}
async function getMcpServerHeaders(serverName, config) {
  const staticHeaders = config.headers || {};
  const dynamicHeaders = await getMcpHeadersFromHelper(serverName, config) || {};
  return {
    ...staticHeaders,
    ...dynamicHeaders
  };
}
export {
  getMcpHeadersFromHelper,
  getMcpServerHeaders
};
