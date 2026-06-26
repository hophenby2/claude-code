import sample from "lodash-es/sample.js";
import { getSessionId } from "../../bootstrap/state.js";
import { getSpinnerVerbs } from "../../constants/spinnerVerbs.js";
import { TURN_COMPLETION_VERBS } from "../../constants/turnCompletionVerbs.js";
import { createTaskStateBase, generateTaskId } from "../../Task.js";
import { createAbortController } from "../abortController.js";
import { formatAgentId } from "../agentId.js";
import { registerCleanup } from "../cleanupRegistry.js";
import { logForDebugging } from "../debug.js";
import { emitTaskTerminatedSdk } from "../sdkEventQueue.js";
import { evictTaskOutput } from "../task/diskOutput.js";
import {
  evictTerminalTask,
  registerTask,
  STOPPED_DISPLAY_MS
} from "../task/framework.js";
import { createTeammateContext } from "../teammateContext.js";
import {
  isPerfettoTracingEnabled,
  registerAgent as registerPerfettoAgent,
  unregisterAgent as unregisterPerfettoAgent
} from "../telemetry/perfettoTracing.js";
import { removeMemberByAgentId } from "./teamHelpers.js";
async function spawnInProcessTeammate(config, context) {
  const { name, teamName, prompt, color, planModeRequired, model } = config;
  const { setAppState } = context;
  const agentId = formatAgentId(name, teamName);
  const taskId = generateTaskId("in_process_teammate");
  logForDebugging(
    `[spawnInProcessTeammate] Spawning ${agentId} (taskId: ${taskId})`
  );
  try {
    const abortController = createAbortController();
    const parentSessionId = getSessionId();
    const identity = {
      agentId,
      agentName: name,
      teamName,
      color,
      planModeRequired,
      parentSessionId
    };
    const teammateContext = createTeammateContext({
      agentId,
      agentName: name,
      teamName,
      color,
      planModeRequired,
      parentSessionId,
      abortController
    });
    if (isPerfettoTracingEnabled()) {
      registerPerfettoAgent(agentId, name, parentSessionId);
    }
    const description = `${name}: ${prompt.substring(0, 50)}${prompt.length > 50 ? "..." : ""}`;
    const taskState = {
      ...createTaskStateBase(
        taskId,
        "in_process_teammate",
        description,
        context.toolUseId
      ),
      type: "in_process_teammate",
      status: "running",
      identity,
      prompt,
      model,
      abortController,
      awaitingPlanApproval: false,
      spinnerVerb: sample(getSpinnerVerbs()),
      pastTenseVerb: sample(TURN_COMPLETION_VERBS),
      permissionMode: planModeRequired ? "plan" : "default",
      isIdle: false,
      shutdownRequested: false,
      lastReportedToolCount: 0,
      lastReportedTokenCount: 0,
      pendingUserMessages: [],
      messages: []
      // Initialize to empty array so getDisplayedMessages works immediately
    };
    const unregisterCleanup = registerCleanup(async () => {
      logForDebugging(`[spawnInProcessTeammate] Cleanup called for ${agentId}`);
      abortController.abort();
    });
    taskState.unregisterCleanup = unregisterCleanup;
    registerTask(taskState, setAppState);
    logForDebugging(
      `[spawnInProcessTeammate] Registered ${agentId} in AppState`
    );
    return {
      success: true,
      agentId,
      taskId,
      abortController,
      teammateContext
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error during spawn";
    logForDebugging(
      `[spawnInProcessTeammate] Failed to spawn ${agentId}: ${errorMessage}`
    );
    return {
      success: false,
      agentId,
      error: errorMessage
    };
  }
}
function killInProcessTeammate(taskId, setAppState) {
  let killed = false;
  let teamName = null;
  let agentId = null;
  let toolUseId;
  let description;
  setAppState((prev) => {
    const task = prev.tasks[taskId];
    if (!task || task.type !== "in_process_teammate") {
      return prev;
    }
    const teammateTask = task;
    if (teammateTask.status !== "running") {
      return prev;
    }
    teamName = teammateTask.identity.teamName;
    agentId = teammateTask.identity.agentId;
    toolUseId = teammateTask.toolUseId;
    description = teammateTask.description;
    teammateTask.abortController?.abort();
    teammateTask.unregisterCleanup?.();
    killed = true;
    teammateTask.onIdleCallbacks?.forEach((cb) => cb());
    let updatedTeamContext = prev.teamContext;
    if (prev.teamContext && prev.teamContext.teammates && agentId) {
      const { [agentId]: _, ...remainingTeammates } = prev.teamContext.teammates;
      updatedTeamContext = {
        ...prev.teamContext,
        teammates: remainingTeammates
      };
    }
    return {
      ...prev,
      teamContext: updatedTeamContext,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...teammateTask,
          status: "killed",
          notified: true,
          endTime: Date.now(),
          onIdleCallbacks: [],
          // Clear callbacks to prevent stale references
          messages: teammateTask.messages?.length ? [teammateTask.messages[teammateTask.messages.length - 1]] : void 0,
          pendingUserMessages: [],
          inProgressToolUseIDs: void 0,
          abortController: void 0,
          unregisterCleanup: void 0,
          currentWorkAbortController: void 0
        }
      }
    };
  });
  if (teamName && agentId) {
    removeMemberByAgentId(teamName, agentId);
  }
  if (killed) {
    void evictTaskOutput(taskId);
    emitTaskTerminatedSdk(taskId, "stopped", {
      toolUseId,
      summary: description
    });
    setTimeout(
      evictTerminalTask.bind(null, taskId, setAppState),
      STOPPED_DISPLAY_MS
    );
  }
  if (agentId) {
    unregisterPerfettoAgent(agentId);
  }
  return killed;
}
export {
  killInProcessTeammate,
  spawnInProcessTeammate
};
