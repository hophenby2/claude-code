import { homedir as osHomedir } from "os";
import { join } from "path";
function resolveOptions(options) {
  return {
    env: options?.env ?? process.env,
    home: options?.homedir ?? process.env.HOME ?? osHomedir()
  };
}
function getXDGStateHome(options) {
  const { env, home } = resolveOptions(options);
  return env.XDG_STATE_HOME ?? join(home, ".local", "state");
}
function getXDGCacheHome(options) {
  const { env, home } = resolveOptions(options);
  return env.XDG_CACHE_HOME ?? join(home, ".cache");
}
function getXDGDataHome(options) {
  const { env, home } = resolveOptions(options);
  return env.XDG_DATA_HOME ?? join(home, ".local", "share");
}
function getUserBinDir(options) {
  const { home } = resolveOptions(options);
  return join(home, ".local", "bin");
}
export {
  getUserBinDir,
  getXDGCacheHome,
  getXDGDataHome,
  getXDGStateHome
};
