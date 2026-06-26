const feature = (_name) => false;
import { randomUUID } from "crypto";
import {
  getLastMainRequestId,
  getOriginalCwd,
  getSessionId,
  regenerateSessionId
} from "../../bootstrap/state.js";
import {
  logEvent
} from "../../services/analytics/index.js";
import { isInProcessTeammateTask } from "../../tasks/InProcessTeammateTask/types.js";
import {
  isLocalAgentTask
} from "../../tasks/LocalAgentTask/LocalAgentTask.js";
import { isLocalShellTask } from "../../tasks/LocalShellTask/guards.js";
import { asAgentId } from "../../types/ids.js";
import { createEmptyAttributionState } from "../../utils/commitAttribution.js";
import {
  executeSessionEndHooks,
  getSessionEndHookTimeoutMs
} from "../../utils/hooks.js";
import { logError } from "../../utils/log.js";
import { clearAllPlanSlugs } from "../../utils/plans.js";
import { setCwd } from "../../utils/Shell.js";
import { processSessionStartHooks } from "../../utils/sessionStart.js";
import {
  clearSessionMetadata,
  getAgentTranscriptPath,
  resetSessionFilePointer,
  saveWorktreeState
} from "../../utils/sessionStorage.js";
import {
  evictTaskOutput,
  initTaskOutputAsSymlink
} from "../../utils/task/diskOutput.js";
import { getCurrentWorktreeSession } from "../../utils/worktree.js";
import { clearSessionCaches } from "./caches.js";
async function clearConversation({
  setMessages,
  readFileState,
  discoveredSkillNames,
  loadedNestedMemoryPaths,
  getAppState,
  setAppState,
  setConversationId
}) {
  const sessionEndTimeoutMs = getSessionEndHookTimeoutMs();
  await executeSessionEndHooks("clear", {
    getAppState,
    setAppState,
    signal: AbortSignal.timeout(sessionEndTimeoutMs),
    timeoutMs: sessionEndTimeoutMs
  });
  const lastRequestId = getLastMainRequestId();
  if (lastRequestId) {
    logEvent("tengu_cache_eviction_hint", {
      scope: "conversation_clear",
      last_request_id: lastRequestId
    });
  }
  const preservedAgentIds = /* @__PURE__ */ new Set();
  const preservedLocalAgents = [];
  const shouldKillTask = (task) => "isBackgrounded" in task && task.isBackgrounded === false;
  if (getAppState) {
    for (const task of Object.values(getAppState().tasks)) {
      if (shouldKillTask(task)) continue;
      if (isLocalAgentTask(task)) {
        preservedAgentIds.add(task.agentId);
        preservedLocalAgents.push(task);
      } else if (isInProcessTeammateTask(task)) {
        preservedAgentIds.add(task.identity.agentId);
      }
    }
  }
  setMessages(() => []);
  if (false) {
    const { setContextBlocked } = null;
    setContextBlocked(false);
  }
  if (setConversationId) {
    setConversationId(randomUUID());
  }
  clearSessionCaches(preservedAgentIds);
  setCwd(getOriginalCwd());
  readFileState.clear();
  discoveredSkillNames?.clear();
  loadedNestedMemoryPaths?.clear();
  if (setAppState) {
    setAppState((prev) => {
      const nextTasks = {};
      for (const [taskId, task] of Object.entries(prev.tasks)) {
        if (!shouldKillTask(task)) {
          nextTasks[taskId] = task;
          continue;
        }
        try {
          if (task.status === "running") {
            if (isLocalShellTask(task)) {
              task.shellCommand?.kill();
              task.shellCommand?.cleanup();
              if (task.cleanupTimeoutId) {
                clearTimeout(task.cleanupTimeoutId);
              }
            }
            if ("abortController" in task) {
              task.abortController?.abort();
            }
            if ("unregisterCleanup" in task) {
              task.unregisterCleanup?.();
            }
          }
        } catch (error) {
          logError(error);
        }
        void evictTaskOutput(taskId);
      }
      return {
        ...prev,
        tasks: nextTasks,
        attribution: createEmptyAttributionState(),
        // Clear standalone agent context (name/color set by /rename, /color)
        // so the new session doesn't display the old session's identity badge
        standaloneAgentContext: void 0,
        fileHistory: {
          snapshots: [],
          trackedFiles: /* @__PURE__ */ new Set(),
          snapshotSequence: 0
        },
        // Reset MCP state to default to trigger re-initialization.
        // Preserve pluginReconnectKey so /clear doesn't cause a no-op
        // (it's only bumped by /reload-plugins).
        mcp: {
          clients: [],
          tools: [],
          commands: [],
          resources: {},
          pluginReconnectKey: prev.mcp.pluginReconnectKey
        }
      };
    });
  }
  clearAllPlanSlugs();
  clearSessionMetadata();
  regenerateSessionId({ setCurrentAsParent: true });
  if (process.env.USER_TYPE === "ant" && process.env.CLAUDE_CODE_SESSION_ID) {
    process.env.CLAUDE_CODE_SESSION_ID = getSessionId();
  }
  await resetSessionFilePointer();
  for (const task of preservedLocalAgents) {
    if (task.status !== "running") continue;
    void initTaskOutputAsSymlink(
      task.id,
      getAgentTranscriptPath(asAgentId(task.agentId))
    );
  }
  if (false) {
    const { saveMode } = null;
    const {
      isCoordinatorMode
    } = null;
    saveMode(isCoordinatorMode() ? "coordinator" : "normal");
  }
  const worktreeSession = getCurrentWorktreeSession();
  if (worktreeSession) {
    saveWorktreeState(worktreeSession);
  }
  const hookMessages = await processSessionStartHooks("clear");
  if (hookMessages.length > 0) {
    setMessages(() => hookMessages);
  }
}
export {
  clearConversation
};
