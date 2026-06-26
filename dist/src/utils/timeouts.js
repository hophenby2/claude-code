const DEFAULT_TIMEOUT_MS = 12e4;
const MAX_TIMEOUT_MS = 6e5;
function getDefaultBashTimeoutMs(env = process.env) {
  const envValue = env.BASH_DEFAULT_TIMEOUT_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_TIMEOUT_MS;
}
function getMaxBashTimeoutMs(env = process.env) {
  const envValue = env.BASH_MAX_TIMEOUT_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.max(parsed, getDefaultBashTimeoutMs(env));
    }
  }
  return Math.max(MAX_TIMEOUT_MS, getDefaultBashTimeoutMs(env));
}
export {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs
};
