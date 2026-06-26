import { realpath } from "fs/promises";
import ignore from "ignore";
import memoize from "lodash-es/memoize.js";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  sep as pathSep,
  relative
} from "path";
import {
  getAdditionalDirectoriesForClaudeMd,
  getSessionId
} from "../bootstrap/state.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { roughTokenCountEstimation } from "../services/tokenEstimation.js";
import {
  parseArgumentNames,
  substituteArguments
} from "../utils/argumentSubstitution.js";
import { logForDebugging } from "../utils/debug.js";
import {
  EFFORT_LEVELS,
  parseEffortValue
} from "../utils/effort.js";
import {
  getClaudeConfigHomeDir,
  isBareMode,
  isEnvTruthy
} from "../utils/envUtils.js";
import { isENOENT, isFsInaccessible } from "../utils/errors.js";
import {
  coerceDescriptionToString,
  parseBooleanFrontmatter,
  parseFrontmatter,
  parseShellFrontmatter,
  splitPathInFrontmatter
} from "../utils/frontmatterParser.js";
import { getFsImplementation } from "../utils/fsOperations.js";
import { isPathGitignored } from "../utils/git/gitignore.js";
import { logError } from "../utils/log.js";
import {
  extractDescriptionFromMarkdown,
  getProjectDirsUpToHome,
  loadMarkdownFilesForSubdir,
  parseSlashCommandToolsFromFrontmatter
} from "../utils/markdownConfigLoader.js";
import { parseUserSpecifiedModel } from "../utils/model/model.js";
import { executeShellCommandsInPrompt } from "../utils/promptShellExecution.js";
import { isSettingSourceEnabled } from "../utils/settings/constants.js";
import { getManagedFilePath } from "../utils/settings/managedPath.js";
import { isRestrictedToPluginOnly } from "../utils/settings/pluginOnlyPolicy.js";
import { HooksSchema } from "../utils/settings/types.js";
import { createSignal } from "../utils/signal.js";
import { registerMCPSkillBuilders } from "./mcpSkillBuilders.js";
function getSkillsPath(source, dir) {
  switch (source) {
    case "policySettings":
      return join(getManagedFilePath(), ".claude", dir);
    case "userSettings":
      return join(getClaudeConfigHomeDir(), dir);
    case "projectSettings":
      return `.claude/${dir}`;
    case "plugin":
      return "plugin";
    default:
      return "";
  }
}
function estimateSkillFrontmatterTokens(skill) {
  const frontmatterText = [skill.name, skill.description, skill.whenToUse].filter(Boolean).join(" ");
  return roughTokenCountEstimation(frontmatterText);
}
async function getFileIdentity(filePath) {
  try {
    return await realpath(filePath);
  } catch {
    return null;
  }
}
function parseHooksFromFrontmatter(frontmatter, skillName) {
  if (!frontmatter.hooks) {
    return void 0;
  }
  const result = HooksSchema().safeParse(frontmatter.hooks);
  if (!result.success) {
    logForDebugging(
      `Invalid hooks in skill '${skillName}': ${result.error.message}`
    );
    return void 0;
  }
  return result.data;
}
function parseSkillPaths(frontmatter) {
  if (!frontmatter.paths) {
    return void 0;
  }
  const patterns = splitPathInFrontmatter(frontmatter.paths).map((pattern) => {
    return pattern.endsWith("/**") ? pattern.slice(0, -3) : pattern;
  }).filter((p) => p.length > 0);
  if (patterns.length === 0 || patterns.every((p) => p === "**")) {
    return void 0;
  }
  return patterns;
}
function parseSkillFrontmatterFields(frontmatter, markdownContent, resolvedName, descriptionFallbackLabel = "Skill") {
  const validatedDescription = coerceDescriptionToString(
    frontmatter.description,
    resolvedName
  );
  const description = validatedDescription ?? extractDescriptionFromMarkdown(markdownContent, descriptionFallbackLabel);
  const userInvocable = frontmatter["user-invocable"] === void 0 ? true : parseBooleanFrontmatter(frontmatter["user-invocable"]);
  const model = frontmatter.model === "inherit" ? void 0 : frontmatter.model ? parseUserSpecifiedModel(frontmatter.model) : void 0;
  const effortRaw = frontmatter["effort"];
  const effort = effortRaw !== void 0 ? parseEffortValue(effortRaw) : void 0;
  if (effortRaw !== void 0 && effort === void 0) {
    logForDebugging(
      `Skill ${resolvedName} has invalid effort '${effortRaw}'. Valid options: ${EFFORT_LEVELS.join(", ")} or an integer`
    );
  }
  return {
    displayName: frontmatter.name != null ? String(frontmatter.name) : void 0,
    description,
    hasUserSpecifiedDescription: validatedDescription !== null,
    allowedTools: parseSlashCommandToolsFromFrontmatter(
      frontmatter["allowed-tools"]
    ),
    argumentHint: frontmatter["argument-hint"] != null ? String(frontmatter["argument-hint"]) : void 0,
    argumentNames: parseArgumentNames(
      frontmatter.arguments
    ),
    whenToUse: frontmatter.when_to_use,
    version: frontmatter.version,
    model,
    disableModelInvocation: parseBooleanFrontmatter(
      frontmatter["disable-model-invocation"]
    ),
    userInvocable,
    hooks: parseHooksFromFrontmatter(frontmatter, resolvedName),
    executionContext: frontmatter.context === "fork" ? "fork" : void 0,
    agent: frontmatter.agent,
    effort,
    shell: parseShellFrontmatter(frontmatter.shell, resolvedName)
  };
}
function createSkillCommand({
  skillName,
  displayName,
  description,
  hasUserSpecifiedDescription,
  markdownContent,
  allowedTools,
  argumentHint,
  argumentNames,
  whenToUse,
  version,
  model,
  disableModelInvocation,
  userInvocable,
  source,
  baseDir,
  loadedFrom,
  hooks,
  executionContext,
  agent,
  paths,
  effort,
  shell
}) {
  return {
    type: "prompt",
    name: skillName,
    description,
    hasUserSpecifiedDescription,
    allowedTools,
    argumentHint,
    argNames: argumentNames.length > 0 ? argumentNames : void 0,
    whenToUse,
    version,
    model,
    disableModelInvocation,
    userInvocable,
    context: executionContext,
    agent,
    effort,
    paths,
    contentLength: markdownContent.length,
    isHidden: !userInvocable,
    progressMessage: "running",
    userFacingName() {
      return displayName || skillName;
    },
    source,
    loadedFrom,
    hooks,
    skillRoot: baseDir,
    async getPromptForCommand(args, toolUseContext) {
      let finalContent = baseDir ? `Base directory for this skill: ${baseDir}

${markdownContent}` : markdownContent;
      finalContent = substituteArguments(
        finalContent,
        args,
        true,
        argumentNames
      );
      if (baseDir) {
        const skillDir = process.platform === "win32" ? baseDir.replace(/\\/g, "/") : baseDir;
        finalContent = finalContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir);
      }
      finalContent = finalContent.replace(
        /\$\{CLAUDE_SESSION_ID\}/g,
        getSessionId()
      );
      if (loadedFrom !== "mcp") {
        finalContent = await executeShellCommandsInPrompt(
          finalContent,
          {
            ...toolUseContext,
            getAppState() {
              const appState = toolUseContext.getAppState();
              return {
                ...appState,
                toolPermissionContext: {
                  ...appState.toolPermissionContext,
                  alwaysAllowRules: {
                    ...appState.toolPermissionContext.alwaysAllowRules,
                    command: allowedTools
                  }
                }
              };
            }
          },
          `/${skillName}`,
          shell
        );
      }
      return [{ type: "text", text: finalContent }];
    }
  };
}
async function loadSkillsFromSkillsDir(basePath, source) {
  const fs = getFsImplementation();
  let entries;
  try {
    entries = await fs.readdir(basePath);
  } catch (e) {
    if (!isFsInaccessible(e)) logError(e);
    return [];
  }
  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          return null;
        }
        const skillDirPath = join(basePath, entry.name);
        const skillFilePath = join(skillDirPath, "SKILL.md");
        let content;
        try {
          content = await fs.readFile(skillFilePath, { encoding: "utf-8" });
        } catch (e) {
          if (!isENOENT(e)) {
            logForDebugging(`[skills] failed to read ${skillFilePath}: ${e}`, {
              level: "warn"
            });
          }
          return null;
        }
        const { frontmatter, content: markdownContent } = parseFrontmatter(
          content,
          skillFilePath
        );
        const skillName = entry.name;
        const parsed = parseSkillFrontmatterFields(
          frontmatter,
          markdownContent,
          skillName
        );
        const paths = parseSkillPaths(frontmatter);
        return {
          skill: createSkillCommand({
            ...parsed,
            skillName,
            markdownContent,
            source,
            baseDir: skillDirPath,
            loadedFrom: "skills",
            paths
          }),
          filePath: skillFilePath
        };
      } catch (error) {
        logError(error);
        return null;
      }
    })
  );
  return results.filter((r) => r !== null);
}
function isSkillFile(filePath) {
  return /^skill\.md$/i.test(basename(filePath));
}
function transformSkillFiles(files) {
  const filesByDir = /* @__PURE__ */ new Map();
  for (const file of files) {
    const dir = dirname(file.filePath);
    const dirFiles = filesByDir.get(dir) ?? [];
    dirFiles.push(file);
    filesByDir.set(dir, dirFiles);
  }
  const result = [];
  for (const [dir, dirFiles] of filesByDir) {
    const skillFiles = dirFiles.filter((f) => isSkillFile(f.filePath));
    if (skillFiles.length > 0) {
      const skillFile = skillFiles[0];
      if (skillFiles.length > 1) {
        logForDebugging(
          `Multiple skill files found in ${dir}, using ${basename(skillFile.filePath)}`
        );
      }
      result.push(skillFile);
    } else {
      result.push(...dirFiles);
    }
  }
  return result;
}
function buildNamespace(targetDir, baseDir) {
  const normalizedBaseDir = baseDir.endsWith(pathSep) ? baseDir.slice(0, -1) : baseDir;
  if (targetDir === normalizedBaseDir) {
    return "";
  }
  const relativePath = targetDir.slice(normalizedBaseDir.length + 1);
  return relativePath ? relativePath.split(pathSep).join(":") : "";
}
function getSkillCommandName(filePath, baseDir) {
  const skillDirectory = dirname(filePath);
  const parentOfSkillDir = dirname(skillDirectory);
  const commandBaseName = basename(skillDirectory);
  const namespace = buildNamespace(parentOfSkillDir, baseDir);
  return namespace ? `${namespace}:${commandBaseName}` : commandBaseName;
}
function getRegularCommandName(filePath, baseDir) {
  const fileName = basename(filePath);
  const fileDirectory = dirname(filePath);
  const commandBaseName = fileName.replace(/\.md$/, "");
  const namespace = buildNamespace(fileDirectory, baseDir);
  return namespace ? `${namespace}:${commandBaseName}` : commandBaseName;
}
function getCommandName(file) {
  const isSkill = isSkillFile(file.filePath);
  return isSkill ? getSkillCommandName(file.filePath, file.baseDir) : getRegularCommandName(file.filePath, file.baseDir);
}
async function loadSkillsFromCommandsDir(cwd) {
  try {
    const markdownFiles = await loadMarkdownFilesForSubdir("commands", cwd);
    const processedFiles = transformSkillFiles(markdownFiles);
    const skills = [];
    for (const {
      baseDir,
      filePath,
      frontmatter,
      content,
      source
    } of processedFiles) {
      try {
        const isSkillFormat = isSkillFile(filePath);
        const skillDirectory = isSkillFormat ? dirname(filePath) : void 0;
        const cmdName = getCommandName({
          baseDir,
          filePath,
          frontmatter,
          content,
          source
        });
        const parsed = parseSkillFrontmatterFields(
          frontmatter,
          content,
          cmdName,
          "Custom command"
        );
        skills.push({
          skill: createSkillCommand({
            ...parsed,
            skillName: cmdName,
            displayName: void 0,
            markdownContent: content,
            source,
            baseDir: skillDirectory,
            loadedFrom: "commands_DEPRECATED",
            paths: void 0
          }),
          filePath
        });
      } catch (error) {
        logError(error);
      }
    }
    return skills;
  } catch (error) {
    logError(error);
    return [];
  }
}
const getSkillDirCommands = memoize(
  async (cwd) => {
    const userSkillsDir = join(getClaudeConfigHomeDir(), "skills");
    const managedSkillsDir = join(getManagedFilePath(), ".claude", "skills");
    const projectSkillsDirs = getProjectDirsUpToHome("skills", cwd);
    logForDebugging(
      `Loading skills from: managed=${managedSkillsDir}, user=${userSkillsDir}, project=[${projectSkillsDirs.join(", ")}]`
    );
    const additionalDirs = getAdditionalDirectoriesForClaudeMd();
    const skillsLocked = isRestrictedToPluginOnly("skills");
    const projectSettingsEnabled = isSettingSourceEnabled("projectSettings") && !skillsLocked;
    if (isBareMode()) {
      if (additionalDirs.length === 0 || !projectSettingsEnabled) {
        logForDebugging(
          `[bare] Skipping skill dir discovery (${additionalDirs.length === 0 ? "no --add-dir" : "projectSettings disabled or skillsLocked"})`
        );
        return [];
      }
      const additionalSkillsNested2 = await Promise.all(
        additionalDirs.map(
          (dir) => loadSkillsFromSkillsDir(
            join(dir, ".claude", "skills"),
            "projectSettings"
          )
        )
      );
      return additionalSkillsNested2.flat().map((s) => s.skill);
    }
    const [
      managedSkills,
      userSkills,
      projectSkillsNested,
      additionalSkillsNested,
      legacyCommands
    ] = await Promise.all([
      isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_POLICY_SKILLS) ? Promise.resolve([]) : loadSkillsFromSkillsDir(managedSkillsDir, "policySettings"),
      isSettingSourceEnabled("userSettings") && !skillsLocked ? loadSkillsFromSkillsDir(userSkillsDir, "userSettings") : Promise.resolve([]),
      projectSettingsEnabled ? Promise.all(
        projectSkillsDirs.map(
          (dir) => loadSkillsFromSkillsDir(dir, "projectSettings")
        )
      ) : Promise.resolve([]),
      projectSettingsEnabled ? Promise.all(
        additionalDirs.map(
          (dir) => loadSkillsFromSkillsDir(
            join(dir, ".claude", "skills"),
            "projectSettings"
          )
        )
      ) : Promise.resolve([]),
      // Legacy commands-as-skills goes through markdownConfigLoader with
      // subdir='commands', which our agents-only guard there skips. Block
      // here when skills are locked — these ARE skills, regardless of the
      // directory they load from.
      skillsLocked ? Promise.resolve([]) : loadSkillsFromCommandsDir(cwd)
    ]);
    const allSkillsWithPaths = [
      ...managedSkills,
      ...userSkills,
      ...projectSkillsNested.flat(),
      ...additionalSkillsNested.flat(),
      ...legacyCommands
    ];
    const fileIds = await Promise.all(
      allSkillsWithPaths.map(
        ({ skill, filePath }) => skill.type === "prompt" ? getFileIdentity(filePath) : Promise.resolve(null)
      )
    );
    const seenFileIds = /* @__PURE__ */ new Map();
    const deduplicatedSkills = [];
    for (let i = 0; i < allSkillsWithPaths.length; i++) {
      const entry = allSkillsWithPaths[i];
      if (entry === void 0 || entry.skill.type !== "prompt") continue;
      const { skill } = entry;
      const fileId = fileIds[i];
      if (fileId === null || fileId === void 0) {
        deduplicatedSkills.push(skill);
        continue;
      }
      const existingSource = seenFileIds.get(fileId);
      if (existingSource !== void 0) {
        logForDebugging(
          `Skipping duplicate skill '${skill.name}' from ${skill.source} (same file already loaded from ${existingSource})`
        );
        continue;
      }
      seenFileIds.set(fileId, skill.source);
      deduplicatedSkills.push(skill);
    }
    const duplicatesRemoved = allSkillsWithPaths.length - deduplicatedSkills.length;
    if (duplicatesRemoved > 0) {
      logForDebugging(`Deduplicated ${duplicatesRemoved} skills (same file)`);
    }
    const unconditionalSkills = [];
    const newConditionalSkills = [];
    for (const skill of deduplicatedSkills) {
      if (skill.type === "prompt" && skill.paths && skill.paths.length > 0 && !activatedConditionalSkillNames.has(skill.name)) {
        newConditionalSkills.push(skill);
      } else {
        unconditionalSkills.push(skill);
      }
    }
    for (const skill of newConditionalSkills) {
      conditionalSkills.set(skill.name, skill);
    }
    if (newConditionalSkills.length > 0) {
      logForDebugging(
        `[skills] ${newConditionalSkills.length} conditional skills stored (activated when matching files are touched)`
      );
    }
    logForDebugging(
      `Loaded ${deduplicatedSkills.length} unique skills (${unconditionalSkills.length} unconditional, ${newConditionalSkills.length} conditional, managed: ${managedSkills.length}, user: ${userSkills.length}, project: ${projectSkillsNested.flat().length}, additional: ${additionalSkillsNested.flat().length}, legacy commands: ${legacyCommands.length})`
    );
    return unconditionalSkills;
  }
);
function clearSkillCaches() {
  getSkillDirCommands.cache?.clear?.();
  loadMarkdownFilesForSubdir.cache?.clear?.();
  conditionalSkills.clear();
  activatedConditionalSkillNames.clear();
}
const dynamicSkillDirs = /* @__PURE__ */ new Set();
const dynamicSkills = /* @__PURE__ */ new Map();
const conditionalSkills = /* @__PURE__ */ new Map();
const activatedConditionalSkillNames = /* @__PURE__ */ new Set();
const skillsLoaded = createSignal();
function onDynamicSkillsLoaded(callback) {
  return skillsLoaded.subscribe(() => {
    try {
      callback();
    } catch (error) {
      logError(error);
    }
  });
}
async function discoverSkillDirsForPaths(filePaths, cwd) {
  const fs = getFsImplementation();
  const resolvedCwd = cwd.endsWith(pathSep) ? cwd.slice(0, -1) : cwd;
  const newDirs = [];
  for (const filePath of filePaths) {
    let currentDir = dirname(filePath);
    while (currentDir.startsWith(resolvedCwd + pathSep)) {
      const skillDir = join(currentDir, ".claude", "skills");
      if (!dynamicSkillDirs.has(skillDir)) {
        dynamicSkillDirs.add(skillDir);
        try {
          await fs.stat(skillDir);
          if (await isPathGitignored(currentDir, resolvedCwd)) {
            logForDebugging(
              `[skills] Skipped gitignored skills dir: ${skillDir}`
            );
            continue;
          }
          newDirs.push(skillDir);
        } catch {
        }
      }
      const parent = dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  }
  return newDirs.sort(
    (a, b) => b.split(pathSep).length - a.split(pathSep).length
  );
}
async function addSkillDirectories(dirs) {
  if (!isSettingSourceEnabled("projectSettings") || isRestrictedToPluginOnly("skills")) {
    logForDebugging(
      "[skills] Dynamic skill discovery skipped: projectSettings disabled or plugin-only policy"
    );
    return;
  }
  if (dirs.length === 0) {
    return;
  }
  const previousSkillNamesForLogging = new Set(dynamicSkills.keys());
  const loadedSkills = await Promise.all(
    dirs.map((dir) => loadSkillsFromSkillsDir(dir, "projectSettings"))
  );
  for (let i = loadedSkills.length - 1; i >= 0; i--) {
    for (const { skill } of loadedSkills[i] ?? []) {
      if (skill.type === "prompt") {
        dynamicSkills.set(skill.name, skill);
      }
    }
  }
  const newSkillCount = loadedSkills.flat().length;
  if (newSkillCount > 0) {
    const addedSkills = [...dynamicSkills.keys()].filter(
      (n) => !previousSkillNamesForLogging.has(n)
    );
    logForDebugging(
      `[skills] Dynamically discovered ${newSkillCount} skills from ${dirs.length} directories`
    );
    if (addedSkills.length > 0) {
      logEvent("tengu_dynamic_skills_changed", {
        source: "file_operation",
        previousCount: previousSkillNamesForLogging.size,
        newCount: dynamicSkills.size,
        addedCount: addedSkills.length,
        directoryCount: dirs.length
      });
    }
  }
  skillsLoaded.emit();
}
function getDynamicSkills() {
  return Array.from(dynamicSkills.values());
}
function activateConditionalSkillsForPaths(filePaths, cwd) {
  if (conditionalSkills.size === 0) {
    return [];
  }
  const activated = [];
  for (const [name, skill] of conditionalSkills) {
    if (skill.type !== "prompt" || !skill.paths || skill.paths.length === 0) {
      continue;
    }
    const skillIgnore = ignore().add(skill.paths);
    for (const filePath of filePaths) {
      const relativePath = isAbsolute(filePath) ? relative(cwd, filePath) : filePath;
      if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
        continue;
      }
      if (skillIgnore.ignores(relativePath)) {
        dynamicSkills.set(name, skill);
        conditionalSkills.delete(name);
        activatedConditionalSkillNames.add(name);
        activated.push(name);
        logForDebugging(
          `[skills] Activated conditional skill '${name}' (matched path: ${relativePath})`
        );
        break;
      }
    }
  }
  if (activated.length > 0) {
    logEvent("tengu_dynamic_skills_changed", {
      source: "conditional_paths",
      previousCount: dynamicSkills.size - activated.length,
      newCount: dynamicSkills.size,
      addedCount: activated.length,
      directoryCount: 0
    });
    skillsLoaded.emit();
  }
  return activated;
}
function getConditionalSkillCount() {
  return conditionalSkills.size;
}
function clearDynamicSkills() {
  dynamicSkillDirs.clear();
  dynamicSkills.clear();
  conditionalSkills.clear();
  activatedConditionalSkillNames.clear();
}
registerMCPSkillBuilders({
  createSkillCommand,
  parseSkillFrontmatterFields
});
export {
  activateConditionalSkillsForPaths,
  addSkillDirectories,
  clearSkillCaches as clearCommandCaches,
  clearDynamicSkills,
  clearSkillCaches,
  createSkillCommand,
  discoverSkillDirsForPaths,
  estimateSkillFrontmatterTokens,
  getSkillDirCommands as getCommandDirCommands,
  getConditionalSkillCount,
  getDynamicSkills,
  getSkillDirCommands,
  getSkillsPath,
  onDynamicSkillsLoaded,
  parseSkillFrontmatterFields,
  transformSkillFiles
};
