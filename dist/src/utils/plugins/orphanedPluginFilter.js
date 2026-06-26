import { dirname, isAbsolute, join, normalize, relative, sep } from "path";
import { ripGrep } from "../ripgrep.js";
import { getPluginsDirectory } from "./pluginDirectories.js";
const ORPHANED_AT_FILENAME = ".orphaned_at";
let cachedExclusions = null;
async function getGlobExclusionsForPluginCache(searchPath) {
  const cachePath = normalize(join(getPluginsDirectory(), "cache"));
  if (searchPath && !pathsOverlap(searchPath, cachePath)) {
    return [];
  }
  if (cachedExclusions !== null) {
    return cachedExclusions;
  }
  try {
    const markers = await ripGrep(
      [
        "--files",
        "--hidden",
        "--no-ignore",
        "--max-depth",
        "4",
        "--glob",
        ORPHANED_AT_FILENAME
      ],
      cachePath,
      new AbortController().signal
    );
    cachedExclusions = markers.map((markerPath) => {
      const versionDir = dirname(markerPath);
      const rel = isAbsolute(versionDir) ? relative(cachePath, versionDir) : versionDir;
      const posixRelative = rel.replace(/\\/g, "/");
      return `!**/${posixRelative}/**`;
    });
    return cachedExclusions;
  } catch {
    cachedExclusions = [];
    return cachedExclusions;
  }
}
function clearPluginCacheExclusions() {
  cachedExclusions = null;
}
function pathsOverlap(a, b) {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  return na === nb || na === sep || nb === sep || na.startsWith(nb + sep) || nb.startsWith(na + sep);
}
function normalizeForCompare(p) {
  const n = normalize(p);
  return process.platform === "win32" ? n.toLowerCase() : n;
}
export {
  clearPluginCacheExclusions,
  getGlobExclusionsForPluginCache
};
