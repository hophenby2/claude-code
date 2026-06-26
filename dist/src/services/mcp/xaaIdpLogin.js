import {
  exchangeAuthorization,
  startAuthorization
} from "@modelcontextprotocol/sdk/client/auth.js";
import {
  OpenIdProviderDiscoveryMetadataSchema
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { randomBytes } from "crypto";
import { createServer } from "http";
import { parse } from "url";
import xss from "xss";
import { openBrowser } from "../../utils/browser.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { toError } from "../../utils/errors.js";
import { logMCPDebug } from "../../utils/log.js";
import { getPlatform } from "../../utils/platform.js";
import { getSecureStorage } from "../../utils/secureStorage/index.js";
import { getInitialSettings } from "../../utils/settings/settings.js";
import { jsonParse } from "../../utils/slowOperations.js";
import { buildRedirectUri, findAvailablePort } from "./oauthPort.js";
function isXaaEnabled() {
  return isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_XAA);
}
function getXaaIdpSettings() {
  return getInitialSettings().xaaIdp;
}
const IDP_LOGIN_TIMEOUT_MS = 5 * 60 * 1e3;
const IDP_REQUEST_TIMEOUT_MS = 3e4;
const ID_TOKEN_EXPIRY_BUFFER_S = 60;
function issuerKey(issuer) {
  try {
    const u = new URL(issuer);
    u.pathname = u.pathname.replace(/\/+$/, "");
    u.host = u.host.toLowerCase();
    return u.toString();
  } catch {
    return issuer.replace(/\/+$/, "");
  }
}
function getCachedIdpIdToken(idpIssuer) {
  const storage = getSecureStorage();
  const data = storage.read();
  const entry = data?.mcpXaaIdp?.[issuerKey(idpIssuer)];
  if (!entry) return void 0;
  const remainingMs = entry.expiresAt - Date.now();
  if (remainingMs <= ID_TOKEN_EXPIRY_BUFFER_S * 1e3) return void 0;
  return entry.idToken;
}
function saveIdpIdToken(idpIssuer, idToken, expiresAt) {
  const storage = getSecureStorage();
  const existing = storage.read() || {};
  storage.update({
    ...existing,
    mcpXaaIdp: {
      ...existing.mcpXaaIdp,
      [issuerKey(idpIssuer)]: { idToken, expiresAt }
    }
  });
}
function saveIdpIdTokenFromJwt(idpIssuer, idToken) {
  const expFromJwt = jwtExp(idToken);
  const expiresAt = expFromJwt ? expFromJwt * 1e3 : Date.now() + 3600 * 1e3;
  saveIdpIdToken(idpIssuer, idToken, expiresAt);
  return expiresAt;
}
function clearIdpIdToken(idpIssuer) {
  const storage = getSecureStorage();
  const existing = storage.read();
  const key = issuerKey(idpIssuer);
  if (!existing?.mcpXaaIdp?.[key]) return;
  delete existing.mcpXaaIdp[key];
  storage.update(existing);
}
function saveIdpClientSecret(idpIssuer, clientSecret) {
  const storage = getSecureStorage();
  const existing = storage.read() || {};
  return storage.update({
    ...existing,
    mcpXaaIdpConfig: {
      ...existing.mcpXaaIdpConfig,
      [issuerKey(idpIssuer)]: { clientSecret }
    }
  });
}
function getIdpClientSecret(idpIssuer) {
  const storage = getSecureStorage();
  const data = storage.read();
  return data?.mcpXaaIdpConfig?.[issuerKey(idpIssuer)]?.clientSecret;
}
function clearIdpClientSecret(idpIssuer) {
  const storage = getSecureStorage();
  const existing = storage.read();
  const key = issuerKey(idpIssuer);
  if (!existing?.mcpXaaIdpConfig?.[key]) return;
  delete existing.mcpXaaIdpConfig[key];
  storage.update(existing);
}
async function discoverOidc(idpIssuer) {
  const base = idpIssuer.endsWith("/") ? idpIssuer : idpIssuer + "/";
  const url = new URL(".well-known/openid-configuration", base);
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(IDP_REQUEST_TIMEOUT_MS)
  });
  if (!res.ok) {
    throw new Error(
      `XAA IdP: OIDC discovery failed: HTTP ${res.status} at ${url}`
    );
  }
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(
      `XAA IdP: OIDC discovery returned non-JSON at ${url} (captive portal or proxy?)`
    );
  }
  const parsed = OpenIdProviderDiscoveryMetadataSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`XAA IdP: invalid OIDC metadata: ${parsed.error.message}`);
  }
  if (new URL(parsed.data.token_endpoint).protocol !== "https:") {
    throw new Error(
      `XAA IdP: refusing non-HTTPS token endpoint: ${parsed.data.token_endpoint}`
    );
  }
  return parsed.data;
}
function jwtExp(jwt) {
  const parts = jwt.split(".");
  if (parts.length !== 3) return void 0;
  try {
    const payload = jsonParse(
      Buffer.from(parts[1], "base64url").toString("utf-8")
    );
    return typeof payload.exp === "number" ? payload.exp : void 0;
  } catch {
    return void 0;
  }
}
function waitForCallback(port, expectedState, abortSignal, onListening) {
  let server = null;
  let timeoutId = null;
  let abortHandler = null;
  const cleanup = () => {
    server?.removeAllListeners();
    server?.on("error", () => {
    });
    server?.close();
    server = null;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (abortSignal && abortHandler) {
      abortSignal.removeEventListener("abort", abortHandler);
      abortHandler = null;
    }
  };
  return new Promise((resolve, reject) => {
    let resolved = false;
    const resolveOnce = (v) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(v);
    };
    const rejectOnce = (e) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(e);
    };
    if (abortSignal) {
      abortHandler = () => rejectOnce(new Error("XAA IdP: login cancelled"));
      if (abortSignal.aborted) {
        abortHandler();
        return;
      }
      abortSignal.addEventListener("abort", abortHandler, { once: true });
    }
    server = createServer((req, res) => {
      const parsed = parse(req.url || "", true);
      if (parsed.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = parsed.query.code;
      const state = parsed.query.state;
      const err = parsed.query.error;
      if (err) {
        const desc = parsed.query.error_description;
        const safeErr = xss(err);
        const safeDesc = desc ? xss(desc) : "";
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h3>IdP login failed</h3><p>${safeErr}</p><p>${safeDesc}</p></body></html>`
        );
        rejectOnce(new Error(`XAA IdP: ${err}${desc ? ` \u2014 ${desc}` : ""}`));
        return;
      }
      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h3>State mismatch</h3></body></html>");
        rejectOnce(new Error("XAA IdP: state mismatch (possible CSRF)"));
        return;
      }
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h3>Missing code</h3></body></html>");
        rejectOnce(new Error("XAA IdP: callback missing code"));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body><h3>IdP login complete \u2014 you can close this window.</h3></body></html>"
      );
      resolveOnce(code);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        const findCmd = getPlatform() === "windows" ? `netstat -ano | findstr :${port}` : `lsof -ti:${port} -sTCP:LISTEN`;
        rejectOnce(
          new Error(
            `XAA IdP: callback port ${port} is already in use. Run \`${findCmd}\` to find the holder.`
          )
        );
      } else {
        rejectOnce(new Error(`XAA IdP: callback server failed: ${err.message}`));
      }
    });
    server.listen(port, "127.0.0.1", () => {
      try {
        onListening();
      } catch (e) {
        rejectOnce(toError(e));
      }
    });
    server.unref();
    timeoutId = setTimeout(
      (rej) => rej(new Error("XAA IdP: login timed out")),
      IDP_LOGIN_TIMEOUT_MS,
      rejectOnce
    );
    timeoutId.unref();
  });
}
async function acquireIdpIdToken(opts) {
  const { idpIssuer, idpClientId } = opts;
  const cached = getCachedIdpIdToken(idpIssuer);
  if (cached) {
    logMCPDebug("xaa", `Using cached id_token for ${idpIssuer}`);
    return cached;
  }
  logMCPDebug("xaa", `No cached id_token for ${idpIssuer}; starting OIDC login`);
  const metadata = await discoverOidc(idpIssuer);
  const port = opts.callbackPort ?? await findAvailablePort();
  const redirectUri = buildRedirectUri(port);
  const state = randomBytes(32).toString("base64url");
  const clientInformation = {
    client_id: idpClientId,
    ...opts.idpClientSecret ? { client_secret: opts.idpClientSecret } : {}
  };
  const { authorizationUrl, codeVerifier } = await startAuthorization(
    idpIssuer,
    {
      metadata,
      clientInformation,
      redirectUrl: redirectUri,
      scope: "openid",
      state
    }
  );
  const authorizationCode = await waitForCallback(
    port,
    state,
    opts.abortSignal,
    () => {
      if (opts.onAuthorizationUrl) {
        opts.onAuthorizationUrl(authorizationUrl.toString());
      }
      if (!opts.skipBrowserOpen) {
        logMCPDebug("xaa", `Opening browser to IdP authorization endpoint`);
        void openBrowser(authorizationUrl.toString());
      }
    }
  );
  const tokens = await exchangeAuthorization(idpIssuer, {
    metadata,
    clientInformation,
    authorizationCode,
    codeVerifier,
    redirectUri,
    fetchFn: (url, init) => (
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      fetch(url, {
        ...init,
        signal: AbortSignal.timeout(IDP_REQUEST_TIMEOUT_MS)
      })
    )
  });
  if (!tokens.id_token) {
    throw new Error(
      "XAA IdP: token response missing id_token (check scope=openid)"
    );
  }
  const expFromJwt = jwtExp(tokens.id_token);
  const expiresAt = expFromJwt ? expFromJwt * 1e3 : Date.now() + (tokens.expires_in ?? 3600) * 1e3;
  saveIdpIdToken(idpIssuer, tokens.id_token, expiresAt);
  logMCPDebug(
    "xaa",
    `Cached id_token for ${idpIssuer} (expires ${new Date(expiresAt).toISOString()})`
  );
  return tokens.id_token;
}
export {
  acquireIdpIdToken,
  clearIdpClientSecret,
  clearIdpIdToken,
  discoverOidc,
  getCachedIdpIdToken,
  getIdpClientSecret,
  getXaaIdpSettings,
  isXaaEnabled,
  issuerKey,
  saveIdpClientSecret,
  saveIdpIdTokenFromJwt
};
