import { randomBytes } from "crypto";
import {
  chmod,
  lstat,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "fs/promises";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
import { logForDebugging } from "../debug.js";
import { parseZipModes, unzipFile } from "../dxt/zip.js";
import { isEnvTruthy } from "../envUtils.js";
import { getFsImplementation } from "../fsOperations.js";
import { expandTilde } from "../permissions/pathValidation.js";
function isPluginZipCacheEnabled() {
  return isEnvTruthy(process.env.CLAUDE_CODE_PLUGIN_USE_ZIP_CACHE);
}
function getPluginZipCachePath() {
  if (!isPluginZipCacheEnabled()) {
    return void 0;
  }
  const dir = process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR;
  return dir ? expandTilde(dir) : void 0;
}
function getZipCacheKnownMarketplacesPath() {
  const cachePath = getPluginZipCachePath();
  if (!cachePath) {
    throw new Error("Plugin zip cache is not enabled");
  }
  return join(cachePath, "known_marketplaces.json");
}
function getZipCacheInstalledPluginsPath() {
  const cachePath = getPluginZipCachePath();
  if (!cachePath) {
    throw new Error("Plugin zip cache is not enabled");
  }
  return join(cachePath, "installed_plugins.json");
}
function getZipCacheMarketplacesDir() {
  const cachePath = getPluginZipCachePath();
  if (!cachePath) {
    throw new Error("Plugin zip cache is not enabled");
  }
  return join(cachePath, "marketplaces");
}
function getZipCachePluginsDir() {
  const cachePath = getPluginZipCachePath();
  if (!cachePath) {
    throw new Error("Plugin zip cache is not enabled");
  }
  return join(cachePath, "plugins");
}
let sessionPluginCachePath = null;
let sessionPluginCachePromise = null;
async function getSessionPluginCachePath() {
  if (sessionPluginCachePath) {
    return sessionPluginCachePath;
  }
  if (!sessionPluginCachePromise) {
    sessionPluginCachePromise = (async () => {
      const suffix = randomBytes(8).toString("hex");
      const dir = join(tmpdir(), `claude-plugin-session-${suffix}`);
      await getFsImplementation().mkdir(dir);
      sessionPluginCachePath = dir;
      logForDebugging(`Created session plugin cache at ${dir}`);
      return dir;
    })();
  }
  return sessionPluginCachePromise;
}
async function cleanupSessionPluginCache() {
  if (!sessionPluginCachePath) {
    return;
  }
  try {
    await rm(sessionPluginCachePath, { recursive: true, force: true });
    logForDebugging(
      `Cleaned up session plugin cache at ${sessionPluginCachePath}`
    );
  } catch (error) {
    logForDebugging(`Failed to clean up session plugin cache: ${error}`);
  } finally {
    sessionPluginCachePath = null;
    sessionPluginCachePromise = null;
  }
}
function resetSessionPluginCache() {
  sessionPluginCachePath = null;
  sessionPluginCachePromise = null;
}
async function atomicWriteToZipCache(targetPath, data) {
  const dir = dirname(targetPath);
  await getFsImplementation().mkdir(dir);
  const tmpName = `.${basename(targetPath)}.tmp.${randomBytes(4).toString("hex")}`;
  const tmpPath = join(dir, tmpName);
  try {
    if (typeof data === "string") {
      await writeFile(tmpPath, data, { encoding: "utf-8" });
    } else {
      await writeFile(tmpPath, data);
    }
    await rename(tmpPath, targetPath);
  } catch (error) {
    try {
      await rm(tmpPath, { force: true });
    } catch {
    }
    throw error;
  }
}
async function createZipFromDirectory(sourceDir) {
  const files = {};
  const visited = /* @__PURE__ */ new Set();
  await collectFilesForZip(sourceDir, "", files, visited);
  const { zipSync } = await import("fflate");
  const zipData = zipSync(files, { level: 6 });
  logForDebugging(
    `Created ZIP from ${sourceDir}: ${Object.keys(files).length} files, ${zipData.length} bytes`
  );
  return zipData;
}
async function collectFilesForZip(baseDir, relativePath, files, visited) {
  const currentDir = relativePath ? join(baseDir, relativePath) : baseDir;
  let entries;
  try {
    entries = await readdir(currentDir);
  } catch {
    return;
  }
  try {
    const dirStat = await stat(currentDir, { bigint: true });
    if (dirStat.dev !== 0n || dirStat.ino !== 0n) {
      const key = `${dirStat.dev}:${dirStat.ino}`;
      if (visited.has(key)) {
        logForDebugging(`Skipping symlink cycle at ${currentDir}`);
        return;
      }
      visited.add(key);
    }
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === ".git") {
      continue;
    }
    const fullPath = join(currentDir, entry);
    const relPath = relativePath ? `${relativePath}/${entry}` : entry;
    let fileStat;
    try {
      fileStat = await lstat(fullPath);
    } catch {
      continue;
    }
    if (fileStat.isSymbolicLink()) {
      try {
        const targetStat = await stat(fullPath);
        if (targetStat.isDirectory()) {
          continue;
        }
        fileStat = targetStat;
      } catch {
        continue;
      }
    }
    if (fileStat.isDirectory()) {
      await collectFilesForZip(baseDir, relPath, files, visited);
    } else if (fileStat.isFile()) {
      try {
        const content = await readFile(fullPath);
        files[relPath] = [
          new Uint8Array(content),
          { os: 3, attrs: (fileStat.mode & 65535) << 16 }
        ];
      } catch (error) {
        logForDebugging(`Failed to read file for zip: ${relPath}: ${error}`);
      }
    }
  }
}
async function extractZipToDirectory(zipPath, targetDir) {
  const zipBuf = await getFsImplementation().readFileBytes(zipPath);
  const files = await unzipFile(zipBuf);
  const modes = parseZipModes(zipBuf);
  await getFsImplementation().mkdir(targetDir);
  for (const [relPath, data] of Object.entries(files)) {
    if (relPath.endsWith("/")) {
      await getFsImplementation().mkdir(join(targetDir, relPath));
      continue;
    }
    const fullPath = join(targetDir, relPath);
    await getFsImplementation().mkdir(dirname(fullPath));
    await writeFile(fullPath, data);
    const mode = modes[relPath];
    if (mode && mode & 73) {
      await chmod(fullPath, mode & 511).catch(() => {
      });
    }
  }
  logForDebugging(
    `Extracted ZIP to ${targetDir}: ${Object.keys(files).length} entries`
  );
}
async function convertDirectoryToZipInPlace(dirPath, zipPath) {
  const zipData = await createZipFromDirectory(dirPath);
  await atomicWriteToZipCache(zipPath, zipData);
  await rm(dirPath, { recursive: true, force: true });
}
function getMarketplaceJsonRelativePath(marketplaceName) {
  const sanitized = marketplaceName.replace(/[^a-zA-Z0-9\-_]/g, "-");
  return join("marketplaces", `${sanitized}.json`);
}
function isMarketplaceSourceSupportedByZipCache(source) {
  return ["github", "git", "url", "settings"].includes(source.source);
}
export {
  atomicWriteToZipCache,
  cleanupSessionPluginCache,
  convertDirectoryToZipInPlace,
  createZipFromDirectory,
  extractZipToDirectory,
  getMarketplaceJsonRelativePath,
  getPluginZipCachePath,
  getSessionPluginCachePath,
  getZipCacheInstalledPluginsPath,
  getZipCacheKnownMarketplacesPath,
  getZipCacheMarketplacesDir,
  getZipCachePluginsDir,
  isMarketplaceSourceSupportedByZipCache,
  isPluginZipCacheEnabled,
  resetSessionPluginCache
};
