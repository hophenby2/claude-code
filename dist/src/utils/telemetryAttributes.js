import { getSessionId } from "../bootstrap/state.js";
import { getOauthAccountInfo } from "./auth.js";
import { getOrCreateUserID } from "./config.js";
import { envDynamic } from "./envDynamic.js";
import { isEnvTruthy } from "./envUtils.js";
import { toTaggedId } from "./taggedId.js";
const METRICS_CARDINALITY_DEFAULTS = {
  OTEL_METRICS_INCLUDE_SESSION_ID: true,
  OTEL_METRICS_INCLUDE_VERSION: false,
  OTEL_METRICS_INCLUDE_ACCOUNT_UUID: true
};
function shouldIncludeAttribute(envVar) {
  const defaultValue = METRICS_CARDINALITY_DEFAULTS[envVar];
  const envValue = process.env[envVar];
  if (envValue === void 0) {
    return defaultValue;
  }
  return isEnvTruthy(envValue);
}
function getTelemetryAttributes() {
  const userId = getOrCreateUserID();
  const sessionId = getSessionId();
  const attributes = {
    "user.id": userId
  };
  if (shouldIncludeAttribute("OTEL_METRICS_INCLUDE_SESSION_ID")) {
    attributes["session.id"] = sessionId;
  }
  if (shouldIncludeAttribute("OTEL_METRICS_INCLUDE_VERSION")) {
    attributes["app.version"] = "0.0.0";
  }
  const oauthAccount = getOauthAccountInfo();
  if (oauthAccount) {
    const orgId = oauthAccount.organizationUuid;
    const email = oauthAccount.emailAddress;
    const accountUuid = oauthAccount.accountUuid;
    if (orgId) attributes["organization.id"] = orgId;
    if (email) attributes["user.email"] = email;
    if (accountUuid && shouldIncludeAttribute("OTEL_METRICS_INCLUDE_ACCOUNT_UUID")) {
      attributes["user.account_uuid"] = accountUuid;
      attributes["user.account_id"] = process.env.CLAUDE_CODE_ACCOUNT_TAGGED_ID || toTaggedId("user", accountUuid);
    }
  }
  if (envDynamic.terminal) {
    attributes["terminal.type"] = envDynamic.terminal;
  }
  return attributes;
}
export {
  getTelemetryAttributes
};
