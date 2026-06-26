const feature = (_name) => false;
import { statSync } from "fs";
import { lstat, readdir, readFile, realpath, stat } from "fs/promises";
import memoize from "lodash-es/memoize.js";
import { homedir } from "os";
import { dirname, join, resolve, sep } from "path";
import {
  logEvent
} from "../services/analytics/index.js";
import { getProjectRoot } from "../bootstrap/state.js";
import { logForDebugging } from "./debug.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "./envUtils.js";
import { isFsInaccessible } from "./errors.js";
import { normalizePathForComparison } from "./file.js";
import { parseFrontmatter } from "./frontmatterParser.js";
import { findCanonicalGitRoot, findGitRoot } from "./git.js";
import { parseToolListFromCLI } from "./permissions/permissionSetup.js";
import { ripGrep } from "./ripgrep.js";
import {
  isSettingSourceEnabled
} from "./settings/constants.js";
import { getManagedFilePath } from "./settings/managedPath.js";
import { isRestrictedToPluginOnly } from "./settings/pluginOnlyPolicy.js";
const CLAUDE_CONFIG_DIRECTORIES = [
  "commands",
  "agents",
  "output-styles",
  "skills",
  "workflows",
  ...false ? ["templates"] : []
];
function extractDescriptionFromMarkdown(content, defaultDescription = "Custom item") {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      const headerMatch = trimmed.match(/^#+\s+(.+)$/);
      const text = headerMatch?.[1] ?? trimmed;
      return text.length > 100 ? text.substring(0, 97) + "..." : text;
    }
  }
  return defaultDescription;
}
function parseToolListString(toolsValue) {
  if (toolsValue === void 0 || toolsValue === null) {
    return null;
  }
  if (!toolsValue) {
    return [];
  }
  let toolsArray = [];
  if (typeof toolsValue === "string") {
    toolsArray = [toolsValue];
  } else if (Array.isArray(toolsValue)) {
    toolsArray = toolsValue.filter(
      (item) => typeof item === "string"
    );
  }
  if (toolsArray.length === 0) {
    return [];
  }
  const parsedTools = parseToolListFromCLI(toolsArray);
  if (parsedTools.includes("*")) {
    return ["*"];
  }
  return parsedTools;
}
function parseAgentToolsFromFrontmatter(toolsValue) {
  const parsed = parseToolListString(toolsValue);
  if (parsed === null) {
    return toolsValue === void 0 ? void 0 : [];
  }
  if (parsed.includes("*")) {
    return void 0;
  }
  return parsed;
}
function parseSlashCommandToolsFromFrontmatter(toolsValue) {
  const parsed = parseToolListString(toolsValue);
  if (parsed === null) {
    return [];
  }
  return parsed;
}
async function getFileIdentity(filePath) {
  try {
    const stats = await lstat(filePath, { bigint: true });
    if (stats.dev === 0n && stats.ino === 0n) {
      return null;
    }
    return `${stats.dev}:${stats.ino}`;
  } catch {
    return null;
  }
}
function resolveStopBoundary(cwd) {
  const cwdGitRoot = findGitRoot(cwd);
  const sessionGitRoot = findGitRoot(getProjectRoot());
  if (!cwdGitRoot || !sessionGitRoot) {
    return cwdGitRoot;
  }
  const cwdCanonical = findCanonicalGitRoot(cwd);
  if (cwdCanonical && normalizePathForComparison(cwdCanonical) === normalizePathForComparison(sessionGitRoot)) {
    return cwdGitRoot;
  }
  const nCwdGitRoot = normalizePathForComparison(cwdGitRoot);
  const nSessionRoot = normalizePathForComparison(sessionGitRoot);
  if (nCwdGitRoot !== nSessionRoot && nCwdGitRoot.startsWith(nSessionRoot + sep)) {
    return sessionGitRoot;
  }
  return cwdGitRoot;
}
function getProjectDirsUpToHome(subdir, cwd) {
  const home = resolve(homedir()).normalize("NFC");
  const gitRoot = resolveStopBoundary(cwd);
  let current = resolve(cwd);
  const dirs = [];
  while (true) {
    if (normalizePathForComparison(current) === normalizePathForComparison(home)) {
      break;
    }
    const claudeSubdir = join(current, ".claude", subdir);
    try {
      statSync(claudeSubdir);
      dirs.push(claudeSubdir);
    } catch (e) {
      if (!isFsInaccessible(e)) throw e;
    }
    if (gitRoot && normalizePathForComparison(current) === normalizePathForComparison(gitRoot)) {
      break;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return dirs;
}
const loadMarkdownFilesForSubdir = memoize(
  async function(subdir, cwd) {
    const searchStartTime = Date.now();
    const userDir = join(getClaudeConfigHomeDir(), subdir);
    const managedDir = join(getManagedFilePath(), ".claude", subdir);
    const projectDirs = getProjectDirsUpToHome(subdir, cwd);
    const gitRoot = findGitRoot(cwd);
    const canonicalRoot = findCanonicalGitRoot(cwd);
    if (gitRoot && canonicalRoot && canonicalRoot !== gitRoot) {
      const worktreeSubdir = normalizePathForComparison(
        join(gitRoot, ".claude", subdir)
      );
      const worktreeHasSubdir = projectDirs.some(
        (dir) => normalizePathForComparison(dir) === worktreeSubdir
      );
      if (!worktreeHasSubdir) {
        const mainClaudeSubdir = join(canonicalRoot, ".claude", subdir);
        if (!projectDirs.includes(mainClaudeSubdir)) {
          projectDirs.push(mainClaudeSubdir);
        }
      }
    }
    const [managedFiles, userFiles, projectFilesNested] = await Promise.all([
      // Always load managed (policy settings)
      loadMarkdownFiles(managedDir).then(
        (_) => _.map((file) => ({
          ...file,
          baseDir: managedDir,
          source: "policySettings"
        }))
      ),
      // Conditionally load user files
      isSettingSourceEnabled("userSettings") && !(subdir === "agents" && isRestrictedToPluginOnly("agents")) ? loadMarkdownFiles(userDir).then(
        (_) => _.map((file) => ({
          ...file,
          baseDir: userDir,
          source: "userSettings"
        }))
      ) : Promise.resolve([]),
      // Conditionally load project files from all directories up to home
      isSettingSourceEnabled("projectSettings") && !(subdir === "agents" && isRestrictedToPluginOnly("agents")) ? Promise.all(
        projectDirs.map(
          (projectDir) => loadMarkdownFiles(projectDir).then(
            (_) => _.map((file) => ({
              ...file,
              baseDir: projectDir,
              source: "projectSettings"
            }))
          )
        )
      ) : Promise.resolve([])
    ]);
    const projectFiles = projectFilesNested.flat();
    const allFiles = [...managedFiles, ...userFiles, ...projectFiles];
    const fileIdentities = await Promise.all(
      allFiles.map((file) => getFileIdentity(file.filePath))
    );
    const seenFileIds = /* @__PURE__ */ new Map();
    const deduplicatedFiles = [];
    for (const [i, file] of allFiles.entries()) {
      const fileId = fileIdentities[i] ?? null;
      if (fileId === null) {
        deduplicatedFiles.push(file);
        continue;
      }
      const existingSource = seenFileIds.get(fileId);
      if (existingSource !== void 0) {
        logForDebugging(
          `Skipping duplicate file '${file.filePath}' from ${file.source} (same inode already loaded from ${existingSource})`
        );
        continue;
      }
      seenFileIds.set(fileId, file.source);
      deduplicatedFiles.push(file);
    }
    const duplicatesRemoved = allFiles.length - deduplicatedFiles.length;
    if (duplicatesRemoved > 0) {
      logForDebugging(
        `Deduplicated ${duplicatesRemoved} files in ${subdir} (same inode via symlinks or hard links)`
      );
    }
    logEvent(`tengu_dir_search`, {
      durationMs: Date.now() - searchStartTime,
      managedFilesFound: managedFiles.length,
      userFilesFound: userFiles.length,
      projectFilesFound: projectFiles.length,
      projectDirsSearched: projectDirs.length,
      subdir
    });
    return deduplicatedFiles;
  },
  // Custom resolver creates cache key from both subdir and cwd parameters
  (subdir, cwd) => `${subdir}:${cwd}`
);
async function findMarkdownFilesNative(dir, signal) {
  const files = [];
  const visitedDirs = /* @__PURE__ */ new Set();
  async function walk(currentDir) {
    if (signal.aborted) {
      return;
    }
    try {
      const stats = await stat(currentDir, { bigint: true });
      if (stats.isDirectory()) {
        const dirKey = stats.dev !== void 0 && stats.ino !== void 0 ? `${stats.dev}:${stats.ino}` : await realpath(currentDir);
        if (visitedDirs.has(dirKey)) {
          logForDebugging(
            `Skipping already visited directory (circular symlink): ${currentDir}`
          );
          return;
        }
        visitedDirs.add(dirKey);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logForDebugging(`Failed to stat directory ${currentDir}: ${errorMessage}`);
      return;
    }
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (signal.aborted) {
          break;
        }
        const fullPath = join(currentDir, entry.name);
        try {
          if (entry.isSymbolicLink()) {
            try {
              const stats = await stat(fullPath);
              if (stats.isDirectory()) {
                await walk(fullPath);
              } else if (stats.isFile() && entry.name.endsWith(".md")) {
                files.push(fullPath);
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              logForDebugging(
                `Failed to follow symlink ${fullPath}: ${errorMessage}`
              );
            }
          } else if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile() && entry.name.endsWith(".md")) {
            files.push(fullPath);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logForDebugging(`Failed to access ${fullPath}: ${errorMessage}`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logForDebugging(`Failed to read directory ${currentDir}: ${errorMessage}`);
    }
  }
  await walk(dir);
  return files;
}
async function loadMarkdownFiles(dir) {
  const useNative = isEnvTruthy(process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH);
  const signal = AbortSignal.timeout(3e3);
  let files;
  try {
    files = useNative ? await findMarkdownFilesNative(dir, signal) : await ripGrep(
      ["--files", "--hidden", "--follow", "--no-ignore", "--glob", "*.md"],
      dir,
      signal
    );
  } catch (e) {
    if (isFsInaccessible(e)) return [];
    throw e;
  }
  const results = await Promise.all(
    files.map(async (filePath) => {
      try {
        const rawContent = await readFile(filePath, { encoding: "utf-8" });
        const { frontmatter, content } = parseFrontmatter(rawContent, filePath);
        return {
          filePath,
          frontmatter,
          content
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logForDebugging(
          `Failed to read/parse markdown file:  ${filePath}: ${errorMessage}`
        );
        return null;
      }
    })
  );
  return results.filter((_) => _ !== null);
}
export {
  CLAUDE_CONFIG_DIRECTORIES,
  extractDescriptionFromMarkdown,
  getProjectDirsUpToHome,
  loadMarkdownFilesForSubdir,
  parseAgentToolsFromFrontmatter,
  parseSlashCommandToolsFromFrontmatter
};
