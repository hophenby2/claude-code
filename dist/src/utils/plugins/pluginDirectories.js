import { mkdirSync } from "fs";
import { readdir, rm, stat } from "fs/promises";
import { delimiter, join } from "path";
import { getUseCoworkPlugins } from "../../bootstrap/state.js";
import { logForDebugging } from "../debug.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "../envUtils.js";
import { errorMessage, isFsInaccessible } from "../errors.js";
import { formatFileSize } from "../format.js";
import { expandTilde } from "../permissions/pathValidation.js";
const PLUGINS_DIR = "plugins";
const COWORK_PLUGINS_DIR = "cowork_plugins";
function getPluginsDirectoryName() {
  if (getUseCoworkPlugins()) {
    return COWORK_PLUGINS_DIR;
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_COWORK_PLUGINS)) {
    return COWORK_PLUGINS_DIR;
  }
  return PLUGINS_DIR;
}
function getPluginsDirectory() {
  const envOverride = process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR;
  if (envOverride) {
    return expandTilde(envOverride);
  }
  return join(getClaudeConfigHomeDir(), getPluginsDirectoryName());
}
function getPluginSeedDirs() {
  const raw = process.env.CLAUDE_CODE_PLUGIN_SEED_DIR;
  if (!raw) return [];
  return raw.split(delimiter).filter(Boolean).map(expandTilde);
}
function sanitizePluginId(pluginId) {
  return pluginId.replace(/[^a-zA-Z0-9\-_]/g, "-");
}
function pluginDataDirPath(pluginId) {
  return join(getPluginsDirectory(), "data", sanitizePluginId(pluginId));
}
function getPluginDataDir(pluginId) {
  const dir = pluginDataDirPath(pluginId);
  mkdirSync(dir, { recursive: true });
  return dir;
}
async function getPluginDataDirSize(pluginId) {
  const dir = pluginDataDirPath(pluginId);
  let bytes = 0;
  const walk = async (p) => {
    for (const entry of await readdir(p, { withFileTypes: true })) {
      const full = join(p, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        try {
          bytes += (await stat(full)).size;
        } catch {
        }
      }
    }
  };
  try {
    await walk(dir);
  } catch (e) {
    if (isFsInaccessible(e)) return null;
    throw e;
  }
  if (bytes === 0) return null;
  return { bytes, human: formatFileSize(bytes) };
}
async function deletePluginDataDir(pluginId) {
  const dir = pluginDataDirPath(pluginId);
  try {
    await rm(dir, { recursive: true, force: true });
  } catch (e) {
    logForDebugging(
      `Failed to delete plugin data dir ${dir}: ${errorMessage(e)}`,
      { level: "warn" }
    );
  }
}
export {
  deletePluginDataDir,
  getPluginDataDir,
  getPluginDataDirSize,
  getPluginSeedDirs,
  getPluginsDirectory,
  pluginDataDirPath
};
