const feature = (_name) => false;
import { dirname } from "path";
import {
  getMainLoopModelOverride,
  getSessionId,
  setMainLoopModelOverride,
  setMainThreadAgentType,
  setOriginalCwd,
  switchSession
} from "../bootstrap/state.js";
import { clearSystemPromptSections } from "../constants/systemPromptSections.js";
import { restoreCostStateForSession } from "../cost-tracker.js";
import {
  getActiveAgentsFromList,
  getAgentDefinitionsWithOverrides
} from "../tools/AgentTool/loadAgentsDir.js";
import { TODO_WRITE_TOOL_NAME } from "../tools/TodoWriteTool/constants.js";
import { asSessionId } from "../types/ids.js";
import { renameRecordingForSession } from "./asciicast.js";
import { clearMemoryFileCaches } from "./claudemd.js";
import "./commitAttribution.js";
import { updateSessionName } from "./concurrentSessions.js";
import { getCwd } from "./cwd.js";
import { logForDebugging } from "./debug.js";
import { fileHistoryRestoreStateFromLog } from "./fileHistory.js";
import "./messages.js";
import { parseUserSpecifiedModel } from "./model/model.js";
import { getPlansDirectory } from "./plans.js";
import { setCwd } from "./Shell.js";
import {
  adoptResumedSessionFile,
  recordContentReplacement,
  resetSessionFilePointer,
  restoreSessionMetadata,
  saveWorktreeState
} from "./sessionStorage.js";
import { isTodoV2Enabled } from "./tasks.js";
import { TodoListSchema } from "./todo/types.js";
import {
  getCurrentWorktreeSession,
  restoreWorktreeSession
} from "./worktree.js";
function extractTodosFromTranscript(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.type !== "assistant") continue;
    const toolUse = msg.message.content.find(
      (block) => block.type === "tool_use" && block.name === TODO_WRITE_TOOL_NAME
    );
    if (!toolUse || toolUse.type !== "tool_use") continue;
    const input = toolUse.input;
    if (input === null || typeof input !== "object") return [];
    const parsed = TodoListSchema().safeParse(
      input.todos
    );
    return parsed.success ? parsed.data : [];
  }
  return [];
}
function restoreSessionStateFromLog(result, setAppState) {
  if (result.fileHistorySnapshots && result.fileHistorySnapshots.length > 0) {
    fileHistoryRestoreStateFromLog(result.fileHistorySnapshots, (newState) => {
      setAppState((prev) => ({ ...prev, fileHistory: newState }));
    });
  }
  if (false) {
    attributionRestoreStateFromLog(result.attributionSnapshots, (newState) => {
      setAppState((prev) => ({ ...prev, attribution: newState }));
    });
  }
  if (false) {
    ;
    null.restoreFromEntries(
      result.contextCollapseCommits ?? [],
      result.contextCollapseSnapshot
    );
  }
  if (!isTodoV2Enabled() && result.messages && result.messages.length > 0) {
    const todos = extractTodosFromTranscript(result.messages);
    if (todos.length > 0) {
      const agentId = getSessionId();
      setAppState((prev) => ({
        ...prev,
        todos: { ...prev.todos, [agentId]: todos }
      }));
    }
  }
}
function computeRestoredAttributionState(result) {
  if (false) {
    return restoreAttributionStateFromSnapshots(result.attributionSnapshots);
  }
  return void 0;
}
function computeStandaloneAgentContext(agentName, agentColor) {
  if (!agentName && !agentColor) {
    return void 0;
  }
  return {
    name: agentName ?? "",
    color: agentColor === "default" ? void 0 : agentColor
  };
}
function restoreAgentFromSession(agentSetting, currentAgentDefinition, agentDefinitions) {
  if (currentAgentDefinition) {
    return { agentDefinition: currentAgentDefinition, agentType: void 0 };
  }
  if (!agentSetting) {
    setMainThreadAgentType(void 0);
    return { agentDefinition: void 0, agentType: void 0 };
  }
  const resumedAgent = agentDefinitions.activeAgents.find(
    (agent) => agent.agentType === agentSetting
  );
  if (!resumedAgent) {
    logForDebugging(
      `Resumed session had agent "${agentSetting}" but it is no longer available. Using default behavior.`
    );
    setMainThreadAgentType(void 0);
    return { agentDefinition: void 0, agentType: void 0 };
  }
  setMainThreadAgentType(resumedAgent.agentType);
  if (!getMainLoopModelOverride() && resumedAgent.model && resumedAgent.model !== "inherit") {
    setMainLoopModelOverride(parseUserSpecifiedModel(resumedAgent.model));
  }
  return { agentDefinition: resumedAgent, agentType: resumedAgent.agentType };
}
async function refreshAgentDefinitionsForModeSwitch(modeWasSwitched, currentCwd, cliAgents, currentAgentDefinitions) {
  if (true) {
    return currentAgentDefinitions;
  }
  getAgentDefinitionsWithOverrides.cache.clear?.();
  const freshAgentDefs = await getAgentDefinitionsWithOverrides(currentCwd);
  const freshAllAgents = [...freshAgentDefs.allAgents, ...cliAgents];
  return {
    ...freshAgentDefs,
    allAgents: freshAllAgents,
    activeAgents: getActiveAgentsFromList(freshAllAgents)
  };
}
function restoreWorktreeForResume(worktreeSession) {
  const fresh = getCurrentWorktreeSession();
  if (fresh) {
    saveWorktreeState(fresh);
    return;
  }
  if (!worktreeSession) return;
  try {
    process.chdir(worktreeSession.worktreePath);
  } catch {
    saveWorktreeState(null);
    return;
  }
  setCwd(worktreeSession.worktreePath);
  setOriginalCwd(getCwd());
  restoreWorktreeSession(worktreeSession);
  clearMemoryFileCaches();
  clearSystemPromptSections();
  getPlansDirectory.cache.clear?.();
}
function exitRestoredWorktree() {
  const current = getCurrentWorktreeSession();
  if (!current) return;
  restoreWorktreeSession(null);
  clearMemoryFileCaches();
  clearSystemPromptSections();
  getPlansDirectory.cache.clear?.();
  try {
    process.chdir(current.originalCwd);
  } catch {
    return;
  }
  setCwd(current.originalCwd);
  setOriginalCwd(getCwd());
}
async function processResumedConversation(result, opts, context) {
  let modeWarning;
  if (false) {
    modeWarning = context.modeApi?.matchSessionMode(result.mode);
    if (modeWarning) {
      result.messages.push(createSystemMessage(modeWarning, "warning"));
    }
  }
  if (!opts.forkSession) {
    const sid = opts.sessionIdOverride ?? result.sessionId;
    if (sid) {
      switchSession(
        asSessionId(sid),
        opts.transcriptPath ? dirname(opts.transcriptPath) : null
      );
      await renameRecordingForSession();
      await resetSessionFilePointer();
      restoreCostStateForSession(sid);
    }
  } else if (result.contentReplacements?.length) {
    await recordContentReplacement(result.contentReplacements);
  }
  restoreSessionMetadata(
    opts.forkSession ? { ...result, worktreeSession: void 0 } : result
  );
  if (!opts.forkSession) {
    restoreWorktreeForResume(result.worktreeSession);
    adoptResumedSessionFile();
  }
  if (false) {
    ;
    null.restoreFromEntries(
      result.contextCollapseCommits ?? [],
      result.contextCollapseSnapshot
    );
  }
  const { agentDefinition: restoredAgent, agentType: resumedAgentType } = restoreAgentFromSession(
    result.agentSetting,
    context.mainThreadAgentDefinition,
    context.agentDefinitions
  );
  if (false) {
    saveMode(context.modeApi?.isCoordinatorMode() ? "coordinator" : "normal");
  }
  const restoredAttribution = opts.includeAttribution ? computeRestoredAttributionState(result) : void 0;
  const standaloneAgentContext = computeStandaloneAgentContext(
    result.agentName,
    result.agentColor
  );
  void updateSessionName(result.agentName);
  const refreshedAgentDefs = await refreshAgentDefinitionsForModeSwitch(
    !!modeWarning,
    context.currentCwd,
    context.cliAgents,
    context.agentDefinitions
  );
  return {
    messages: result.messages,
    fileHistorySnapshots: result.fileHistorySnapshots,
    contentReplacements: result.contentReplacements,
    agentName: result.agentName,
    agentColor: result.agentColor === "default" ? void 0 : result.agentColor,
    restoredAgentDef: restoredAgent,
    initialState: {
      ...context.initialState,
      ...resumedAgentType && { agent: resumedAgentType },
      ...restoredAttribution && { attribution: restoredAttribution },
      ...standaloneAgentContext && { standaloneAgentContext },
      agentDefinitions: refreshedAgentDefs
    }
  };
}
export {
  computeRestoredAttributionState,
  computeStandaloneAgentContext,
  exitRestoredWorktree,
  processResumedConversation,
  refreshAgentDefinitionsForModeSwitch,
  restoreAgentFromSession,
  restoreSessionStateFromLog,
  restoreWorktreeForResume
};
