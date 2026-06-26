import axios from "axios";
import { logForDebugging } from "../../utils/debug.js";
import { errorMessage } from "../../utils/errors.js";
let officialUrls = void 0;
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return void 0;
  }
}
async function prefetchOfficialMcpUrls() {
  if (process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) {
    return;
  }
  try {
    const response = await axios.get(
      "https://api.anthropic.com/mcp-registry/v0/servers?version=latest&visibility=commercial",
      { timeout: 5e3 }
    );
    const urls = /* @__PURE__ */ new Set();
    for (const entry of response.data.servers) {
      for (const remote of entry.server.remotes ?? []) {
        const normalized = normalizeUrl(remote.url);
        if (normalized) {
          urls.add(normalized);
        }
      }
    }
    officialUrls = urls;
    logForDebugging(`[mcp-registry] Loaded ${urls.size} official MCP URLs`);
  } catch (error) {
    logForDebugging(`Failed to fetch MCP registry: ${errorMessage(error)}`, {
      level: "error"
    });
  }
}
function isOfficialMcpUrl(normalizedUrl) {
  return officialUrls?.has(normalizedUrl) ?? false;
}
function resetOfficialMcpUrlsForTesting() {
  officialUrls = void 0;
}
export {
  isOfficialMcpUrl,
  prefetchOfficialMcpUrls,
  resetOfficialMcpUrlsForTesting
};
