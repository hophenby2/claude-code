const feature = (_name) => false;
import { randomUUID } from "crypto";
import uniqBy from "lodash-es/uniqBy.js";
import { logForDebugging } from "../../utils/debug.js";
import { getProjectRoot, getSessionId } from "../../bootstrap/state.js";
import { getCommand, getSkillToolCommands, hasCommand } from "../../commands.js";
import {
  DEFAULT_AGENT_PROMPT,
  enhanceSystemPromptWithEnvDetails
} from "../../constants/prompts.js";
import { getSystemContext, getUserContext } from "../../context.js";
import { query } from "../../query.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import { getDumpPromptsPath } from "../../services/api/dumpPrompts.js";
import "../../services/api/promptCacheBreakDetection.js";
import {
  connectToServer,
  fetchToolsForClient
} from "../../services/mcp/client.js";
import { getMcpConfigByName } from "../../services/mcp/config.js";
import { killShellTasksForAgent } from "../../tasks/LocalShellTask/killShellTasks.js";
import { createAttachmentMessage } from "../../utils/attachments.js";
import { AbortError } from "../../utils/errors.js";
import { getDisplayPath } from "../../utils/file.js";
import {
  cloneFileStateCache,
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE
} from "../../utils/fileStateCache.js";
import {
  createSubagentContext
} from "../../utils/forkedAgent.js";
import { registerFrontmatterHooks } from "../../utils/hooks/registerFrontmatterHooks.js";
import { clearSessionHooks } from "../../utils/hooks/sessionHooks.js";
import { executeSubagentStartHooks } from "../../utils/hooks.js";
import { createUserMessage } from "../../utils/messages.js";
import { getAgentModel } from "../../utils/model/agent.js";
import {
  clearAgentTranscriptSubdir,
  recordSidechainTranscript,
  setAgentTranscriptSubdir,
  writeAgentMetadata
} from "../../utils/sessionStorage.js";
import {
  isRestrictedToPluginOnly,
  isSourceAdminTrusted
} from "../../utils/settings/pluginOnlyPolicy.js";
import {
  asSystemPrompt
} from "../../utils/systemPromptType.js";
import {
  isPerfettoTracingEnabled,
  registerAgent as registerPerfettoAgent,
  unregisterAgent as unregisterPerfettoAgent
} from "../../utils/telemetry/perfettoTracing.js";
import { createAgentId } from "../../utils/uuid.js";
import { resolveAgentTools } from "./agentToolUtils.js";
import { isBuiltInAgent } from "./loadAgentsDir.js";
async function initializeAgentMcpServers(agentDefinition, parentClients) {
  if (!agentDefinition.mcpServers?.length) {
    return {
      clients: parentClients,
      tools: [],
      cleanup: async () => {
      }
    };
  }
  const agentIsAdminTrusted = isSourceAdminTrusted(agentDefinition.source);
  if (isRestrictedToPluginOnly("mcp") && !agentIsAdminTrusted) {
    logForDebugging(
      `[Agent: ${agentDefinition.agentType}] Skipping MCP servers: strictPluginOnlyCustomization locks MCP to plugin-only (agent source: ${agentDefinition.source})`
    );
    return {
      clients: parentClients,
      tools: [],
      cleanup: async () => {
      }
    };
  }
  const agentClients = [];
  const newlyCreatedClients = [];
  const agentTools = [];
  for (const spec of agentDefinition.mcpServers) {
    let config = null;
    let name;
    let isNewlyCreated = false;
    if (typeof spec === "string") {
      name = spec;
      config = getMcpConfigByName(spec);
      if (!config) {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] MCP server not found: ${spec}`,
          { level: "warn" }
        );
        continue;
      }
    } else {
      const entries = Object.entries(spec);
      if (entries.length !== 1) {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Invalid MCP server spec: expected exactly one key`,
          { level: "warn" }
        );
        continue;
      }
      const [serverName, serverConfig] = entries[0];
      name = serverName;
      config = {
        ...serverConfig,
        scope: "dynamic"
      };
      isNewlyCreated = true;
    }
    const client = await connectToServer(name, config);
    agentClients.push(client);
    if (isNewlyCreated) {
      newlyCreatedClients.push(client);
    }
    if (client.type === "connected") {
      const tools = await fetchToolsForClient(client);
      agentTools.push(...tools);
      logForDebugging(
        `[Agent: ${agentDefinition.agentType}] Connected to MCP server '${name}' with ${tools.length} tools`
      );
    } else {
      logForDebugging(
        `[Agent: ${agentDefinition.agentType}] Failed to connect to MCP server '${name}': ${client.type}`,
        { level: "warn" }
      );
    }
  }
  const cleanup = async () => {
    for (const client of newlyCreatedClients) {
      if (client.type === "connected") {
        try {
          await client.cleanup();
        } catch (error) {
          logForDebugging(
            `[Agent: ${agentDefinition.agentType}] Error cleaning up MCP server '${client.name}': ${error}`,
            { level: "warn" }
          );
        }
      }
    }
  };
  return {
    clients: [...parentClients, ...agentClients],
    tools: agentTools,
    cleanup
  };
}
function isRecordableMessage(msg) {
  return msg.type === "assistant" || msg.type === "user" || msg.type === "progress" || msg.type === "system" && "subtype" in msg && msg.subtype === "compact_boundary";
}
async function* runAgent({
  agentDefinition,
  promptMessages,
  toolUseContext,
  canUseTool,
  isAsync,
  canShowPermissionPrompts,
  forkContextMessages,
  querySource,
  override,
  model,
  maxTurns,
  preserveToolUseResults,
  availableTools,
  allowedTools,
  onCacheSafeParams,
  contentReplacementState,
  useExactTools,
  worktreePath,
  description,
  transcriptSubdir,
  onQueryProgress
}) {
  const appState = toolUseContext.getAppState();
  const permissionMode = appState.toolPermissionContext.mode;
  const rootSetAppState = toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState;
  const resolvedAgentModel = getAgentModel(
    agentDefinition.model,
    toolUseContext.options.mainLoopModel,
    model,
    permissionMode
  );
  const agentId = override?.agentId ? override.agentId : createAgentId();
  if (transcriptSubdir) {
    setAgentTranscriptSubdir(agentId, transcriptSubdir);
  }
  if (isPerfettoTracingEnabled()) {
    const parentId = toolUseContext.agentId ?? getSessionId();
    registerPerfettoAgent(agentId, agentDefinition.agentType, parentId);
  }
  if (process.env.USER_TYPE === "ant") {
    logForDebugging(
      `[Subagent ${agentDefinition.agentType}] API calls: ${getDisplayPath(getDumpPromptsPath(agentId))}`
    );
  }
  const contextMessages = forkContextMessages ? filterIncompleteToolCalls(forkContextMessages) : [];
  const initialMessages = [...contextMessages, ...promptMessages];
  const agentReadFileState = forkContextMessages !== void 0 ? cloneFileStateCache(toolUseContext.readFileState) : createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE);
  const [baseUserContext, baseSystemContext] = await Promise.all([
    override?.userContext ?? getUserContext(),
    override?.systemContext ?? getSystemContext()
  ]);
  const shouldOmitClaudeMd = agentDefinition.omitClaudeMd && !override?.userContext && getFeatureValue_CACHED_MAY_BE_STALE("tengu_slim_subagent_claudemd", true);
  const { claudeMd: _omittedClaudeMd, ...userContextNoClaudeMd } = baseUserContext;
  const resolvedUserContext = shouldOmitClaudeMd ? userContextNoClaudeMd : baseUserContext;
  const { gitStatus: _omittedGitStatus, ...systemContextNoGit } = baseSystemContext;
  const resolvedSystemContext = agentDefinition.agentType === "Explore" || agentDefinition.agentType === "Plan" ? systemContextNoGit : baseSystemContext;
  const agentPermissionMode = agentDefinition.permissionMode;
  const agentGetAppState = () => {
    const state = toolUseContext.getAppState();
    let toolPermissionContext = state.toolPermissionContext;
    if (agentPermissionMode && state.toolPermissionContext.mode !== "bypassPermissions" && state.toolPermissionContext.mode !== "acceptEdits" && true) {
      toolPermissionContext = {
        ...toolPermissionContext,
        mode: agentPermissionMode
      };
    }
    const shouldAvoidPrompts = canShowPermissionPrompts !== void 0 ? !canShowPermissionPrompts : agentPermissionMode === "bubble" ? false : isAsync;
    if (shouldAvoidPrompts) {
      toolPermissionContext = {
        ...toolPermissionContext,
        shouldAvoidPermissionPrompts: true
      };
    }
    if (isAsync && !shouldAvoidPrompts) {
      toolPermissionContext = {
        ...toolPermissionContext,
        awaitAutomatedChecksBeforeDialog: true
      };
    }
    if (allowedTools !== void 0) {
      toolPermissionContext = {
        ...toolPermissionContext,
        alwaysAllowRules: {
          // Preserve SDK-level permissions from --allowedTools
          cliArg: state.toolPermissionContext.alwaysAllowRules.cliArg,
          // Use the provided allowedTools as session-level permissions
          session: [...allowedTools]
        }
      };
    }
    const effortValue = agentDefinition.effort !== void 0 ? agentDefinition.effort : state.effortValue;
    if (toolPermissionContext === state.toolPermissionContext && effortValue === state.effortValue) {
      return state;
    }
    return {
      ...state,
      toolPermissionContext,
      effortValue
    };
  };
  const resolvedTools = useExactTools ? availableTools : resolveAgentTools(agentDefinition, availableTools, isAsync).resolvedTools;
  const additionalWorkingDirectories = Array.from(
    appState.toolPermissionContext.additionalWorkingDirectories.keys()
  );
  const agentSystemPrompt = override?.systemPrompt ? override.systemPrompt : asSystemPrompt(
    await getAgentSystemPrompt(
      agentDefinition,
      toolUseContext,
      resolvedAgentModel,
      additionalWorkingDirectories,
      resolvedTools
    )
  );
  const agentAbortController = override?.abortController ? override.abortController : isAsync ? new AbortController() : toolUseContext.abortController;
  const additionalContexts = [];
  for await (const hookResult of executeSubagentStartHooks(
    agentId,
    agentDefinition.agentType,
    agentAbortController.signal
  )) {
    if (hookResult.additionalContexts && hookResult.additionalContexts.length > 0) {
      additionalContexts.push(...hookResult.additionalContexts);
    }
  }
  if (additionalContexts.length > 0) {
    const contextMessage = createAttachmentMessage({
      type: "hook_additional_context",
      content: additionalContexts,
      hookName: "SubagentStart",
      toolUseID: randomUUID(),
      hookEvent: "SubagentStart"
    });
    initialMessages.push(contextMessage);
  }
  const hooksAllowedForThisAgent = !isRestrictedToPluginOnly("hooks") || isSourceAdminTrusted(agentDefinition.source);
  if (agentDefinition.hooks && hooksAllowedForThisAgent) {
    registerFrontmatterHooks(
      rootSetAppState,
      agentId,
      agentDefinition.hooks,
      `agent '${agentDefinition.agentType}'`,
      true
      // isAgent - converts Stop to SubagentStop
    );
  }
  const skillsToPreload = agentDefinition.skills ?? [];
  if (skillsToPreload.length > 0) {
    const allSkills = await getSkillToolCommands(getProjectRoot());
    const validSkills = [];
    for (const skillName of skillsToPreload) {
      const resolvedName = resolveSkillName(
        skillName,
        allSkills,
        agentDefinition
      );
      if (!resolvedName) {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Warning: Skill '${skillName}' specified in frontmatter was not found`,
          { level: "warn" }
        );
        continue;
      }
      const skill = getCommand(resolvedName, allSkills);
      if (skill.type !== "prompt") {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Warning: Skill '${skillName}' is not a prompt-based skill`,
          { level: "warn" }
        );
        continue;
      }
      validSkills.push({ skillName, skill });
    }
    const { formatSkillLoadingMetadata } = await import("../../utils/processUserInput/processSlashCommand.js");
    const loaded = await Promise.all(
      validSkills.map(async ({ skillName, skill }) => ({
        skillName,
        skill,
        content: await skill.getPromptForCommand("", toolUseContext)
      }))
    );
    for (const { skillName, skill, content } of loaded) {
      logForDebugging(
        `[Agent: ${agentDefinition.agentType}] Preloaded skill '${skillName}'`
      );
      const metadata = formatSkillLoadingMetadata(
        skillName,
        skill.progressMessage
      );
      initialMessages.push(
        createUserMessage({
          content: [{ type: "text", text: metadata }, ...content],
          isMeta: true
        })
      );
    }
  }
  const {
    clients: mergedMcpClients,
    tools: agentMcpTools,
    cleanup: mcpCleanup
  } = await initializeAgentMcpServers(
    agentDefinition,
    toolUseContext.options.mcpClients
  );
  const allTools = agentMcpTools.length > 0 ? uniqBy([...resolvedTools, ...agentMcpTools], "name") : resolvedTools;
  const agentOptions = {
    isNonInteractiveSession: useExactTools ? toolUseContext.options.isNonInteractiveSession : isAsync ? true : toolUseContext.options.isNonInteractiveSession ?? false,
    appendSystemPrompt: toolUseContext.options.appendSystemPrompt,
    tools: allTools,
    commands: [],
    debug: toolUseContext.options.debug,
    verbose: toolUseContext.options.verbose,
    mainLoopModel: resolvedAgentModel,
    // For fork children (useExactTools), inherit thinking config to match the
    // parent's API request prefix for prompt cache hits. For regular
    // sub-agents, disable thinking to control output token costs.
    thinkingConfig: useExactTools ? toolUseContext.options.thinkingConfig : { type: "disabled" },
    mcpClients: mergedMcpClients,
    mcpResources: toolUseContext.options.mcpResources,
    agentDefinitions: toolUseContext.options.agentDefinitions,
    // Fork children (useExactTools path) need querySource on context.options
    // for the recursive-fork guard at AgentTool.tsx call() — it checks
    // options.querySource === 'agent:builtin:fork'. This survives autocompact
    // (which rewrites messages, not context.options). Without this, the guard
    // reads undefined and only the message-scan fallback fires — which
    // autocompact defeats by replacing the fork-boilerplate message.
    ...useExactTools && { querySource }
  };
  const agentToolUseContext = createSubagentContext(toolUseContext, {
    options: agentOptions,
    agentId,
    agentType: agentDefinition.agentType,
    messages: initialMessages,
    readFileState: agentReadFileState,
    abortController: agentAbortController,
    getAppState: agentGetAppState,
    // Sync agents share these callbacks with parent
    shareSetAppState: !isAsync,
    shareSetResponseLength: true,
    // Both sync and async contribute to response metrics
    criticalSystemReminder_EXPERIMENTAL: agentDefinition.criticalSystemReminder_EXPERIMENTAL,
    contentReplacementState
  });
  if (preserveToolUseResults) {
    agentToolUseContext.preserveToolUseResults = true;
  }
  if (onCacheSafeParams) {
    onCacheSafeParams({
      systemPrompt: agentSystemPrompt,
      userContext: resolvedUserContext,
      systemContext: resolvedSystemContext,
      toolUseContext: agentToolUseContext,
      forkContextMessages: initialMessages
    });
  }
  void recordSidechainTranscript(initialMessages, agentId).catch(
    (_err) => logForDebugging(`Failed to record sidechain transcript: ${_err}`)
  );
  void writeAgentMetadata(agentId, {
    agentType: agentDefinition.agentType,
    ...worktreePath && { worktreePath },
    ...description && { description }
  }).catch((_err) => logForDebugging(`Failed to write agent metadata: ${_err}`));
  let lastRecordedUuid = initialMessages.at(-1)?.uuid ?? null;
  try {
    for await (const message of query({
      messages: initialMessages,
      systemPrompt: agentSystemPrompt,
      userContext: resolvedUserContext,
      systemContext: resolvedSystemContext,
      canUseTool,
      toolUseContext: agentToolUseContext,
      querySource,
      maxTurns: maxTurns ?? agentDefinition.maxTurns
    })) {
      onQueryProgress?.();
      if (message.type === "stream_event" && message.event.type === "message_start" && message.ttftMs != null) {
        toolUseContext.pushApiMetricsEntry?.(message.ttftMs);
        continue;
      }
      if (message.type === "attachment") {
        if (message.attachment.type === "max_turns_reached") {
          logForDebugging(
            `[Agent
: $
{
  agentDefinition.agentType
}
] Reached max turns limit ($
{
  message.attachment.maxTurns
}
)`
          );
          break;
        }
        yield message;
        continue;
      }
      if (isRecordableMessage(message)) {
        await recordSidechainTranscript(
          [message],
          agentId,
          lastRecordedUuid
        ).catch(
          (err) => logForDebugging(`Failed to record sidechain transcript: ${err}`)
        );
        if (message.type !== "progress") {
          lastRecordedUuid = message.uuid;
        }
        yield message;
      }
    }
    if (agentAbortController.signal.aborted) {
      throw new AbortError();
    }
    if (isBuiltInAgent(agentDefinition) && agentDefinition.callback) {
      agentDefinition.callback();
    }
  } finally {
    await mcpCleanup();
    if (agentDefinition.hooks) {
      clearSessionHooks(rootSetAppState, agentId);
    }
    if (false) {
      cleanupAgentTracking(agentId);
    }
    agentToolUseContext.readFileState.clear();
    initialMessages.length = 0;
    unregisterPerfettoAgent(agentId);
    clearAgentTranscriptSubdir(agentId);
    rootSetAppState((prev) => {
      if (!(agentId in prev.todos)) return prev;
      const { [agentId]: _removed, ...todos } = prev.todos;
      return { ...prev, todos };
    });
    killShellTasksForAgent(agentId, toolUseContext.getAppState, rootSetAppState);
    if (false) {
      const mcpMod = null;
      mcpMod.killMonitorMcpTasksForAgent(
        agentId,
        toolUseContext.getAppState,
        rootSetAppState
      );
    }
  }
}
function filterIncompleteToolCalls(messages) {
  const toolUseIdsWithResults = /* @__PURE__ */ new Set();
  for (const message of messages) {
    if (message?.type === "user") {
      const userMessage = message;
      const content = userMessage.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_result" && block.tool_use_id) {
            toolUseIdsWithResults.add(block.tool_use_id);
          }
        }
      }
    }
  }
  return messages.filter((message) => {
    if (message?.type === "assistant") {
      const assistantMessage = message;
      const content = assistantMessage.message.content;
      if (Array.isArray(content)) {
        const hasIncompleteToolCall = content.some(
          (block) => block.type === "tool_use" && block.id && !toolUseIdsWithResults.has(block.id)
        );
        return !hasIncompleteToolCall;
      }
    }
    return true;
  });
}
async function getAgentSystemPrompt(agentDefinition, toolUseContext, resolvedAgentModel, additionalWorkingDirectories, resolvedTools) {
  const enabledToolNames = new Set(resolvedTools.map((t) => t.name));
  try {
    const agentPrompt = agentDefinition.getSystemPrompt({ toolUseContext });
    const prompts = [agentPrompt];
    return await enhanceSystemPromptWithEnvDetails(
      prompts,
      resolvedAgentModel,
      additionalWorkingDirectories,
      enabledToolNames
    );
  } catch (_error) {
    return enhanceSystemPromptWithEnvDetails(
      [DEFAULT_AGENT_PROMPT],
      resolvedAgentModel,
      additionalWorkingDirectories,
      enabledToolNames
    );
  }
}
function resolveSkillName(skillName, allSkills, agentDefinition) {
  if (hasCommand(skillName, allSkills)) {
    return skillName;
  }
  const pluginPrefix = agentDefinition.agentType.split(":")[0];
  if (pluginPrefix) {
    const qualifiedName = `${pluginPrefix}:${skillName}`;
    if (hasCommand(qualifiedName, allSkills)) {
      return qualifiedName;
    }
  }
  const suffix = `:${skillName}`;
  const match = allSkills.find((cmd) => cmd.name.endsWith(suffix));
  if (match) {
    return match.name;
  }
  return null;
}
export {
  filterIncompleteToolCalls,
  runAgent
};
