import { execFile } from "child_process";
import { isBareMode } from "../envUtils.js";
import {
  CREDENTIALS_SERVICE_SUFFIX,
  getMacOsKeychainStorageServiceName,
  getUsername,
  primeKeychainCacheFromPrefetch
} from "./macOsKeychainHelpers.js";
const KEYCHAIN_PREFETCH_TIMEOUT_MS = 1e4;
let legacyApiKeyPrefetch = null;
let prefetchPromise = null;
function spawnSecurity(serviceName) {
  return new Promise((resolve) => {
    execFile(
      "security",
      ["find-generic-password", "-a", getUsername(), "-w", "-s", serviceName],
      { encoding: "utf-8", timeout: KEYCHAIN_PREFETCH_TIMEOUT_MS },
      (err, stdout) => {
        resolve({
          stdout: err ? null : stdout?.trim() || null,
          timedOut: Boolean(err && "killed" in err && err.killed)
        });
      }
    );
  });
}
function startKeychainPrefetch() {
  if (process.platform !== "darwin" || prefetchPromise || isBareMode()) return;
  const oauthSpawn = spawnSecurity(
    getMacOsKeychainStorageServiceName(CREDENTIALS_SERVICE_SUFFIX)
  );
  const legacySpawn = spawnSecurity(getMacOsKeychainStorageServiceName());
  prefetchPromise = Promise.all([oauthSpawn, legacySpawn]).then(
    ([oauth, legacy]) => {
      if (!oauth.timedOut) primeKeychainCacheFromPrefetch(oauth.stdout);
      if (!legacy.timedOut) legacyApiKeyPrefetch = { stdout: legacy.stdout };
    }
  );
}
async function ensureKeychainPrefetchCompleted() {
  if (prefetchPromise) await prefetchPromise;
}
function getLegacyApiKeyPrefetchResult() {
  return legacyApiKeyPrefetch;
}
function clearLegacyApiKeyPrefetch() {
  legacyApiKeyPrefetch = null;
}
export {
  clearLegacyApiKeyPrefetch,
  ensureKeychainPrefetchCompleted,
  getLegacyApiKeyPrefetchResult,
  startKeychainPrefetch
};
