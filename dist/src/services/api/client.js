import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getAnthropicApiKey,
  getApiKeyFromApiKeyHelper,
  getClaudeAIOAuthTokens,
  isClaudeAISubscriber,
  refreshAndGetAwsCredentials,
  refreshGcpCredentialsIfNeeded
} from "../../utils/auth.js";
import { getUserAgent } from "../../utils/http.js";
import { getSmallFastModel } from "../../utils/model/model.js";
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl
} from "../../utils/model/providers.js";
import { getProxyFetchOptions } from "../../utils/proxy.js";
import {
  getIsNonInteractiveSession,
  getSessionId
} from "../../bootstrap/state.js";
import { getOauthConfig } from "../../constants/oauth.js";
import { isDebugToStdErr, logForDebugging } from "../../utils/debug.js";
import {
  getAWSRegion,
  getVertexRegionForModel,
  isEnvTruthy
} from "../../utils/envUtils.js";
function createStderrLogger() {
  return {
    error: (msg, ...args) => (
      // biome-ignore lint/suspicious/noConsole:: intentional console output -- SDK logger must use console
      console.error("[Anthropic SDK ERROR]", msg, ...args)
    ),
    // biome-ignore lint/suspicious/noConsole:: intentional console output -- SDK logger must use console
    warn: (msg, ...args) => console.error("[Anthropic SDK WARN]", msg, ...args),
    // biome-ignore lint/suspicious/noConsole:: intentional console output -- SDK logger must use console
    info: (msg, ...args) => console.error("[Anthropic SDK INFO]", msg, ...args),
    debug: (msg, ...args) => (
      // biome-ignore lint/suspicious/noConsole:: intentional console output -- SDK logger must use console
      console.error("[Anthropic SDK DEBUG]", msg, ...args)
    )
  };
}
async function getAnthropicClient({
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source
}) {
  const containerId = process.env.CLAUDE_CODE_CONTAINER_ID;
  const remoteSessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
  const clientApp = process.env.CLAUDE_AGENT_SDK_CLIENT_APP;
  const customHeaders = getCustomHeaders();
  const defaultHeaders = {
    "x-app": "cli",
    "User-Agent": getUserAgent(),
    "X-Claude-Code-Session-Id": getSessionId(),
    ...customHeaders,
    ...containerId ? { "x-claude-remote-container-id": containerId } : {},
    ...remoteSessionId ? { "x-claude-remote-session-id": remoteSessionId } : {},
    // SDK consumers can identify their app/library for backend analytics
    ...clientApp ? { "x-client-app": clientApp } : {}
  };
  logForDebugging(
    `[API:request] Creating client, ANTHROPIC_CUSTOM_HEADERS present: ${!!process.env.ANTHROPIC_CUSTOM_HEADERS}, has Authorization header: ${!!customHeaders["Authorization"]}`
  );
  const additionalProtectionEnabled = isEnvTruthy(
    process.env.CLAUDE_CODE_ADDITIONAL_PROTECTION
  );
  if (additionalProtectionEnabled) {
    defaultHeaders["x-anthropic-additional-protection"] = "true";
  }
  logForDebugging("[API:auth] OAuth token check starting");
  await checkAndRefreshOAuthTokenIfNeeded();
  logForDebugging("[API:auth] OAuth token check complete");
  if (!isClaudeAISubscriber()) {
    await configureApiKeyHeaders(defaultHeaders, getIsNonInteractiveSession());
  }
  const resolvedFetch = buildFetch(fetchOverride, source);
  const ARGS = {
    defaultHeaders,
    maxRetries,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1e3), 10),
    dangerouslyAllowBrowser: true,
    fetchOptions: getProxyFetchOptions({
      forAnthropicAPI: true
    }),
    ...resolvedFetch && {
      fetch: resolvedFetch
    }
  };
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)) {
    const { AnthropicBedrock } = await import("@anthropic-ai/bedrock-sdk");
    const awsRegion = model === getSmallFastModel() && process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION ? process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION : getAWSRegion();
    const bedrockArgs = {
      ...ARGS,
      awsRegion,
      ...isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH) && {
        skipAuth: true
      },
      ...isDebugToStdErr() && { logger: createStderrLogger() }
    };
    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
      bedrockArgs.skipAuth = true;
      bedrockArgs.defaultHeaders = {
        ...bedrockArgs.defaultHeaders,
        Authorization: `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`
      };
    } else if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH)) {
      const cachedCredentials = await refreshAndGetAwsCredentials();
      if (cachedCredentials) {
        bedrockArgs.awsAccessKey = cachedCredentials.accessKeyId;
        bedrockArgs.awsSecretKey = cachedCredentials.secretAccessKey;
        bedrockArgs.awsSessionToken = cachedCredentials.sessionToken;
      }
    }
    return new AnthropicBedrock(bedrockArgs);
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) {
    const { AnthropicFoundry } = await import("@anthropic-ai/foundry-sdk");
    let azureADTokenProvider;
    if (!process.env.ANTHROPIC_FOUNDRY_API_KEY) {
      if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_FOUNDRY_AUTH)) {
        azureADTokenProvider = () => Promise.resolve("");
      } else {
        const {
          DefaultAzureCredential: AzureCredential,
          getBearerTokenProvider
        } = await import("@azure/identity");
        azureADTokenProvider = getBearerTokenProvider(
          new AzureCredential(),
          "https://cognitiveservices.azure.com/.default"
        );
      }
    }
    const foundryArgs = {
      ...ARGS,
      ...azureADTokenProvider && { azureADTokenProvider },
      ...isDebugToStdErr() && { logger: createStderrLogger() }
    };
    return new AnthropicFoundry(foundryArgs);
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) {
    if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)) {
      await refreshGcpCredentialsIfNeeded();
    }
    const [{ AnthropicVertex }, { GoogleAuth }] = await Promise.all([
      import("@anthropic-ai/vertex-sdk"),
      import("google-auth-library")
    ]);
    const hasProjectEnvVar = process.env["GCLOUD_PROJECT"] || process.env["GOOGLE_CLOUD_PROJECT"] || process.env["gcloud_project"] || process.env["google_cloud_project"];
    const hasKeyFile = process.env["GOOGLE_APPLICATION_CREDENTIALS"] || process.env["google_application_credentials"];
    const googleAuth = isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH) ? {
      // Mock GoogleAuth for testing/proxy scenarios
      getClient: () => ({
        getRequestHeaders: () => ({})
      })
    } : new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      // Only use ANTHROPIC_VERTEX_PROJECT_ID as last resort fallback
      // This prevents the 12-second metadata server timeout when:
      // - No project env vars are set AND
      // - No credential keyfile is specified AND
      // - ADC file exists but lacks project_id field
      //
      // Risk: If auth project != API target project, this could cause billing/audit issues
      // Mitigation: Users can set GOOGLE_CLOUD_PROJECT to override
      ...hasProjectEnvVar || hasKeyFile ? {} : {
        projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID
      }
    });
    const vertexArgs = {
      ...ARGS,
      region: getVertexRegionForModel(model),
      googleAuth,
      ...isDebugToStdErr() && { logger: createStderrLogger() }
    };
    return new AnthropicVertex(vertexArgs);
  }
  const clientConfig = {
    apiKey: isClaudeAISubscriber() ? null : apiKey || getAnthropicApiKey(),
    authToken: isClaudeAISubscriber() ? getClaudeAIOAuthTokens()?.accessToken : void 0,
    // Set baseURL from OAuth config when using staging OAuth
    ...process.env.USER_TYPE === "ant" && isEnvTruthy(process.env.USE_STAGING_OAUTH) ? { baseURL: getOauthConfig().BASE_API_URL } : {},
    ...ARGS,
    ...isDebugToStdErr() && { logger: createStderrLogger() }
  };
  return new Anthropic(clientConfig);
}
async function configureApiKeyHeaders(headers, isNonInteractiveSession) {
  const token = process.env.ANTHROPIC_AUTH_TOKEN || await getApiKeyFromApiKeyHelper(isNonInteractiveSession);
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
}
function getCustomHeaders() {
  const customHeaders = {};
  const customHeadersEnv = process.env.ANTHROPIC_CUSTOM_HEADERS;
  if (!customHeadersEnv) return customHeaders;
  const headerStrings = customHeadersEnv.split(/\n|\r\n/);
  for (const headerString of headerStrings) {
    if (!headerString.trim()) continue;
    const colonIdx = headerString.indexOf(":");
    if (colonIdx === -1) continue;
    const name = headerString.slice(0, colonIdx).trim();
    const value = headerString.slice(colonIdx + 1).trim();
    if (name) {
      customHeaders[name] = value;
    }
  }
  return customHeaders;
}
const CLIENT_REQUEST_ID_HEADER = "x-client-request-id";
function buildFetch(fetchOverride, source) {
  const inner = fetchOverride ?? globalThis.fetch;
  const injectClientRequestId = getAPIProvider() === "firstParty" && isFirstPartyAnthropicBaseUrl();
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (injectClientRequestId && !headers.has(CLIENT_REQUEST_ID_HEADER)) {
      headers.set(CLIENT_REQUEST_ID_HEADER, randomUUID());
    }
    try {
      const url = input instanceof Request ? input.url : String(input);
      const id = headers.get(CLIENT_REQUEST_ID_HEADER);
      logForDebugging(
        `[API REQUEST] ${new URL(url).pathname}${id ? ` ${CLIENT_REQUEST_ID_HEADER}=${id}` : ""} source=${source ?? "unknown"}`
      );
    } catch {
    }
    return inner(input, { ...init, headers });
  };
}
export {
  CLIENT_REQUEST_ID_HEADER,
  getAnthropicClient
};
