import { lstat, realpath } from "fs/promises";
import { dirname, join, resolve, sep } from "path";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import { getErrnoCode } from "../utils/errors.js";
import { getAutoMemPath, isAutoMemoryEnabled } from "./paths.js";
class PathTraversalError extends Error {
  constructor(message) {
    super(message);
    this.name = "PathTraversalError";
  }
}
function sanitizePathKey(key) {
  if (key.includes("\0")) {
    throw new PathTraversalError(`Null byte in path key: "${key}"`);
  }
  let decoded;
  try {
    decoded = decodeURIComponent(key);
  } catch {
    decoded = key;
  }
  if (decoded !== key && (decoded.includes("..") || decoded.includes("/"))) {
    throw new PathTraversalError(`URL-encoded traversal in path key: "${key}"`);
  }
  const normalized = key.normalize("NFKC");
  if (normalized !== key && (normalized.includes("..") || normalized.includes("/") || normalized.includes("\\") || normalized.includes("\0"))) {
    throw new PathTraversalError(
      `Unicode-normalized traversal in path key: "${key}"`
    );
  }
  if (key.includes("\\")) {
    throw new PathTraversalError(`Backslash in path key: "${key}"`);
  }
  if (key.startsWith("/")) {
    throw new PathTraversalError(`Absolute path key: "${key}"`);
  }
  return key;
}
function isTeamMemoryEnabled() {
  if (!isAutoMemoryEnabled()) {
    return false;
  }
  return getFeatureValue_CACHED_MAY_BE_STALE("tengu_herring_clock", false);
}
function getTeamMemPath() {
  return (join(getAutoMemPath(), "team") + sep).normalize("NFC");
}
function getTeamMemEntrypoint() {
  return join(getAutoMemPath(), "team", "MEMORY.md");
}
async function realpathDeepestExisting(absolutePath) {
  const tail = [];
  let current = absolutePath;
  for (let parent = dirname(current); current !== parent; parent = dirname(current)) {
    try {
      const realCurrent = await realpath(current);
      return tail.length === 0 ? realCurrent : join(realCurrent, ...tail.reverse());
    } catch (e) {
      const code = getErrnoCode(e);
      if (code === "ENOENT") {
        try {
          const st = await lstat(current);
          if (st.isSymbolicLink()) {
            throw new PathTraversalError(
              `Dangling symlink detected (target does not exist): "${current}"`
            );
          }
        } catch (lstatErr) {
          if (lstatErr instanceof PathTraversalError) {
            throw lstatErr;
          }
        }
      } else if (code === "ELOOP") {
        throw new PathTraversalError(
          `Symlink loop detected in path: "${current}"`
        );
      } else if (code !== "ENOTDIR" && code !== "ENAMETOOLONG") {
        throw new PathTraversalError(
          `Cannot verify path containment (${code}): "${current}"`
        );
      }
      tail.push(current.slice(parent.length + sep.length));
      current = parent;
    }
  }
  return absolutePath;
}
async function isRealPathWithinTeamDir(realCandidate) {
  let realTeamDir;
  try {
    realTeamDir = await realpath(getTeamMemPath().replace(/[/\\]+$/, ""));
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT" || code === "ENOTDIR") {
      return true;
    }
    return false;
  }
  if (realCandidate === realTeamDir) {
    return true;
  }
  return realCandidate.startsWith(realTeamDir + sep);
}
function isTeamMemPath(filePath) {
  const resolvedPath = resolve(filePath);
  const teamDir = getTeamMemPath();
  return resolvedPath.startsWith(teamDir);
}
async function validateTeamMemWritePath(filePath) {
  if (filePath.includes("\0")) {
    throw new PathTraversalError(`Null byte in path: "${filePath}"`);
  }
  const resolvedPath = resolve(filePath);
  const teamDir = getTeamMemPath();
  if (!resolvedPath.startsWith(teamDir)) {
    throw new PathTraversalError(
      `Path escapes team memory directory: "${filePath}"`
    );
  }
  const realPath = await realpathDeepestExisting(resolvedPath);
  if (!await isRealPathWithinTeamDir(realPath)) {
    throw new PathTraversalError(
      `Path escapes team memory directory via symlink: "${filePath}"`
    );
  }
  return resolvedPath;
}
async function validateTeamMemKey(relativeKey) {
  sanitizePathKey(relativeKey);
  const teamDir = getTeamMemPath();
  const fullPath = join(teamDir, relativeKey);
  const resolvedPath = resolve(fullPath);
  if (!resolvedPath.startsWith(teamDir)) {
    throw new PathTraversalError(
      `Key escapes team memory directory: "${relativeKey}"`
    );
  }
  const realPath = await realpathDeepestExisting(resolvedPath);
  if (!await isRealPathWithinTeamDir(realPath)) {
    throw new PathTraversalError(
      `Key escapes team memory directory via symlink: "${relativeKey}"`
    );
  }
  return resolvedPath;
}
function isTeamMemFile(filePath) {
  return isTeamMemoryEnabled() && isTeamMemPath(filePath);
}
export {
  PathTraversalError,
  getTeamMemEntrypoint,
  getTeamMemPath,
  isTeamMemFile,
  isTeamMemPath,
  isTeamMemoryEnabled,
  validateTeamMemKey,
  validateTeamMemWritePath
};
