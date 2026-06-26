import { isEnvTruthy } from "./envUtils.js";
const GHA_SUBPROCESS_SCRUB = [
  // Anthropic auth — claude re-reads these per-request, subprocesses don't need them
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_FOUNDRY_API_KEY",
  "ANTHROPIC_CUSTOM_HEADERS",
  // OTLP exporter headers — documented to carry Authorization=Bearer tokens
  // for monitoring backends; read in-process by OTEL SDK, subprocesses never need them
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_EXPORTER_OTLP_LOGS_HEADERS",
  "OTEL_EXPORTER_OTLP_METRICS_HEADERS",
  "OTEL_EXPORTER_OTLP_TRACES_HEADERS",
  // Cloud provider creds — same pattern (lazy SDK reads)
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_BEARER_TOKEN_BEDROCK",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "AZURE_CLIENT_SECRET",
  "AZURE_CLIENT_CERTIFICATE_PATH",
  // GitHub Actions OIDC — consumed by the action's JS before claude spawns;
  // leaking these allows minting an App installation token → repo takeover
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_URL",
  // GitHub Actions artifact/cache API — cache poisoning → supply-chain pivot
  "ACTIONS_RUNTIME_TOKEN",
  "ACTIONS_RUNTIME_URL",
  // claude-code-action-specific duplicates — action JS consumes these during
  // prepare, before spawning claude. ALL_INPUTS contains anthropic_api_key as JSON.
  "ALL_INPUTS",
  "OVERRIDE_GITHUB_TOKEN",
  "DEFAULT_WORKFLOW_TOKEN",
  "SSH_SIGNING_KEY"
];
let _getUpstreamProxyEnv;
function registerUpstreamProxyEnvFn(fn) {
  _getUpstreamProxyEnv = fn;
}
function subprocessEnv() {
  const proxyEnv = _getUpstreamProxyEnv?.() ?? {};
  if (!isEnvTruthy(process.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB)) {
    return Object.keys(proxyEnv).length > 0 ? { ...process.env, ...proxyEnv } : process.env;
  }
  const env = { ...process.env, ...proxyEnv };
  for (const k of GHA_SUBPROCESS_SCRUB) {
    delete env[k];
    delete env[`INPUT_${k}`];
  }
  return env;
}
export {
  registerUpstreamProxyEnvFn,
  subprocessEnv
};
