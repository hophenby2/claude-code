import memoize from "lodash-es/memoize.js";
import { basename, dirname, join } from "path";
import { getInlinePlugins, getSessionId } from "../../bootstrap/state.js";
import { getPluginErrorMessage } from "../../types/plugin.js";
import {
  parseArgumentNames,
  substituteArguments
} from "../argumentSubstitution.js";
import { logForDebugging } from "../debug.js";
import { EFFORT_LEVELS, parseEffortValue } from "../effort.js";
import { isBareMode } from "../envUtils.js";
import { isENOENT } from "../errors.js";
import {
  coerceDescriptionToString,
  parseBooleanFrontmatter,
  parseFrontmatter,
  parseShellFrontmatter
} from "../frontmatterParser.js";
import { getFsImplementation, isDuplicatePath } from "../fsOperations.js";
import {
  extractDescriptionFromMarkdown,
  parseSlashCommandToolsFromFrontmatter
} from "../markdownConfigLoader.js";
import { parseUserSpecifiedModel } from "../model/model.js";
import { executeShellCommandsInPrompt } from "../promptShellExecution.js";
import { loadAllPluginsCacheOnly } from "./pluginLoader.js";
import {
  loadPluginOptions,
  substitutePluginVariables,
  substituteUserConfigInContent
} from "./pluginOptionsStorage.js";
import { walkPluginMarkdown } from "./walkPluginMarkdown.js";
function isSkillFile(filePath) {
  return /^skill\.md$/i.test(basename(filePath));
}
function getCommandNameFromFile(filePath, baseDir, pluginName) {
  const isSkill = isSkillFile(filePath);
  if (isSkill) {
    const skillDirectory = dirname(filePath);
    const parentOfSkillDir = dirname(skillDirectory);
    const commandBaseName = basename(skillDirectory);
    const relativePath = parentOfSkillDir.startsWith(baseDir) ? parentOfSkillDir.slice(baseDir.length).replace(/^\//, "") : "";
    const namespace = relativePath ? relativePath.split("/").join(":") : "";
    return namespace ? `${pluginName}:${namespace}:${commandBaseName}` : `${pluginName}:${commandBaseName}`;
  } else {
    const fileDirectory = dirname(filePath);
    const commandBaseName = basename(filePath).replace(/\.md$/, "");
    const relativePath = fileDirectory.startsWith(baseDir) ? fileDirectory.slice(baseDir.length).replace(/^\//, "") : "";
    const namespace = relativePath ? relativePath.split("/").join(":") : "";
    return namespace ? `${pluginName}:${namespace}:${commandBaseName}` : `${pluginName}:${commandBaseName}`;
  }
}
async function collectMarkdownFiles(dirPath, baseDir, loadedPaths) {
  const files = [];
  const fs = getFsImplementation();
  await walkPluginMarkdown(
    dirPath,
    async (fullPath) => {
      if (isDuplicatePath(fs, fullPath, loadedPaths)) return;
      const content = await fs.readFile(fullPath, { encoding: "utf-8" });
      const { frontmatter, content: markdownContent } = parseFrontmatter(
        content,
        fullPath
      );
      files.push({
        filePath: fullPath,
        baseDir,
        frontmatter,
        content: markdownContent
      });
    },
    { stopAtSkillDir: true, logLabel: "commands" }
  );
  return files;
}
function transformPluginSkillFiles(files) {
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
async function loadCommandsFromDirectory(commandsPath, pluginName, sourceName, pluginManifest, pluginPath, config = { isSkillMode: false }, loadedPaths = /* @__PURE__ */ new Set()) {
  const markdownFiles = await collectMarkdownFiles(
    commandsPath,
    commandsPath,
    loadedPaths
  );
  const processedFiles = transformPluginSkillFiles(markdownFiles);
  const commands = [];
  for (const file of processedFiles) {
    const commandName = getCommandNameFromFile(
      file.filePath,
      file.baseDir,
      pluginName
    );
    const command = createPluginCommand(
      commandName,
      file,
      sourceName,
      pluginManifest,
      pluginPath,
      isSkillFile(file.filePath),
      config
    );
    if (command) {
      commands.push(command);
    }
  }
  return commands;
}
function createPluginCommand(commandName, file, sourceName, pluginManifest, pluginPath, isSkill, config = { isSkillMode: false }) {
  try {
    const { frontmatter, content } = file;
    const validatedDescription = coerceDescriptionToString(
      frontmatter.description,
      commandName
    );
    const description = validatedDescription ?? extractDescriptionFromMarkdown(
      content,
      isSkill ? "Plugin skill" : "Plugin command"
    );
    const rawAllowedTools = frontmatter["allowed-tools"];
    const substitutedAllowedTools = typeof rawAllowedTools === "string" ? substitutePluginVariables(rawAllowedTools, {
      path: pluginPath,
      source: sourceName
    }) : Array.isArray(rawAllowedTools) ? rawAllowedTools.map(
      (tool) => typeof tool === "string" ? substitutePluginVariables(tool, {
        path: pluginPath,
        source: sourceName
      }) : tool
    ) : rawAllowedTools;
    const allowedTools = parseSlashCommandToolsFromFrontmatter(
      substitutedAllowedTools
    );
    const argumentHint = frontmatter["argument-hint"];
    const argumentNames = parseArgumentNames(
      frontmatter.arguments
    );
    const whenToUse = frontmatter.when_to_use;
    const version = frontmatter.version;
    const displayName = frontmatter.name;
    const model = frontmatter.model === "inherit" ? void 0 : frontmatter.model ? parseUserSpecifiedModel(frontmatter.model) : void 0;
    const effortRaw = frontmatter["effort"];
    const effort = effortRaw !== void 0 ? parseEffortValue(effortRaw) : void 0;
    if (effortRaw !== void 0 && effort === void 0) {
      logForDebugging(
        `Plugin command ${commandName} has invalid effort '${effortRaw}'. Valid options: ${EFFORT_LEVELS.join(", ")} or an integer`
      );
    }
    const disableModelInvocation = parseBooleanFrontmatter(
      frontmatter["disable-model-invocation"]
    );
    const userInvocableValue = frontmatter["user-invocable"];
    const userInvocable = userInvocableValue === void 0 ? true : parseBooleanFrontmatter(userInvocableValue);
    const shell = parseShellFrontmatter(frontmatter.shell, commandName);
    return {
      type: "prompt",
      name: commandName,
      description,
      hasUserSpecifiedDescription: validatedDescription !== null,
      allowedTools,
      argumentHint,
      argNames: argumentNames.length > 0 ? argumentNames : void 0,
      whenToUse,
      version,
      model,
      effort,
      disableModelInvocation,
      userInvocable,
      contentLength: content.length,
      source: "plugin",
      loadedFrom: isSkill || config.isSkillMode ? "plugin" : void 0,
      pluginInfo: {
        pluginManifest,
        repository: sourceName
      },
      isHidden: !userInvocable,
      progressMessage: isSkill || config.isSkillMode ? "loading" : "running",
      userFacingName() {
        return displayName || commandName;
      },
      async getPromptForCommand(args, context) {
        let finalContent = config.isSkillMode ? `Base directory for this skill: ${dirname(file.filePath)}

${content}` : content;
        finalContent = substituteArguments(
          finalContent,
          args,
          true,
          argumentNames
        );
        finalContent = substitutePluginVariables(finalContent, {
          path: pluginPath,
          source: sourceName
        });
        if (pluginManifest.userConfig) {
          finalContent = substituteUserConfigInContent(
            finalContent,
            loadPluginOptions(sourceName),
            pluginManifest.userConfig
          );
        }
        if (config.isSkillMode) {
          const rawSkillDir = dirname(file.filePath);
          const skillDir = process.platform === "win32" ? rawSkillDir.replace(/\\/g, "/") : rawSkillDir;
          finalContent = finalContent.replace(
            /\$\{CLAUDE_SKILL_DIR\}/g,
            skillDir
          );
        }
        finalContent = finalContent.replace(
          /\$\{CLAUDE_SESSION_ID\}/g,
          getSessionId()
        );
        finalContent = await executeShellCommandsInPrompt(
          finalContent,
          {
            ...context,
            getAppState() {
              const appState = context.getAppState();
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
          `/${commandName}`,
          shell
        );
        return [{ type: "text", text: finalContent }];
      }
    };
  } catch (error) {
    logForDebugging(
      `Failed to create command from ${file.filePath}: ${error}`,
      {
        level: "error"
      }
    );
    return null;
  }
}
const getPluginCommands = memoize(async () => {
  if (isBareMode() && getInlinePlugins().length === 0) {
    return [];
  }
  const { enabled, errors } = await loadAllPluginsCacheOnly();
  if (errors.length > 0) {
    logForDebugging(
      `Plugin loading errors: ${errors.map((e) => getPluginErrorMessage(e)).join(", ")}`
    );
  }
  const perPluginCommands = await Promise.all(
    enabled.map(async (plugin) => {
      const loadedPaths = /* @__PURE__ */ new Set();
      const pluginCommands = [];
      if (plugin.commandsPath) {
        try {
          const commands = await loadCommandsFromDirectory(
            plugin.commandsPath,
            plugin.name,
            plugin.source,
            plugin.manifest,
            plugin.path,
            { isSkillMode: false },
            loadedPaths
          );
          pluginCommands.push(...commands);
          if (commands.length > 0) {
            logForDebugging(
              `Loaded ${commands.length} commands from plugin ${plugin.name} default directory`
            );
          }
        } catch (error) {
          logForDebugging(
            `Failed to load commands from plugin ${plugin.name} default directory: ${error}`,
            { level: "error" }
          );
        }
      }
      if (plugin.commandsPaths) {
        logForDebugging(
          `Plugin ${plugin.name} has commandsPaths: ${plugin.commandsPaths.join(", ")}`
        );
        const pathResults = await Promise.all(
          plugin.commandsPaths.map(async (commandPath) => {
            try {
              const fs = getFsImplementation();
              const stats = await fs.stat(commandPath);
              logForDebugging(
                `Checking commandPath ${commandPath} - isDirectory: ${stats.isDirectory()}, isFile: ${stats.isFile()}`
              );
              if (stats.isDirectory()) {
                const commands = await loadCommandsFromDirectory(
                  commandPath,
                  plugin.name,
                  plugin.source,
                  plugin.manifest,
                  plugin.path,
                  { isSkillMode: false },
                  loadedPaths
                );
                if (commands.length > 0) {
                  logForDebugging(
                    `Loaded ${commands.length} commands from plugin ${plugin.name} custom path: ${commandPath}`
                  );
                } else {
                  logForDebugging(
                    `Warning: No commands found in plugin ${plugin.name} custom directory: ${commandPath}. Expected .md files or SKILL.md in subdirectories.`,
                    { level: "warn" }
                  );
                }
                return commands;
              } else if (stats.isFile() && commandPath.endsWith(".md")) {
                if (isDuplicatePath(fs, commandPath, loadedPaths)) {
                  return [];
                }
                const content = await fs.readFile(commandPath, {
                  encoding: "utf-8"
                });
                const { frontmatter, content: markdownContent } = parseFrontmatter(content, commandPath);
                let commandName;
                let metadataOverride;
                if (plugin.commandsMetadata) {
                  for (const [name, metadata] of Object.entries(
                    plugin.commandsMetadata
                  )) {
                    if (metadata.source) {
                      const fullMetadataPath = join(
                        plugin.path,
                        metadata.source
                      );
                      if (commandPath === fullMetadataPath) {
                        commandName = `${plugin.name}:${name}`;
                        metadataOverride = metadata;
                        break;
                      }
                    }
                  }
                }
                if (!commandName) {
                  commandName = `${plugin.name}:${basename(commandPath).replace(/\.md$/, "")}`;
                }
                const finalFrontmatter = metadataOverride ? {
                  ...frontmatter,
                  ...metadataOverride.description && {
                    description: metadataOverride.description
                  },
                  ...metadataOverride.argumentHint && {
                    "argument-hint": metadataOverride.argumentHint
                  },
                  ...metadataOverride.model && {
                    model: metadataOverride.model
                  },
                  ...metadataOverride.allowedTools && {
                    "allowed-tools": metadataOverride.allowedTools.join(",")
                  }
                } : frontmatter;
                const file = {
                  filePath: commandPath,
                  baseDir: dirname(commandPath),
                  frontmatter: finalFrontmatter,
                  content: markdownContent
                };
                const command = createPluginCommand(
                  commandName,
                  file,
                  plugin.source,
                  plugin.manifest,
                  plugin.path,
                  false
                );
                if (command) {
                  logForDebugging(
                    `Loaded command from plugin ${plugin.name} custom file: ${commandPath}${metadataOverride ? " (with metadata override)" : ""}`
                  );
                  return [command];
                }
              }
              return [];
            } catch (error) {
              logForDebugging(
                `Failed to load commands from plugin ${plugin.name} custom path ${commandPath}: ${error}`,
                { level: "error" }
              );
              return [];
            }
          })
        );
        for (const commands of pathResults) {
          pluginCommands.push(...commands);
        }
      }
      if (plugin.commandsMetadata) {
        for (const [name, metadata] of Object.entries(
          plugin.commandsMetadata
        )) {
          if (metadata.content && !metadata.source) {
            try {
              const { frontmatter, content: markdownContent } = parseFrontmatter(
                metadata.content,
                `<inline:${plugin.name}:${name}>`
              );
              const finalFrontmatter = {
                ...frontmatter,
                ...metadata.description && {
                  description: metadata.description
                },
                ...metadata.argumentHint && {
                  "argument-hint": metadata.argumentHint
                },
                ...metadata.model && {
                  model: metadata.model
                },
                ...metadata.allowedTools && {
                  "allowed-tools": metadata.allowedTools.join(",")
                }
              };
              const commandName = `${plugin.name}:${name}`;
              const file = {
                filePath: `<inline:${commandName}>`,
                // Virtual path for inline content
                baseDir: plugin.path,
                // Use plugin root as base directory
                frontmatter: finalFrontmatter,
                content: markdownContent
              };
              const command = createPluginCommand(
                commandName,
                file,
                plugin.source,
                plugin.manifest,
                plugin.path,
                false
              );
              if (command) {
                pluginCommands.push(command);
                logForDebugging(
                  `Loaded inline content command from plugin ${plugin.name}: ${commandName}`
                );
              }
            } catch (error) {
              logForDebugging(
                `Failed to load inline content command ${name} from plugin ${plugin.name}: ${error}`,
                { level: "error" }
              );
            }
          }
        }
      }
      return pluginCommands;
    })
  );
  const allCommands = perPluginCommands.flat();
  logForDebugging(`Total plugin commands loaded: ${allCommands.length}`);
  return allCommands;
});
function clearPluginCommandCache() {
  getPluginCommands.cache?.clear?.();
}
async function loadSkillsFromDirectory(skillsPath, pluginName, sourceName, pluginManifest, pluginPath, loadedPaths) {
  const fs = getFsImplementation();
  const skills = [];
  const directSkillPath = join(skillsPath, "SKILL.md");
  let directSkillContent = null;
  try {
    directSkillContent = await fs.readFile(directSkillPath, {
      encoding: "utf-8"
    });
  } catch (e) {
    if (!isENOENT(e)) {
      logForDebugging(`Failed to load skill from ${directSkillPath}: ${e}`, {
        level: "error"
      });
      return skills;
    }
  }
  if (directSkillContent !== null) {
    if (isDuplicatePath(fs, directSkillPath, loadedPaths)) {
      return skills;
    }
    try {
      const { frontmatter, content: markdownContent } = parseFrontmatter(
        directSkillContent,
        directSkillPath
      );
      const skillName = `${pluginName}:${basename(skillsPath)}`;
      const file = {
        filePath: directSkillPath,
        baseDir: dirname(directSkillPath),
        frontmatter,
        content: markdownContent
      };
      const skill = createPluginCommand(
        skillName,
        file,
        sourceName,
        pluginManifest,
        pluginPath,
        true,
        // isSkill
        { isSkillMode: true }
        // config
      );
      if (skill) {
        skills.push(skill);
      }
    } catch (error) {
      logForDebugging(
        `Failed to load skill from ${directSkillPath}: ${error}`,
        {
          level: "error"
        }
      );
    }
    return skills;
  }
  let entries;
  try {
    entries = await fs.readdir(skillsPath);
  } catch (e) {
    if (!isENOENT(e)) {
      logForDebugging(
        `Failed to load skills from directory ${skillsPath}: ${e}`,
        { level: "error" }
      );
    }
    return skills;
  }
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        return;
      }
      const skillDirPath = join(skillsPath, entry.name);
      const skillFilePath = join(skillDirPath, "SKILL.md");
      let content;
      try {
        content = await fs.readFile(skillFilePath, { encoding: "utf-8" });
      } catch (e) {
        if (!isENOENT(e)) {
          logForDebugging(`Failed to load skill from ${skillFilePath}: ${e}`, {
            level: "error"
          });
        }
        return;
      }
      if (isDuplicatePath(fs, skillFilePath, loadedPaths)) {
        return;
      }
      try {
        const { frontmatter, content: markdownContent } = parseFrontmatter(
          content,
          skillFilePath
        );
        const skillName = `${pluginName}:${entry.name}`;
        const file = {
          filePath: skillFilePath,
          baseDir: dirname(skillFilePath),
          frontmatter,
          content: markdownContent
        };
        const skill = createPluginCommand(
          skillName,
          file,
          sourceName,
          pluginManifest,
          pluginPath,
          true,
          // isSkill
          { isSkillMode: true }
          // config
        );
        if (skill) {
          skills.push(skill);
        }
      } catch (error) {
        logForDebugging(
          `Failed to load skill from ${skillFilePath}: ${error}`,
          { level: "error" }
        );
      }
    })
  );
  return skills;
}
const getPluginSkills = memoize(async () => {
  if (isBareMode() && getInlinePlugins().length === 0) {
    return [];
  }
  const { enabled, errors } = await loadAllPluginsCacheOnly();
  if (errors.length > 0) {
    logForDebugging(
      `Plugin loading errors: ${errors.map((e) => getPluginErrorMessage(e)).join(", ")}`
    );
  }
  logForDebugging(
    `getPluginSkills: Processing ${enabled.length} enabled plugins`
  );
  const perPluginSkills = await Promise.all(
    enabled.map(async (plugin) => {
      const loadedPaths = /* @__PURE__ */ new Set();
      const pluginSkills = [];
      logForDebugging(
        `Checking plugin ${plugin.name}: skillsPath=${plugin.skillsPath ? "exists" : "none"}, skillsPaths=${plugin.skillsPaths ? plugin.skillsPaths.length : 0} paths`
      );
      if (plugin.skillsPath) {
        logForDebugging(
          `Attempting to load skills from plugin ${plugin.name} default skillsPath: ${plugin.skillsPath}`
        );
        try {
          const skills = await loadSkillsFromDirectory(
            plugin.skillsPath,
            plugin.name,
            plugin.source,
            plugin.manifest,
            plugin.path,
            loadedPaths
          );
          pluginSkills.push(...skills);
          logForDebugging(
            `Loaded ${skills.length} skills from plugin ${plugin.name} default directory`
          );
        } catch (error) {
          logForDebugging(
            `Failed to load skills from plugin ${plugin.name} default directory: ${error}`,
            { level: "error" }
          );
        }
      }
      if (plugin.skillsPaths) {
        logForDebugging(
          `Attempting to load skills from plugin ${plugin.name} skillsPaths: ${plugin.skillsPaths.join(", ")}`
        );
        const pathResults = await Promise.all(
          plugin.skillsPaths.map(async (skillPath) => {
            try {
              logForDebugging(
                `Loading from skillPath: ${skillPath} for plugin ${plugin.name}`
              );
              const skills = await loadSkillsFromDirectory(
                skillPath,
                plugin.name,
                plugin.source,
                plugin.manifest,
                plugin.path,
                loadedPaths
              );
              logForDebugging(
                `Loaded ${skills.length} skills from plugin ${plugin.name} custom path: ${skillPath}`
              );
              return skills;
            } catch (error) {
              logForDebugging(
                `Failed to load skills from plugin ${plugin.name} custom path ${skillPath}: ${error}`,
                { level: "error" }
              );
              return [];
            }
          })
        );
        for (const skills of pathResults) {
          pluginSkills.push(...skills);
        }
      }
      return pluginSkills;
    })
  );
  const allSkills = perPluginSkills.flat();
  logForDebugging(`Total plugin skills loaded: ${allSkills.length}`);
  return allSkills;
});
function clearPluginSkillsCache() {
  getPluginSkills.cache?.clear?.();
}
export {
  clearPluginCommandCache,
  clearPluginSkillsCache,
  getPluginCommands,
  getPluginSkills
};
