import { jsx } from "react/jsx-runtime";
import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import { buildTool, toolMatchesName } from "../../Tool.js";
import { getQuerySourceForAgent } from "../../utils/promptCategory.js";
import { z } from "zod/v4";
import { clearInvokedSkillsForAgent, getSdkAgentProgressSummariesEnabled } from "../../bootstrap/state.js";
import { enhanceSystemPromptWithEnvDetails, getSystemPrompt } from "../../constants/prompts.js";
import { isCoordinatorMode } from "../../coordinator/coordinatorMode.js";
import { startAgentSummarization } from "../../services/AgentSummary/agentSummary.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import { logEvent } from "../../services/analytics/index.js";
import { clearDumpState } from "../../services/api/dumpPrompts.js";
import { completeAgentTask as completeAsyncAgent, createActivityDescriptionResolver, createProgressTracker, enqueueAgentNotification, failAgentTask as failAsyncAgent, getProgressUpdate, getTokenCountFromTracker, isLocalAgentTask, killAsyncAgent, registerAgentForeground, registerAsyncAgent, unregisterAgentForeground, updateAgentProgress as updateAsyncAgentProgress, updateProgressFromMessage } from "../../tasks/LocalAgentTask/LocalAgentTask.js";
import "../../tasks/RemoteAgentTask/RemoteAgentTask.js";
import { assembleToolPool } from "../../tools.js";
import { asAgentId } from "../../types/ids.js";
import { runWithAgentContext } from "../../utils/agentContext.js";
import { isAgentSwarmsEnabled } from "../../utils/agentSwarmsEnabled.js";
import { getCwd, runWithCwdOverride } from "../../utils/cwd.js";
import { logForDebugging } from "../../utils/debug.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { AbortError, errorMessage, toError } from "../../utils/errors.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { createUserMessage, extractTextContent, isSyntheticMessage, normalizeMessages } from "../../utils/messages.js";
import { getAgentModel } from "../../utils/model/agent.js";
import { permissionModeSchema } from "../../utils/permissions/PermissionMode.js";
import { filterDeniedAgents, getDenyRuleForAgent } from "../../utils/permissions/permissions.js";
import { enqueueSdkEvent } from "../../utils/sdkEventQueue.js";
import { writeAgentMetadata } from "../../utils/sessionStorage.js";
import { sleep } from "../../utils/sleep.js";
import { buildEffectiveSystemPrompt } from "../../utils/systemPrompt.js";
import { asSystemPrompt } from "../../utils/systemPromptType.js";
import { getTaskOutputPath } from "../../utils/task/diskOutput.js";
import { getParentSessionId, isTeammate } from "../../utils/teammate.js";
import { isInProcessTeammate } from "../../utils/teammateContext.js";
import "../../utils/teleport.js";
import { getAssistantMessageContentLength } from "../../utils/tokens.js";
import { createAgentId } from "../../utils/uuid.js";
import { createAgentWorktree, hasWorktreeChanges, removeAgentWorktree } from "../../utils/worktree.js";
import { BASH_TOOL_NAME } from "../BashTool/toolName.js";
import { BackgroundHint } from "../BashTool/UI.js";
import { FILE_READ_TOOL_NAME } from "../FileReadTool/prompt.js";
import { spawnTeammate } from "../shared/spawnMultiAgent.js";
import { setAgentColor } from "./agentColorManager.js";
import { agentToolResultSchema, emitTaskProgress, extractPartialResult, finalizeAgentTool, getLastToolUseName, runAsyncAgentLifecycle } from "./agentToolUtils.js";
import { GENERAL_PURPOSE_AGENT } from "./built-in/generalPurposeAgent.js";
import { AGENT_TOOL_NAME, LEGACY_AGENT_TOOL_NAME, ONE_SHOT_BUILTIN_AGENT_TYPES } from "./constants.js";
import { buildForkedMessages, buildWorktreeNotice, FORK_AGENT, isForkSubagentEnabled, isInForkChild } from "./forkSubagent.js";
import { filterAgentsByMcpRequirements, hasRequiredMcpServers, isBuiltInAgent } from "./loadAgentsDir.js";
import { getPrompt } from "./prompt.js";
import { runAgent } from "./runAgent.js";
import { renderGroupedAgentToolUse, renderToolResultMessage, renderToolUseErrorMessage, renderToolUseMessage, renderToolUseProgressMessage, renderToolUseRejectedMessage, renderToolUseTag, userFacingName, userFacingNameBackgroundColor } from "./UI.js";
const proactiveModule = false ? require2("../../proactive/index.js") : null;
const PROGRESS_THRESHOLD_MS = 2e3;
const isBackgroundTasksDisabled = (
  // eslint-disable-next-line custom-rules/no-process-env-top-level -- Intentional: schema must be defined at module load
  isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)
);
function getAutoBackgroundMs() {
  if (isEnvTruthy(process.env.CLAUDE_AUTO_BACKGROUND_TASKS) || getFeatureValue_CACHED_MAY_BE_STALE("tengu_auto_background_agents", false)) {
    return 12e4;
  }
  return 0;
}
const baseInputSchema = lazySchema(() => z.object({
  description: z.string().describe("A short (3-5 word) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().optional().describe("The type of specialized agent to use for this task"),
  model: z.enum(["sonnet", "opus", "haiku"]).optional().describe("Optional model override for this agent. Takes precedence over the agent definition's model frontmatter. If omitted, uses the agent definition's model, or inherits from the parent."),
  run_in_background: z.boolean().optional().describe("Set to true to run this agent in the background. You will be notified when it completes.")
}));
const fullInputSchema = lazySchema(() => {
  const multiAgentInputSchema = z.object({
    name: z.string().optional().describe("Name for the spawned agent. Makes it addressable via SendMessage({to: name}) while running."),
    team_name: z.string().optional().describe("Team name for spawning. Uses current team context if omitted."),
    mode: permissionModeSchema().optional().describe('Permission mode for spawned teammate (e.g., "plan" to require plan approval).')
  });
  return baseInputSchema().merge(multiAgentInputSchema).extend({
    isolation: (false ? z.enum(["worktree", "remote"]) : z.enum(["worktree"])).optional().describe(false ? 'Isolation mode. "worktree" creates a temporary git worktree so the agent works on an isolated copy of the repo. "remote" launches the agent in a remote CCR environment (always runs in background).' : 'Isolation mode. "worktree" creates a temporary git worktree so the agent works on an isolated copy of the repo.'),
    cwd: z.string().optional().describe('Absolute path to run the agent in. Overrides the working directory for all filesystem and shell operations within this agent. Mutually exclusive with isolation: "worktree".')
  });
});
const inputSchema = lazySchema(() => {
  const schema = false ? fullInputSchema() : fullInputSchema().omit({
    cwd: true
  });
  return isBackgroundTasksDisabled || isForkSubagentEnabled() ? schema.omit({
    run_in_background: true
  }) : schema;
});
const outputSchema = lazySchema(() => {
  const syncOutputSchema = agentToolResultSchema().extend({
    status: z.literal("completed"),
    prompt: z.string()
  });
  const asyncOutputSchema = z.object({
    status: z.literal("async_launched"),
    agentId: z.string().describe("The ID of the async agent"),
    description: z.string().describe("The description of the task"),
    prompt: z.string().describe("The prompt for the agent"),
    outputFile: z.string().describe("Path to the output file for checking agent progress"),
    canReadOutputFile: z.boolean().optional().describe("Whether the calling agent has Read/Bash tools to check progress")
  });
  return z.union([syncOutputSchema, asyncOutputSchema]);
});
const AgentTool = buildTool({
  async prompt({
    agents,
    tools,
    getToolPermissionContext,
    allowedAgentTypes
  }) {
    const toolPermissionContext = await getToolPermissionContext();
    const mcpServersWithTools = [];
    for (const tool of tools) {
      if (tool.name?.startsWith("mcp__")) {
        const parts = tool.name.split("__");
        const serverName = parts[1];
        if (serverName && !mcpServersWithTools.includes(serverName)) {
          mcpServersWithTools.push(serverName);
        }
      }
    }
    const agentsWithMcpRequirementsMet = filterAgentsByMcpRequirements(agents, mcpServersWithTools);
    const filteredAgents = filterDeniedAgents(agentsWithMcpRequirementsMet, toolPermissionContext, AGENT_TOOL_NAME);
    const isCoordinator = false ? isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE) : false;
    return await getPrompt(filteredAgents, isCoordinator, allowedAgentTypes);
  },
  name: AGENT_TOOL_NAME,
  searchHint: "delegate work to a subagent",
  aliases: [LEGACY_AGENT_TOOL_NAME],
  maxResultSizeChars: 1e5,
  async description() {
    return "Launch a new agent";
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  async call({
    prompt,
    subagent_type,
    description,
    model: modelParam,
    run_in_background,
    name,
    team_name,
    mode: spawnMode,
    isolation,
    cwd
  }, toolUseContext, canUseTool, assistantMessage, onProgress) {
    const startTime = Date.now();
    const model = isCoordinatorMode() ? void 0 : modelParam;
    const appState = toolUseContext.getAppState();
    const permissionMode = appState.toolPermissionContext.mode;
    const rootSetAppState = toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState;
    if (team_name && !isAgentSwarmsEnabled()) {
      throw new Error("Agent Teams is not yet available on your plan.");
    }
    const teamName = resolveTeamName({
      team_name
    }, appState);
    if (isTeammate() && teamName && name) {
      throw new Error("Teammates cannot spawn other teammates \u2014 the team roster is flat. To spawn a subagent instead, omit the `name` parameter.");
    }
    if (isInProcessTeammate() && teamName && run_in_background === true) {
      throw new Error("In-process teammates cannot spawn background agents. Use run_in_background=false for synchronous subagents.");
    }
    if (teamName && name) {
      const agentDef = subagent_type ? toolUseContext.options.agentDefinitions.activeAgents.find((a) => a.agentType === subagent_type) : void 0;
      if (agentDef?.color) {
        setAgentColor(subagent_type, agentDef.color);
      }
      const result = await spawnTeammate({
        name,
        prompt,
        description,
        team_name: teamName,
        use_splitpane: true,
        plan_mode_required: spawnMode === "plan",
        model: model ?? agentDef?.model,
        agent_type: subagent_type,
        invokingRequestId: assistantMessage?.requestId
      }, toolUseContext);
      const spawnResult = {
        status: "teammate_spawned",
        prompt,
        ...result.data
      };
      return {
        data: spawnResult
      };
    }
    const effectiveType = subagent_type ?? (isForkSubagentEnabled() ? void 0 : GENERAL_PURPOSE_AGENT.agentType);
    const isForkPath = effectiveType === void 0;
    let selectedAgent;
    if (isForkPath) {
      if (toolUseContext.options.querySource === `agent:builtin:${FORK_AGENT.agentType}` || isInForkChild(toolUseContext.messages)) {
        throw new Error("Fork is not available inside a forked worker. Complete your task directly using your tools.");
      }
      selectedAgent = FORK_AGENT;
    } else {
      const allAgents = toolUseContext.options.agentDefinitions.activeAgents;
      const {
        allowedAgentTypes
      } = toolUseContext.options.agentDefinitions;
      const agents = filterDeniedAgents(
        // When allowedAgentTypes is set (from Agent(x,y) tool spec), restrict to those types
        allowedAgentTypes ? allAgents.filter((a) => allowedAgentTypes.includes(a.agentType)) : allAgents,
        appState.toolPermissionContext,
        AGENT_TOOL_NAME
      );
      const found = agents.find((agent) => agent.agentType === effectiveType);
      if (!found) {
        const agentExistsButDenied = allAgents.find((agent) => agent.agentType === effectiveType);
        if (agentExistsButDenied) {
          const denyRule = getDenyRuleForAgent(appState.toolPermissionContext, AGENT_TOOL_NAME, effectiveType);
          throw new Error(`Agent type '${effectiveType}' has been denied by permission rule '${AGENT_TOOL_NAME}(${effectiveType})' from ${denyRule?.source ?? "settings"}.`);
        }
        throw new Error(`Agent type '${effectiveType}' not found. Available agents: ${agents.map((a) => a.agentType).join(", ")}`);
      }
      selectedAgent = found;
    }
    if (isInProcessTeammate() && teamName && selectedAgent.background === true) {
      throw new Error(`In-process teammates cannot spawn background agents. Agent '${selectedAgent.agentType}' has background: true in its definition.`);
    }
    const requiredMcpServers = selectedAgent.requiredMcpServers;
    if (requiredMcpServers?.length) {
      const hasPendingRequiredServers = appState.mcp.clients.some((c) => c.type === "pending" && requiredMcpServers.some((pattern) => c.name.toLowerCase().includes(pattern.toLowerCase())));
      let currentAppState = appState;
      if (hasPendingRequiredServers) {
        const MAX_WAIT_MS = 3e4;
        const POLL_INTERVAL_MS = 500;
        const deadline = Date.now() + MAX_WAIT_MS;
        while (Date.now() < deadline) {
          await sleep(POLL_INTERVAL_MS);
          currentAppState = toolUseContext.getAppState();
          const hasFailedRequiredServer = currentAppState.mcp.clients.some((c) => c.type === "failed" && requiredMcpServers.some((pattern) => c.name.toLowerCase().includes(pattern.toLowerCase())));
          if (hasFailedRequiredServer) break;
          const stillPending = currentAppState.mcp.clients.some((c) => c.type === "pending" && requiredMcpServers.some((pattern) => c.name.toLowerCase().includes(pattern.toLowerCase())));
          if (!stillPending) break;
        }
      }
      const serversWithTools = [];
      for (const tool of currentAppState.mcp.tools) {
        if (tool.name?.startsWith("mcp__")) {
          const parts = tool.name.split("__");
          const serverName = parts[1];
          if (serverName && !serversWithTools.includes(serverName)) {
            serversWithTools.push(serverName);
          }
        }
      }
      if (!hasRequiredMcpServers(selectedAgent, serversWithTools)) {
        const missing = requiredMcpServers.filter((pattern) => !serversWithTools.some((server) => server.toLowerCase().includes(pattern.toLowerCase())));
        throw new Error(`Agent '${selectedAgent.agentType}' requires MCP servers matching: ${missing.join(", ")}. MCP servers with tools: ${serversWithTools.length > 0 ? serversWithTools.join(", ") : "none"}. Use /mcp to configure and authenticate the required MCP servers.`);
      }
    }
    if (selectedAgent.color) {
      setAgentColor(selectedAgent.agentType, selectedAgent.color);
    }
    const resolvedAgentModel = getAgentModel(selectedAgent.model, toolUseContext.options.mainLoopModel, isForkPath ? void 0 : model, permissionMode);
    logEvent("tengu_agent_tool_selected", {
      agent_type: selectedAgent.agentType,
      model: resolvedAgentModel,
      source: selectedAgent.source,
      color: selectedAgent.color,
      is_built_in_agent: isBuiltInAgent(selectedAgent),
      is_resume: false,
      is_async: (run_in_background === true || selectedAgent.background === true) && !isBackgroundTasksDisabled,
      is_fork: isForkPath
    });
    const effectiveIsolation = isolation ?? selectedAgent.isolation;
    if (false) {
      const eligibility = await checkRemoteAgentEligibility();
      if (!eligibility.eligible) {
        const reasons = eligibility.errors.map(formatPreconditionError).join("\n");
        throw new Error(`Cannot launch remote agent:
${reasons}`);
      }
      let bundleFailHint;
      const session = await teleportToRemote({
        initialMessage: prompt,
        description,
        signal: toolUseContext.abortController.signal,
        onBundleFail: (msg) => {
          bundleFailHint = msg;
        }
      });
      if (!session) {
        throw new Error(bundleFailHint ?? "Failed to create remote session");
      }
      const {
        taskId,
        sessionId
      } = registerRemoteAgentTask({
        remoteTaskType: "remote-agent",
        session: {
          id: session.id,
          title: session.title || description
        },
        command: prompt,
        context: toolUseContext,
        toolUseId: toolUseContext.toolUseId
      });
      logEvent("tengu_agent_tool_remote_launched", {
        agent_type: selectedAgent.agentType
      });
      const remoteResult = {
        status: "remote_launched",
        taskId,
        sessionUrl: getRemoteTaskSessionUrl(sessionId),
        description,
        prompt,
        outputFile: getTaskOutputPath(taskId)
      };
      return {
        data: remoteResult
      };
    }
    let enhancedSystemPrompt;
    let forkParentSystemPrompt;
    let promptMessages;
    if (isForkPath) {
      if (toolUseContext.renderedSystemPrompt) {
        forkParentSystemPrompt = toolUseContext.renderedSystemPrompt;
      } else {
        const mainThreadAgentDefinition = appState.agent ? appState.agentDefinitions.activeAgents.find((a) => a.agentType === appState.agent) : void 0;
        const additionalWorkingDirectories = Array.from(appState.toolPermissionContext.additionalWorkingDirectories.keys());
        const defaultSystemPrompt = await getSystemPrompt(toolUseContext.options.tools, toolUseContext.options.mainLoopModel, additionalWorkingDirectories, toolUseContext.options.mcpClients);
        forkParentSystemPrompt = buildEffectiveSystemPrompt({
          mainThreadAgentDefinition,
          toolUseContext,
          customSystemPrompt: toolUseContext.options.customSystemPrompt,
          defaultSystemPrompt,
          appendSystemPrompt: toolUseContext.options.appendSystemPrompt
        });
      }
      promptMessages = buildForkedMessages(prompt, assistantMessage);
    } else {
      try {
        const additionalWorkingDirectories = Array.from(appState.toolPermissionContext.additionalWorkingDirectories.keys());
        const agentPrompt = selectedAgent.getSystemPrompt({
          toolUseContext
        });
        if (selectedAgent.memory) {
          logEvent("tengu_agent_memory_loaded", {
            ...false,
            scope: selectedAgent.memory,
            source: "subagent"
          });
        }
        enhancedSystemPrompt = await enhanceSystemPromptWithEnvDetails([agentPrompt], resolvedAgentModel, additionalWorkingDirectories);
      } catch (error) {
        logForDebugging(`Failed to get system prompt for agent ${selectedAgent.agentType}: ${errorMessage(error)}`);
      }
      promptMessages = [createUserMessage({
        content: prompt
      })];
    }
    const metadata = {
      prompt,
      resolvedAgentModel,
      isBuiltInAgent: isBuiltInAgent(selectedAgent),
      startTime,
      agentType: selectedAgent.agentType,
      isAsync: (run_in_background === true || selectedAgent.background === true) && !isBackgroundTasksDisabled
    };
    const isCoordinator = false ? isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE) : false;
    const forceAsync = isForkSubagentEnabled();
    const assistantForceAsync = false ? appState.kairosEnabled : false;
    const shouldRunAsync = (run_in_background === true || selectedAgent.background === true || isCoordinator || forceAsync || assistantForceAsync || (proactiveModule?.isProactiveActive() ?? false)) && !isBackgroundTasksDisabled;
    const workerPermissionContext = {
      ...appState.toolPermissionContext,
      mode: selectedAgent.permissionMode ?? "acceptEdits"
    };
    const workerTools = assembleToolPool(workerPermissionContext, appState.mcp.tools);
    const earlyAgentId = createAgentId();
    let worktreeInfo = null;
    if (effectiveIsolation === "worktree") {
      const slug = `agent-${earlyAgentId.slice(0, 8)}`;
      worktreeInfo = await createAgentWorktree(slug);
    }
    if (isForkPath && worktreeInfo) {
      promptMessages.push(createUserMessage({
        content: buildWorktreeNotice(getCwd(), worktreeInfo.worktreePath)
      }));
    }
    const runAgentParams = {
      agentDefinition: selectedAgent,
      promptMessages,
      toolUseContext,
      canUseTool,
      isAsync: shouldRunAsync,
      querySource: toolUseContext.options.querySource ?? getQuerySourceForAgent(selectedAgent.agentType, isBuiltInAgent(selectedAgent)),
      model: isForkPath ? void 0 : model,
      // Fork path: pass parent's system prompt AND parent's exact tool
      // array (cache-identical prefix). workerTools is rebuilt under
      // permissionMode 'bubble' which differs from the parent's mode, so
      // its tool-def serialization diverges and breaks cache at the first
      // differing tool. useExactTools also inherits the parent's
      // thinkingConfig and isNonInteractiveSession (see runAgent.ts).
      //
      // Normal path: when a cwd override is in effect (worktree isolation
      // or explicit cwd), skip the pre-built system prompt so runAgent's
      // buildAgentSystemPrompt() runs inside wrapWithCwd where getCwd()
      // returns the override path.
      override: isForkPath ? {
        systemPrompt: forkParentSystemPrompt
      } : enhancedSystemPrompt && !worktreeInfo && !cwd ? {
        systemPrompt: asSystemPrompt(enhancedSystemPrompt)
      } : void 0,
      availableTools: isForkPath ? toolUseContext.options.tools : workerTools,
      // Pass parent conversation when the fork-subagent path needs full
      // context. useExactTools inherits thinkingConfig (runAgent.ts:624).
      forkContextMessages: isForkPath ? toolUseContext.messages : void 0,
      ...isForkPath && {
        useExactTools: true
      },
      worktreePath: worktreeInfo?.worktreePath,
      description
    };
    const cwdOverridePath = cwd ?? worktreeInfo?.worktreePath;
    const wrapWithCwd = (fn) => cwdOverridePath ? runWithCwdOverride(cwdOverridePath, fn) : fn();
    const cleanupWorktreeIfNeeded = async () => {
      if (!worktreeInfo) return {};
      const {
        worktreePath,
        worktreeBranch,
        headCommit,
        gitRoot,
        hookBased
      } = worktreeInfo;
      worktreeInfo = null;
      if (hookBased) {
        logForDebugging(`Hook-based agent worktree kept at: ${worktreePath}`);
        return {
          worktreePath
        };
      }
      if (headCommit) {
        const changed = await hasWorktreeChanges(worktreePath, headCommit);
        if (!changed) {
          await removeAgentWorktree(worktreePath, worktreeBranch, gitRoot);
          void writeAgentMetadata(asAgentId(earlyAgentId), {
            agentType: selectedAgent.agentType,
            description
          }).catch((_err) => logForDebugging(`Failed to clear worktree metadata: ${_err}`));
          return {};
        }
      }
      logForDebugging(`Agent worktree has changes, keeping: ${worktreePath}`);
      return {
        worktreePath,
        worktreeBranch
      };
    };
    if (shouldRunAsync) {
      const asyncAgentId = earlyAgentId;
      const agentBackgroundTask = registerAsyncAgent({
        agentId: asyncAgentId,
        description,
        prompt,
        selectedAgent,
        setAppState: rootSetAppState,
        // Don't link to parent's abort controller -- background agents should
        // survive when the user presses ESC to cancel the main thread.
        // They are killed explicitly via chat:killAgents.
        toolUseId: toolUseContext.toolUseId
      });
      if (name) {
        rootSetAppState((prev) => {
          const next = new Map(prev.agentNameRegistry);
          next.set(name, asAgentId(asyncAgentId));
          return {
            ...prev,
            agentNameRegistry: next
          };
        });
      }
      const asyncAgentContext = {
        agentId: asyncAgentId,
        // For subagents from teammates: use team lead's session
        // For subagents from main REPL: undefined (no parent session)
        parentSessionId: getParentSessionId(),
        agentType: "subagent",
        subagentName: selectedAgent.agentType,
        isBuiltIn: isBuiltInAgent(selectedAgent),
        invokingRequestId: assistantMessage?.requestId,
        invocationKind: "spawn",
        invocationEmitted: false
      };
      void runWithAgentContext(asyncAgentContext, () => wrapWithCwd(() => runAsyncAgentLifecycle({
        taskId: agentBackgroundTask.agentId,
        abortController: agentBackgroundTask.abortController,
        makeStream: (onCacheSafeParams) => runAgent({
          ...runAgentParams,
          override: {
            ...runAgentParams.override,
            agentId: asAgentId(agentBackgroundTask.agentId),
            abortController: agentBackgroundTask.abortController
          },
          onCacheSafeParams
        }),
        metadata,
        description,
        toolUseContext,
        rootSetAppState,
        agentIdForCleanup: asyncAgentId,
        enableSummarization: isCoordinator || isForkSubagentEnabled() || getSdkAgentProgressSummariesEnabled(),
        getWorktreeResult: cleanupWorktreeIfNeeded
      })));
      const canReadOutputFile = toolUseContext.options.tools.some((t) => toolMatchesName(t, FILE_READ_TOOL_NAME) || toolMatchesName(t, BASH_TOOL_NAME));
      return {
        data: {
          isAsync: true,
          status: "async_launched",
          agentId: agentBackgroundTask.agentId,
          description,
          prompt,
          outputFile: getTaskOutputPath(agentBackgroundTask.agentId),
          canReadOutputFile
        }
      };
    } else {
      const syncAgentId = asAgentId(earlyAgentId);
      const syncAgentContext = {
        agentId: syncAgentId,
        // For subagents from teammates: use team lead's session
        // For subagents from main REPL: undefined (no parent session)
        parentSessionId: getParentSessionId(),
        agentType: "subagent",
        subagentName: selectedAgent.agentType,
        isBuiltIn: isBuiltInAgent(selectedAgent),
        invokingRequestId: assistantMessage?.requestId,
        invocationKind: "spawn",
        invocationEmitted: false
      };
      return runWithAgentContext(syncAgentContext, () => wrapWithCwd(async () => {
        const agentMessages = [];
        const agentStartTime = Date.now();
        const syncTracker = createProgressTracker();
        const syncResolveActivity = createActivityDescriptionResolver(toolUseContext.options.tools);
        if (promptMessages.length > 0) {
          const normalizedPromptMessages = normalizeMessages(promptMessages);
          const normalizedFirstMessage = normalizedPromptMessages.find((m) => m.type === "user");
          if (normalizedFirstMessage && normalizedFirstMessage.type === "user" && onProgress) {
            onProgress({
              toolUseID: `agent_${assistantMessage.message.id}`,
              data: {
                message: normalizedFirstMessage,
                type: "agent_progress",
                prompt,
                agentId: syncAgentId
              }
            });
          }
        }
        let foregroundTaskId;
        let backgroundPromise;
        let cancelAutoBackground;
        if (!isBackgroundTasksDisabled) {
          const registration = registerAgentForeground({
            agentId: syncAgentId,
            description,
            prompt,
            selectedAgent,
            setAppState: rootSetAppState,
            toolUseId: toolUseContext.toolUseId,
            autoBackgroundMs: getAutoBackgroundMs() || void 0
          });
          foregroundTaskId = registration.taskId;
          backgroundPromise = registration.backgroundSignal.then(() => ({
            type: "background"
          }));
          cancelAutoBackground = registration.cancelAutoBackground;
        }
        let backgroundHintShown = false;
        let wasBackgrounded = false;
        let stopForegroundSummarization;
        const summaryTaskId = foregroundTaskId;
        const agentIterator = runAgent({
          ...runAgentParams,
          override: {
            ...runAgentParams.override,
            agentId: syncAgentId
          },
          onCacheSafeParams: summaryTaskId && getSdkAgentProgressSummariesEnabled() ? (params) => {
            const {
              stop
            } = startAgentSummarization(summaryTaskId, syncAgentId, params, rootSetAppState);
            stopForegroundSummarization = stop;
          } : void 0
        })[Symbol.asyncIterator]();
        let syncAgentError;
        let wasAborted = false;
        let worktreeResult = {};
        try {
          while (true) {
            const elapsed = Date.now() - agentStartTime;
            if (!isBackgroundTasksDisabled && !backgroundHintShown && elapsed >= PROGRESS_THRESHOLD_MS && toolUseContext.setToolJSX) {
              backgroundHintShown = true;
              toolUseContext.setToolJSX({
                jsx: /* @__PURE__ */ jsx(BackgroundHint, {}),
                shouldHidePromptInput: false,
                shouldContinueAnimation: true,
                showSpinner: true
              });
            }
            const nextMessagePromise = agentIterator.next();
            const raceResult = backgroundPromise ? await Promise.race([nextMessagePromise.then((r) => ({
              type: "message",
              result: r
            })), backgroundPromise]) : {
              type: "message",
              result: await nextMessagePromise
            };
            if (raceResult.type === "background" && foregroundTaskId) {
              const appState2 = toolUseContext.getAppState();
              const task = appState2.tasks[foregroundTaskId];
              if (isLocalAgentTask(task) && task.isBackgrounded) {
                const backgroundedTaskId = foregroundTaskId;
                wasBackgrounded = true;
                stopForegroundSummarization?.();
                void runWithAgentContext(syncAgentContext, async () => {
                  let stopBackgroundedSummarization;
                  try {
                    await Promise.race([agentIterator.return(void 0).catch(() => {
                    }), sleep(1e3)]);
                    const tracker = createProgressTracker();
                    const resolveActivity2 = createActivityDescriptionResolver(toolUseContext.options.tools);
                    for (const existingMsg of agentMessages) {
                      updateProgressFromMessage(tracker, existingMsg, resolveActivity2, toolUseContext.options.tools);
                    }
                    for await (const msg of runAgent({
                      ...runAgentParams,
                      isAsync: true,
                      // Agent is now running in background
                      override: {
                        ...runAgentParams.override,
                        agentId: asAgentId(backgroundedTaskId),
                        abortController: task.abortController
                      },
                      onCacheSafeParams: getSdkAgentProgressSummariesEnabled() ? (params) => {
                        const {
                          stop
                        } = startAgentSummarization(backgroundedTaskId, asAgentId(backgroundedTaskId), params, rootSetAppState);
                        stopBackgroundedSummarization = stop;
                      } : void 0
                    })) {
                      agentMessages.push(msg);
                      updateProgressFromMessage(tracker, msg, resolveActivity2, toolUseContext.options.tools);
                      updateAsyncAgentProgress(backgroundedTaskId, getProgressUpdate(tracker), rootSetAppState);
                      const lastToolName = getLastToolUseName(msg);
                      if (lastToolName) {
                        emitTaskProgress(tracker, backgroundedTaskId, toolUseContext.toolUseId, description, startTime, lastToolName);
                      }
                    }
                    const agentResult2 = finalizeAgentTool(agentMessages, backgroundedTaskId, metadata);
                    completeAsyncAgent(agentResult2, rootSetAppState);
                    let finalMessage = extractTextContent(agentResult2.content, "\n");
                    if (false) {
                      const backgroundedAppState = toolUseContext.getAppState();
                      const handoffWarning = await classifyHandoffIfNeeded({
                        agentMessages,
                        tools: toolUseContext.options.tools,
                        toolPermissionContext: backgroundedAppState.toolPermissionContext,
                        abortSignal: task.abortController.signal,
                        subagentType: selectedAgent.agentType,
                        totalToolUseCount: agentResult2.totalToolUseCount
                      });
                      if (handoffWarning) {
                        finalMessage = `${handoffWarning}

${finalMessage}`;
                      }
                    }
                    const worktreeResult2 = await cleanupWorktreeIfNeeded();
                    enqueueAgentNotification({
                      taskId: backgroundedTaskId,
                      description,
                      status: "completed",
                      setAppState: rootSetAppState,
                      finalMessage,
                      usage: {
                        totalTokens: getTokenCountFromTracker(tracker),
                        toolUses: agentResult2.totalToolUseCount,
                        durationMs: agentResult2.totalDurationMs
                      },
                      toolUseId: toolUseContext.toolUseId,
                      ...worktreeResult2
                    });
                  } catch (error) {
                    if (error instanceof AbortError) {
                      killAsyncAgent(backgroundedTaskId, rootSetAppState);
                      logEvent("tengu_agent_tool_terminated", {
                        agent_type: metadata.agentType,
                        model: metadata.resolvedAgentModel,
                        duration_ms: Date.now() - metadata.startTime,
                        is_async: true,
                        is_built_in_agent: metadata.isBuiltInAgent,
                        reason: "user_cancel_background"
                      });
                      const worktreeResult3 = await cleanupWorktreeIfNeeded();
                      const partialResult = extractPartialResult(agentMessages);
                      enqueueAgentNotification({
                        taskId: backgroundedTaskId,
                        description,
                        status: "killed",
                        setAppState: rootSetAppState,
                        toolUseId: toolUseContext.toolUseId,
                        finalMessage: partialResult,
                        ...worktreeResult3
                      });
                      return;
                    }
                    const errMsg = errorMessage(error);
                    failAsyncAgent(backgroundedTaskId, errMsg, rootSetAppState);
                    const worktreeResult2 = await cleanupWorktreeIfNeeded();
                    enqueueAgentNotification({
                      taskId: backgroundedTaskId,
                      description,
                      status: "failed",
                      error: errMsg,
                      setAppState: rootSetAppState,
                      toolUseId: toolUseContext.toolUseId,
                      ...worktreeResult2
                    });
                  } finally {
                    stopBackgroundedSummarization?.();
                    clearInvokedSkillsForAgent(syncAgentId);
                    clearDumpState(syncAgentId);
                  }
                });
                const canReadOutputFile = toolUseContext.options.tools.some((t) => toolMatchesName(t, FILE_READ_TOOL_NAME) || toolMatchesName(t, BASH_TOOL_NAME));
                return {
                  data: {
                    isAsync: true,
                    status: "async_launched",
                    agentId: backgroundedTaskId,
                    description,
                    prompt,
                    outputFile: getTaskOutputPath(backgroundedTaskId),
                    canReadOutputFile
                  }
                };
              }
            }
            if (raceResult.type !== "message") {
              continue;
            }
            const {
              result
            } = raceResult;
            if (result.done) break;
            const message = result.value;
            agentMessages.push(message);
            updateProgressFromMessage(syncTracker, message, syncResolveActivity, toolUseContext.options.tools);
            if (foregroundTaskId) {
              const lastToolName = getLastToolUseName(message);
              if (lastToolName) {
                emitTaskProgress(syncTracker, foregroundTaskId, toolUseContext.toolUseId, description, agentStartTime, lastToolName);
                if (getSdkAgentProgressSummariesEnabled()) {
                  updateAsyncAgentProgress(foregroundTaskId, getProgressUpdate(syncTracker), rootSetAppState);
                }
              }
            }
            if (message.type === "progress" && (message.data.type === "bash_progress" || message.data.type === "powershell_progress") && onProgress) {
              onProgress({
                toolUseID: message.toolUseID,
                data: message.data
              });
            }
            if (message.type !== "assistant" && message.type !== "user") {
              continue;
            }
            if (message.type === "assistant") {
              const contentLength = getAssistantMessageContentLength(message);
              if (contentLength > 0) {
                toolUseContext.setResponseLength((len) => len + contentLength);
              }
            }
            const normalizedNew = normalizeMessages([message]);
            for (const m of normalizedNew) {
              for (const content of m.message.content) {
                if (content.type !== "tool_use" && content.type !== "tool_result") {
                  continue;
                }
                if (onProgress) {
                  onProgress({
                    toolUseID: `agent_${assistantMessage.message.id}`,
                    data: {
                      message: m,
                      type: "agent_progress",
                      // prompt only needed on first progress message (UI.tsx:624
                      // reads progressMessages[0]). Omit here to avoid duplication.
                      prompt: "",
                      agentId: syncAgentId
                    }
                  });
                }
              }
            }
          }
        } catch (error) {
          if (error instanceof AbortError) {
            wasAborted = true;
            logEvent("tengu_agent_tool_terminated", {
              agent_type: metadata.agentType,
              model: metadata.resolvedAgentModel,
              duration_ms: Date.now() - metadata.startTime,
              is_async: false,
              is_built_in_agent: metadata.isBuiltInAgent,
              reason: "user_cancel_sync"
            });
            throw error;
          }
          logForDebugging(`Sync agent error: ${errorMessage(error)}`, {
            level: "error"
          });
          syncAgentError = toError(error);
        } finally {
          if (toolUseContext.setToolJSX) {
            toolUseContext.setToolJSX(null);
          }
          stopForegroundSummarization?.();
          if (foregroundTaskId) {
            unregisterAgentForeground(foregroundTaskId, rootSetAppState);
            if (!wasBackgrounded) {
              const progress = getProgressUpdate(syncTracker);
              enqueueSdkEvent({
                type: "system",
                subtype: "task_notification",
                task_id: foregroundTaskId,
                tool_use_id: toolUseContext.toolUseId,
                status: syncAgentError ? "failed" : wasAborted ? "stopped" : "completed",
                output_file: "",
                summary: description,
                usage: {
                  total_tokens: progress.tokenCount,
                  tool_uses: progress.toolUseCount,
                  duration_ms: Date.now() - agentStartTime
                }
              });
            }
          }
          clearInvokedSkillsForAgent(syncAgentId);
          if (!wasBackgrounded) {
            clearDumpState(syncAgentId);
          }
          cancelAutoBackground?.();
          if (!wasBackgrounded) {
            worktreeResult = await cleanupWorktreeIfNeeded();
          }
        }
        const lastMessage = agentMessages.findLast((_) => _.type !== "system" && _.type !== "progress");
        if (lastMessage && isSyntheticMessage(lastMessage)) {
          logEvent("tengu_agent_tool_terminated", {
            agent_type: metadata.agentType,
            model: metadata.resolvedAgentModel,
            duration_ms: Date.now() - metadata.startTime,
            is_async: false,
            is_built_in_agent: metadata.isBuiltInAgent,
            reason: "user_cancel_sync"
          });
          throw new AbortError();
        }
        if (syncAgentError) {
          const hasAssistantMessages = agentMessages.some((msg) => msg.type === "assistant");
          if (!hasAssistantMessages) {
            throw syncAgentError;
          }
          logForDebugging(`Sync agent recovering from error with ${agentMessages.length} messages`);
        }
        const agentResult = finalizeAgentTool(agentMessages, syncAgentId, metadata);
        if (false) {
          const currentAppState = toolUseContext.getAppState();
          const handoffWarning = await classifyHandoffIfNeeded({
            agentMessages,
            tools: toolUseContext.options.tools,
            toolPermissionContext: currentAppState.toolPermissionContext,
            abortSignal: toolUseContext.abortController.signal,
            subagentType: selectedAgent.agentType,
            totalToolUseCount: agentResult.totalToolUseCount
          });
          if (handoffWarning) {
            agentResult.content = [{
              type: "text",
              text: handoffWarning
            }, ...agentResult.content];
          }
        }
        return {
          data: {
            status: "completed",
            prompt,
            ...agentResult,
            ...worktreeResult
          }
        };
      }));
    }
  },
  isReadOnly() {
    return true;
  },
  toAutoClassifierInput(input) {
    const i = input;
    const tags = [i.subagent_type, i.mode ? `mode=${i.mode}` : void 0].filter((t) => t !== void 0);
    const prefix = tags.length > 0 ? `(${tags.join(", ")}): ` : ": ";
    return `${prefix}${i.prompt}`;
  },
  isConcurrencySafe() {
    return true;
  },
  userFacingName,
  userFacingNameBackgroundColor,
  getActivityDescription(input) {
    return input?.description ?? "Running task";
  },
  async checkPermissions(input, context) {
    const appState = context.getAppState();
    if (false) {
      return {
        behavior: "passthrough",
        message: "Agent tool requires permission to spawn sub-agents."
      };
    }
    return {
      behavior: "allow",
      updatedInput: input
    };
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    const internalData = data;
    if (typeof internalData === "object" && internalData !== null && "status" in internalData && internalData.status === "teammate_spawned") {
      const spawnData = internalData;
      return {
        tool_use_id: toolUseID,
        type: "tool_result",
        content: [{
          type: "text",
          text: `Spawned successfully.
agent_id: ${spawnData.teammate_id}
name: ${spawnData.name}
team_name: ${spawnData.team_name}
The agent is now running and will receive instructions via mailbox.`
        }]
      };
    }
    if ("status" in internalData && internalData.status === "remote_launched") {
      const r = internalData;
      return {
        tool_use_id: toolUseID,
        type: "tool_result",
        content: [{
          type: "text",
          text: `Remote agent launched in CCR.
taskId: ${r.taskId}
session_url: ${r.sessionUrl}
output_file: ${r.outputFile}
The agent is running remotely. You will be notified automatically when it completes.
Briefly tell the user what you launched and end your response.`
        }]
      };
    }
    if (data.status === "async_launched") {
      const prefix = `Async agent launched successfully.
agentId: ${data.agentId} (internal ID - do not mention to user. Use SendMessage with to: '${data.agentId}' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes.`;
      const instructions = data.canReadOutputFile ? `Do not duplicate this agent's work \u2014 avoid working with the same files or topics it is using. Work on non-overlapping tasks, or briefly tell the user what you launched and end your response.
output_file: ${data.outputFile}
If asked, you can check progress before completion by using ${FILE_READ_TOOL_NAME} or ${BASH_TOOL_NAME} tail on the output file.` : `Briefly tell the user what you launched and end your response. Do not generate any other text \u2014 agent results will arrive in a subsequent message.`;
      const text = `${prefix}
${instructions}`;
      return {
        tool_use_id: toolUseID,
        type: "tool_result",
        content: [{
          type: "text",
          text
        }]
      };
    }
    if (data.status === "completed") {
      const worktreeData = data;
      const worktreeInfoText = worktreeData.worktreePath ? `
worktreePath: ${worktreeData.worktreePath}
worktreeBranch: ${worktreeData.worktreeBranch}` : "";
      const contentOrMarker = data.content.length > 0 ? data.content : [{
        type: "text",
        text: "(Subagent completed but returned no output.)"
      }];
      if (data.agentType && ONE_SHOT_BUILTIN_AGENT_TYPES.has(data.agentType) && !worktreeInfoText) {
        return {
          tool_use_id: toolUseID,
          type: "tool_result",
          content: contentOrMarker
        };
      }
      return {
        tool_use_id: toolUseID,
        type: "tool_result",
        content: [...contentOrMarker, {
          type: "text",
          text: `agentId: ${data.agentId} (use SendMessage with to: '${data.agentId}' to continue this agent)${worktreeInfoText}
<usage>total_tokens: ${data.totalTokens}
tool_uses: ${data.totalToolUseCount}
duration_ms: ${data.totalDurationMs}</usage>`
        }]
      };
    }
    data;
    throw new Error(`Unexpected agent tool result status: ${data.status}`);
  },
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseTag,
  renderToolUseProgressMessage,
  renderToolUseRejectedMessage,
  renderToolUseErrorMessage,
  renderGroupedToolUse: renderGroupedAgentToolUse
});
function resolveTeamName(input, appState) {
  if (!isAgentSwarmsEnabled()) return void 0;
  return input.team_name || appState.teamContext?.teamName;
}
export {
  AgentTool,
  inputSchema,
  outputSchema
};
