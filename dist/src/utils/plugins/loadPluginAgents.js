import memoize from "lodash-es/memoize.js";
import { basename } from "path";
import { isAutoMemoryEnabled } from "../../memdir/paths.js";
import {
  loadAgentMemoryPrompt
} from "../../tools/AgentTool/agentMemory.js";
import { FILE_EDIT_TOOL_NAME } from "../../tools/FileEditTool/constants.js";
import { FILE_READ_TOOL_NAME } from "../../tools/FileReadTool/prompt.js";
import { FILE_WRITE_TOOL_NAME } from "../../tools/FileWriteTool/prompt.js";
import { getPluginErrorMessage } from "../../types/plugin.js";
import { logForDebugging } from "../debug.js";
import { EFFORT_LEVELS, parseEffortValue } from "../effort.js";
import {
  coerceDescriptionToString,
  parseFrontmatter,
  parsePositiveIntFromFrontmatter
} from "../frontmatterParser.js";
import { getFsImplementation, isDuplicatePath } from "../fsOperations.js";
import {
  parseAgentToolsFromFrontmatter,
  parseSlashCommandToolsFromFrontmatter
} from "../markdownConfigLoader.js";
import { loadAllPluginsCacheOnly } from "./pluginLoader.js";
import {
  loadPluginOptions,
  substitutePluginVariables,
  substituteUserConfigInContent
} from "./pluginOptionsStorage.js";
import { walkPluginMarkdown } from "./walkPluginMarkdown.js";
const VALID_MEMORY_SCOPES = ["user", "project", "local"];
async function loadAgentsFromDirectory(agentsPath, pluginName, sourceName, pluginPath, pluginManifest, loadedPaths) {
  const agents = [];
  await walkPluginMarkdown(
    agentsPath,
    async (fullPath, namespace) => {
      const agent = await loadAgentFromFile(
        fullPath,
        pluginName,
        namespace,
        sourceName,
        pluginPath,
        pluginManifest,
        loadedPaths
      );
      if (agent) agents.push(agent);
    },
    { logLabel: "agents" }
  );
  return agents;
}
async function loadAgentFromFile(filePath, pluginName, namespace, sourceName, pluginPath, pluginManifest, loadedPaths) {
  const fs = getFsImplementation();
  if (isDuplicatePath(fs, filePath, loadedPaths)) {
    return null;
  }
  try {
    const content = await fs.readFile(filePath, { encoding: "utf-8" });
    const { frontmatter, content: markdownContent } = parseFrontmatter(
      content,
      filePath
    );
    const baseAgentName = frontmatter.name || basename(filePath).replace(/\.md$/, "");
    const nameParts = [pluginName, ...namespace, baseAgentName];
    const agentType = nameParts.join(":");
    const whenToUse = coerceDescriptionToString(frontmatter.description, agentType) ?? coerceDescriptionToString(frontmatter["when-to-use"], agentType) ?? `Agent from ${pluginName} plugin`;
    let tools = parseAgentToolsFromFrontmatter(frontmatter.tools);
    const skills = parseSlashCommandToolsFromFrontmatter(frontmatter.skills);
    const color = frontmatter.color;
    const modelRaw = frontmatter.model;
    let model;
    if (typeof modelRaw === "string" && modelRaw.trim().length > 0) {
      const trimmed = modelRaw.trim();
      model = trimmed.toLowerCase() === "inherit" ? "inherit" : trimmed;
    }
    const backgroundRaw = frontmatter.background;
    const background = backgroundRaw === "true" || backgroundRaw === true ? true : void 0;
    let systemPrompt = substitutePluginVariables(markdownContent.trim(), {
      path: pluginPath,
      source: sourceName
    });
    if (pluginManifest.userConfig) {
      systemPrompt = substituteUserConfigInContent(
        systemPrompt,
        loadPluginOptions(sourceName),
        pluginManifest.userConfig
      );
    }
    const memoryRaw = frontmatter.memory;
    let memory;
    if (memoryRaw !== void 0) {
      if (VALID_MEMORY_SCOPES.includes(memoryRaw)) {
        memory = memoryRaw;
      } else {
        logForDebugging(
          `Plugin agent file ${filePath} has invalid memory value '${memoryRaw}'. Valid options: ${VALID_MEMORY_SCOPES.join(", ")}`
        );
      }
    }
    const isolationRaw = frontmatter.isolation;
    const isolation = isolationRaw === "worktree" ? "worktree" : void 0;
    const effortRaw = frontmatter.effort;
    const effort = effortRaw !== void 0 ? parseEffortValue(effortRaw) : void 0;
    if (effortRaw !== void 0 && effort === void 0) {
      logForDebugging(
        `Plugin agent file ${filePath} has invalid effort '${effortRaw}'. Valid options: ${EFFORT_LEVELS.join(", ")} or an integer`
      );
    }
    for (const field of ["permissionMode", "hooks", "mcpServers"]) {
      if (frontmatter[field] !== void 0) {
        logForDebugging(
          `Plugin agent file ${filePath} sets ${field}, which is ignored for plugin agents. Use .claude/agents/ for this level of control.`,
          { level: "warn" }
        );
      }
    }
    const maxTurnsRaw = frontmatter.maxTurns;
    const maxTurns = parsePositiveIntFromFrontmatter(maxTurnsRaw);
    if (maxTurnsRaw !== void 0 && maxTurns === void 0) {
      logForDebugging(
        `Plugin agent file ${filePath} has invalid maxTurns '${maxTurnsRaw}'. Must be a positive integer.`
      );
    }
    const disallowedTools = frontmatter.disallowedTools !== void 0 ? parseAgentToolsFromFrontmatter(frontmatter.disallowedTools) : void 0;
    if (isAutoMemoryEnabled() && memory && tools !== void 0) {
      const toolSet = new Set(tools);
      for (const tool of [
        FILE_WRITE_TOOL_NAME,
        FILE_EDIT_TOOL_NAME,
        FILE_READ_TOOL_NAME
      ]) {
        if (!toolSet.has(tool)) {
          tools = [...tools, tool];
        }
      }
    }
    return {
      agentType,
      whenToUse,
      tools,
      ...disallowedTools !== void 0 ? { disallowedTools } : {},
      ...skills !== void 0 ? { skills } : {},
      getSystemPrompt: () => {
        if (isAutoMemoryEnabled() && memory) {
          const memoryPrompt = loadAgentMemoryPrompt(agentType, memory);
          return systemPrompt + "\n\n" + memoryPrompt;
        }
        return systemPrompt;
      },
      source: "plugin",
      color,
      model,
      filename: baseAgentName,
      plugin: sourceName,
      ...background ? { background } : {},
      ...memory ? { memory } : {},
      ...isolation ? { isolation } : {},
      ...effort !== void 0 ? { effort } : {},
      ...maxTurns !== void 0 ? { maxTurns } : {}
    };
  } catch (error) {
    logForDebugging(`Failed to load agent from ${filePath}: ${error}`, {
      level: "error"
    });
    return null;
  }
}
const loadPluginAgents = memoize(
  async () => {
    const { enabled, errors } = await loadAllPluginsCacheOnly();
    if (errors.length > 0) {
      logForDebugging(
        `Plugin loading errors: ${errors.map((e) => getPluginErrorMessage(e)).join(", ")}`
      );
    }
    const perPluginAgents = await Promise.all(
      enabled.map(async (plugin) => {
        const loadedPaths = /* @__PURE__ */ new Set();
        const pluginAgents = [];
        if (plugin.agentsPath) {
          try {
            const agents = await loadAgentsFromDirectory(
              plugin.agentsPath,
              plugin.name,
              plugin.source,
              plugin.path,
              plugin.manifest,
              loadedPaths
            );
            pluginAgents.push(...agents);
            if (agents.length > 0) {
              logForDebugging(
                `Loaded ${agents.length} agents from plugin ${plugin.name} default directory`
              );
            }
          } catch (error) {
            logForDebugging(
              `Failed to load agents from plugin ${plugin.name} default directory: ${error}`,
              { level: "error" }
            );
          }
        }
        if (plugin.agentsPaths) {
          const pathResults = await Promise.all(
            plugin.agentsPaths.map(
              async (agentPath) => {
                try {
                  const fs = getFsImplementation();
                  const stats = await fs.stat(agentPath);
                  if (stats.isDirectory()) {
                    const agents = await loadAgentsFromDirectory(
                      agentPath,
                      plugin.name,
                      plugin.source,
                      plugin.path,
                      plugin.manifest,
                      loadedPaths
                    );
                    if (agents.length > 0) {
                      logForDebugging(
                        `Loaded ${agents.length} agents from plugin ${plugin.name} custom path: ${agentPath}`
                      );
                    }
                    return agents;
                  } else if (stats.isFile() && agentPath.endsWith(".md")) {
                    const agent = await loadAgentFromFile(
                      agentPath,
                      plugin.name,
                      [],
                      plugin.source,
                      plugin.path,
                      plugin.manifest,
                      loadedPaths
                    );
                    if (agent) {
                      logForDebugging(
                        `Loaded agent from plugin ${plugin.name} custom file: ${agentPath}`
                      );
                      return [agent];
                    }
                  }
                  return [];
                } catch (error) {
                  logForDebugging(
                    `Failed to load agents from plugin ${plugin.name} custom path ${agentPath}: ${error}`,
                    { level: "error" }
                  );
                  return [];
                }
              }
            )
          );
          for (const agents of pathResults) {
            pluginAgents.push(...agents);
          }
        }
        return pluginAgents;
      })
    );
    const allAgents = perPluginAgents.flat();
    logForDebugging(`Total plugin agents loaded: ${allAgents.length}`);
    return allAgents;
  }
);
function clearPluginAgentCache() {
  loadPluginAgents.cache?.clear?.();
}
export {
  clearPluginAgentCache,
  loadPluginAgents
};
