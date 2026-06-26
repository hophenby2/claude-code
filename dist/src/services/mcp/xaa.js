import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata
} from "@modelcontextprotocol/sdk/client/auth.js";
import { z } from "zod/v4";
import { lazySchema } from "../../utils/lazySchema.js";
import { logMCPDebug } from "../../utils/log.js";
import { jsonStringify } from "../../utils/slowOperations.js";
const XAA_REQUEST_TIMEOUT_MS = 3e4;
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const ID_JAG_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id-jag";
const ID_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";
function makeXaaFetch(abortSignal) {
  return (url, init) => {
    const timeout = AbortSignal.timeout(XAA_REQUEST_TIMEOUT_MS);
    const signal = abortSignal ? (
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      AbortSignal.any([timeout, abortSignal])
    ) : timeout;
    return fetch(url, { ...init, signal });
  };
}
const defaultFetch = makeXaaFetch();
function normalizeUrl(url) {
  try {
    return new URL(url).href.replace(/\/$/, "");
  } catch {
    return url.replace(/\/$/, "");
  }
}
class XaaTokenExchangeError extends Error {
  shouldClearIdToken;
  constructor(message, shouldClearIdToken) {
    super(message);
    this.name = "XaaTokenExchangeError";
    this.shouldClearIdToken = shouldClearIdToken;
  }
}
const SENSITIVE_TOKEN_RE = /"(access_token|refresh_token|id_token|assertion|subject_token|client_secret)"\s*:\s*"[^"]*"/g;
function redactTokens(raw) {
  const s = typeof raw === "string" ? raw : jsonStringify(raw);
  return s.replace(SENSITIVE_TOKEN_RE, (_, k) => `"${k}":"[REDACTED]"`);
}
const TokenExchangeResponseSchema = lazySchema(
  () => z.object({
    access_token: z.string().optional(),
    issued_token_type: z.string().optional(),
    // z.coerce tolerates IdPs that send expires_in as a string (common in
    // PHP-backed IdPs) — technically non-conformant JSON but widespread.
    expires_in: z.coerce.number().optional(),
    scope: z.string().optional()
  })
);
const JwtBearerResponseSchema = lazySchema(
  () => z.object({
    access_token: z.string().min(1),
    // Many ASes omit token_type since Bearer is the only value anyone uses
    // (RFC 6750). Don't reject a valid access_token over a missing label.
    token_type: z.string().default("Bearer"),
    expires_in: z.coerce.number().optional(),
    scope: z.string().optional(),
    refresh_token: z.string().optional()
  })
);
async function discoverProtectedResource(serverUrl, opts) {
  let prm;
  try {
    prm = await discoverOAuthProtectedResourceMetadata(
      serverUrl,
      void 0,
      opts?.fetchFn ?? defaultFetch
    );
  } catch (e) {
    throw new Error(
      `XAA: PRM discovery failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (!prm.resource || !prm.authorization_servers?.[0]) {
    throw new Error(
      "XAA: PRM discovery failed: PRM missing resource or authorization_servers"
    );
  }
  if (normalizeUrl(prm.resource) !== normalizeUrl(serverUrl)) {
    throw new Error(
      `XAA: PRM discovery failed: PRM resource mismatch: expected ${serverUrl}, got ${prm.resource}`
    );
  }
  return {
    resource: prm.resource,
    authorization_servers: prm.authorization_servers
  };
}
async function discoverAuthorizationServer(asUrl, opts) {
  const meta = await discoverAuthorizationServerMetadata(asUrl, {
    fetchFn: opts?.fetchFn ?? defaultFetch
  });
  if (!meta?.issuer || !meta.token_endpoint) {
    throw new Error(
      `XAA: AS metadata discovery failed: no valid metadata at ${asUrl}`
    );
  }
  if (normalizeUrl(meta.issuer) !== normalizeUrl(asUrl)) {
    throw new Error(
      `XAA: AS metadata discovery failed: issuer mismatch: expected ${asUrl}, got ${meta.issuer}`
    );
  }
  if (new URL(meta.token_endpoint).protocol !== "https:") {
    throw new Error(
      `XAA: refusing non-HTTPS token endpoint: ${meta.token_endpoint}`
    );
  }
  return {
    issuer: meta.issuer,
    token_endpoint: meta.token_endpoint,
    grant_types_supported: meta.grant_types_supported,
    token_endpoint_auth_methods_supported: meta.token_endpoint_auth_methods_supported
  };
}
async function requestJwtAuthorizationGrant(opts) {
  const fetchFn = opts.fetchFn ?? defaultFetch;
  const params = new URLSearchParams({
    grant_type: TOKEN_EXCHANGE_GRANT,
    requested_token_type: ID_JAG_TOKEN_TYPE,
    audience: opts.audience,
    resource: opts.resource,
    subject_token: opts.idToken,
    subject_token_type: ID_TOKEN_TYPE,
    client_id: opts.clientId
  });
  if (opts.clientSecret) {
    params.set("client_secret", opts.clientSecret);
  }
  if (opts.scope) {
    params.set("scope", opts.scope);
  }
  const res = await fetchFn(opts.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (!res.ok) {
    const body = redactTokens(await res.text()).slice(0, 200);
    const shouldClear = res.status < 500;
    throw new XaaTokenExchangeError(
      `XAA: token exchange failed: HTTP ${res.status}: ${body}`,
      shouldClear
    );
  }
  let rawExchange;
  try {
    rawExchange = await res.json();
  } catch {
    throw new XaaTokenExchangeError(
      `XAA: token exchange returned non-JSON (captive portal?) at ${opts.tokenEndpoint}`,
      false
    );
  }
  const exchangeParsed = TokenExchangeResponseSchema().safeParse(rawExchange);
  if (!exchangeParsed.success) {
    throw new XaaTokenExchangeError(
      `XAA: token exchange response did not match expected shape: ${redactTokens(rawExchange)}`,
      true
    );
  }
  const result = exchangeParsed.data;
  if (!result.access_token) {
    throw new XaaTokenExchangeError(
      `XAA: token exchange response missing access_token: ${redactTokens(result)}`,
      true
    );
  }
  if (result.issued_token_type !== ID_JAG_TOKEN_TYPE) {
    throw new XaaTokenExchangeError(
      `XAA: token exchange returned unexpected issued_token_type: ${result.issued_token_type}`,
      true
    );
  }
  return {
    jwtAuthGrant: result.access_token,
    expiresIn: result.expires_in,
    scope: result.scope
  };
}
async function exchangeJwtAuthGrant(opts) {
  const fetchFn = opts.fetchFn ?? defaultFetch;
  const authMethod = opts.authMethod ?? "client_secret_basic";
  const params = new URLSearchParams({
    grant_type: JWT_BEARER_GRANT,
    assertion: opts.assertion
  });
  if (opts.scope) {
    params.set("scope", opts.scope);
  }
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (authMethod === "client_secret_basic") {
    const basicAuth = Buffer.from(
      `${encodeURIComponent(opts.clientId)}:${encodeURIComponent(opts.clientSecret)}`
    ).toString("base64");
    headers.Authorization = `Basic ${basicAuth}`;
  } else {
    params.set("client_id", opts.clientId);
    params.set("client_secret", opts.clientSecret);
  }
  const res = await fetchFn(opts.tokenEndpoint, {
    method: "POST",
    headers,
    body: params
  });
  if (!res.ok) {
    const body = redactTokens(await res.text()).slice(0, 200);
    throw new Error(`XAA: jwt-bearer grant failed: HTTP ${res.status}: ${body}`);
  }
  let rawTokens;
  try {
    rawTokens = await res.json();
  } catch {
    throw new Error(
      `XAA: jwt-bearer grant returned non-JSON (captive portal?) at ${opts.tokenEndpoint}`
    );
  }
  const tokensParsed = JwtBearerResponseSchema().safeParse(rawTokens);
  if (!tokensParsed.success) {
    throw new Error(
      `XAA: jwt-bearer response did not match expected shape: ${redactTokens(rawTokens)}`
    );
  }
  return tokensParsed.data;
}
async function performCrossAppAccess(serverUrl, config, serverName = "xaa", abortSignal) {
  const fetchFn = makeXaaFetch(abortSignal);
  logMCPDebug(serverName, `XAA: discovering PRM for ${serverUrl}`);
  const prm = await discoverProtectedResource(serverUrl, { fetchFn });
  logMCPDebug(
    serverName,
    `XAA: discovered resource=${prm.resource} ASes=[${prm.authorization_servers.join(", ")}]`
  );
  let asMeta;
  const asErrors = [];
  for (const asUrl of prm.authorization_servers) {
    let candidate;
    try {
      candidate = await discoverAuthorizationServer(asUrl, { fetchFn });
    } catch (e) {
      if (abortSignal?.aborted) throw e;
      asErrors.push(`${asUrl}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (candidate.grant_types_supported && !candidate.grant_types_supported.includes(JWT_BEARER_GRANT)) {
      asErrors.push(
        `${asUrl}: does not advertise jwt-bearer grant (supported: ${candidate.grant_types_supported.join(", ")})`
      );
      continue;
    }
    asMeta = candidate;
    break;
  }
  if (!asMeta) {
    throw new Error(
      `XAA: no authorization server supports jwt-bearer. Tried: ${asErrors.join("; ")}`
    );
  }
  const authMethods = asMeta.token_endpoint_auth_methods_supported;
  const authMethod = authMethods && !authMethods.includes("client_secret_basic") && authMethods.includes("client_secret_post") ? "client_secret_post" : "client_secret_basic";
  logMCPDebug(
    serverName,
    `XAA: AS issuer=${asMeta.issuer} token_endpoint=${asMeta.token_endpoint} auth_method=${authMethod}`
  );
  logMCPDebug(serverName, `XAA: exchanging id_token for ID-JAG at IdP`);
  const jag = await requestJwtAuthorizationGrant({
    tokenEndpoint: config.idpTokenEndpoint,
    audience: asMeta.issuer,
    resource: prm.resource,
    idToken: config.idpIdToken,
    clientId: config.idpClientId,
    clientSecret: config.idpClientSecret,
    fetchFn
  });
  logMCPDebug(serverName, `XAA: ID-JAG obtained`);
  logMCPDebug(serverName, `XAA: exchanging ID-JAG for access_token at AS`);
  const tokens = await exchangeJwtAuthGrant({
    tokenEndpoint: asMeta.token_endpoint,
    assertion: jag.jwtAuthGrant,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authMethod,
    fetchFn
  });
  logMCPDebug(serverName, `XAA: access_token obtained`);
  return { ...tokens, authorizationServerUrl: asMeta.issuer };
}
export {
  XaaTokenExchangeError,
  discoverAuthorizationServer,
  discoverProtectedResource,
  exchangeJwtAuthGrant,
  performCrossAppAccess,
  requestJwtAuthorizationGrant
};
