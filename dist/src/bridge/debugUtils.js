import {
  logEvent
} from "../services/analytics/index.js";
import { logForDebugging } from "../utils/debug.js";
import { errorMessage } from "../utils/errors.js";
import { jsonStringify } from "../utils/slowOperations.js";
const DEBUG_MSG_LIMIT = 2e3;
const SECRET_FIELD_NAMES = [
  "session_ingress_token",
  "environment_secret",
  "access_token",
  "secret",
  "token"
];
const SECRET_PATTERN = new RegExp(
  `"(${SECRET_FIELD_NAMES.join("|")})"\\s*:\\s*"([^"]*)"`,
  "g"
);
const REDACT_MIN_LENGTH = 16;
function redactSecrets(s) {
  return s.replace(SECRET_PATTERN, (_match, field, value) => {
    if (value.length < REDACT_MIN_LENGTH) {
      return `"${field}":"[REDACTED]"`;
    }
    const redacted = `${value.slice(0, 8)}...${value.slice(-4)}`;
    return `"${field}":"${redacted}"`;
  });
}
function debugTruncate(s) {
  const flat = s.replace(/\n/g, "\\n");
  if (flat.length <= DEBUG_MSG_LIMIT) {
    return flat;
  }
  return flat.slice(0, DEBUG_MSG_LIMIT) + `... (${flat.length} chars)`;
}
function debugBody(data) {
  const raw = typeof data === "string" ? data : jsonStringify(data);
  const s = redactSecrets(raw);
  if (s.length <= DEBUG_MSG_LIMIT) {
    return s;
  }
  return s.slice(0, DEBUG_MSG_LIMIT) + `... (${s.length} chars)`;
}
function describeAxiosError(err) {
  const msg = errorMessage(err);
  if (err && typeof err === "object" && "response" in err) {
    const response = err.response;
    if (response?.data && typeof response.data === "object") {
      const data = response.data;
      const detail = typeof data.message === "string" ? data.message : typeof data.error === "object" && data.error && "message" in data.error && typeof data.error.message === "string" ? data.error.message : void 0;
      if (detail) {
        return `${msg}: ${detail}`;
      }
    }
  }
  return msg;
}
function extractHttpStatus(err) {
  if (err && typeof err === "object" && "response" in err && err.response && typeof err.response.status === "number") {
    return err.response.status;
  }
  return void 0;
}
function extractErrorDetail(data) {
  if (!data || typeof data !== "object") return void 0;
  if ("message" in data && typeof data.message === "string") {
    return data.message;
  }
  if ("error" in data && data.error !== null && typeof data.error === "object" && "message" in data.error && typeof data.error.message === "string") {
    return data.error.message;
  }
  return void 0;
}
function logBridgeSkip(reason, debugMsg, v2) {
  if (debugMsg) {
    logForDebugging(debugMsg);
  }
  logEvent("tengu_bridge_repl_skipped", {
    reason,
    ...v2 !== void 0 && { v2 }
  });
}
export {
  debugBody,
  debugTruncate,
  describeAxiosError,
  extractErrorDetail,
  extractHttpStatus,
  logBridgeSkip,
  redactSecrets
};
