const feature = (_name) => false;
import { randomBytes } from "crypto";
import ignore from "ignore";
import memoize from "lodash-es/memoize.js";
import { homedir, tmpdir } from "os";
import { join, normalize, posix, sep } from "path";
import { hasAutoMemPathOverride, isAutoMemPath } from "../../memdir/paths.js";
import { isAgentMemoryPath } from "../../tools/AgentTool/agentMemory.js";
import {
  CLAUDE_FOLDER_PERMISSION_PATTERN,
  FILE_EDIT_TOOL_NAME,
  GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN
} from "../../tools/FileEditTool/constants.js";
import { getOriginalCwd, getSessionId } from "../../bootstrap/state.js";
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import { FILE_READ_TOOL_NAME } from "../../tools/FileReadTool/prompt.js";
import { getCwd } from "../cwd.js";
import { getClaudeConfigHomeDir } from "../envUtils.js";
import {
  getFsImplementation,
  getPathsForPermissionCheck
} from "../fsOperations.js";
import {
  containsPathTraversal,
  expandPath,
  getDirectoryForPath,
  sanitizePath
} from "../path.js";
import { getPlanSlug, getPlansDirectory } from "../plans.js";
import { getPlatform } from "../platform.js";
import { getProjectDir } from "../sessionStorage.js";
import { SETTING_SOURCES } from "../settings/constants.js";
import {
  getSettingsFilePathForSource,
  getSettingsRootPathForSource
} from "../settings/settings.js";
import { containsVulnerableUncPath } from "../shell/readOnlyCommandValidation.js";
import { getToolResultsDir } from "../toolResultStorage.js";
import { windowsPathToPosixPath } from "../windowsPaths.js";
import { createReadRuleSuggestion } from "./PermissionUpdate.js";
import { getRuleByContentsForToolName } from "./permissions.js";
const DANGEROUS_FILES = [
  ".gitconfig",
  ".gitmodules",
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".profile",
  ".ripgreprc",
  ".mcp.json",
  ".claude.json"
];
const DANGEROUS_DIRECTORIES = [
  ".git",
  ".vscode",
  ".idea",
  ".claude"
];
function normalizeCaseForComparison(path) {
  return path.toLowerCase();
}
function getClaudeSkillScope(filePath) {
  const absolutePath = expandPath(filePath);
  const absolutePathLower = normalizeCaseForComparison(absolutePath);
  const bases = [
    {
      dir: expandPath(join(getOriginalCwd(), ".claude", "skills")),
      prefix: "/.claude/skills/"
    },
    {
      dir: expandPath(join(homedir(), ".claude", "skills")),
      prefix: "~/.claude/skills/"
    }
  ];
  for (const { dir, prefix } of bases) {
    const dirLower = normalizeCaseForComparison(dir);
    for (const s of [sep, "/"]) {
      if (absolutePathLower.startsWith(dirLower + s.toLowerCase())) {
        const rest = absolutePath.slice(dir.length + s.length);
        const slash = rest.indexOf("/");
        const bslash = sep === "\\" ? rest.indexOf("\\") : -1;
        const cut = slash === -1 ? bslash : bslash === -1 ? slash : Math.min(slash, bslash);
        if (cut <= 0) return null;
        const skillName = rest.slice(0, cut);
        if (!skillName || skillName === "." || skillName.includes("..")) {
          return null;
        }
        if (/[*?[\]]/.test(skillName)) return null;
        return { skillName, pattern: prefix + skillName + "/**" };
      }
    }
  }
  return null;
}
const DIR_SEP = posix.sep;
function relativePath(from, to) {
  if (getPlatform() === "windows") {
    const posixFrom = windowsPathToPosixPath(from);
    const posixTo = windowsPathToPosixPath(to);
    return posix.relative(posixFrom, posixTo);
  }
  return posix.relative(from, to);
}
function toPosixPath(path) {
  if (getPlatform() === "windows") {
    return windowsPathToPosixPath(path);
  }
  return path;
}
function getSettingsPaths() {
  return SETTING_SOURCES.map(
    (source) => getSettingsFilePathForSource(source)
  ).filter((path) => path !== void 0);
}
function isClaudeSettingsPath(filePath) {
  const expandedPath = expandPath(filePath);
  const normalizedPath = normalizeCaseForComparison(expandedPath);
  if (normalizedPath.endsWith(`${sep}.claude${sep}settings.json`) || normalizedPath.endsWith(`${sep}.claude${sep}settings.local.json`)) {
    return true;
  }
  return getSettingsPaths().some(
    (settingsPath) => normalizeCaseForComparison(settingsPath) === normalizedPath
  );
}
function isClaudeConfigFilePath(filePath) {
  if (isClaudeSettingsPath(filePath)) {
    return true;
  }
  const commandsDir = join(getOriginalCwd(), ".claude", "commands");
  const agentsDir = join(getOriginalCwd(), ".claude", "agents");
  const skillsDir = join(getOriginalCwd(), ".claude", "skills");
  return pathInWorkingPath(filePath, commandsDir) || pathInWorkingPath(filePath, agentsDir) || pathInWorkingPath(filePath, skillsDir);
}
function isSessionPlanFile(absolutePath) {
  const expectedPrefix = join(getPlansDirectory(), getPlanSlug());
  const normalizedPath = normalize(absolutePath);
  return normalizedPath.startsWith(expectedPrefix) && normalizedPath.endsWith(".md");
}
function getSessionMemoryDir() {
  return join(getProjectDir(getCwd()), getSessionId(), "session-memory") + sep;
}
function getSessionMemoryPath() {
  return join(getSessionMemoryDir(), "summary.md");
}
function isSessionMemoryPath(absolutePath) {
  const normalizedPath = normalize(absolutePath);
  return normalizedPath.startsWith(getSessionMemoryDir());
}
function isProjectDirPath(absolutePath) {
  const projectDir = getProjectDir(getCwd());
  const normalizedPath = normalize(absolutePath);
  return normalizedPath === projectDir || normalizedPath.startsWith(projectDir + sep);
}
function isScratchpadEnabled() {
  return checkStatsigFeatureGate_CACHED_MAY_BE_STALE("tengu_scratch");
}
function getClaudeTempDirName() {
  if (getPlatform() === "windows") {
    return "claude";
  }
  const uid = process.getuid?.() ?? 0;
  return `claude-${uid}`;
}
const getClaudeTempDir = memoize(function getClaudeTempDir2() {
  const baseTmpDir = process.env.CLAUDE_CODE_TMPDIR || (getPlatform() === "windows" ? tmpdir() : "/tmp");
  const fs = getFsImplementation();
  let resolvedBaseTmpDir = baseTmpDir;
  try {
    resolvedBaseTmpDir = fs.realpathSync(baseTmpDir);
  } catch {
  }
  return join(resolvedBaseTmpDir, getClaudeTempDirName()) + sep;
});
const getBundledSkillsRoot = memoize(
  function getBundledSkillsRoot2() {
    const nonce = randomBytes(16).toString("hex");
    return join(getClaudeTempDir(), "bundled-skills", "0.0.0", nonce);
  }
);
function getProjectTempDir() {
  return join(getClaudeTempDir(), sanitizePath(getOriginalCwd())) + sep;
}
function getScratchpadDir() {
  return join(getProjectTempDir(), getSessionId(), "scratchpad");
}
async function ensureScratchpadDir() {
  if (!isScratchpadEnabled()) {
    throw new Error("Scratchpad directory feature is not enabled");
  }
  const fs = getFsImplementation();
  const scratchpadDir = getScratchpadDir();
  await fs.mkdir(scratchpadDir, { mode: 448 });
  return scratchpadDir;
}
function isScratchpadPath(absolutePath) {
  if (!isScratchpadEnabled()) {
    return false;
  }
  const scratchpadDir = getScratchpadDir();
  const normalizedPath = normalize(absolutePath);
  return normalizedPath === scratchpadDir || normalizedPath.startsWith(scratchpadDir + sep);
}
function isDangerousFilePathToAutoEdit(path) {
  const absolutePath = expandPath(path);
  const pathSegments = absolutePath.split(sep);
  const fileName = pathSegments.at(-1);
  if (path.startsWith("\\\\") || path.startsWith("//")) {
    return true;
  }
  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i];
    const normalizedSegment = normalizeCaseForComparison(segment);
    for (const dir of DANGEROUS_DIRECTORIES) {
      if (normalizedSegment !== normalizeCaseForComparison(dir)) {
        continue;
      }
      if (dir === ".claude") {
        const nextSegment = pathSegments[i + 1];
        if (nextSegment && normalizeCaseForComparison(nextSegment) === "worktrees") {
          break;
        }
      }
      return true;
    }
  }
  if (fileName) {
    const normalizedFileName = normalizeCaseForComparison(fileName);
    if (DANGEROUS_FILES.some(
      (dangerousFile) => normalizeCaseForComparison(dangerousFile) === normalizedFileName
    )) {
      return true;
    }
  }
  return false;
}
function hasSuspiciousWindowsPathPattern(path) {
  if (getPlatform() === "windows" || getPlatform() === "wsl") {
    const colonIndex = path.indexOf(":", 2);
    if (colonIndex !== -1) {
      return true;
    }
  }
  if (/~\d/.test(path)) {
    return true;
  }
  if (path.startsWith("\\\\?\\") || path.startsWith("\\\\.\\") || path.startsWith("//?/") || path.startsWith("//./")) {
    return true;
  }
  if (/[.\s]+$/.test(path)) {
    return true;
  }
  if (/\.(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(path)) {
    return true;
  }
  if (/(^|\/|\\)\.{3,}(\/|\\|$)/.test(path)) {
    return true;
  }
  if (containsVulnerableUncPath(path)) {
    return true;
  }
  return false;
}
function checkPathSafetyForAutoEdit(path, precomputedPathsToCheck) {
  const pathsToCheck = precomputedPathsToCheck ?? getPathsForPermissionCheck(path);
  for (const pathToCheck of pathsToCheck) {
    if (hasSuspiciousWindowsPathPattern(pathToCheck)) {
      return {
        safe: false,
        message: `Claude requested permissions to write to ${path}, which contains a suspicious Windows path pattern that requires manual approval.`,
        classifierApprovable: false
      };
    }
  }
  for (const pathToCheck of pathsToCheck) {
    if (isClaudeConfigFilePath(pathToCheck)) {
      return {
        safe: false,
        message: `Claude requested permissions to write to ${path}, but you haven't granted it yet.`,
        classifierApprovable: true
      };
    }
  }
  for (const pathToCheck of pathsToCheck) {
    if (isDangerousFilePathToAutoEdit(pathToCheck)) {
      return {
        safe: false,
        message: `Claude requested permissions to edit ${path} which is a sensitive file.`,
        classifierApprovable: true
      };
    }
  }
  return { safe: true };
}
function allWorkingDirectories(context) {
  return /* @__PURE__ */ new Set([
    getOriginalCwd(),
    ...context.additionalWorkingDirectories.keys()
  ]);
}
const getResolvedWorkingDirPaths = memoize(getPathsForPermissionCheck);
function pathInAllowedWorkingPath(path, toolPermissionContext, precomputedPathsToCheck) {
  const pathsToCheck = precomputedPathsToCheck ?? getPathsForPermissionCheck(path);
  const workingPaths = Array.from(
    allWorkingDirectories(toolPermissionContext)
  ).flatMap((wp) => getResolvedWorkingDirPaths(wp));
  return pathsToCheck.every(
    (pathToCheck) => workingPaths.some(
      (workingPath) => pathInWorkingPath(pathToCheck, workingPath)
    )
  );
}
function pathInWorkingPath(path, workingPath) {
  const absolutePath = expandPath(path);
  const absoluteWorkingPath = expandPath(workingPath);
  const normalizedPath = absolutePath.replace(/^\/private\/var\//, "/var/").replace(/^\/private\/tmp(\/|$)/, "/tmp$1");
  const normalizedWorkingPath = absoluteWorkingPath.replace(/^\/private\/var\//, "/var/").replace(/^\/private\/tmp(\/|$)/, "/tmp$1");
  const caseNormalizedPath = normalizeCaseForComparison(normalizedPath);
  const caseNormalizedWorkingPath = normalizeCaseForComparison(
    normalizedWorkingPath
  );
  const relative = relativePath(caseNormalizedWorkingPath, caseNormalizedPath);
  if (relative === "") {
    return true;
  }
  if (containsPathTraversal(relative)) {
    return false;
  }
  return !posix.isAbsolute(relative);
}
function rootPathForSource(source) {
  switch (source) {
    case "cliArg":
    case "command":
    case "session":
      return expandPath(getOriginalCwd());
    case "userSettings":
    case "policySettings":
    case "projectSettings":
    case "localSettings":
    case "flagSettings":
      return getSettingsRootPathForSource(source);
  }
}
function prependDirSep(path) {
  return posix.join(DIR_SEP, path);
}
function normalizePatternToPath({
  patternRoot,
  pattern,
  rootPath
}) {
  const fullPattern = posix.join(patternRoot, pattern);
  if (patternRoot === rootPath) {
    return prependDirSep(pattern);
  } else if (fullPattern.startsWith(`${rootPath}${DIR_SEP}`)) {
    const relativePart = fullPattern.slice(rootPath.length);
    return prependDirSep(relativePart);
  } else {
    const relativePath2 = posix.relative(rootPath, patternRoot);
    if (!relativePath2 || relativePath2.startsWith(`..${DIR_SEP}`) || relativePath2 === "..") {
      return null;
    } else {
      const relativePattern = posix.join(relativePath2, pattern);
      return prependDirSep(relativePattern);
    }
  }
}
function normalizePatternsToPath(patternsByRoot, root) {
  const result = new Set(patternsByRoot.get(null) ?? []);
  for (const [patternRoot, patterns] of patternsByRoot.entries()) {
    if (patternRoot === null) {
      continue;
    }
    for (const pattern of patterns) {
      const normalizedPattern = normalizePatternToPath({
        patternRoot,
        pattern,
        rootPath: root
      });
      if (normalizedPattern) {
        result.add(normalizedPattern);
      }
    }
  }
  return Array.from(result);
}
function getFileReadIgnorePatterns(toolPermissionContext) {
  const patternsByRoot = getPatternsByRoot(
    toolPermissionContext,
    "read",
    "deny"
  );
  const result = /* @__PURE__ */ new Map();
  for (const [patternRoot, patternMap] of patternsByRoot.entries()) {
    result.set(patternRoot, Array.from(patternMap.keys()));
  }
  return result;
}
function patternWithRoot(pattern, source) {
  if (pattern.startsWith(`${DIR_SEP}${DIR_SEP}`)) {
    const patternWithoutDoubleSlash = pattern.slice(1);
    if (getPlatform() === "windows" && patternWithoutDoubleSlash.match(/^\/[a-z]\//i)) {
      const driveLetter = patternWithoutDoubleSlash[1]?.toUpperCase() ?? "C";
      const pathAfterDrive = patternWithoutDoubleSlash.slice(2);
      const driveRoot = `${driveLetter}:\\`;
      const relativeFromDrive = pathAfterDrive.startsWith("/") ? pathAfterDrive.slice(1) : pathAfterDrive;
      return {
        relativePattern: relativeFromDrive,
        root: driveRoot
      };
    }
    return {
      relativePattern: patternWithoutDoubleSlash,
      root: DIR_SEP
    };
  } else if (pattern.startsWith(`~${DIR_SEP}`)) {
    return {
      relativePattern: pattern.slice(1),
      root: homedir().normalize("NFC")
    };
  } else if (pattern.startsWith(DIR_SEP)) {
    return {
      relativePattern: pattern,
      root: rootPathForSource(source)
    };
  }
  let normalizedPattern = pattern;
  if (pattern.startsWith(`.${DIR_SEP}`)) {
    normalizedPattern = pattern.slice(2);
  }
  return {
    relativePattern: normalizedPattern,
    root: null
  };
}
function getPatternsByRoot(toolPermissionContext, toolType, behavior) {
  const toolName = (() => {
    switch (toolType) {
      case "edit":
        return FILE_EDIT_TOOL_NAME;
      case "read":
        return FILE_READ_TOOL_NAME;
    }
  })();
  const rules = getRuleByContentsForToolName(
    toolPermissionContext,
    toolName,
    behavior
  );
  const patternsByRoot = /* @__PURE__ */ new Map();
  for (const [pattern, rule] of rules.entries()) {
    const { relativePattern, root } = patternWithRoot(pattern, rule.source);
    let patternsForRoot = patternsByRoot.get(root);
    if (patternsForRoot === void 0) {
      patternsForRoot = /* @__PURE__ */ new Map();
      patternsByRoot.set(root, patternsForRoot);
    }
    patternsForRoot.set(relativePattern, rule);
  }
  return patternsByRoot;
}
function matchingRuleForInput(path, toolPermissionContext, toolType, behavior) {
  let fileAbsolutePath = expandPath(path);
  if (getPlatform() === "windows" && fileAbsolutePath.includes("\\")) {
    fileAbsolutePath = windowsPathToPosixPath(fileAbsolutePath);
  }
  const patternsByRoot = getPatternsByRoot(
    toolPermissionContext,
    toolType,
    behavior
  );
  for (const [root, patternMap] of patternsByRoot.entries()) {
    const patterns = Array.from(patternMap.keys()).map((pattern) => {
      let adjustedPattern = pattern;
      if (adjustedPattern.endsWith("/**")) {
        adjustedPattern = adjustedPattern.slice(0, -3);
      }
      return adjustedPattern;
    });
    const ig = ignore().add(patterns);
    const relativePathStr = relativePath(
      root ?? getCwd(),
      fileAbsolutePath ?? getCwd()
    );
    if (relativePathStr.startsWith(`..${DIR_SEP}`)) {
      continue;
    }
    if (!relativePathStr) {
      continue;
    }
    const igResult = ig.test(relativePathStr);
    if (igResult.ignored && igResult.rule) {
      const originalPattern = igResult.rule.pattern;
      const withWildcard = originalPattern + "/**";
      if (patternMap.has(withWildcard)) {
        return patternMap.get(withWildcard) ?? null;
      }
      return patternMap.get(originalPattern) ?? null;
    }
  }
  return null;
}
function checkReadPermissionForTool(tool, input, toolPermissionContext) {
  if (typeof tool.getPath !== "function") {
    return {
      behavior: "ask",
      message: `Claude requested permissions to use ${tool.name}, but you haven't granted it yet.`
    };
  }
  const path = tool.getPath(input);
  const pathsToCheck = getPathsForPermissionCheck(path);
  for (const pathToCheck of pathsToCheck) {
    if (pathToCheck.startsWith("\\\\") || pathToCheck.startsWith("//")) {
      return {
        behavior: "ask",
        message: `Claude requested permissions to read from ${path}, which appears to be a UNC path that could access network resources.`,
        decisionReason: {
          type: "other",
          reason: "UNC path detected (defense-in-depth check)"
        }
      };
    }
  }
  for (const pathToCheck of pathsToCheck) {
    if (hasSuspiciousWindowsPathPattern(pathToCheck)) {
      return {
        behavior: "ask",
        message: `Claude requested permissions to read from ${path}, which contains a suspicious Windows path pattern that requires manual approval.`,
        decisionReason: {
          type: "other",
          reason: "Path contains suspicious Windows-specific patterns (alternate data streams, short names, long path prefixes, or three or more consecutive dots) that require manual verification"
        }
      };
    }
  }
  for (const pathToCheck of pathsToCheck) {
    const denyRule = matchingRuleForInput(
      pathToCheck,
      toolPermissionContext,
      "read",
      "deny"
    );
    if (denyRule) {
      return {
        behavior: "deny",
        message: `Permission to read ${path} has been denied.`,
        decisionReason: {
          type: "rule",
          rule: denyRule
        }
      };
    }
  }
  for (const pathToCheck of pathsToCheck) {
    const askRule = matchingRuleForInput(
      pathToCheck,
      toolPermissionContext,
      "read",
      "ask"
    );
    if (askRule) {
      return {
        behavior: "ask",
        message: `Claude requested permissions to read from ${path}, but you haven't granted it yet.`,
        decisionReason: {
          type: "rule",
          rule: askRule
        }
      };
    }
  }
  const editResult = checkWritePermissionForTool(
    tool,
    input,
    toolPermissionContext,
    pathsToCheck
  );
  if (editResult.behavior === "allow") {
    return editResult;
  }
  const isInWorkingDir = pathInAllowedWorkingPath(
    path,
    toolPermissionContext,
    pathsToCheck
  );
  if (isInWorkingDir) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "mode",
        mode: "default"
      }
    };
  }
  const absolutePath = expandPath(path);
  const internalReadResult = checkReadableInternalPath(absolutePath, input);
  if (internalReadResult.behavior !== "passthrough") {
    return internalReadResult;
  }
  const allowRule = matchingRuleForInput(
    path,
    toolPermissionContext,
    "read",
    "allow"
  );
  if (allowRule) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "rule",
        rule: allowRule
      }
    };
  }
  return {
    behavior: "ask",
    message: `Claude requested permissions to read from ${path}, but you haven't granted it yet.`,
    suggestions: generateSuggestions(
      path,
      "read",
      toolPermissionContext,
      pathsToCheck
    ),
    decisionReason: {
      type: "workingDir",
      reason: "Path is outside allowed working directories"
    }
  };
}
function checkWritePermissionForTool(tool, input, toolPermissionContext, precomputedPathsToCheck) {
  if (typeof tool.getPath !== "function") {
    return {
      behavior: "ask",
      message: `Claude requested permissions to use ${tool.name}, but you haven't granted it yet.`
    };
  }
  const path = tool.getPath(input);
  const pathsToCheck = precomputedPathsToCheck ?? getPathsForPermissionCheck(path);
  for (const pathToCheck of pathsToCheck) {
    const denyRule = matchingRuleForInput(
      pathToCheck,
      toolPermissionContext,
      "edit",
      "deny"
    );
    if (denyRule) {
      return {
        behavior: "deny",
        message: `Permission to edit ${path} has been denied.`,
        decisionReason: {
          type: "rule",
          rule: denyRule
        }
      };
    }
  }
  const absolutePathForEdit = expandPath(path);
  const internalEditResult = checkEditableInternalPath(
    absolutePathForEdit,
    input
  );
  if (internalEditResult.behavior !== "passthrough") {
    return internalEditResult;
  }
  const claudeFolderAllowRule = matchingRuleForInput(
    path,
    {
      ...toolPermissionContext,
      alwaysAllowRules: {
        session: toolPermissionContext.alwaysAllowRules.session ?? []
      }
    },
    "edit",
    "allow"
  );
  if (claudeFolderAllowRule) {
    const ruleContent = claudeFolderAllowRule.ruleValue.ruleContent;
    if (ruleContent && (ruleContent.startsWith(CLAUDE_FOLDER_PERMISSION_PATTERN.slice(0, -2)) || ruleContent.startsWith(
      GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN.slice(0, -2)
    )) && !ruleContent.includes("..") && ruleContent.endsWith("/**")) {
      return {
        behavior: "allow",
        updatedInput: input,
        decisionReason: {
          type: "rule",
          rule: claudeFolderAllowRule
        }
      };
    }
  }
  const safetyCheck = checkPathSafetyForAutoEdit(path, pathsToCheck);
  if (!safetyCheck.safe) {
    const skillScope = getClaudeSkillScope(path);
    const safetySuggestions = skillScope ? [
      {
        type: "addRules",
        rules: [
          {
            toolName: FILE_EDIT_TOOL_NAME,
            ruleContent: skillScope.pattern
          }
        ],
        behavior: "allow",
        destination: "session"
      }
    ] : generateSuggestions(path, "write", toolPermissionContext, pathsToCheck);
    return {
      behavior: "ask",
      message: safetyCheck.message,
      suggestions: safetySuggestions,
      decisionReason: {
        type: "safetyCheck",
        reason: safetyCheck.message,
        classifierApprovable: safetyCheck.classifierApprovable
      }
    };
  }
  for (const pathToCheck of pathsToCheck) {
    const askRule = matchingRuleForInput(
      pathToCheck,
      toolPermissionContext,
      "edit",
      "ask"
    );
    if (askRule) {
      return {
        behavior: "ask",
        message: `Claude requested permissions to write to ${path}, but you haven't granted it yet.`,
        decisionReason: {
          type: "rule",
          rule: askRule
        }
      };
    }
  }
  const isInWorkingDir = pathInAllowedWorkingPath(
    path,
    toolPermissionContext,
    pathsToCheck
  );
  if (toolPermissionContext.mode === "acceptEdits" && isInWorkingDir) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "mode",
        mode: toolPermissionContext.mode
      }
    };
  }
  const allowRule = matchingRuleForInput(
    path,
    toolPermissionContext,
    "edit",
    "allow"
  );
  if (allowRule) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "rule",
        rule: allowRule
      }
    };
  }
  return {
    behavior: "ask",
    message: `Claude requested permissions to write to ${path}, but you haven't granted it yet.`,
    suggestions: generateSuggestions(
      path,
      "write",
      toolPermissionContext,
      pathsToCheck
    ),
    decisionReason: !isInWorkingDir ? {
      type: "workingDir",
      reason: "Path is outside allowed working directories"
    } : void 0
  };
}
function generateSuggestions(filePath, operationType, toolPermissionContext, precomputedPathsToCheck) {
  const isOutsideWorkingDir = !pathInAllowedWorkingPath(
    filePath,
    toolPermissionContext,
    precomputedPathsToCheck
  );
  if (operationType === "read" && isOutsideWorkingDir) {
    const dirPath = getDirectoryForPath(filePath);
    const dirsToAdd = getPathsForPermissionCheck(dirPath);
    const suggestions = dirsToAdd.map((dir) => createReadRuleSuggestion(dir, "session")).filter((s) => s !== void 0);
    return suggestions;
  }
  const shouldSuggestAcceptEdits = toolPermissionContext.mode === "default" || toolPermissionContext.mode === "plan";
  if (operationType === "write" || operationType === "create") {
    const updates = shouldSuggestAcceptEdits ? [{ type: "setMode", mode: "acceptEdits", destination: "session" }] : [];
    if (isOutsideWorkingDir) {
      const dirPath = getDirectoryForPath(filePath);
      const dirsToAdd = getPathsForPermissionCheck(dirPath);
      updates.push({
        type: "addDirectories",
        directories: dirsToAdd,
        destination: "session"
      });
    }
    return updates;
  }
  return shouldSuggestAcceptEdits ? [{ type: "setMode", mode: "acceptEdits", destination: "session" }] : [];
}
function checkEditableInternalPath(absolutePath, input) {
  const normalizedPath = normalize(absolutePath);
  if (isSessionPlanFile(normalizedPath)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Plan files for current session are allowed for writing"
      }
    };
  }
  if (isScratchpadPath(normalizedPath)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Scratchpad files for current session are allowed for writing"
      }
    };
  }
  if (false) {
    const jobDir = process.env.CLAUDE_JOB_DIR;
    if (jobDir) {
      const jobsRoot = join(getClaudeConfigHomeDir(), "jobs");
      const jobDirForms = getPathsForPermissionCheck(jobDir).map(normalize);
      const jobsRootForms = getPathsForPermissionCheck(jobsRoot).map(normalize);
      const isUnderJobsRoot = jobDirForms.every(
        (jd) => jobsRootForms.some((jr) => jd.startsWith(jr + sep))
      );
      if (isUnderJobsRoot) {
        const targetForms = getPathsForPermissionCheck(absolutePath);
        const allInsideJobDir = targetForms.every((p) => {
          const np = normalize(p);
          return jobDirForms.some((jd) => np === jd || np.startsWith(jd + sep));
        });
        if (allInsideJobDir) {
          return {
            behavior: "allow",
            updatedInput: input,
            decisionReason: {
              type: "other",
              reason: "Job directory files for current job are allowed for writing"
            }
          };
        }
      }
    }
  }
  if (isAgentMemoryPath(normalizedPath)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Agent memory files are allowed for writing"
      }
    };
  }
  if (!hasAutoMemPathOverride() && isAutoMemPath(normalizedPath)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "auto memory files are allowed for writing"
      }
    };
  }
  if (normalizeCaseForComparison(normalizedPath) === normalizeCaseForComparison(join(getOriginalCwd(), ".claude", "launch.json"))) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Preview launch config is allowed for writing"
      }
    };
  }
  return { behavior: "passthrough", message: "" };
}
function checkReadableInternalPath(absolutePath, input) {
  const normalizedPath = normalize(absolutePath);
  if (isSessionMemoryPath(normalizedPath)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Session memory files are allowed for reading"
      }
    };
  }
  if (isProjectDirPath(normalizedPath)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Project directory files are allowed for reading"
      }
    };
  }
  if (isSessionPlanFile(normalizedPath)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Plan files for current session are allowed for reading"
      }
    };
  }
  const toolResultsDir = getToolResultsDir();
  const toolResultsDirWithSep = toolResultsDir.endsWith(sep) ? toolResultsDir : toolResultsDir + sep;
  if (normalizedPath === toolResultsDir || normalizedPath.startsWith(toolResultsDirWithSep)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Tool result files are allowed for reading"
      }
    };
  }
  if (isScratchpadPath(normalizedPath)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Scratchpad files for current session are allowed for reading"
      }
    };
  }
  const projectTempDir = getProjectTempDir();
  if (normalizedPath.startsWith(projectTempDir)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Project temp directory files are allowed for reading"
      }
    };
  }
  if (isAgentMemoryPath(normalizedPath)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Agent memory files are allowed for reading"
      }
    };
  }
  if (isAutoMemPath(normalizedPath)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "auto memory files are allowed for reading"
      }
    };
  }
  const tasksDir = join(getClaudeConfigHomeDir(), "tasks") + sep;
  if (normalizedPath === tasksDir.slice(0, -1) || normalizedPath.startsWith(tasksDir)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Task files are allowed for reading"
      }
    };
  }
  const teamsReadDir = join(getClaudeConfigHomeDir(), "teams") + sep;
  if (normalizedPath === teamsReadDir.slice(0, -1) || normalizedPath.startsWith(teamsReadDir)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Team files are allowed for reading"
      }
    };
  }
  const bundledSkillsRoot = getBundledSkillsRoot() + sep;
  if (normalizedPath.startsWith(bundledSkillsRoot)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Bundled skill reference files are allowed for reading"
      }
    };
  }
  return { behavior: "passthrough", message: "" };
}
export {
  DANGEROUS_DIRECTORIES,
  DANGEROUS_FILES,
  allWorkingDirectories,
  checkEditableInternalPath,
  checkPathSafetyForAutoEdit,
  checkReadPermissionForTool,
  checkReadableInternalPath,
  checkWritePermissionForTool,
  ensureScratchpadDir,
  generateSuggestions,
  getBundledSkillsRoot,
  getClaudeSkillScope,
  getClaudeTempDir,
  getClaudeTempDirName,
  getFileReadIgnorePatterns,
  getProjectTempDir,
  getResolvedWorkingDirPaths,
  getScratchpadDir,
  getSessionMemoryDir,
  getSessionMemoryPath,
  isClaudeSettingsPath,
  isScratchpadEnabled,
  matchingRuleForInput,
  normalizeCaseForComparison,
  normalizePatternsToPath,
  pathInAllowedWorkingPath,
  pathInWorkingPath,
  relativePath,
  toPosixPath
};
