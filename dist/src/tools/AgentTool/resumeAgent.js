import { promises as fsp } from "fs";
import { getSdkAgentProgressSummariesEnabled } from "../../bootstrap/state.js";
import { getSystemPrompt } from "../../constants/prompts.js";
import { isCoordinatorMode } from "../../coordinator/coordinatorMode.js";
import { registerAsyncAgent } from "../../tasks/LocalAgentTask/LocalAgentTask.js";
import { assembleToolPool } from "../../tools.js";
import { asAgentId } from "../../types/ids.js";
import { runWithAgentContext } from "../../utils/agentContext.js";
import { runWithCwdOverride } from "../../utils/cwd.js";
import { logForDebugging } from "../../utils/debug.js";
import {
  createUserMessage,
  filterOrphanedThinkingOnlyMessages,
  filterUnresolvedToolUses,
  filterWhitespaceOnlyAssistantMessages
} from "../../utils/messages.js";
import { getAgentModel } from "../../utils/model/agent.js";
import { getQuerySourceForAgent } from "../../utils/promptCategory.js";
import {
  getAgentTranscript,
  readAgentMetadata
} from "../../utils/sessionStorage.js";
import { buildEffectiveSystemPrompt } from "../../utils/systemPrompt.js";
import { getTaskOutputPath } from "../../utils/task/diskOutput.js";
import { getParentSessionId } from "../../utils/teammate.js";
import { reconstructForSubagentResume } from "../../utils/toolResultStorage.js";
import { runAsyncAgentLifecycle } from "./agentToolUtils.js";
import { GENERAL_PURPOSE_AGENT } from "./built-in/generalPurposeAgent.js";
import { FORK_AGENT, isForkSubagentEnabled } from "./forkSubagent.js";
import { isBuiltInAgent } from "./loadAgentsDir.js";
import { runAgent } from "./runAgent.js";
async function resumeAgentBackground({
  agentId,
  prompt,
  toolUseContext,
  canUseTool,
  invokingRequestId
}) {
  const startTime = Date.now();
  const appState = toolUseContext.getAppState();
  const rootSetAppState = toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState;
  const permissionMode = appState.toolPermissionContext.mode;
  const [transcript, meta] = await Promise.all([
    getAgentTranscript(asAgentId(agentId)),
    readAgentMetadata(asAgentId(agentId))
  ]);
  if (!transcript) {
    throw new Error(`No transcript found for agent ID: ${agentId}`);
  }
  const resumedMessages = filterWhitespaceOnlyAssistantMessages(
    filterOrphanedThinkingOnlyMessages(
      filterUnresolvedToolUses(transcript.messages)
    )
  );
  const resumedReplacementState = reconstructForSubagentResume(
    toolUseContext.contentReplacementState,
    resumedMessages,
    transcript.contentReplacements
  );
  const resumedWorktreePath = meta?.worktreePath ? await fsp.stat(meta.worktreePath).then(
    (s) => s.isDirectory() ? meta.worktreePath : void 0,
    () => {
      logForDebugging(
        `Resumed worktree ${meta.worktreePath} no longer exists; falling back to parent cwd`
      );
      return void 0;
    }
  ) : void 0;
  if (resumedWorktreePath) {
    const now = /* @__PURE__ */ new Date();
    await fsp.utimes(resumedWorktreePath, now, now);
  }
  let selectedAgent;
  let isResumedFork = false;
  if (meta?.agentType === FORK_AGENT.agentType) {
    selectedAgent = FORK_AGENT;
    isResumedFork = true;
  } else if (meta?.agentType) {
    const found = toolUseContext.options.agentDefinitions.activeAgents.find(
      (a) => a.agentType === meta.agentType
    );
    selectedAgent = found ?? GENERAL_PURPOSE_AGENT;
  } else {
    selectedAgent = GENERAL_PURPOSE_AGENT;
  }
  const uiDescription = meta?.description ?? "(resumed)";
  let forkParentSystemPrompt;
  if (isResumedFork) {
    if (toolUseContext.renderedSystemPrompt) {
      forkParentSystemPrompt = toolUseContext.renderedSystemPrompt;
    } else {
      const mainThreadAgentDefinition = appState.agent ? appState.agentDefinitions.activeAgents.find(
        (a) => a.agentType === appState.agent
      ) : void 0;
      const additionalWorkingDirectories = Array.from(
        appState.toolPermissionContext.additionalWorkingDirectories.keys()
      );
      const defaultSystemPrompt = await getSystemPrompt(
        toolUseContext.options.tools,
        toolUseContext.options.mainLoopModel,
        additionalWorkingDirectories,
        toolUseContext.options.mcpClients
      );
      forkParentSystemPrompt = buildEffectiveSystemPrompt({
        mainThreadAgentDefinition,
        toolUseContext,
        customSystemPrompt: toolUseContext.options.customSystemPrompt,
        defaultSystemPrompt,
        appendSystemPrompt: toolUseContext.options.appendSystemPrompt
      });
    }
    if (!forkParentSystemPrompt) {
      throw new Error(
        "Cannot resume fork agent: unable to reconstruct parent system prompt"
      );
    }
  }
  const resolvedAgentModel = getAgentModel(
    selectedAgent.model,
    toolUseContext.options.mainLoopModel,
    void 0,
    permissionMode
  );
  const workerPermissionContext = {
    ...appState.toolPermissionContext,
    mode: selectedAgent.permissionMode ?? "acceptEdits"
  };
  const workerTools = isResumedFork ? toolUseContext.options.tools : assembleToolPool(workerPermissionContext, appState.mcp.tools);
  const runAgentParams = {
    agentDefinition: selectedAgent,
    promptMessages: [
      ...resumedMessages,
      createUserMessage({ content: prompt })
    ],
    toolUseContext,
    canUseTool,
    isAsync: true,
    querySource: getQuerySourceForAgent(
      selectedAgent.agentType,
      isBuiltInAgent(selectedAgent)
    ),
    model: void 0,
    // Fork resume: pass parent's system prompt (cache-identical prefix).
    // Non-fork: undefined → runAgent recomputes under wrapWithCwd so
    // getCwd() sees resumedWorktreePath.
    override: isResumedFork ? { systemPrompt: forkParentSystemPrompt } : void 0,
    availableTools: workerTools,
    // Transcript already contains the parent context slice from the
    // original fork. Re-supplying it would cause duplicate tool_use IDs.
    forkContextMessages: void 0,
    ...isResumedFork && { useExactTools: true },
    // Re-persist so metadata survives runAgent's writeAgentMetadata overwrite
    worktreePath: resumedWorktreePath,
    description: meta?.description,
    contentReplacementState: resumedReplacementState
  };
  const agentBackgroundTask = registerAsyncAgent({
    agentId,
    description: uiDescription,
    prompt,
    selectedAgent,
    setAppState: rootSetAppState,
    toolUseId: toolUseContext.toolUseId
  });
  const metadata = {
    prompt,
    resolvedAgentModel,
    isBuiltInAgent: isBuiltInAgent(selectedAgent),
    startTime,
    agentType: selectedAgent.agentType,
    isAsync: true
  };
  const asyncAgentContext = {
    agentId,
    parentSessionId: getParentSessionId(),
    agentType: "subagent",
    subagentName: selectedAgent.agentType,
    isBuiltIn: isBuiltInAgent(selectedAgent),
    invokingRequestId,
    invocationKind: "resume",
    invocationEmitted: false
  };
  const wrapWithCwd = (fn) => resumedWorktreePath ? runWithCwdOverride(resumedWorktreePath, fn) : fn();
  void runWithAgentContext(
    asyncAgentContext,
    () => wrapWithCwd(
      () => runAsyncAgentLifecycle({
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
        description: uiDescription,
        toolUseContext,
        rootSetAppState,
        agentIdForCleanup: agentId,
        enableSummarization: isCoordinatorMode() || isForkSubagentEnabled() || getSdkAgentProgressSummariesEnabled(),
        getWorktreeResult: async () => resumedWorktreePath ? { worktreePath: resumedWorktreePath } : {}
      })
    )
  );
  return {
    agentId,
    description: uiDescription,
    outputFile: getTaskOutputPath(agentId)
  };
}
export {
  resumeAgentBackground
};
