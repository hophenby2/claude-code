const feature = (_name) => false;
import memoize from "lodash-es/memoize.js";
import { basename } from "path";
import { z } from "zod/v4";
import { isAutoMemoryEnabled } from "../../memdir/paths.js";
import {
  logEvent
} from "../../services/analytics/index.js";
import {
  McpServerConfigSchema
} from "../../services/mcp/types.js";
import { logForDebugging } from "../../utils/debug.js";
import {
  EFFORT_LEVELS,
  parseEffortValue
} from "../../utils/effort.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { parsePositiveIntFromFrontmatter } from "../../utils/frontmatterParser.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { logError } from "../../utils/log.js";
import {
  loadMarkdownFilesForSubdir,
  parseAgentToolsFromFrontmatter,
  parseSlashCommandToolsFromFrontmatter
} from "../../utils/markdownConfigLoader.js";
import {
  PERMISSION_MODES
} from "../../utils/permissions/PermissionMode.js";
import {
  clearPluginAgentCache,
  loadPluginAgents
} from "../../utils/plugins/loadPluginAgents.js";
import { HooksSchema } from "../../utils/settings/types.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { FILE_EDIT_TOOL_NAME } from "../FileEditTool/constants.js";
import { FILE_READ_TOOL_NAME } from "../FileReadTool/prompt.js";
import { FILE_WRITE_TOOL_NAME } from "../FileWriteTool/prompt.js";
import {
  AGENT_COLORS,
  setAgentColor
} from "./agentColorManager.js";
import { loadAgentMemoryPrompt } from "./agentMemory.js";
import {
  checkAgentMemorySnapshot,
  initializeFromSnapshot
} from "./agentMemorySnapshot.js";
import { getBuiltInAgents } from "./builtInAgents.js";
const AgentMcpServerSpecSchema = lazySchema(
  () => z.union([
    z.string(),
    // Reference by name
    z.record(z.string(), McpServerConfigSchema())
    // Inline as { name: config }
  ])
);
const AgentJsonSchema = lazySchema(
  () => z.object({
    description: z.string().min(1, "Description cannot be empty"),
    tools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    prompt: z.string().min(1, "Prompt cannot be empty"),
    model: z.string().trim().min(1, "Model cannot be empty").transform((m) => m.toLowerCase() === "inherit" ? "inherit" : m).optional(),
    effort: z.union([z.enum(EFFORT_LEVELS), z.number().int()]).optional(),
    permissionMode: z.enum(PERMISSION_MODES).optional(),
    mcpServers: z.array(AgentMcpServerSpecSchema()).optional(),
    hooks: HooksSchema().optional(),
    maxTurns: z.number().int().positive().optional(),
    skills: z.array(z.string()).optional(),
    initialPrompt: z.string().optional(),
    memory: z.enum(["user", "project", "local"]).optional(),
    background: z.boolean().optional(),
    isolation: (process.env.USER_TYPE === "ant" ? z.enum(["worktree", "remote"]) : z.enum(["worktree"])).optional()
  })
);
const AgentsJsonSchema = lazySchema(
  () => z.record(z.string(), AgentJsonSchema())
);
function isBuiltInAgent(agent) {
  return agent.source === "built-in";
}
function isCustomAgent(agent) {
  return agent.source !== "built-in" && agent.source !== "plugin";
}
function isPluginAgent(agent) {
  return agent.source === "plugin";
}
function getActiveAgentsFromList(allAgents) {
  const builtInAgents = allAgents.filter((a) => a.source === "built-in");
  const pluginAgents = allAgents.filter((a) => a.source === "plugin");
  const userAgents = allAgents.filter((a) => a.source === "userSettings");
  const projectAgents = allAgents.filter((a) => a.source === "projectSettings");
  const managedAgents = allAgents.filter((a) => a.source === "policySettings");
  const flagAgents = allAgents.filter((a) => a.source === "flagSettings");
  const agentGroups = [
    builtInAgents,
    pluginAgents,
    userAgents,
    projectAgents,
    flagAgents,
    managedAgents
  ];
  const agentMap = /* @__PURE__ */ new Map();
  for (const agents of agentGroups) {
    for (const agent of agents) {
      agentMap.set(agent.agentType, agent);
    }
  }
  return Array.from(agentMap.values());
}
function hasRequiredMcpServers(agent, availableServers) {
  if (!agent.requiredMcpServers || agent.requiredMcpServers.length === 0) {
    return true;
  }
  return agent.requiredMcpServers.every(
    (pattern) => availableServers.some(
      (server) => server.toLowerCase().includes(pattern.toLowerCase())
    )
  );
}
function filterAgentsByMcpRequirements(agents, availableServers) {
  return agents.filter((agent) => hasRequiredMcpServers(agent, availableServers));
}
async function initializeAgentMemorySnapshots(agents) {
  await Promise.all(
    agents.map(async (agent) => {
      if (agent.memory !== "user") return;
      const result = await checkAgentMemorySnapshot(
        agent.agentType,
        agent.memory
      );
      switch (result.action) {
        case "initialize":
          logForDebugging(
            `Initializing ${agent.agentType} memory from project snapshot`
          );
          await initializeFromSnapshot(
            agent.agentType,
            agent.memory,
            result.snapshotTimestamp
          );
          break;
        case "prompt-update":
          agent.pendingSnapshotUpdate = {
            snapshotTimestamp: result.snapshotTimestamp
          };
          logForDebugging(
            `Newer snapshot available for ${agent.agentType} memory (snapshot: ${result.snapshotTimestamp})`
          );
          break;
      }
    })
  );
}
const getAgentDefinitionsWithOverrides = memoize(
  async (cwd) => {
    if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
      const builtInAgents = getBuiltInAgents();
      return {
        activeAgents: builtInAgents,
        allAgents: builtInAgents
      };
    }
    try {
      const markdownFiles = await loadMarkdownFilesForSubdir("agents", cwd);
      const failedFiles = [];
      const customAgents = markdownFiles.map(({ filePath, baseDir, frontmatter, content, source }) => {
        const agent = parseAgentFromMarkdown(
          filePath,
          baseDir,
          frontmatter,
          content,
          source
        );
        if (!agent) {
          if (!frontmatter["name"]) {
            return null;
          }
          const errorMsg = getParseError(frontmatter);
          failedFiles.push({ path: filePath, error: errorMsg });
          logForDebugging(
            `Failed to parse agent from ${filePath}: ${errorMsg}`
          );
          logEvent("tengu_agent_parse_error", {
            error: errorMsg,
            location: source
          });
          return null;
        }
        return agent;
      }).filter((agent) => agent !== null);
      let pluginAgentsPromise = loadPluginAgents();
      if (false) {
        const [pluginAgents_] = await Promise.all([
          pluginAgentsPromise,
          initializeAgentMemorySnapshots(customAgents)
        ]);
        pluginAgentsPromise = Promise.resolve(pluginAgents_);
      }
      const pluginAgents = await pluginAgentsPromise;
      const builtInAgents = getBuiltInAgents();
      const allAgentsList = [
        ...builtInAgents,
        ...pluginAgents,
        ...customAgents
      ];
      const activeAgents = getActiveAgentsFromList(allAgentsList);
      for (const agent of activeAgents) {
        if (agent.color) {
          setAgentColor(agent.agentType, agent.color);
        }
      }
      return {
        activeAgents,
        allAgents: allAgentsList,
        failedFiles: failedFiles.length > 0 ? failedFiles : void 0
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logForDebugging(`Error loading agent definitions: ${errorMessage}`);
      logError(error);
      const builtInAgents = getBuiltInAgents();
      return {
        activeAgents: builtInAgents,
        allAgents: builtInAgents,
        failedFiles: [{ path: "unknown", error: errorMessage }]
      };
    }
  }
);
function clearAgentDefinitionsCache() {
  getAgentDefinitionsWithOverrides.cache.clear?.();
  clearPluginAgentCache();
}
function getParseError(frontmatter) {
  const agentType = frontmatter["name"];
  const description = frontmatter["description"];
  if (!agentType || typeof agentType !== "string") {
    return 'Missing required "name" field in frontmatter';
  }
  if (!description || typeof description !== "string") {
    return 'Missing required "description" field in frontmatter';
  }
  return "Unknown parsing error";
}
function parseHooksFromFrontmatter(frontmatter, agentType) {
  if (!frontmatter.hooks) {
    return void 0;
  }
  const result = HooksSchema().safeParse(frontmatter.hooks);
  if (!result.success) {
    logForDebugging(
      `Invalid hooks in agent '${agentType}': ${result.error.message}`
    );
    return void 0;
  }
  return result.data;
}
function parseAgentFromJson(name, definition, source = "flagSettings") {
  try {
    const parsed = AgentJsonSchema().parse(definition);
    let tools = parseAgentToolsFromFrontmatter(parsed.tools);
    if (isAutoMemoryEnabled() && parsed.memory && tools !== void 0) {
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
    const disallowedTools = parsed.disallowedTools !== void 0 ? parseAgentToolsFromFrontmatter(parsed.disallowedTools) : void 0;
    const systemPrompt = parsed.prompt;
    const agent = {
      agentType: name,
      whenToUse: parsed.description,
      ...tools !== void 0 ? { tools } : {},
      ...disallowedTools !== void 0 ? { disallowedTools } : {},
      getSystemPrompt: () => {
        if (isAutoMemoryEnabled() && parsed.memory) {
          return systemPrompt + "\n\n" + loadAgentMemoryPrompt(name, parsed.memory);
        }
        return systemPrompt;
      },
      source,
      ...parsed.model ? { model: parsed.model } : {},
      ...parsed.effort !== void 0 ? { effort: parsed.effort } : {},
      ...parsed.permissionMode ? { permissionMode: parsed.permissionMode } : {},
      ...parsed.mcpServers && parsed.mcpServers.length > 0 ? { mcpServers: parsed.mcpServers } : {},
      ...parsed.hooks ? { hooks: parsed.hooks } : {},
      ...parsed.maxTurns !== void 0 ? { maxTurns: parsed.maxTurns } : {},
      ...parsed.skills && parsed.skills.length > 0 ? { skills: parsed.skills } : {},
      ...parsed.initialPrompt ? { initialPrompt: parsed.initialPrompt } : {},
      ...parsed.background ? { background: parsed.background } : {},
      ...parsed.memory ? { memory: parsed.memory } : {},
      ...parsed.isolation ? { isolation: parsed.isolation } : {}
    };
    return agent;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logForDebugging(`Error parsing agent '${name}' from JSON: ${errorMessage}`);
    logError(error);
    return null;
  }
}
function parseAgentsFromJson(agentsJson, source = "flagSettings") {
  try {
    const parsed = AgentsJsonSchema().parse(agentsJson);
    return Object.entries(parsed).map(([name, def]) => parseAgentFromJson(name, def, source)).filter((agent) => agent !== null);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logForDebugging(`Error parsing agents from JSON: ${errorMessage}`);
    logError(error);
    return [];
  }
}
function parseAgentFromMarkdown(filePath, baseDir, frontmatter, content, source) {
  try {
    const agentType = frontmatter["name"];
    let whenToUse = frontmatter["description"];
    if (!agentType || typeof agentType !== "string") {
      return null;
    }
    if (!whenToUse || typeof whenToUse !== "string") {
      logForDebugging(
        `Agent file ${filePath} is missing required 'description' in frontmatter`
      );
      return null;
    }
    whenToUse = whenToUse.replace(/\\n/g, "\n");
    const color = frontmatter["color"];
    const modelRaw = frontmatter["model"];
    let model;
    if (typeof modelRaw === "string" && modelRaw.trim().length > 0) {
      const trimmed = modelRaw.trim();
      model = trimmed.toLowerCase() === "inherit" ? "inherit" : trimmed;
    }
    const backgroundRaw = frontmatter["background"];
    if (backgroundRaw !== void 0 && backgroundRaw !== "true" && backgroundRaw !== "false" && backgroundRaw !== true && backgroundRaw !== false) {
      logForDebugging(
        `Agent file ${filePath} has invalid background value '${backgroundRaw}'. Must be 'true', 'false', or omitted.`
      );
    }
    const background = backgroundRaw === "true" || backgroundRaw === true ? true : void 0;
    const VALID_MEMORY_SCOPES = ["user", "project", "local"];
    const memoryRaw = frontmatter["memory"];
    let memory;
    if (memoryRaw !== void 0) {
      if (VALID_MEMORY_SCOPES.includes(memoryRaw)) {
        memory = memoryRaw;
      } else {
        logForDebugging(
          `Agent file ${filePath} has invalid memory value '${memoryRaw}'. Valid options: ${VALID_MEMORY_SCOPES.join(", ")}`
        );
      }
    }
    const VALID_ISOLATION_MODES = process.env.USER_TYPE === "ant" ? ["worktree", "remote"] : ["worktree"];
    const isolationRaw = frontmatter["isolation"];
    let isolation;
    if (isolationRaw !== void 0) {
      if (VALID_ISOLATION_MODES.includes(isolationRaw)) {
        isolation = isolationRaw;
      } else {
        logForDebugging(
          `Agent file ${filePath} has invalid isolation value '${isolationRaw}'. Valid options: ${VALID_ISOLATION_MODES.join(", ")}`
        );
      }
    }
    const effortRaw = frontmatter["effort"];
    const parsedEffort = effortRaw !== void 0 ? parseEffortValue(effortRaw) : void 0;
    if (effortRaw !== void 0 && parsedEffort === void 0) {
      logForDebugging(
        `Agent file ${filePath} has invalid effort '${effortRaw}'. Valid options: ${EFFORT_LEVELS.join(", ")} or an integer`
      );
    }
    const permissionModeRaw = frontmatter["permissionMode"];
    const isValidPermissionMode = permissionModeRaw && PERMISSION_MODES.includes(permissionModeRaw);
    if (permissionModeRaw && !isValidPermissionMode) {
      const errorMsg = `Agent file ${filePath} has invalid permissionMode '${permissionModeRaw}'. Valid options: ${PERMISSION_MODES.join(", ")}`;
      logForDebugging(errorMsg);
    }
    const maxTurnsRaw = frontmatter["maxTurns"];
    const maxTurns = parsePositiveIntFromFrontmatter(maxTurnsRaw);
    if (maxTurnsRaw !== void 0 && maxTurns === void 0) {
      logForDebugging(
        `Agent file ${filePath} has invalid maxTurns '${maxTurnsRaw}'. Must be a positive integer.`
      );
    }
    const filename = basename(filePath, ".md");
    let tools = parseAgentToolsFromFrontmatter(frontmatter["tools"]);
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
    const disallowedToolsRaw = frontmatter["disallowedTools"];
    const disallowedTools = disallowedToolsRaw !== void 0 ? parseAgentToolsFromFrontmatter(disallowedToolsRaw) : void 0;
    const skills = parseSlashCommandToolsFromFrontmatter(frontmatter["skills"]);
    const initialPromptRaw = frontmatter["initialPrompt"];
    const initialPrompt = typeof initialPromptRaw === "string" && initialPromptRaw.trim() ? initialPromptRaw : void 0;
    const mcpServersRaw = frontmatter["mcpServers"];
    let mcpServers;
    if (Array.isArray(mcpServersRaw)) {
      mcpServers = mcpServersRaw.map((item) => {
        const result = AgentMcpServerSpecSchema().safeParse(item);
        if (result.success) {
          return result.data;
        }
        logForDebugging(
          `Agent file ${filePath} has invalid mcpServers item: ${jsonStringify(item)}. Error: ${result.error.message}`
        );
        return null;
      }).filter((item) => item !== null);
    }
    const hooks = parseHooksFromFrontmatter(frontmatter, agentType);
    const systemPrompt = content.trim();
    const agentDef = {
      baseDir,
      agentType,
      whenToUse,
      ...tools !== void 0 ? { tools } : {},
      ...disallowedTools !== void 0 ? { disallowedTools } : {},
      ...skills !== void 0 ? { skills } : {},
      ...initialPrompt !== void 0 ? { initialPrompt } : {},
      ...mcpServers !== void 0 && mcpServers.length > 0 ? { mcpServers } : {},
      ...hooks !== void 0 ? { hooks } : {},
      getSystemPrompt: () => {
        if (isAutoMemoryEnabled() && memory) {
          const memoryPrompt = loadAgentMemoryPrompt(agentType, memory);
          return systemPrompt + "\n\n" + memoryPrompt;
        }
        return systemPrompt;
      },
      source,
      filename,
      ...color && typeof color === "string" && AGENT_COLORS.includes(color) ? { color } : {},
      ...model !== void 0 ? { model } : {},
      ...parsedEffort !== void 0 ? { effort: parsedEffort } : {},
      ...isValidPermissionMode ? { permissionMode: permissionModeRaw } : {},
      ...maxTurns !== void 0 ? { maxTurns } : {},
      ...background ? { background } : {},
      ...memory ? { memory } : {},
      ...isolation ? { isolation } : {}
    };
    return agentDef;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logForDebugging(`Error parsing agent from ${filePath}: ${errorMessage}`);
    logError(error);
    return null;
  }
}
export {
  clearAgentDefinitionsCache,
  filterAgentsByMcpRequirements,
  getActiveAgentsFromList,
  getAgentDefinitionsWithOverrides,
  hasRequiredMcpServers,
  isBuiltInAgent,
  isCustomAgent,
  isPluginAgent,
  parseAgentFromJson,
  parseAgentFromMarkdown,
  parseAgentsFromJson
};
