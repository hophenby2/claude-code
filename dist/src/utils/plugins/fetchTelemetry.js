import {
  logEvent
} from "../../services/analytics/index.js";
import { OFFICIAL_MARKETPLACE_NAME } from "./officialMarketplace.js";
const KNOWN_PUBLIC_HOSTS = /* @__PURE__ */ new Set([
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "gist.githubusercontent.com",
  "gitlab.com",
  "bitbucket.org",
  "codeberg.org",
  "dev.azure.com",
  "ssh.dev.azure.com",
  "storage.googleapis.com"
  // GCS — where Dickson's migration points
]);
function extractHost(urlOrSpec) {
  let host;
  const scpMatch = /^[^@/]+@([^:/]+):/.exec(urlOrSpec);
  if (scpMatch) {
    host = scpMatch[1];
  } else {
    try {
      host = new URL(urlOrSpec).hostname;
    } catch {
      return "unknown";
    }
  }
  const normalized = host.toLowerCase();
  return KNOWN_PUBLIC_HOSTS.has(normalized) ? normalized : "other";
}
function isOfficialRepo(urlOrSpec) {
  return urlOrSpec.includes(`anthropics/${OFFICIAL_MARKETPLACE_NAME}`);
}
function logPluginFetch(source, urlOrSpec, outcome, durationMs, errorKind) {
  logEvent("tengu_plugin_remote_fetch", {
    source,
    host: urlOrSpec ? extractHost(urlOrSpec) : "unknown",
    is_official: urlOrSpec ? isOfficialRepo(urlOrSpec) : false,
    outcome,
    duration_ms: Math.round(durationMs),
    ...errorKind && { error_kind: errorKind }
  });
}
function classifyFetchError(error) {
  const msg = String(error?.message ?? error);
  if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|Could not resolve host|Connection refused/i.test(
    msg
  )) {
    return "dns_or_refused";
  }
  if (/ETIMEDOUT|timed out|timeout/i.test(msg)) return "timeout";
  if (/ECONNRESET|socket hang up|Connection reset by peer|remote end hung up/i.test(
    msg
  )) {
    return "conn_reset";
  }
  if (/403|401|authentication|permission denied/i.test(msg)) return "auth";
  if (/404|not found|repository not found/i.test(msg)) return "not_found";
  if (/certificate|SSL|TLS|unable to get local issuer/i.test(msg)) return "tls";
  if (/Invalid response format|Invalid marketplace schema/i.test(msg)) {
    return "invalid_schema";
  }
  return "other";
}
export {
  classifyFetchError,
  logPluginFetch
};
