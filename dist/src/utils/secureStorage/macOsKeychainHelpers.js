import { createHash } from "crypto";
import { userInfo } from "os";
import { getOauthConfig } from "../../constants/oauth.js";
import { getClaudeConfigHomeDir } from "../envUtils.js";
const CREDENTIALS_SERVICE_SUFFIX = "-credentials";
function getMacOsKeychainStorageServiceName(serviceSuffix = "") {
  const configDir = getClaudeConfigHomeDir();
  const isDefaultDir = !process.env.CLAUDE_CONFIG_DIR;
  const dirHash = isDefaultDir ? "" : `-${createHash("sha256").update(configDir).digest("hex").substring(0, 8)}`;
  return `Claude Code${getOauthConfig().OAUTH_FILE_SUFFIX}${serviceSuffix}${dirHash}`;
}
function getUsername() {
  try {
    return process.env.USER || userInfo().username;
  } catch {
    return "claude-code-user";
  }
}
const KEYCHAIN_CACHE_TTL_MS = 3e4;
const keychainCacheState = {
  cache: { data: null, cachedAt: 0 },
  generation: 0,
  readInFlight: null
};
function clearKeychainCache() {
  keychainCacheState.cache = { data: null, cachedAt: 0 };
  keychainCacheState.generation++;
  keychainCacheState.readInFlight = null;
}
function primeKeychainCacheFromPrefetch(stdout) {
  if (keychainCacheState.cache.cachedAt !== 0) return;
  let data = null;
  if (stdout) {
    try {
      data = JSON.parse(stdout);
    } catch {
      return;
    }
  }
  keychainCacheState.cache = { data, cachedAt: Date.now() };
}
export {
  CREDENTIALS_SERVICE_SUFFIX,
  KEYCHAIN_CACHE_TTL_MS,
  clearKeychainCache,
  getMacOsKeychainStorageServiceName,
  getUsername,
  keychainCacheState,
  primeKeychainCacheFromPrefetch
};
