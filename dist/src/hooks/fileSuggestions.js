import { statSync } from "fs";
import ignore from "ignore";
import * as path from "path";
import {
  CLAUDE_CONFIG_DIRECTORIES,
  loadMarkdownFilesForSubdir
} from "../utils/markdownConfigLoader.js";
import {
  CHUNK_MS,
  FileIndex,
  yieldToEventLoop
} from "../native-ts/file-index/index.js";
import { logEvent } from "../services/analytics/index.js";
import { getGlobalConfig } from "../utils/config.js";
import { getCwd } from "../utils/cwd.js";
import { logForDebugging } from "../utils/debug.js";
import { isTuiSmokeTestMode } from "../utils/envUtils.js";
import { errorMessage } from "../utils/errors.js";
import { execFileNoThrowWithCwd } from "../utils/execFileNoThrow.js";
import { getFsImplementation } from "../utils/fsOperations.js";
import { findGitRoot, gitExe } from "../utils/git.js";
import {
  createBaseHookInput,
  executeFileSuggestionCommand
} from "../utils/hooks.js";
import { logError } from "../utils/log.js";
import { expandPath } from "../utils/path.js";
import { ripGrep } from "../utils/ripgrep.js";
import { getInitialSettings } from "../utils/settings/settings.js";
import { createSignal } from "../utils/signal.js";
let fileIndex = null;
function getFileIndex() {
  if (!fileIndex) {
    fileIndex = new FileIndex();
  }
  return fileIndex;
}
let fileListRefreshPromise = null;
const indexBuildComplete = createSignal();
const onIndexBuildComplete = indexBuildComplete.subscribe;
let cacheGeneration = 0;
let untrackedFetchPromise = null;
let cachedTrackedFiles = [];
let cachedConfigFiles = [];
let cachedTrackedDirs = [];
let ignorePatternsCache = null;
let ignorePatternsCacheKey = null;
let lastRefreshMs = 0;
let lastGitIndexMtime = null;
let loadedTrackedSignature = null;
let loadedMergedSignature = null;
function clearFileSuggestionCaches() {
  fileIndex = null;
  fileListRefreshPromise = null;
  cacheGeneration++;
  untrackedFetchPromise = null;
  cachedTrackedFiles = [];
  cachedConfigFiles = [];
  cachedTrackedDirs = [];
  indexBuildComplete.clear();
  ignorePatternsCache = null;
  ignorePatternsCacheKey = null;
  lastRefreshMs = 0;
  lastGitIndexMtime = null;
  loadedTrackedSignature = null;
  loadedMergedSignature = null;
}
function pathListSignature(paths) {
  const n = paths.length;
  const stride = Math.max(1, Math.floor(n / 500));
  let h = 2166136261 | 0;
  for (let i = 0; i < n; i += stride) {
    const p = paths[i];
    for (let j = 0; j < p.length; j++) {
      h = (h ^ p.charCodeAt(j)) * 16777619 | 0;
    }
    h = h * 16777619 | 0;
  }
  if (n > 0) {
    const last = paths[n - 1];
    for (let j = 0; j < last.length; j++) {
      h = (h ^ last.charCodeAt(j)) * 16777619 | 0;
    }
  }
  return `${n}:${(h >>> 0).toString(16)}`;
}
function getGitIndexMtime() {
  const repoRoot = findGitRoot(getCwd());
  if (!repoRoot) return null;
  try {
    return statSync(path.join(repoRoot, ".git", "index")).mtimeMs;
  } catch {
    return null;
  }
}
function normalizeGitPaths(files, repoRoot, originalCwd) {
  if (originalCwd === repoRoot) {
    return files;
  }
  return files.map((f) => {
    const absolutePath = path.join(repoRoot, f);
    return path.relative(originalCwd, absolutePath);
  });
}
async function mergeUntrackedIntoNormalizedCache(normalizedUntracked) {
  if (normalizedUntracked.length === 0) return;
  if (!fileIndex || cachedTrackedFiles.length === 0) return;
  const untrackedDirs = await getDirectoryNamesAsync(normalizedUntracked);
  const allPaths = [
    ...cachedTrackedFiles,
    ...cachedConfigFiles,
    ...cachedTrackedDirs,
    ...normalizedUntracked,
    ...untrackedDirs
  ];
  const sig = pathListSignature(allPaths);
  if (sig === loadedMergedSignature) {
    logForDebugging(
      `[FileIndex] skipped index rebuild \u2014 merged paths unchanged`
    );
    return;
  }
  await fileIndex.loadFromFileListAsync(allPaths).done;
  loadedMergedSignature = sig;
  logForDebugging(
    `[FileIndex] rebuilt index with ${cachedTrackedFiles.length} tracked + ${normalizedUntracked.length} untracked files`
  );
}
async function loadRipgrepIgnorePatterns(repoRoot, cwd) {
  const cacheKey = `${repoRoot}:${cwd}`;
  if (ignorePatternsCacheKey === cacheKey) {
    return ignorePatternsCache;
  }
  const fs = getFsImplementation();
  const ignoreFiles = [".ignore", ".rgignore"];
  const directories = [.../* @__PURE__ */ new Set([repoRoot, cwd])];
  const ig = ignore();
  let hasPatterns = false;
  const paths = directories.flatMap(
    (dir) => ignoreFiles.map((f) => path.join(dir, f))
  );
  const contents = await Promise.all(
    paths.map((p) => fs.readFile(p, { encoding: "utf8" }).catch(() => null))
  );
  for (const [i, content] of contents.entries()) {
    if (content === null) continue;
    ig.add(content);
    hasPatterns = true;
    logForDebugging(`[FileIndex] loaded ignore patterns from ${paths[i]}`);
  }
  const result = hasPatterns ? ig : null;
  ignorePatternsCache = result;
  ignorePatternsCacheKey = cacheKey;
  return result;
}
async function getFilesUsingGit(abortSignal, respectGitignore) {
  const startTime = Date.now();
  logForDebugging(`[FileIndex] getFilesUsingGit called`);
  const repoRoot = findGitRoot(getCwd());
  if (!repoRoot) {
    logForDebugging(`[FileIndex] not a git repo, returning null`);
    return null;
  }
  try {
    const cwd = getCwd();
    const lsFilesStart = Date.now();
    const trackedResult = await execFileNoThrowWithCwd(
      gitExe(),
      ["-c", "core.quotepath=false", "ls-files", "--recurse-submodules"],
      { timeout: 5e3, abortSignal, cwd: repoRoot }
    );
    logForDebugging(
      `[FileIndex] git ls-files (tracked) took ${Date.now() - lsFilesStart}ms`
    );
    if (trackedResult.code !== 0) {
      logForDebugging(
        `[FileIndex] git ls-files failed (code=${trackedResult.code}, stderr=${trackedResult.stderr}), falling back to ripgrep`
      );
      return null;
    }
    const trackedFiles = trackedResult.stdout.trim().split("\n").filter(Boolean);
    let normalizedTracked = normalizeGitPaths(trackedFiles, repoRoot, cwd);
    const ignorePatterns = await loadRipgrepIgnorePatterns(repoRoot, cwd);
    if (ignorePatterns) {
      const beforeCount = normalizedTracked.length;
      normalizedTracked = ignorePatterns.filter(normalizedTracked);
      logForDebugging(
        `[FileIndex] applied ignore patterns: ${beforeCount} -> ${normalizedTracked.length} files`
      );
    }
    cachedTrackedFiles = normalizedTracked;
    const duration = Date.now() - startTime;
    logForDebugging(
      `[FileIndex] git ls-files: ${normalizedTracked.length} tracked files in ${duration}ms`
    );
    logEvent("tengu_file_suggestions_git_ls_files", {
      file_count: normalizedTracked.length,
      tracked_count: normalizedTracked.length,
      untracked_count: 0,
      duration_ms: duration
    });
    if (!untrackedFetchPromise) {
      const untrackedArgs = respectGitignore ? [
        "-c",
        "core.quotepath=false",
        "ls-files",
        "--others",
        "--exclude-standard"
      ] : ["-c", "core.quotepath=false", "ls-files", "--others"];
      const generation = cacheGeneration;
      untrackedFetchPromise = execFileNoThrowWithCwd(gitExe(), untrackedArgs, {
        timeout: 1e4,
        cwd: repoRoot
      }).then(async (untrackedResult) => {
        if (generation !== cacheGeneration) {
          return;
        }
        if (untrackedResult.code === 0) {
          const rawUntrackedFiles = untrackedResult.stdout.trim().split("\n").filter(Boolean);
          let normalizedUntracked = normalizeGitPaths(
            rawUntrackedFiles,
            repoRoot,
            cwd
          );
          const ignorePatterns2 = await loadRipgrepIgnorePatterns(
            repoRoot,
            cwd
          );
          if (ignorePatterns2 && normalizedUntracked.length > 0) {
            const beforeCount = normalizedUntracked.length;
            normalizedUntracked = ignorePatterns2.filter(normalizedUntracked);
            logForDebugging(
              `[FileIndex] applied ignore patterns to untracked: ${beforeCount} -> ${normalizedUntracked.length} files`
            );
          }
          logForDebugging(
            `[FileIndex] background untracked fetch: ${normalizedUntracked.length} files`
          );
          void mergeUntrackedIntoNormalizedCache(normalizedUntracked);
        }
      }).catch((error) => {
        logForDebugging(
          `[FileIndex] background untracked fetch failed: ${error}`
        );
      }).finally(() => {
        untrackedFetchPromise = null;
      });
    }
    return normalizedTracked;
  } catch (error) {
    logForDebugging(`[FileIndex] git ls-files error: ${errorMessage(error)}`);
    return null;
  }
}
function getDirectoryNames(files) {
  const directoryNames = /* @__PURE__ */ new Set();
  collectDirectoryNames(files, 0, files.length, directoryNames);
  return [...directoryNames].map((d) => d + path.sep);
}
async function getDirectoryNamesAsync(files) {
  const directoryNames = /* @__PURE__ */ new Set();
  let chunkStart = performance.now();
  for (let i = 0; i < files.length; i++) {
    collectDirectoryNames(files, i, i + 1, directoryNames);
    if ((i & 255) === 255 && performance.now() - chunkStart > CHUNK_MS) {
      await yieldToEventLoop();
      chunkStart = performance.now();
    }
  }
  return [...directoryNames].map((d) => d + path.sep);
}
function collectDirectoryNames(files, start, end, out) {
  for (let i = start; i < end; i++) {
    let currentDir = path.dirname(files[i]);
    while (currentDir !== "." && !out.has(currentDir)) {
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      out.add(currentDir);
      currentDir = parent;
    }
  }
}
async function getClaudeConfigFiles(cwd) {
  const markdownFileArrays = await Promise.all(
    CLAUDE_CONFIG_DIRECTORIES.map(
      (subdir) => loadMarkdownFilesForSubdir(subdir, cwd)
    )
  );
  return markdownFileArrays.flatMap(
    (markdownFiles) => markdownFiles.map((f) => f.filePath)
  );
}
async function getProjectFiles(abortSignal, respectGitignore) {
  logForDebugging(
    `[FileIndex] getProjectFiles called, respectGitignore=${respectGitignore}`
  );
  const gitFiles = await getFilesUsingGit(abortSignal, respectGitignore);
  if (gitFiles !== null) {
    logForDebugging(
      `[FileIndex] using git ls-files result (${gitFiles.length} files)`
    );
    return gitFiles;
  }
  logForDebugging(
    `[FileIndex] git ls-files returned null, falling back to ripgrep`
  );
  const startTime = Date.now();
  const rgArgs = [
    "--files",
    "--follow",
    "--hidden",
    "--glob",
    "!.git/",
    "--glob",
    "!.svn/",
    "--glob",
    "!.hg/",
    "--glob",
    "!.bzr/",
    "--glob",
    "!.jj/",
    "--glob",
    "!.sl/"
  ];
  if (!respectGitignore) {
    rgArgs.push("--no-ignore-vcs");
  }
  const files = await ripGrep(rgArgs, ".", abortSignal);
  const relativePaths = files.map((f) => path.relative(getCwd(), f));
  const duration = Date.now() - startTime;
  logForDebugging(
    `[FileIndex] ripgrep: ${relativePaths.length} files in ${duration}ms`
  );
  logEvent("tengu_file_suggestions_ripgrep", {
    file_count: relativePaths.length,
    duration_ms: duration
  });
  return relativePaths;
}
async function getPathsForSuggestions() {
  const signal = AbortSignal.timeout(1e4);
  const index = getFileIndex();
  try {
    const projectSettings = getInitialSettings();
    const globalConfig = getGlobalConfig();
    const respectGitignore = projectSettings.respectGitignore ?? globalConfig.respectGitignore ?? true;
    const cwd = getCwd();
    const [projectFiles, configFiles] = await Promise.all([
      getProjectFiles(signal, respectGitignore),
      getClaudeConfigFiles(cwd)
    ]);
    cachedConfigFiles = configFiles;
    const allFiles = [...projectFiles, ...configFiles];
    const directories = await getDirectoryNamesAsync(allFiles);
    cachedTrackedDirs = directories;
    const allPathsList = [...directories, ...allFiles];
    const sig = pathListSignature(allPathsList);
    if (sig !== loadedTrackedSignature) {
      await index.loadFromFileListAsync(allPathsList).done;
      loadedTrackedSignature = sig;
      loadedMergedSignature = null;
    } else {
      logForDebugging(
        `[FileIndex] skipped index rebuild \u2014 tracked paths unchanged`
      );
    }
  } catch (error) {
    logError(error);
  }
  return index;
}
function findCommonPrefix(a, b) {
  const minLength = Math.min(a.length, b.length);
  let i = 0;
  while (i < minLength && a[i] === b[i]) {
    i++;
  }
  return a.substring(0, i);
}
function findLongestCommonPrefix(suggestions) {
  if (suggestions.length === 0) return "";
  const strings = suggestions.map((item) => item.displayText);
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    const currentString = strings[i];
    prefix = findCommonPrefix(prefix, currentString);
    if (prefix === "") return "";
  }
  return prefix;
}
function createFileSuggestionItem(filePath, score) {
  return {
    id: `file-${filePath}`,
    displayText: filePath,
    metadata: score !== void 0 ? { score } : void 0
  };
}
const MAX_SUGGESTIONS = 15;
function findMatchingFiles(fileIndex2, partialPath) {
  const results = fileIndex2.search(partialPath, MAX_SUGGESTIONS);
  return results.map(
    (result) => createFileSuggestionItem(result.path, result.score)
  );
}
const REFRESH_THROTTLE_MS = 5e3;
function startBackgroundCacheRefresh() {
  if (isTuiSmokeTestMode()) return;
  if (fileListRefreshPromise) return;
  const indexMtime = getGitIndexMtime();
  if (fileIndex) {
    const gitStateChanged = indexMtime !== null && indexMtime !== lastGitIndexMtime;
    if (!gitStateChanged && Date.now() - lastRefreshMs < REFRESH_THROTTLE_MS) {
      return;
    }
  }
  const generation = cacheGeneration;
  const refreshStart = Date.now();
  getFileIndex();
  fileListRefreshPromise = getPathsForSuggestions().then((result) => {
    if (generation !== cacheGeneration) {
      return result;
    }
    fileListRefreshPromise = null;
    indexBuildComplete.emit();
    lastGitIndexMtime = indexMtime;
    lastRefreshMs = Date.now();
    logForDebugging(
      `[FileIndex] cache refresh completed in ${Date.now() - refreshStart}ms`
    );
    return result;
  }).catch((error) => {
    logForDebugging(
      `[FileIndex] Cache refresh failed: ${errorMessage(error)}`
    );
    logError(error);
    if (generation === cacheGeneration) {
      fileListRefreshPromise = null;
    }
    return getFileIndex();
  });
}
async function getTopLevelPaths() {
  const fs = getFsImplementation();
  const cwd = getCwd();
  try {
    const entries = await fs.readdir(cwd);
    return entries.map((entry) => {
      const fullPath = path.join(cwd, entry.name);
      const relativePath = path.relative(cwd, fullPath);
      return entry.isDirectory() ? relativePath + path.sep : relativePath;
    });
  } catch (error) {
    logError(error);
    return [];
  }
}
async function generateFileSuggestions(partialPath, showOnEmpty = false) {
  if (!partialPath && !showOnEmpty) {
    return [];
  }
  if (getInitialSettings().fileSuggestion?.type === "command") {
    const input = {
      ...createBaseHookInput(),
      query: partialPath
    };
    const results = await executeFileSuggestionCommand(input);
    return results.slice(0, MAX_SUGGESTIONS).map(createFileSuggestionItem);
  }
  if (partialPath === "" || partialPath === "." || partialPath === "./") {
    const topLevelPaths = await getTopLevelPaths();
    startBackgroundCacheRefresh();
    return topLevelPaths.slice(0, MAX_SUGGESTIONS).map(createFileSuggestionItem);
  }
  const startTime = Date.now();
  try {
    const wasBuilding = fileListRefreshPromise !== null;
    startBackgroundCacheRefresh();
    let normalizedPath = partialPath;
    const currentDirPrefix = "." + path.sep;
    if (partialPath.startsWith(currentDirPrefix)) {
      normalizedPath = partialPath.substring(2);
    }
    if (normalizedPath.startsWith("~")) {
      normalizedPath = expandPath(normalizedPath);
    }
    const matches = fileIndex ? findMatchingFiles(fileIndex, normalizedPath) : [];
    const duration = Date.now() - startTime;
    logForDebugging(
      `[FileIndex] generateFileSuggestions: ${matches.length} results in ${duration}ms (${wasBuilding ? "partial" : "full"} index)`
    );
    logEvent("tengu_file_suggestions_query", {
      duration_ms: duration,
      cache_hit: !wasBuilding,
      result_count: matches.length,
      query_length: partialPath.length
    });
    return matches;
  } catch (error) {
    logError(error);
    return [];
  }
}
function applyFileSuggestion(suggestion, input, partialPath, startPos, onInputChange, setCursorOffset) {
  const suggestionText = typeof suggestion === "string" ? suggestion : suggestion.displayText;
  const newInput = input.substring(0, startPos) + suggestionText + input.substring(startPos + partialPath.length);
  onInputChange(newInput);
  const newCursorPos = startPos + suggestionText.length;
  setCursorOffset(newCursorPos);
}
export {
  applyFileSuggestion,
  clearFileSuggestionCaches,
  findLongestCommonPrefix,
  generateFileSuggestions,
  getDirectoryNames,
  getDirectoryNamesAsync,
  getPathsForSuggestions,
  onIndexBuildComplete,
  pathListSignature,
  startBackgroundCacheRefresh
};
