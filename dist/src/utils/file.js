import { chmodSync, writeFileSync as fsWriteFileSync } from "fs";
import { realpath, stat } from "fs/promises";
import { homedir } from "os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep
} from "path";
import { logEvent } from "../services/analytics/index.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import { getCwd } from "../utils/cwd.js";
import { logForDebugging } from "./debug.js";
import { isENOENT, isFsInaccessible } from "./errors.js";
import {
  detectEncodingForResolvedPath,
  detectLineEndingsForString
} from "./fileRead.js";
import { fileReadCache } from "./fileReadCache.js";
import { getFsImplementation, safeResolvePath } from "./fsOperations.js";
import { logError } from "./log.js";
import { expandPath } from "./path.js";
import { getPlatform } from "./platform.js";
async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
const MAX_OUTPUT_SIZE = 0.25 * 1024 * 1024;
function readFileSafe(filepath) {
  try {
    const fs = getFsImplementation();
    return fs.readFileSync(filepath, { encoding: "utf8" });
  } catch (error) {
    logError(error);
    return null;
  }
}
function getFileModificationTime(filePath) {
  const fs = getFsImplementation();
  return Math.floor(fs.statSync(filePath).mtimeMs);
}
async function getFileModificationTimeAsync(filePath) {
  const s = await getFsImplementation().stat(filePath);
  return Math.floor(s.mtimeMs);
}
function writeTextContent(filePath, content, encoding, endings) {
  let toWrite = content;
  if (endings === "CRLF") {
    toWrite = content.replaceAll("\r\n", "\n").split("\n").join("\r\n");
  }
  writeFileSyncAndFlush_DEPRECATED(filePath, toWrite, { encoding });
}
function detectFileEncoding(filePath) {
  try {
    const fs = getFsImplementation();
    const { resolvedPath } = safeResolvePath(fs, filePath);
    return detectEncodingForResolvedPath(resolvedPath);
  } catch (error) {
    if (isFsInaccessible(error)) {
      logForDebugging(
        `detectFileEncoding failed for expected reason: ${error.code}`,
        {
          level: "debug"
        }
      );
    } else {
      logError(error);
    }
    return "utf8";
  }
}
function detectLineEndings(filePath, encoding = "utf8") {
  try {
    const fs = getFsImplementation();
    const { resolvedPath } = safeResolvePath(fs, filePath);
    const { buffer, bytesRead } = fs.readSync(resolvedPath, { length: 4096 });
    const content = buffer.toString(encoding, 0, bytesRead);
    return detectLineEndingsForString(content);
  } catch (error) {
    logError(error);
    return "LF";
  }
}
function convertLeadingTabsToSpaces(content) {
  if (!content.includes("	")) return content;
  return content.replace(/^\t+/gm, (_) => "  ".repeat(_.length));
}
function getAbsoluteAndRelativePaths(path) {
  const absolutePath = path ? expandPath(path) : void 0;
  const relativePath = absolutePath ? relative(getCwd(), absolutePath) : void 0;
  return { absolutePath, relativePath };
}
function getDisplayPath(filePath) {
  const { relativePath } = getAbsoluteAndRelativePaths(filePath);
  if (relativePath && !relativePath.startsWith("..")) {
    return relativePath;
  }
  const homeDir = homedir();
  if (filePath.startsWith(homeDir + sep)) {
    return "~" + filePath.slice(homeDir.length);
  }
  return filePath;
}
function findSimilarFile(filePath) {
  const fs = getFsImplementation();
  try {
    const dir = dirname(filePath);
    const fileBaseName = basename(filePath, extname(filePath));
    const files = fs.readdirSync(dir);
    const similarFiles = files.filter(
      (file) => basename(file.name, extname(file.name)) === fileBaseName && join(dir, file.name) !== filePath
    );
    const firstMatch = similarFiles[0];
    if (firstMatch) {
      return firstMatch.name;
    }
    return void 0;
  } catch (error) {
    if (!isENOENT(error)) {
      logError(error);
    }
    return void 0;
  }
}
const FILE_NOT_FOUND_CWD_NOTE = "Note: your current working directory is";
async function suggestPathUnderCwd(requestedPath) {
  const cwd = getCwd();
  const cwdParent = dirname(cwd);
  let resolvedPath = requestedPath;
  try {
    const resolvedDir = await realpath(dirname(requestedPath));
    resolvedPath = join(resolvedDir, basename(requestedPath));
  } catch {
  }
  const cwdParentPrefix = cwdParent === sep ? sep : cwdParent + sep;
  if (!resolvedPath.startsWith(cwdParentPrefix) || resolvedPath.startsWith(cwd + sep) || resolvedPath === cwd) {
    return void 0;
  }
  const relFromParent = relative(cwdParent, resolvedPath);
  const correctedPath = join(cwd, relFromParent);
  try {
    await stat(correctedPath);
    return correctedPath;
  } catch {
    return void 0;
  }
}
function isCompactLinePrefixEnabled() {
  return !getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_compact_line_prefix_killswitch",
    false
  );
}
function addLineNumbers({
  content,
  // 1-indexed
  startLine
}) {
  if (!content) {
    return "";
  }
  const lines = content.split(/\r?\n/);
  if (isCompactLinePrefixEnabled()) {
    return lines.map((line, index) => `${index + startLine}	${line}`).join("\n");
  }
  return lines.map((line, index) => {
    const numStr = String(index + startLine);
    if (numStr.length >= 6) {
      return `${numStr}\u2192${line}`;
    }
    return `${numStr.padStart(6, " ")}\u2192${line}`;
  }).join("\n");
}
function stripLineNumberPrefix(line) {
  const match = line.match(/^\s*\d+[\u2192\t](.*)$/);
  return match?.[1] ?? line;
}
function isDirEmpty(dirPath) {
  try {
    return getFsImplementation().isDirEmptySync(dirPath);
  } catch (e) {
    return isENOENT(e);
  }
}
function readFileSyncCached(filePath) {
  const { content } = fileReadCache.readFile(filePath);
  return content;
}
function writeFileSyncAndFlush_DEPRECATED(filePath, content, options = { encoding: "utf-8" }) {
  const fs = getFsImplementation();
  let targetPath = filePath;
  try {
    const linkTarget = fs.readlinkSync(filePath);
    targetPath = isAbsolute(linkTarget) ? linkTarget : resolve(dirname(filePath), linkTarget);
    logForDebugging(`Writing through symlink: ${filePath} -> ${targetPath}`);
  } catch {
  }
  const tempPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  let targetMode;
  let targetExists = false;
  try {
    targetMode = fs.statSync(targetPath).mode;
    targetExists = true;
    logForDebugging(`Preserving file permissions: ${targetMode.toString(8)}`);
  } catch (e) {
    if (!isENOENT(e)) throw e;
    if (options.mode !== void 0) {
      targetMode = options.mode;
      logForDebugging(
        `Setting permissions for new file: ${targetMode.toString(8)}`
      );
    }
  }
  try {
    logForDebugging(`Writing to temp file: ${tempPath}`);
    const writeOptions = {
      encoding: options.encoding,
      flush: true
    };
    if (!targetExists && options.mode !== void 0) {
      writeOptions.mode = options.mode;
    }
    fsWriteFileSync(tempPath, content, writeOptions);
    logForDebugging(
      `Temp file written successfully, size: ${content.length} bytes`
    );
    if (targetExists && targetMode !== void 0) {
      chmodSync(tempPath, targetMode);
      logForDebugging(`Applied original permissions to temp file`);
    }
    logForDebugging(`Renaming ${tempPath} to ${targetPath}`);
    fs.renameSync(tempPath, targetPath);
    logForDebugging(`File ${targetPath} written atomically`);
  } catch (atomicError) {
    logForDebugging(`Failed to write file atomically: ${atomicError}`, {
      level: "error"
    });
    logEvent("tengu_atomic_write_error", {});
    try {
      logForDebugging(`Cleaning up temp file: ${tempPath}`);
      fs.unlinkSync(tempPath);
    } catch (cleanupError) {
      logForDebugging(`Failed to clean up temp file: ${cleanupError}`);
    }
    logForDebugging(`Falling back to non-atomic write for ${targetPath}`);
    try {
      const fallbackOptions = {
        encoding: options.encoding,
        flush: true
      };
      if (!targetExists && options.mode !== void 0) {
        fallbackOptions.mode = options.mode;
      }
      fsWriteFileSync(targetPath, content, fallbackOptions);
      logForDebugging(
        `File ${targetPath} written successfully with non-atomic fallback`
      );
    } catch (fallbackError) {
      logForDebugging(`Non-atomic write also failed: ${fallbackError}`);
      throw fallbackError;
    }
  }
}
function getDesktopPath() {
  const platform = getPlatform();
  const homeDir = homedir();
  if (platform === "macos") {
    return join(homeDir, "Desktop");
  }
  if (platform === "windows") {
    const windowsHome = process.env.USERPROFILE ? process.env.USERPROFILE.replace(/\\/g, "/") : null;
    if (windowsHome) {
      const wslPath = windowsHome.replace(/^[A-Z]:/, "");
      const desktopPath2 = `/mnt/c${wslPath}/Desktop`;
      if (getFsImplementation().existsSync(desktopPath2)) {
        return desktopPath2;
      }
    }
    try {
      const usersDir = "/mnt/c/Users";
      const userDirs = getFsImplementation().readdirSync(usersDir);
      for (const user of userDirs) {
        if (user.name === "Public" || user.name === "Default" || user.name === "Default User" || user.name === "All Users") {
          continue;
        }
        const potentialDesktopPath = join(usersDir, user.name, "Desktop");
        if (getFsImplementation().existsSync(potentialDesktopPath)) {
          return potentialDesktopPath;
        }
      }
    } catch (error) {
      logError(error);
    }
  }
  const desktopPath = join(homeDir, "Desktop");
  if (getFsImplementation().existsSync(desktopPath)) {
    return desktopPath;
  }
  return homeDir;
}
function isFileWithinReadSizeLimit(filePath, maxSizeBytes = MAX_OUTPUT_SIZE) {
  try {
    const stats = getFsImplementation().statSync(filePath);
    return stats.size <= maxSizeBytes;
  } catch {
    return false;
  }
}
function normalizePathForComparison(filePath) {
  let normalized = normalize(filePath);
  if (getPlatform() === "windows") {
    normalized = normalized.replace(/\//g, "\\").toLowerCase();
  }
  return normalized;
}
function pathsEqual(path1, path2) {
  return normalizePathForComparison(path1) === normalizePathForComparison(path2);
}
export {
  FILE_NOT_FOUND_CWD_NOTE,
  MAX_OUTPUT_SIZE,
  addLineNumbers,
  convertLeadingTabsToSpaces,
  detectFileEncoding,
  detectLineEndings,
  findSimilarFile,
  getAbsoluteAndRelativePaths,
  getDesktopPath,
  getDisplayPath,
  getFileModificationTime,
  getFileModificationTimeAsync,
  isCompactLinePrefixEnabled,
  isDirEmpty,
  isFileWithinReadSizeLimit,
  normalizePathForComparison,
  pathExists,
  pathsEqual,
  readFileSafe,
  readFileSyncCached,
  stripLineNumberPrefix,
  suggestPathUnderCwd,
  writeFileSyncAndFlush_DEPRECATED,
  writeTextContent
};
