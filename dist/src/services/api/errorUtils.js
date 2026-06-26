const SSL_ERROR_CODES = /* @__PURE__ */ new Set([
  // Certificate verification errors
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_SIGNATURE_FAILURE",
  "CERT_NOT_YET_VALID",
  "CERT_HAS_EXPIRED",
  "CERT_REVOKED",
  "CERT_REJECTED",
  "CERT_UNTRUSTED",
  // Self-signed certificate errors
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  // Chain errors
  "CERT_CHAIN_TOO_LONG",
  "PATH_LENGTH_EXCEEDED",
  // Hostname/altname errors
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "HOSTNAME_MISMATCH",
  // TLS handshake errors
  "ERR_TLS_HANDSHAKE_TIMEOUT",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC"
]);
function extractConnectionErrorDetails(error) {
  if (!error || typeof error !== "object") {
    return null;
  }
  let current = error;
  const maxDepth = 5;
  let depth = 0;
  while (current && depth < maxDepth) {
    if (current instanceof Error && "code" in current && typeof current.code === "string") {
      const code = current.code;
      const isSSLError = SSL_ERROR_CODES.has(code);
      return {
        code,
        message: current.message,
        isSSLError
      };
    }
    if (current instanceof Error && "cause" in current && current.cause !== current) {
      current = current.cause;
      depth++;
    } else {
      break;
    }
  }
  return null;
}
function getSSLErrorHint(error) {
  const details = extractConnectionErrorDetails(error);
  if (!details?.isSSLError) {
    return null;
  }
  return `SSL certificate error (${details.code}). If you are behind a corporate proxy or TLS-intercepting firewall, set NODE_EXTRA_CA_CERTS to your CA bundle path, or ask IT to allowlist *.anthropic.com. Run /doctor for details.`;
}
function sanitizeMessageHTML(message) {
  if (message.includes("<!DOCTYPE html") || message.includes("<html")) {
    const titleMatch = message.match(/<title>([^<]+)<\/title>/);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }
    return "";
  }
  return message;
}
function sanitizeAPIError(apiError) {
  const message = apiError.message;
  if (!message) {
    return "";
  }
  return sanitizeMessageHTML(message);
}
function hasNestedError(value) {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "object" && value.error !== null;
}
function extractNestedErrorMessage(error) {
  if (!hasNestedError(error)) {
    return null;
  }
  const narrowed = error;
  const nested = narrowed.error;
  const deepMsg = nested?.error?.message;
  if (typeof deepMsg === "string" && deepMsg.length > 0) {
    const sanitized = sanitizeMessageHTML(deepMsg);
    if (sanitized.length > 0) {
      return sanitized;
    }
  }
  const msg = nested?.message;
  if (typeof msg === "string" && msg.length > 0) {
    const sanitized = sanitizeMessageHTML(msg);
    if (sanitized.length > 0) {
      return sanitized;
    }
  }
  return null;
}
function formatAPIError(error) {
  const connectionDetails = extractConnectionErrorDetails(error);
  if (connectionDetails) {
    const { code, isSSLError } = connectionDetails;
    if (code === "ETIMEDOUT") {
      return "Request timed out. Check your internet connection and proxy settings";
    }
    if (isSSLError) {
      switch (code) {
        case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
        case "UNABLE_TO_GET_ISSUER_CERT":
        case "UNABLE_TO_GET_ISSUER_CERT_LOCALLY":
          return "Unable to connect to API: SSL certificate verification failed. Check your proxy or corporate SSL certificates";
        case "CERT_HAS_EXPIRED":
          return "Unable to connect to API: SSL certificate has expired";
        case "CERT_REVOKED":
          return "Unable to connect to API: SSL certificate has been revoked";
        case "DEPTH_ZERO_SELF_SIGNED_CERT":
        case "SELF_SIGNED_CERT_IN_CHAIN":
          return "Unable to connect to API: Self-signed certificate detected. Check your proxy or corporate SSL certificates";
        case "ERR_TLS_CERT_ALTNAME_INVALID":
        case "HOSTNAME_MISMATCH":
          return "Unable to connect to API: SSL certificate hostname mismatch";
        case "CERT_NOT_YET_VALID":
          return "Unable to connect to API: SSL certificate is not yet valid";
        default:
          return `Unable to connect to API: SSL error (${code})`;
      }
    }
  }
  if (error.message === "Connection error.") {
    if (connectionDetails?.code) {
      return `Unable to connect to API (${connectionDetails.code})`;
    }
    return "Unable to connect to API. Check your internet connection";
  }
  if (!error.message) {
    return extractNestedErrorMessage(error) ?? `API error (status ${error.status ?? "unknown"})`;
  }
  const sanitizedMessage = sanitizeAPIError(error);
  return sanitizedMessage !== error.message && sanitizedMessage.length > 0 ? sanitizedMessage : error.message;
}
export {
  extractConnectionErrorDetails,
  formatAPIError,
  getSSLErrorHint,
  sanitizeAPIError
};
