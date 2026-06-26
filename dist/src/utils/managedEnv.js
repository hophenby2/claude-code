import { isRemoteManagedSettingsEligible } from "../services/remoteManagedSettings/syncCache.js";
import { clearCACertsCache } from "./caCerts.js";
import { getGlobalConfig } from "./config.js";
import { isEnvTruthy } from "./envUtils.js";
import {
  isProviderManagedEnvVar,
  SAFE_ENV_VARS
} from "./managedEnvConstants.js";
import { clearMTLSCache } from "./mtls.js";
import { clearProxyCache, configureGlobalAgents } from "./proxy.js";
import { isSettingSourceEnabled } from "./settings/constants.js";
import {
  getSettings_DEPRECATED,
  getSettingsForSource
} from "./settings/settings.js";
function withoutSSHTunnelVars(env) {
  if (!env || !process.env.ANTHROPIC_UNIX_SOCKET) return env || {};
  const {
    ANTHROPIC_UNIX_SOCKET: _1,
    ANTHROPIC_BASE_URL: _2,
    ANTHROPIC_API_KEY: _3,
    ANTHROPIC_AUTH_TOKEN: _4,
    CLAUDE_CODE_OAUTH_TOKEN: _5,
    ...rest
  } = env;
  return rest;
}
function withoutHostManagedProviderVars(env) {
  if (!env) return {};
  if (!isEnvTruthy(process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST)) {
    return env;
  }
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (!isProviderManagedEnvVar(key)) {
      out[key] = value;
    }
  }
  return out;
}
let ccdSpawnEnvKeys;
function withoutCcdSpawnEnvKeys(env) {
  if (!env || !ccdSpawnEnvKeys) return env || {};
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (!ccdSpawnEnvKeys.has(key)) out[key] = value;
  }
  return out;
}
function filterSettingsEnv(env) {
  return withoutCcdSpawnEnvKeys(
    withoutHostManagedProviderVars(withoutSSHTunnelVars(env))
  );
}
const TRUSTED_SETTING_SOURCES = [
  "userSettings",
  "flagSettings",
  "policySettings"
];
function applySafeConfigEnvironmentVariables() {
  if (ccdSpawnEnvKeys === void 0) {
    ccdSpawnEnvKeys = process.env.CLAUDE_CODE_ENTRYPOINT === "claude-desktop" ? new Set(Object.keys(process.env)) : null;
  }
  Object.assign(process.env, filterSettingsEnv(getGlobalConfig().env));
  for (const source of TRUSTED_SETTING_SOURCES) {
    if (source === "policySettings") continue;
    if (!isSettingSourceEnabled(source)) continue;
    Object.assign(
      process.env,
      filterSettingsEnv(getSettingsForSource(source)?.env)
    );
  }
  isRemoteManagedSettingsEligible();
  Object.assign(
    process.env,
    filterSettingsEnv(getSettingsForSource("policySettings")?.env)
  );
  const settingsEnv = filterSettingsEnv(getSettings_DEPRECATED()?.env);
  for (const [key, value] of Object.entries(settingsEnv)) {
    if (SAFE_ENV_VARS.has(key.toUpperCase())) {
      process.env[key] = value;
    }
  }
}
function applyConfigEnvironmentVariables() {
  Object.assign(process.env, filterSettingsEnv(getGlobalConfig().env));
  Object.assign(process.env, filterSettingsEnv(getSettings_DEPRECATED()?.env));
  clearCACertsCache();
  clearMTLSCache();
  clearProxyCache();
  configureGlobalAgents();
}
export {
  applyConfigEnvironmentVariables,
  applySafeConfigEnvironmentVariables
};
