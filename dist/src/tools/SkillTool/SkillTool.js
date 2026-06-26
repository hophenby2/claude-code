const feature = (_name) => false;
import uniqBy from "lodash-es/uniqBy.js";
import { dirname } from "path";
import { getProjectRoot } from "../../bootstrap/state.js";
import {
  builtInCommandNames,
  findCommand,
  getCommands
} from "../../commands.js";
import { buildTool } from "../../Tool.js";
import { logForDebugging } from "../../utils/debug.js";
import { getRuleByContentsForTool } from "../../utils/permissions/permissions.js";
import {
  isOfficialMarketplaceName,
  parsePluginIdentifier
} from "../../utils/plugins/pluginIdentifier.js";
import { buildPluginCommandTelemetryFields } from "../../utils/telemetry/pluginTelemetry.js";
import { z } from "zod/v4";
import {
  addInvokedSkill,
  clearInvokedSkillsForAgent,
  getSessionId
} from "../../bootstrap/state.js";
import { COMMAND_MESSAGE_TAG } from "../../constants/xml.js";
import {
  logEvent
} from "../../services/analytics/index.js";
import { getAgentContext } from "../../utils/agentContext.js";
import { errorMessage } from "../../utils/errors.js";
import {
  extractResultText,
  prepareForkedCommandContext
} from "../../utils/forkedAgent.js";
import { parseFrontmatter } from "../../utils/frontmatterParser.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { createUserMessage, normalizeMessages } from "../../utils/messages.js";
import { resolveSkillModelOverride } from "../../utils/model/model.js";
import { recordSkillUsage } from "../../utils/suggestions/skillUsageTracking.js";
import { createAgentId } from "../../utils/uuid.js";
import { runAgent } from "../AgentTool/runAgent.js";
import {
  getToolUseIDFromParentMessage,
  tagMessagesWithToolUseID
} from "../utils.js";
import { SKILL_TOOL_NAME } from "./constants.js";
import { getPrompt } from "./prompt.js";
import {
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseRejectedMessage
} from "./UI.js";
async function getAllCommands(context) {
  const mcpSkills = context.getAppState().mcp.commands.filter(
    (cmd) => cmd.type === "prompt" && cmd.loadedFrom === "mcp"
  );
  if (mcpSkills.length === 0) return getCommands(getProjectRoot());
  const localCommands = await getCommands(getProjectRoot());
  return uniqBy([...localCommands, ...mcpSkills], "name");
}
const remoteSkillModules = false ? {
  ...null,
  ...null,
  ...null,
  ...null
} : null;
async function executeForkedSkill(command, commandName, args, context, canUseTool, parentMessage, onProgress) {
  const startTime = Date.now();
  const agentId = createAgentId();
  const isBuiltIn = builtInCommandNames().has(commandName);
  const isOfficialSkill = isOfficialMarketplaceSkill(command);
  const isBundled = command.source === "bundled";
  const forkedSanitizedName = isBuiltIn || isBundled || isOfficialSkill ? commandName : "custom";
  const wasDiscoveredField = false ? {
    was_discovered: context.discoveredSkillNames?.has(commandName) ?? false
  } : {};
  const pluginMarketplace = command.pluginInfo ? parsePluginIdentifier(command.pluginInfo.repository).marketplace : void 0;
  const queryDepth = context.queryTracking?.depth ?? 0;
  const parentAgentId = getAgentContext()?.agentId;
  logEvent("tengu_skill_tool_invocation", {
    command_name: forkedSanitizedName,
    // _PROTO_skill_name routes to the privileged skill_name BQ column
    // (unredacted, all users); command_name stays in additional_metadata as
    // the redacted variant for general-access dashboards.
    _PROTO_skill_name: commandName,
    execution_context: "fork",
    invocation_trigger: queryDepth > 0 ? "nested-skill" : "claude-proactive",
    query_depth: queryDepth,
    ...parentAgentId && {
      parent_agent_id: parentAgentId
    },
    ...wasDiscoveredField,
    ...process.env.USER_TYPE === "ant" && {
      skill_name: commandName,
      skill_source: command.source,
      ...command.loadedFrom && {
        skill_loaded_from: command.loadedFrom
      },
      ...command.kind && {
        skill_kind: command.kind
      }
    },
    ...command.pluginInfo && {
      // _PROTO_* routes to PII-tagged plugin_name/marketplace_name BQ columns
      // (unredacted, all users); plugin_name/plugin_repository stay in
      // additional_metadata as redacted variants.
      _PROTO_plugin_name: command.pluginInfo.pluginManifest.name,
      ...pluginMarketplace && {
        _PROTO_marketplace_name: pluginMarketplace
      },
      plugin_name: isOfficialSkill ? command.pluginInfo.pluginManifest.name : "third-party",
      plugin_repository: isOfficialSkill ? command.pluginInfo.repository : "third-party",
      ...buildPluginCommandTelemetryFields(command.pluginInfo)
    }
  });
  const { modifiedGetAppState, baseAgent, promptMessages, skillContent } = await prepareForkedCommandContext(command, args || "", context);
  const agentDefinition = command.effort !== void 0 ? { ...baseAgent, effort: command.effort } : baseAgent;
  const agentMessages = [];
  logForDebugging(
    `SkillTool executing forked skill ${commandName} with agent ${agentDefinition.agentType}`
  );
  try {
    for await (const message of runAgent({
      agentDefinition,
      promptMessages,
      toolUseContext: {
        ...context,
        getAppState: modifiedGetAppState
      },
      canUseTool,
      isAsync: false,
      querySource: "agent:custom",
      model: command.model,
      availableTools: context.options.tools,
      override: { agentId }
    })) {
      agentMessages.push(message);
      if ((message.type === "assistant" || message.type === "user") && onProgress) {
        const normalizedNew = normalizeMessages([message]);
        for (const m of normalizedNew) {
          const hasToolContent = m.message.content.some(
            (c) => c.type === "tool_use" || c.type === "tool_result"
          );
          if (hasToolContent) {
            onProgress({
              toolUseID: `skill_${parentMessage.message.id}`,
              data: {
                message: m,
                type: "skill_progress",
                prompt: skillContent,
                agentId
              }
            });
          }
        }
      }
    }
    const resultText = extractResultText(
      agentMessages,
      "Skill execution completed"
    );
    agentMessages.length = 0;
    const durationMs = Date.now() - startTime;
    logForDebugging(
      `SkillTool forked skill ${commandName} completed in ${durationMs}ms`
    );
    return {
      data: {
        success: true,
        commandName,
        status: "forked",
        agentId,
        result: resultText
      }
    };
  } finally {
    clearInvokedSkillsForAgent(agentId);
  }
}
const inputSchema = lazySchema(
  () => z.object({
    skill: z.string().describe('The skill name. E.g., "commit", "review-pr", or "pdf"'),
    args: z.string().optional().describe("Optional arguments for the skill")
  })
);
const outputSchema = lazySchema(() => {
  const inlineOutputSchema = z.object({
    success: z.boolean().describe("Whether the skill is valid"),
    commandName: z.string().describe("The name of the skill"),
    allowedTools: z.array(z.string()).optional().describe("Tools allowed by this skill"),
    model: z.string().optional().describe("Model override if specified"),
    status: z.literal("inline").optional().describe("Execution status")
  });
  const forkedOutputSchema = z.object({
    success: z.boolean().describe("Whether the skill completed successfully"),
    commandName: z.string().describe("The name of the skill"),
    status: z.literal("forked").describe("Execution status"),
    agentId: z.string().describe("The ID of the sub-agent that executed the skill"),
    result: z.string().describe("The result from the forked skill execution")
  });
  return z.union([inlineOutputSchema, forkedOutputSchema]);
});
const SkillTool = buildTool({
  name: SKILL_TOOL_NAME,
  searchHint: "invoke a slash-command skill",
  maxResultSizeChars: 1e5,
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  description: async ({ skill }) => `Execute skill: ${skill}`,
  prompt: async () => getPrompt(getProjectRoot()),
  // Only one skill/command should run at a time, since the tool expands the
  // command into a full prompt that Claude must process before continuing.
  // Skill-coach needs the skill name to avoid false-positive "you could have
  // used skill X" suggestions when X was actually invoked. Backseat classifies
  // downstream tool calls from the expanded prompt, not this wrapper, so the
  // name alone is sufficient — it just records that the skill fired.
  toAutoClassifierInput: ({ skill }) => skill ?? "",
  async validateInput({ skill }, context) {
    const trimmed = skill.trim();
    if (!trimmed) {
      return {
        result: false,
        message: `Invalid skill format: ${skill}`,
        errorCode: 1
      };
    }
    const hasLeadingSlash = trimmed.startsWith("/");
    if (hasLeadingSlash) {
      logEvent("tengu_skill_tool_slash_prefix", {});
    }
    const normalizedCommandName = hasLeadingSlash ? trimmed.substring(1) : trimmed;
    if (false) {
      const slug = remoteSkillModules.stripCanonicalPrefix(
        normalizedCommandName
      );
      if (slug !== null) {
        const meta = remoteSkillModules.getDiscoveredRemoteSkill(slug);
        if (!meta) {
          return {
            result: false,
            message: `Remote skill ${slug} was not discovered in this session. Use DiscoverSkills to find remote skills first.`,
            errorCode: 6
          };
        }
        return { result: true };
      }
    }
    const commands = await getAllCommands(context);
    const foundCommand = findCommand(normalizedCommandName, commands);
    if (!foundCommand) {
      return {
        result: false,
        message: `Unknown skill: ${normalizedCommandName}`,
        errorCode: 2
      };
    }
    if (foundCommand.disableModelInvocation) {
      return {
        result: false,
        message: `Skill ${normalizedCommandName} cannot be used with ${SKILL_TOOL_NAME} tool due to disable-model-invocation`,
        errorCode: 4
      };
    }
    if (foundCommand.type !== "prompt") {
      return {
        result: false,
        message: `Skill ${normalizedCommandName} is not a prompt-based skill`,
        errorCode: 5
      };
    }
    return { result: true };
  },
  async checkPermissions({ skill, args }, context) {
    const trimmed = skill.trim();
    const commandName = trimmed.startsWith("/") ? trimmed.substring(1) : trimmed;
    const appState = context.getAppState();
    const permissionContext = appState.toolPermissionContext;
    const commands = await getAllCommands(context);
    const commandObj = findCommand(commandName, commands);
    const ruleMatches = (ruleContent) => {
      const normalizedRule = ruleContent.startsWith("/") ? ruleContent.substring(1) : ruleContent;
      if (normalizedRule === commandName) {
        return true;
      }
      if (normalizedRule.endsWith(":*")) {
        const prefix = normalizedRule.slice(0, -2);
        return commandName.startsWith(prefix);
      }
      return false;
    };
    const denyRules = getRuleByContentsForTool(
      permissionContext,
      SkillTool,
      "deny"
    );
    for (const [ruleContent, rule] of denyRules.entries()) {
      if (ruleMatches(ruleContent)) {
        return {
          behavior: "deny",
          message: `Skill execution blocked by permission rules`,
          decisionReason: {
            type: "rule",
            rule
          }
        };
      }
    }
    if (false) {
      const slug = remoteSkillModules.stripCanonicalPrefix(commandName);
      if (slug !== null) {
        return {
          behavior: "allow",
          updatedInput: { skill, args },
          decisionReason: void 0
        };
      }
    }
    const allowRules = getRuleByContentsForTool(
      permissionContext,
      SkillTool,
      "allow"
    );
    for (const [ruleContent, rule] of allowRules.entries()) {
      if (ruleMatches(ruleContent)) {
        return {
          behavior: "allow",
          updatedInput: { skill, args },
          decisionReason: {
            type: "rule",
            rule
          }
        };
      }
    }
    if (commandObj?.type === "prompt" && skillHasOnlySafeProperties(commandObj)) {
      return {
        behavior: "allow",
        updatedInput: { skill, args },
        decisionReason: void 0
      };
    }
    const suggestions = [
      // Exact skill suggestion
      {
        type: "addRules",
        rules: [
          {
            toolName: SKILL_TOOL_NAME,
            ruleContent: commandName
          }
        ],
        behavior: "allow",
        destination: "localSettings"
      },
      // Prefix suggestion to allow any args
      {
        type: "addRules",
        rules: [
          {
            toolName: SKILL_TOOL_NAME,
            ruleContent: `${commandName}:*`
          }
        ],
        behavior: "allow",
        destination: "localSettings"
      }
    ];
    return {
      behavior: "ask",
      message: `Execute skill: ${commandName}`,
      decisionReason: void 0,
      suggestions,
      updatedInput: { skill, args },
      metadata: commandObj ? { command: commandObj } : void 0
    };
  },
  async call({ skill, args }, context, canUseTool, parentMessage, onProgress) {
    const trimmed = skill.trim();
    const commandName = trimmed.startsWith("/") ? trimmed.substring(1) : trimmed;
    if (false) {
      const slug = remoteSkillModules.stripCanonicalPrefix(commandName);
      if (slug !== null) {
        return executeRemoteSkill(slug, commandName, parentMessage, context);
      }
    }
    const commands = await getAllCommands(context);
    const command = findCommand(commandName, commands);
    recordSkillUsage(commandName);
    if (command?.type === "prompt" && command.context === "fork") {
      return executeForkedSkill(
        command,
        commandName,
        args,
        context,
        canUseTool,
        parentMessage,
        onProgress
      );
    }
    const { processPromptSlashCommand } = await import("../../utils/processUserInput/processSlashCommand.js");
    const processedCommand = await processPromptSlashCommand(
      commandName,
      args || "",
      // Pass args if provided
      commands,
      context
    );
    if (!processedCommand.shouldQuery) {
      throw new Error("Command processing failed");
    }
    const allowedTools = processedCommand.allowedTools || [];
    const model = processedCommand.model;
    const effort = command?.type === "prompt" ? command.effort : void 0;
    const isBuiltIn = builtInCommandNames().has(commandName);
    const isBundled = command?.type === "prompt" && command.source === "bundled";
    const isOfficialSkill = command?.type === "prompt" && isOfficialMarketplaceSkill(command);
    const sanitizedCommandName = isBuiltIn || isBundled || isOfficialSkill ? commandName : "custom";
    const wasDiscoveredField = false ? {
      was_discovered: context.discoveredSkillNames?.has(commandName) ?? false
    } : {};
    const pluginMarketplace = command?.type === "prompt" && command.pluginInfo ? parsePluginIdentifier(command.pluginInfo.repository).marketplace : void 0;
    const queryDepth = context.queryTracking?.depth ?? 0;
    const parentAgentId = getAgentContext()?.agentId;
    logEvent("tengu_skill_tool_invocation", {
      command_name: sanitizedCommandName,
      // _PROTO_skill_name routes to the privileged skill_name BQ column
      // (unredacted, all users); command_name stays in additional_metadata as
      // the redacted variant for general-access dashboards.
      _PROTO_skill_name: commandName,
      execution_context: "inline",
      invocation_trigger: queryDepth > 0 ? "nested-skill" : "claude-proactive",
      query_depth: queryDepth,
      ...parentAgentId && {
        parent_agent_id: parentAgentId
      },
      ...wasDiscoveredField,
      ...process.env.USER_TYPE === "ant" && {
        skill_name: commandName,
        ...command?.type === "prompt" && {
          skill_source: command.source
        },
        ...command?.loadedFrom && {
          skill_loaded_from: command.loadedFrom
        },
        ...command?.kind && {
          skill_kind: command.kind
        }
      },
      ...command?.type === "prompt" && command.pluginInfo && {
        _PROTO_plugin_name: command.pluginInfo.pluginManifest.name,
        ...pluginMarketplace && {
          _PROTO_marketplace_name: pluginMarketplace
        },
        plugin_name: isOfficialSkill ? command.pluginInfo.pluginManifest.name : "third-party",
        plugin_repository: isOfficialSkill ? command.pluginInfo.repository : "third-party",
        ...buildPluginCommandTelemetryFields(command.pluginInfo)
      }
    });
    const toolUseID = getToolUseIDFromParentMessage(
      parentMessage,
      SKILL_TOOL_NAME
    );
    const newMessages = tagMessagesWithToolUseID(
      processedCommand.messages.filter(
        (m) => {
          if (m.type === "progress") {
            return false;
          }
          if (m.type === "user" && "message" in m) {
            const content = m.message.content;
            if (typeof content === "string" && content.includes(`<${COMMAND_MESSAGE_TAG}>`)) {
              return false;
            }
          }
          return true;
        }
      ),
      toolUseID
    );
    logForDebugging(
      `SkillTool returning ${newMessages.length} newMessages for skill ${commandName}`
    );
    return {
      data: {
        success: true,
        commandName,
        allowedTools: allowedTools.length > 0 ? allowedTools : void 0,
        model
      },
      newMessages,
      contextModifier(ctx) {
        let modifiedContext = ctx;
        if (allowedTools.length > 0) {
          const previousGetAppState = modifiedContext.getAppState;
          modifiedContext = {
            ...modifiedContext,
            getAppState() {
              const appState = previousGetAppState();
              return {
                ...appState,
                toolPermissionContext: {
                  ...appState.toolPermissionContext,
                  alwaysAllowRules: {
                    ...appState.toolPermissionContext.alwaysAllowRules,
                    command: [
                      .../* @__PURE__ */ new Set([
                        ...appState.toolPermissionContext.alwaysAllowRules.command || [],
                        ...allowedTools
                      ])
                    ]
                  }
                }
              };
            }
          };
        }
        if (model) {
          modifiedContext = {
            ...modifiedContext,
            options: {
              ...modifiedContext.options,
              mainLoopModel: resolveSkillModelOverride(
                model,
                ctx.options.mainLoopModel
              )
            }
          };
        }
        if (effort !== void 0) {
          const previousGetAppState = modifiedContext.getAppState;
          modifiedContext = {
            ...modifiedContext,
            getAppState() {
              const appState = previousGetAppState();
              return {
                ...appState,
                effortValue: effort
              };
            }
          };
        }
        return modifiedContext;
      }
    };
  },
  mapToolResultToToolResultBlockParam(result, toolUseID) {
    if ("status" in result && result.status === "forked") {
      return {
        type: "tool_result",
        tool_use_id: toolUseID,
        content: `Skill "${result.commandName}" completed (forked execution).

Result:
${result.result}`
      };
    }
    return {
      type: "tool_result",
      tool_use_id: toolUseID,
      content: `Launching skill: ${result.commandName}`
    };
  },
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseRejectedMessage,
  renderToolUseErrorMessage
});
const SAFE_SKILL_PROPERTIES = /* @__PURE__ */ new Set([
  // PromptCommand properties
  "type",
  "progressMessage",
  "contentLength",
  "argNames",
  "model",
  "effort",
  "source",
  "pluginInfo",
  "disableNonInteractive",
  "skillRoot",
  "context",
  "agent",
  "getPromptForCommand",
  "frontmatterKeys",
  // CommandBase properties
  "name",
  "description",
  "hasUserSpecifiedDescription",
  "isEnabled",
  "isHidden",
  "aliases",
  "isMcp",
  "argumentHint",
  "whenToUse",
  "paths",
  "version",
  "disableModelInvocation",
  "userInvocable",
  "loadedFrom",
  "immediate",
  "userFacingName"
]);
function skillHasOnlySafeProperties(command) {
  for (const key of Object.keys(command)) {
    if (SAFE_SKILL_PROPERTIES.has(key)) {
      continue;
    }
    const value = command[key];
    if (value === void 0 || value === null) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue;
    }
    return false;
  }
  return true;
}
function isOfficialMarketplaceSkill(command) {
  if (command.source !== "plugin" || !command.pluginInfo?.repository) {
    return false;
  }
  return isOfficialMarketplaceName(
    parsePluginIdentifier(command.pluginInfo.repository).marketplace
  );
}
function extractUrlScheme(url) {
  if (url.startsWith("gs://")) return "gs";
  if (url.startsWith("https://")) return "https";
  if (url.startsWith("http://")) return "http";
  if (url.startsWith("s3://")) return "s3";
  return "gs";
}
async function executeRemoteSkill(slug, commandName, parentMessage, context) {
  const { getDiscoveredRemoteSkill, loadRemoteSkill, logRemoteSkillLoaded } = remoteSkillModules;
  const meta = getDiscoveredRemoteSkill(slug);
  if (!meta) {
    throw new Error(
      `Remote skill ${slug} was not discovered in this session. Use DiscoverSkills to find remote skills first.`
    );
  }
  const urlScheme = extractUrlScheme(meta.url);
  let loadResult;
  try {
    loadResult = await loadRemoteSkill(slug, meta.url);
  } catch (e) {
    const msg = errorMessage(e);
    logRemoteSkillLoaded({
      slug,
      cacheHit: false,
      latencyMs: 0,
      urlScheme,
      error: msg
    });
    throw new Error(`Failed to load remote skill ${slug}: ${msg}`);
  }
  const {
    cacheHit,
    latencyMs,
    skillPath,
    content,
    fileCount,
    totalBytes,
    fetchMethod
  } = loadResult;
  logRemoteSkillLoaded({
    slug,
    cacheHit,
    latencyMs,
    urlScheme,
    fileCount,
    totalBytes,
    fetchMethod
  });
  const queryDepth = context.queryTracking?.depth ?? 0;
  const parentAgentId = getAgentContext()?.agentId;
  logEvent("tengu_skill_tool_invocation", {
    command_name: "remote_skill",
    // _PROTO_skill_name routes to the privileged skill_name BQ column
    // (unredacted, all users); command_name stays in additional_metadata as
    // the redacted variant.
    _PROTO_skill_name: commandName,
    execution_context: "remote",
    invocation_trigger: queryDepth > 0 ? "nested-skill" : "claude-proactive",
    query_depth: queryDepth,
    ...parentAgentId && {
      parent_agent_id: parentAgentId
    },
    was_discovered: true,
    is_remote: true,
    remote_cache_hit: cacheHit,
    remote_load_latency_ms: latencyMs,
    ...process.env.USER_TYPE === "ant" && {
      skill_name: commandName,
      remote_slug: slug
    }
  });
  recordSkillUsage(commandName);
  logForDebugging(
    `SkillTool loaded remote skill ${slug} (cacheHit=${cacheHit}, ${latencyMs}ms, ${content.length} chars)`
  );
  const { content: bodyContent } = parseFrontmatter(content, skillPath);
  const skillDir = dirname(skillPath);
  const normalizedDir = process.platform === "win32" ? skillDir.replace(/\\/g, "/") : skillDir;
  let finalContent = `Base directory for this skill: ${normalizedDir}

${bodyContent}`;
  finalContent = finalContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, normalizedDir);
  finalContent = finalContent.replace(
    /\$\{CLAUDE_SESSION_ID\}/g,
    getSessionId()
  );
  addInvokedSkill(
    commandName,
    skillPath,
    finalContent,
    getAgentContext()?.agentId ?? null
  );
  const toolUseID = getToolUseIDFromParentMessage(
    parentMessage,
    SKILL_TOOL_NAME
  );
  return {
    data: { success: true, commandName, status: "inline" },
    newMessages: tagMessagesWithToolUseID(
      [createUserMessage({ content: finalContent, isMeta: true })],
      toolUseID
    )
  };
}
export {
  SkillTool,
  inputSchema,
  outputSchema
};
