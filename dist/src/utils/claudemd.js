import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import ignore from "ignore";
import memoize from "lodash-es/memoize.js";
import { Lexer } from "marked";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  parse,
  relative,
  sep
} from "path";
import picomatch from "picomatch";
import { logEvent } from "../services/analytics/index.js";
import {
  getAdditionalDirectoriesForClaudeMd,
  getOriginalCwd
} from "../bootstrap/state.js";
import { truncateEntrypointContent } from "../memdir/memdir.js";
import { getAutoMemEntrypoint, isAutoMemoryEnabled } from "../memdir/paths.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import {
  getCurrentProjectConfig,
  getManagedClaudeRulesDir,
  getMemoryPath,
  getUserClaudeRulesDir
} from "./config.js";
import { logForDebugging } from "./debug.js";
import { logForDiagnosticsNoPII } from "./diagLogs.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "./envUtils.js";
import { getErrnoCode } from "./errors.js";
import { normalizePathForComparison } from "./file.js";
import { cacheKeys } from "./fileStateCache.js";
import {
  parseFrontmatter,
  splitPathInFrontmatter
} from "./frontmatterParser.js";
import { getFsImplementation, safeResolvePath } from "./fsOperations.js";
import { findCanonicalGitRoot, findGitRoot } from "./git.js";
import {
  executeInstructionsLoadedHooks,
  hasInstructionsLoadedHook
} from "./hooks.js";
import { expandPath } from "./path.js";
import { pathInWorkingPath } from "./permissions/filesystem.js";
import { isSettingSourceEnabled } from "./settings/constants.js";
import { getInitialSettings } from "./settings/settings.js";
const teamMemPaths = false ? require2("../memdir/teamMemPaths.js") : null;
let hasLoggedInitialLoad = false;
const MEMORY_INSTRUCTION_PROMPT = "Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.";
const MAX_MEMORY_CHARACTER_COUNT = 4e4;
const TEXT_FILE_EXTENSIONS = /* @__PURE__ */ new Set([
  // Markdown and text
  ".md",
  ".txt",
  ".text",
  // Data formats
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".csv",
  // Web
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  // JavaScript/TypeScript
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  // Python
  ".py",
  ".pyi",
  ".pyw",
  // Ruby
  ".rb",
  ".erb",
  ".rake",
  // Go
  ".go",
  // Rust
  ".rs",
  // Java/Kotlin/Scala
  ".java",
  ".kt",
  ".kts",
  ".scala",
  // C/C++
  ".c",
  ".cpp",
  ".cc",
  ".cxx",
  ".h",
  ".hpp",
  ".hxx",
  // C#
  ".cs",
  // Swift
  ".swift",
  // Shell
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".bat",
  ".cmd",
  // Config
  ".env",
  ".ini",
  ".cfg",
  ".conf",
  ".config",
  ".properties",
  // Database
  ".sql",
  ".graphql",
  ".gql",
  // Protocol
  ".proto",
  // Frontend frameworks
  ".vue",
  ".svelte",
  ".astro",
  // Templating
  ".ejs",
  ".hbs",
  ".pug",
  ".jade",
  // Other languages
  ".php",
  ".pl",
  ".pm",
  ".lua",
  ".r",
  ".R",
  ".dart",
  ".ex",
  ".exs",
  ".erl",
  ".hrl",
  ".clj",
  ".cljs",
  ".cljc",
  ".edn",
  ".hs",
  ".lhs",
  ".elm",
  ".ml",
  ".mli",
  ".f",
  ".f90",
  ".f95",
  ".for",
  // Build files
  ".cmake",
  ".make",
  ".makefile",
  ".gradle",
  ".sbt",
  // Documentation
  ".rst",
  ".adoc",
  ".asciidoc",
  ".org",
  ".tex",
  ".latex",
  // Lock files (often text-based)
  ".lock",
  // Misc
  ".log",
  ".diff",
  ".patch"
]);
function pathInOriginalCwd(path) {
  return pathInWorkingPath(path, getOriginalCwd());
}
function parseFrontmatterPaths(rawContent) {
  const { frontmatter, content } = parseFrontmatter(rawContent);
  if (!frontmatter.paths) {
    return { content };
  }
  const patterns = splitPathInFrontmatter(frontmatter.paths).map((pattern) => {
    return pattern.endsWith("/**") ? pattern.slice(0, -3) : pattern;
  }).filter((p) => p.length > 0);
  if (patterns.length === 0 || patterns.every((p) => p === "**")) {
    return { content };
  }
  return { content, paths: patterns };
}
function stripHtmlComments(content) {
  if (!content.includes("<!--")) {
    return { content, stripped: false };
  }
  return stripHtmlCommentsFromTokens(new Lexer({ gfm: false }).lex(content));
}
function stripHtmlCommentsFromTokens(tokens) {
  let result = "";
  let stripped = false;
  const commentSpan = /<!--[\s\S]*?-->/g;
  for (const token of tokens) {
    if (token.type === "html") {
      const trimmed = token.raw.trimStart();
      if (trimmed.startsWith("<!--") && trimmed.includes("-->")) {
        const residue = token.raw.replace(commentSpan, "");
        stripped = true;
        if (residue.trim().length > 0) {
          result += residue;
        }
        continue;
      }
    }
    result += token.raw;
  }
  return { content: result, stripped };
}
function parseMemoryFileContent(rawContent, filePath, type, includeBasePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext && !TEXT_FILE_EXTENSIONS.has(ext)) {
    logForDebugging(`Skipping non-text file in @include: ${filePath}`);
    return { info: null, includePaths: [] };
  }
  const { content: withoutFrontmatter, paths } = parseFrontmatterPaths(rawContent);
  const hasComment = withoutFrontmatter.includes("<!--");
  const tokens = hasComment || includeBasePath !== void 0 ? new Lexer({ gfm: false }).lex(withoutFrontmatter) : void 0;
  const strippedContent = hasComment && tokens ? stripHtmlCommentsFromTokens(tokens).content : withoutFrontmatter;
  const includePaths = tokens && includeBasePath !== void 0 ? extractIncludePathsFromTokens(tokens, includeBasePath) : [];
  let finalContent = strippedContent;
  if (type === "AutoMem" || type === "TeamMem") {
    finalContent = truncateEntrypointContent(strippedContent).content;
  }
  const contentDiffersFromDisk = finalContent !== rawContent;
  return {
    info: {
      path: filePath,
      type,
      content: finalContent,
      globs: paths,
      contentDiffersFromDisk,
      rawContent: contentDiffersFromDisk ? rawContent : void 0
    },
    includePaths
  };
}
function handleMemoryFileReadError(error, filePath) {
  const code = getErrnoCode(error);
  if (code === "ENOENT" || code === "EISDIR") {
    return;
  }
  if (code === "EACCES") {
    logEvent("tengu_claude_md_permission_error", {
      is_access_error: 1,
      has_home_dir: filePath.includes(getClaudeConfigHomeDir()) ? 1 : 0
    });
  }
}
async function safelyReadMemoryFileAsync(filePath, type, includeBasePath) {
  try {
    const fs = getFsImplementation();
    const rawContent = await fs.readFile(filePath, { encoding: "utf-8" });
    return parseMemoryFileContent(rawContent, filePath, type, includeBasePath);
  } catch (error) {
    handleMemoryFileReadError(error, filePath);
    return { info: null, includePaths: [] };
  }
}
function extractIncludePathsFromTokens(tokens, basePath) {
  const absolutePaths = /* @__PURE__ */ new Set();
  function extractPathsFromText(textContent) {
    const includeRegex = /(?:^|\s)@((?:[^\s\\]|\\ )+)/g;
    let match;
    while ((match = includeRegex.exec(textContent)) !== null) {
      let path = match[1];
      if (!path) continue;
      const hashIndex = path.indexOf("#");
      if (hashIndex !== -1) {
        path = path.substring(0, hashIndex);
      }
      if (!path) continue;
      path = path.replace(/\\ /g, " ");
      if (path) {
        const isValidPath = path.startsWith("./") || path.startsWith("~/") || path.startsWith("/") && path !== "/" || !path.startsWith("@") && !path.match(/^[#%^&*()]+/) && path.match(/^[a-zA-Z0-9._-]/);
        if (isValidPath) {
          const resolvedPath = expandPath(path, dirname(basePath));
          absolutePaths.add(resolvedPath);
        }
      }
    }
  }
  function processElements(elements) {
    for (const element of elements) {
      if (element.type === "code" || element.type === "codespan") {
        continue;
      }
      if (element.type === "html") {
        const raw = element.raw || "";
        const trimmed = raw.trimStart();
        if (trimmed.startsWith("<!--") && trimmed.includes("-->")) {
          const commentSpan = /<!--[\s\S]*?-->/g;
          const residue = raw.replace(commentSpan, "");
          if (residue.trim().length > 0) {
            extractPathsFromText(residue);
          }
        }
        continue;
      }
      if (element.type === "text") {
        extractPathsFromText(element.text || "");
      }
      if (element.tokens) {
        processElements(element.tokens);
      }
      if (element.items) {
        processElements(element.items);
      }
    }
  }
  processElements(tokens);
  return [...absolutePaths];
}
const MAX_INCLUDE_DEPTH = 5;
function isClaudeMdExcluded(filePath, type) {
  if (type !== "User" && type !== "Project" && type !== "Local") {
    return false;
  }
  const patterns = getInitialSettings().claudeMdExcludes;
  if (!patterns || patterns.length === 0) {
    return false;
  }
  const matchOpts = { dot: true };
  const normalizedPath = filePath.replaceAll("\\", "/");
  const expandedPatterns = resolveExcludePatterns(patterns).filter(
    (p) => p.length > 0
  );
  if (expandedPatterns.length === 0) {
    return false;
  }
  return picomatch.isMatch(normalizedPath, expandedPatterns, matchOpts);
}
function resolveExcludePatterns(patterns) {
  const fs = getFsImplementation();
  const expanded = patterns.map((p) => p.replaceAll("\\", "/"));
  for (const normalized of expanded) {
    if (!normalized.startsWith("/")) {
      continue;
    }
    const globStart = normalized.search(/[*?{[]/);
    const staticPrefix = globStart === -1 ? normalized : normalized.slice(0, globStart);
    const dirToResolve = dirname(staticPrefix);
    try {
      const resolvedDir = fs.realpathSync(dirToResolve).replaceAll("\\", "/");
      if (resolvedDir !== dirToResolve) {
        const resolvedPattern = resolvedDir + normalized.slice(dirToResolve.length);
        expanded.push(resolvedPattern);
      }
    } catch {
    }
  }
  return expanded;
}
async function processMemoryFile(filePath, type, processedPaths, includeExternal, depth = 0, parent) {
  const normalizedPath = normalizePathForComparison(filePath);
  if (processedPaths.has(normalizedPath) || depth >= MAX_INCLUDE_DEPTH) {
    return [];
  }
  if (isClaudeMdExcluded(filePath, type)) {
    return [];
  }
  const { resolvedPath, isSymlink } = safeResolvePath(
    getFsImplementation(),
    filePath
  );
  processedPaths.add(normalizedPath);
  if (isSymlink) {
    processedPaths.add(normalizePathForComparison(resolvedPath));
  }
  const { info: memoryFile, includePaths: resolvedIncludePaths } = await safelyReadMemoryFileAsync(filePath, type, resolvedPath);
  if (!memoryFile || !memoryFile.content.trim()) {
    return [];
  }
  if (parent) {
    memoryFile.parent = parent;
  }
  const result = [];
  result.push(memoryFile);
  for (const resolvedIncludePath of resolvedIncludePaths) {
    const isExternal = !pathInOriginalCwd(resolvedIncludePath);
    if (isExternal && !includeExternal) {
      continue;
    }
    const includedFiles = await processMemoryFile(
      resolvedIncludePath,
      type,
      processedPaths,
      includeExternal,
      depth + 1,
      filePath
      // Pass current file as parent
    );
    result.push(...includedFiles);
  }
  return result;
}
async function processMdRules({
  rulesDir,
  type,
  processedPaths,
  includeExternal,
  conditionalRule,
  visitedDirs = /* @__PURE__ */ new Set()
}) {
  if (visitedDirs.has(rulesDir)) {
    return [];
  }
  try {
    const fs = getFsImplementation();
    const { resolvedPath: resolvedRulesDir, isSymlink } = safeResolvePath(
      fs,
      rulesDir
    );
    visitedDirs.add(rulesDir);
    if (isSymlink) {
      visitedDirs.add(resolvedRulesDir);
    }
    const result = [];
    let entries;
    try {
      entries = await fs.readdir(resolvedRulesDir);
    } catch (e) {
      const code = getErrnoCode(e);
      if (code === "ENOENT" || code === "EACCES" || code === "ENOTDIR") {
        return [];
      }
      throw e;
    }
    for (const entry of entries) {
      const entryPath = join(rulesDir, entry.name);
      const { resolvedPath: resolvedEntryPath, isSymlink: isSymlink2 } = safeResolvePath(
        fs,
        entryPath
      );
      const stats = isSymlink2 ? await fs.stat(resolvedEntryPath) : null;
      const isDirectory = stats ? stats.isDirectory() : entry.isDirectory();
      const isFile = stats ? stats.isFile() : entry.isFile();
      if (isDirectory) {
        result.push(
          ...await processMdRules({
            rulesDir: resolvedEntryPath,
            type,
            processedPaths,
            includeExternal,
            conditionalRule,
            visitedDirs
          })
        );
      } else if (isFile && entry.name.endsWith(".md")) {
        const files = await processMemoryFile(
          resolvedEntryPath,
          type,
          processedPaths,
          includeExternal
        );
        result.push(
          ...files.filter((f) => conditionalRule ? f.globs : !f.globs)
        );
      }
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes("EACCES")) {
      logEvent("tengu_claude_rules_md_permission_error", {
        is_access_error: 1,
        has_home_dir: rulesDir.includes(getClaudeConfigHomeDir()) ? 1 : 0
      });
    }
    return [];
  }
}
const getMemoryFiles = memoize(
  async (forceIncludeExternal = false) => {
    const startTime = Date.now();
    logForDiagnosticsNoPII("info", "memory_files_started");
    const result = [];
    const processedPaths = /* @__PURE__ */ new Set();
    const config = getCurrentProjectConfig();
    const includeExternal = forceIncludeExternal || config.hasClaudeMdExternalIncludesApproved || false;
    const managedClaudeMd = getMemoryPath("Managed");
    result.push(
      ...await processMemoryFile(
        managedClaudeMd,
        "Managed",
        processedPaths,
        includeExternal
      )
    );
    const managedClaudeRulesDir = getManagedClaudeRulesDir();
    result.push(
      ...await processMdRules({
        rulesDir: managedClaudeRulesDir,
        type: "Managed",
        processedPaths,
        includeExternal,
        conditionalRule: false
      })
    );
    if (isSettingSourceEnabled("userSettings")) {
      const userClaudeMd = getMemoryPath("User");
      result.push(
        ...await processMemoryFile(
          userClaudeMd,
          "User",
          processedPaths,
          true
          // User memory can always include external files
        )
      );
      const userClaudeRulesDir = getUserClaudeRulesDir();
      result.push(
        ...await processMdRules({
          rulesDir: userClaudeRulesDir,
          type: "User",
          processedPaths,
          includeExternal: true,
          conditionalRule: false
        })
      );
    }
    const dirs = [];
    const originalCwd = getOriginalCwd();
    let currentDir = originalCwd;
    while (currentDir !== parse(currentDir).root) {
      dirs.push(currentDir);
      currentDir = dirname(currentDir);
    }
    const gitRoot = findGitRoot(originalCwd);
    const canonicalRoot = findCanonicalGitRoot(originalCwd);
    const isNestedWorktree = gitRoot !== null && canonicalRoot !== null && normalizePathForComparison(gitRoot) !== normalizePathForComparison(canonicalRoot) && pathInWorkingPath(gitRoot, canonicalRoot);
    for (const dir of dirs.reverse()) {
      const skipProject = isNestedWorktree && pathInWorkingPath(dir, canonicalRoot) && !pathInWorkingPath(dir, gitRoot);
      if (isSettingSourceEnabled("projectSettings") && !skipProject) {
        const projectPath = join(dir, "CLAUDE.md");
        result.push(
          ...await processMemoryFile(
            projectPath,
            "Project",
            processedPaths,
            includeExternal
          )
        );
        const dotClaudePath = join(dir, ".claude", "CLAUDE.md");
        result.push(
          ...await processMemoryFile(
            dotClaudePath,
            "Project",
            processedPaths,
            includeExternal
          )
        );
        const rulesDir = join(dir, ".claude", "rules");
        result.push(
          ...await processMdRules({
            rulesDir,
            type: "Project",
            processedPaths,
            includeExternal,
            conditionalRule: false
          })
        );
      }
      if (isSettingSourceEnabled("localSettings")) {
        const localPath = join(dir, "CLAUDE.local.md");
        result.push(
          ...await processMemoryFile(
            localPath,
            "Local",
            processedPaths,
            includeExternal
          )
        );
      }
    }
    if (isEnvTruthy(process.env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD)) {
      const additionalDirs = getAdditionalDirectoriesForClaudeMd();
      for (const dir of additionalDirs) {
        const projectPath = join(dir, "CLAUDE.md");
        result.push(
          ...await processMemoryFile(
            projectPath,
            "Project",
            processedPaths,
            includeExternal
          )
        );
        const dotClaudePath = join(dir, ".claude", "CLAUDE.md");
        result.push(
          ...await processMemoryFile(
            dotClaudePath,
            "Project",
            processedPaths,
            includeExternal
          )
        );
        const rulesDir = join(dir, ".claude", "rules");
        result.push(
          ...await processMdRules({
            rulesDir,
            type: "Project",
            processedPaths,
            includeExternal,
            conditionalRule: false
          })
        );
      }
    }
    if (isAutoMemoryEnabled()) {
      const { info: memdirEntry } = await safelyReadMemoryFileAsync(
        getAutoMemEntrypoint(),
        "AutoMem"
      );
      if (memdirEntry) {
        const normalizedPath = normalizePathForComparison(memdirEntry.path);
        if (!processedPaths.has(normalizedPath)) {
          processedPaths.add(normalizedPath);
          result.push(memdirEntry);
        }
      }
    }
    if (false) {
      const { info: teamMemEntry } = await safelyReadMemoryFileAsync(
        teamMemPaths.getTeamMemEntrypoint(),
        "TeamMem"
      );
      if (teamMemEntry) {
        const normalizedPath = normalizePathForComparison(teamMemEntry.path);
        if (!processedPaths.has(normalizedPath)) {
          processedPaths.add(normalizedPath);
          result.push(teamMemEntry);
        }
      }
    }
    const totalContentLength = result.reduce(
      (sum, f) => sum + f.content.length,
      0
    );
    logForDiagnosticsNoPII("info", "memory_files_completed", {
      duration_ms: Date.now() - startTime,
      file_count: result.length,
      total_content_length: totalContentLength
    });
    const typeCounts = {};
    for (const f of result) {
      typeCounts[f.type] = (typeCounts[f.type] ?? 0) + 1;
    }
    if (!hasLoggedInitialLoad) {
      hasLoggedInitialLoad = true;
      logEvent("tengu_claudemd__initial_load", {
        file_count: result.length,
        total_content_length: totalContentLength,
        user_count: typeCounts["User"] ?? 0,
        project_count: typeCounts["Project"] ?? 0,
        local_count: typeCounts["Local"] ?? 0,
        managed_count: typeCounts["Managed"] ?? 0,
        automem_count: typeCounts["AutoMem"] ?? 0,
        ...false ? { teammem_count: typeCounts["TeamMem"] ?? 0 } : {},
        duration_ms: Date.now() - startTime
      });
    }
    if (!forceIncludeExternal) {
      const eagerLoadReason = consumeNextEagerLoadReason();
      if (eagerLoadReason !== void 0 && hasInstructionsLoadedHook()) {
        for (const file of result) {
          if (!isInstructionsMemoryType(file.type)) continue;
          const loadReason = file.parent ? "include" : eagerLoadReason;
          void executeInstructionsLoadedHooks(
            file.path,
            file.type,
            loadReason,
            {
              globs: file.globs,
              parentFilePath: file.parent
            }
          );
        }
      }
    }
    return result;
  }
);
function isInstructionsMemoryType(type) {
  return type === "User" || type === "Project" || type === "Local" || type === "Managed";
}
let nextEagerLoadReason = "session_start";
let shouldFireHook = true;
function consumeNextEagerLoadReason() {
  if (!shouldFireHook) return void 0;
  shouldFireHook = false;
  const reason = nextEagerLoadReason;
  nextEagerLoadReason = "session_start";
  return reason;
}
function clearMemoryFileCaches() {
  getMemoryFiles.cache?.clear?.();
}
function resetGetMemoryFilesCache(reason = "session_start") {
  nextEagerLoadReason = reason;
  shouldFireHook = true;
  clearMemoryFileCaches();
}
function getLargeMemoryFiles(files) {
  return files.filter((f) => f.content.length > MAX_MEMORY_CHARACTER_COUNT);
}
function filterInjectedMemoryFiles(files) {
  const skipMemoryIndex = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_moth_copse",
    false
  );
  if (!skipMemoryIndex) return files;
  return files.filter((f) => f.type !== "AutoMem" && f.type !== "TeamMem");
}
const getClaudeMds = (memoryFiles, filter) => {
  const memories = [];
  const skipProjectLevel = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_paper_halyard",
    false
  );
  for (const file of memoryFiles) {
    if (filter && !filter(file.type)) continue;
    if (skipProjectLevel && (file.type === "Project" || file.type === "Local"))
      continue;
    if (file.content) {
      const description = file.type === "Project" ? " (project instructions, checked into the codebase)" : file.type === "Local" ? " (user's private project instructions, not checked in)" : false ? " (shared team memory, synced across the organization)" : file.type === "AutoMem" ? " (user's auto-memory, persists across conversations)" : " (user's private global instructions for all projects)";
      const content = file.content.trim();
      if (false) {
        memories.push(
          `Contents of ${file.path}${description}:

<team-memory-content source="shared">
${content}
</team-memory-content>`
        );
      } else {
        memories.push(`Contents of ${file.path}${description}:

${content}`);
      }
    }
  }
  if (memories.length === 0) {
    return "";
  }
  return `${MEMORY_INSTRUCTION_PROMPT}

${memories.join("\n\n")}`;
};
async function getManagedAndUserConditionalRules(targetPath, processedPaths) {
  const result = [];
  const managedClaudeRulesDir = getManagedClaudeRulesDir();
  result.push(
    ...await processConditionedMdRules(
      targetPath,
      managedClaudeRulesDir,
      "Managed",
      processedPaths,
      false
    )
  );
  if (isSettingSourceEnabled("userSettings")) {
    const userClaudeRulesDir = getUserClaudeRulesDir();
    result.push(
      ...await processConditionedMdRules(
        targetPath,
        userClaudeRulesDir,
        "User",
        processedPaths,
        true
      )
    );
  }
  return result;
}
async function getMemoryFilesForNestedDirectory(dir, targetPath, processedPaths) {
  const result = [];
  if (isSettingSourceEnabled("projectSettings")) {
    const projectPath = join(dir, "CLAUDE.md");
    result.push(
      ...await processMemoryFile(
        projectPath,
        "Project",
        processedPaths,
        false
      )
    );
    const dotClaudePath = join(dir, ".claude", "CLAUDE.md");
    result.push(
      ...await processMemoryFile(
        dotClaudePath,
        "Project",
        processedPaths,
        false
      )
    );
  }
  if (isSettingSourceEnabled("localSettings")) {
    const localPath = join(dir, "CLAUDE.local.md");
    result.push(
      ...await processMemoryFile(localPath, "Local", processedPaths, false)
    );
  }
  const rulesDir = join(dir, ".claude", "rules");
  const unconditionalProcessedPaths = new Set(processedPaths);
  result.push(
    ...await processMdRules({
      rulesDir,
      type: "Project",
      processedPaths: unconditionalProcessedPaths,
      includeExternal: false,
      conditionalRule: false
    })
  );
  result.push(
    ...await processConditionedMdRules(
      targetPath,
      rulesDir,
      "Project",
      processedPaths,
      false
    )
  );
  for (const path of unconditionalProcessedPaths) {
    processedPaths.add(path);
  }
  return result;
}
async function getConditionalRulesForCwdLevelDirectory(dir, targetPath, processedPaths) {
  const rulesDir = join(dir, ".claude", "rules");
  return processConditionedMdRules(
    targetPath,
    rulesDir,
    "Project",
    processedPaths,
    false
  );
}
async function processConditionedMdRules(targetPath, rulesDir, type, processedPaths, includeExternal) {
  const conditionedRuleMdFiles = await processMdRules({
    rulesDir,
    type,
    processedPaths,
    includeExternal,
    conditionalRule: true
  });
  return conditionedRuleMdFiles.filter((file) => {
    if (!file.globs || file.globs.length === 0) {
      return false;
    }
    const baseDir = type === "Project" ? dirname(dirname(rulesDir)) : getOriginalCwd();
    const relativePath = isAbsolute(targetPath) ? relative(baseDir, targetPath) : targetPath;
    if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return false;
    }
    return ignore().add(file.globs).ignores(relativePath);
  });
}
function getExternalClaudeMdIncludes(files) {
  const externals = [];
  for (const file of files) {
    if (file.type !== "User" && file.parent && !pathInOriginalCwd(file.path)) {
      externals.push({ path: file.path, parent: file.parent });
    }
  }
  return externals;
}
function hasExternalClaudeMdIncludes(files) {
  return getExternalClaudeMdIncludes(files).length > 0;
}
async function shouldShowClaudeMdExternalIncludesWarning() {
  const config = getCurrentProjectConfig();
  if (config.hasClaudeMdExternalIncludesApproved || config.hasClaudeMdExternalIncludesWarningShown) {
    return false;
  }
  return hasExternalClaudeMdIncludes(await getMemoryFiles(true));
}
function isMemoryFilePath(filePath) {
  const name = basename(filePath);
  if (name === "CLAUDE.md" || name === "CLAUDE.local.md") {
    return true;
  }
  if (name.endsWith(".md") && filePath.includes(`${sep}.claude${sep}rules${sep}`)) {
    return true;
  }
  return false;
}
function getAllMemoryFilePaths(files, readFileState) {
  const paths = /* @__PURE__ */ new Set();
  for (const file of files) {
    if (file.content.trim().length > 0) {
      paths.add(file.path);
    }
  }
  for (const filePath of cacheKeys(readFileState)) {
    if (isMemoryFilePath(filePath)) {
      paths.add(filePath);
    }
  }
  return Array.from(paths);
}
export {
  MAX_MEMORY_CHARACTER_COUNT,
  clearMemoryFileCaches,
  filterInjectedMemoryFiles,
  getAllMemoryFilePaths,
  getClaudeMds,
  getConditionalRulesForCwdLevelDirectory,
  getExternalClaudeMdIncludes,
  getLargeMemoryFiles,
  getManagedAndUserConditionalRules,
  getMemoryFiles,
  getMemoryFilesForNestedDirectory,
  hasExternalClaudeMdIncludes,
  isMemoryFilePath,
  processConditionedMdRules,
  processMdRules,
  processMemoryFile,
  resetGetMemoryFilesCache,
  shouldShowClaudeMdExternalIncludesWarning,
  stripHtmlComments
};
