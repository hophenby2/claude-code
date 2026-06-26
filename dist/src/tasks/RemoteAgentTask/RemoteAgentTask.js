import { getRemoteSessionUrl } from "../../constants/product.js";
import { OUTPUT_FILE_TAG, REMOTE_REVIEW_PROGRESS_TAG, REMOTE_REVIEW_TAG, STATUS_TAG, SUMMARY_TAG, TASK_ID_TAG, TASK_NOTIFICATION_TAG, TASK_TYPE_TAG, TOOL_USE_ID_TAG, ULTRAPLAN_TAG } from "../../constants/xml.js";
import { createTaskStateBase, generateTaskId } from "../../Task.js";
import { TodoWriteTool } from "../../tools/TodoWriteTool/TodoWriteTool.js";
import { checkBackgroundRemoteSessionEligibility } from "../../utils/background/remote/remoteSession.js";
import { logForDebugging } from "../../utils/debug.js";
import { logError } from "../../utils/log.js";
import { enqueuePendingNotification } from "../../utils/messageQueueManager.js";
import { extractTag, extractTextContent } from "../../utils/messages.js";
import { emitTaskTerminatedSdk } from "../../utils/sdkEventQueue.js";
import { deleteRemoteAgentMetadata, listRemoteAgentMetadata, writeRemoteAgentMetadata } from "../../utils/sessionStorage.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { appendTaskOutput, evictTaskOutput, getTaskOutputPath, initTaskOutput } from "../../utils/task/diskOutput.js";
import { registerTask, updateTaskState } from "../../utils/task/framework.js";
import { fetchSession } from "../../utils/teleport/api.js";
import { archiveRemoteSession, pollRemoteSessionEvents } from "../../utils/teleport.js";
const REMOTE_TASK_TYPES = ["remote-agent", "ultraplan", "ultrareview", "autofix-pr", "background-pr"];
function isRemoteTaskType(v) {
  return REMOTE_TASK_TYPES.includes(v ?? "");
}
const completionCheckers = /* @__PURE__ */ new Map();
function registerCompletionChecker(remoteTaskType, checker) {
  completionCheckers.set(remoteTaskType, checker);
}
async function persistRemoteAgentMetadata(meta) {
  try {
    await writeRemoteAgentMetadata(meta.taskId, meta);
  } catch (e) {
    logForDebugging(`persistRemoteAgentMetadata failed: ${String(e)}`);
  }
}
async function removeRemoteAgentMetadata(taskId) {
  try {
    await deleteRemoteAgentMetadata(taskId);
  } catch (e) {
    logForDebugging(`removeRemoteAgentMetadata failed: ${String(e)}`);
  }
}
async function checkRemoteAgentEligibility({
  skipBundle = false
} = {}) {
  const errors = await checkBackgroundRemoteSessionEligibility({
    skipBundle
  });
  if (errors.length > 0) {
    return {
      eligible: false,
      errors
    };
  }
  return {
    eligible: true
  };
}
function formatPreconditionError(error) {
  switch (error.type) {
    case "not_logged_in":
      return "Please run /login and sign in with your Claude.ai account (not Console).";
    case "no_remote_environment":
      return "No cloud environment available. Set one up at https://claude.ai/code/onboarding?magic=env-setup";
    case "not_in_git_repo":
      return "Background tasks require a git repository. Initialize git or run from a git repository.";
    case "no_git_remote":
      return "Background tasks require a GitHub remote. Add one with `git remote add origin REPO_URL`.";
    case "github_app_not_installed":
      return "The Claude GitHub app must be installed on this repository first.\nhttps://github.com/apps/claude/installations/new";
    case "policy_blocked":
      return "Remote sessions are disabled by your organization's policy. Contact your organization admin to enable them.";
  }
}
function enqueueRemoteNotification(taskId, title, status, setAppState, toolUseId) {
  if (!markTaskNotified(taskId, setAppState)) return;
  const statusText = status === "completed" ? "completed successfully" : status === "failed" ? "failed" : "was stopped";
  const toolUseIdLine = toolUseId ? `
<${TOOL_USE_ID_TAG}>${toolUseId}</${TOOL_USE_ID_TAG}>` : "";
  const outputPath = getTaskOutputPath(taskId);
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${TASK_TYPE_TAG}>remote_agent</${TASK_TYPE_TAG}>
<${OUTPUT_FILE_TAG}>${outputPath}</${OUTPUT_FILE_TAG}>
<${STATUS_TAG}>${status}</${STATUS_TAG}>
<${SUMMARY_TAG}>Remote task "${title}" ${statusText}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>`;
  enqueuePendingNotification({
    value: message,
    mode: "task-notification"
  });
}
function markTaskNotified(taskId, setAppState) {
  let shouldEnqueue = false;
  updateTaskState(taskId, setAppState, (task) => {
    if (task.notified) {
      return task;
    }
    shouldEnqueue = true;
    return {
      ...task,
      notified: true
    };
  });
  return shouldEnqueue;
}
function extractPlanFromLog(log) {
  for (let i = log.length - 1; i >= 0; i--) {
    const msg = log[i];
    if (msg?.type !== "assistant") continue;
    const fullText = extractTextContent(msg.message.content, "\n");
    const plan = extractTag(fullText, ULTRAPLAN_TAG);
    if (plan?.trim()) return plan.trim();
  }
  return null;
}
function enqueueUltraplanFailureNotification(taskId, sessionId, reason, setAppState) {
  if (!markTaskNotified(taskId, setAppState)) return;
  const sessionUrl = getRemoteTaskSessionUrl(sessionId);
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>
<${TASK_TYPE_TAG}>remote_agent</${TASK_TYPE_TAG}>
<${STATUS_TAG}>failed</${STATUS_TAG}>
<${SUMMARY_TAG}>Ultraplan failed: ${reason}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>
The remote Ultraplan session did not produce a plan (${reason}). Inspect the session at ${sessionUrl} and tell the user to retry locally with plan mode.`;
  enqueuePendingNotification({
    value: message,
    mode: "task-notification"
  });
}
function extractReviewFromLog(log) {
  for (let i = log.length - 1; i >= 0; i--) {
    const msg = log[i];
    if (msg?.type === "system" && (msg.subtype === "hook_progress" || msg.subtype === "hook_response")) {
      const tagged = extractTag(msg.stdout, REMOTE_REVIEW_TAG);
      if (tagged?.trim()) return tagged.trim();
    }
  }
  for (let i = log.length - 1; i >= 0; i--) {
    const msg = log[i];
    if (msg?.type !== "assistant") continue;
    const fullText = extractTextContent(msg.message.content, "\n");
    const tagged = extractTag(fullText, REMOTE_REVIEW_TAG);
    if (tagged?.trim()) return tagged.trim();
  }
  const hookStdout = log.filter((msg) => msg.type === "system" && (msg.subtype === "hook_progress" || msg.subtype === "hook_response")).map((msg) => msg.stdout).join("");
  const hookTagged = extractTag(hookStdout, REMOTE_REVIEW_TAG);
  if (hookTagged?.trim()) return hookTagged.trim();
  const allText = log.filter((msg) => msg.type === "assistant").map((msg) => extractTextContent(msg.message.content, "\n")).join("\n").trim();
  return allText || null;
}
function extractReviewTagFromLog(log) {
  for (let i = log.length - 1; i >= 0; i--) {
    const msg = log[i];
    if (msg?.type === "system" && (msg.subtype === "hook_progress" || msg.subtype === "hook_response")) {
      const tagged = extractTag(msg.stdout, REMOTE_REVIEW_TAG);
      if (tagged?.trim()) return tagged.trim();
    }
  }
  for (let i = log.length - 1; i >= 0; i--) {
    const msg = log[i];
    if (msg?.type !== "assistant") continue;
    const fullText = extractTextContent(msg.message.content, "\n");
    const tagged = extractTag(fullText, REMOTE_REVIEW_TAG);
    if (tagged?.trim()) return tagged.trim();
  }
  const hookStdout = log.filter((msg) => msg.type === "system" && (msg.subtype === "hook_progress" || msg.subtype === "hook_response")).map((msg) => msg.stdout).join("");
  const hookTagged = extractTag(hookStdout, REMOTE_REVIEW_TAG);
  if (hookTagged?.trim()) return hookTagged.trim();
  return null;
}
function enqueueRemoteReviewNotification(taskId, reviewContent, setAppState) {
  if (!markTaskNotified(taskId, setAppState)) return;
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>
<${TASK_TYPE_TAG}>remote_agent</${TASK_TYPE_TAG}>
<${STATUS_TAG}>completed</${STATUS_TAG}>
<${SUMMARY_TAG}>Remote review completed</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>
The remote review produced the following findings:

${reviewContent}`;
  enqueuePendingNotification({
    value: message,
    mode: "task-notification"
  });
}
function enqueueRemoteReviewFailureNotification(taskId, reason, setAppState) {
  if (!markTaskNotified(taskId, setAppState)) return;
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>
<${TASK_TYPE_TAG}>remote_agent</${TASK_TYPE_TAG}>
<${STATUS_TAG}>failed</${STATUS_TAG}>
<${SUMMARY_TAG}>Remote review failed: ${reason}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>
Remote review did not produce output (${reason}). Tell the user to retry /ultrareview, or use /review for a local review instead.`;
  enqueuePendingNotification({
    value: message,
    mode: "task-notification"
  });
}
function extractTodoListFromLog(log) {
  const todoListMessage = log.findLast((msg) => msg.type === "assistant" && msg.message.content.some((block) => block.type === "tool_use" && block.name === TodoWriteTool.name));
  if (!todoListMessage) {
    return [];
  }
  const input = todoListMessage.message.content.find((block) => block.type === "tool_use" && block.name === TodoWriteTool.name)?.input;
  if (!input) {
    return [];
  }
  const parsedInput = TodoWriteTool.inputSchema.safeParse(input);
  if (!parsedInput.success) {
    return [];
  }
  return parsedInput.data.todos;
}
function registerRemoteAgentTask(options) {
  const {
    remoteTaskType,
    session,
    command,
    context,
    toolUseId,
    isRemoteReview,
    isUltraplan,
    isLongRunning,
    remoteTaskMetadata
  } = options;
  const taskId = generateTaskId("remote_agent");
  void initTaskOutput(taskId);
  const taskState = {
    ...createTaskStateBase(taskId, "remote_agent", session.title, toolUseId),
    type: "remote_agent",
    remoteTaskType,
    status: "running",
    sessionId: session.id,
    command,
    title: session.title,
    todoList: [],
    log: [],
    isRemoteReview,
    isUltraplan,
    isLongRunning,
    pollStartedAt: Date.now(),
    remoteTaskMetadata
  };
  registerTask(taskState, context.setAppState);
  void persistRemoteAgentMetadata({
    taskId,
    remoteTaskType,
    sessionId: session.id,
    title: session.title,
    command,
    spawnedAt: Date.now(),
    toolUseId,
    isUltraplan,
    isRemoteReview,
    isLongRunning,
    remoteTaskMetadata
  });
  const stopPolling = startRemoteSessionPolling(taskId, context);
  return {
    taskId,
    sessionId: session.id,
    cleanup: stopPolling
  };
}
async function restoreRemoteAgentTasks(context) {
  try {
    await restoreRemoteAgentTasksImpl(context);
  } catch (e) {
    logForDebugging(`restoreRemoteAgentTasks failed: ${String(e)}`);
  }
}
async function restoreRemoteAgentTasksImpl(context) {
  const persisted = await listRemoteAgentMetadata();
  if (persisted.length === 0) return;
  for (const meta of persisted) {
    let remoteStatus;
    try {
      const session = await fetchSession(meta.sessionId);
      remoteStatus = session.session_status;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Session not found:")) {
        logForDebugging(`restoreRemoteAgentTasks: dropping ${meta.taskId} (404: ${String(e)})`);
        void removeRemoteAgentMetadata(meta.taskId);
      } else {
        logForDebugging(`restoreRemoteAgentTasks: skipping ${meta.taskId} (recoverable: ${String(e)})`);
      }
      continue;
    }
    if (remoteStatus === "archived") {
      void removeRemoteAgentMetadata(meta.taskId);
      continue;
    }
    const taskState = {
      ...createTaskStateBase(meta.taskId, "remote_agent", meta.title, meta.toolUseId),
      type: "remote_agent",
      remoteTaskType: isRemoteTaskType(meta.remoteTaskType) ? meta.remoteTaskType : "remote-agent",
      status: "running",
      sessionId: meta.sessionId,
      command: meta.command,
      title: meta.title,
      todoList: [],
      log: [],
      isRemoteReview: meta.isRemoteReview,
      isUltraplan: meta.isUltraplan,
      isLongRunning: meta.isLongRunning,
      startTime: meta.spawnedAt,
      pollStartedAt: Date.now(),
      remoteTaskMetadata: meta.remoteTaskMetadata
    };
    registerTask(taskState, context.setAppState);
    void initTaskOutput(meta.taskId);
    startRemoteSessionPolling(meta.taskId, context);
  }
}
function startRemoteSessionPolling(taskId, context) {
  let isRunning = true;
  const POLL_INTERVAL_MS = 1e3;
  const REMOTE_REVIEW_TIMEOUT_MS = 30 * 60 * 1e3;
  const STABLE_IDLE_POLLS = 5;
  let consecutiveIdlePolls = 0;
  let lastEventId = null;
  let accumulatedLog = [];
  let cachedReviewContent = null;
  const poll = async () => {
    if (!isRunning) return;
    try {
      const appState = context.getAppState();
      const task = appState.tasks?.[taskId];
      if (!task || task.status !== "running") {
        return;
      }
      const response = await pollRemoteSessionEvents(task.sessionId, lastEventId);
      lastEventId = response.lastEventId;
      const logGrew = response.newEvents.length > 0;
      if (logGrew) {
        accumulatedLog = [...accumulatedLog, ...response.newEvents];
        const deltaText = response.newEvents.map((msg) => {
          if (msg.type === "assistant") {
            return msg.message.content.filter((block) => block.type === "text").map((block) => "text" in block ? block.text : "").join("\n");
          }
          return jsonStringify(msg);
        }).join("\n");
        if (deltaText) {
          appendTaskOutput(taskId, deltaText + "\n");
        }
      }
      if (response.sessionStatus === "archived") {
        updateTaskState(taskId, context.setAppState, (t) => t.status === "running" ? {
          ...t,
          status: "completed",
          endTime: Date.now()
        } : t);
        enqueueRemoteNotification(taskId, task.title, "completed", context.setAppState, task.toolUseId);
        void evictTaskOutput(taskId);
        void removeRemoteAgentMetadata(taskId);
        return;
      }
      const checker = completionCheckers.get(task.remoteTaskType);
      if (checker) {
        const completionResult = await checker(task.remoteTaskMetadata);
        if (completionResult !== null) {
          updateTaskState(taskId, context.setAppState, (t) => t.status === "running" ? {
            ...t,
            status: "completed",
            endTime: Date.now()
          } : t);
          enqueueRemoteNotification(taskId, completionResult, "completed", context.setAppState, task.toolUseId);
          void evictTaskOutput(taskId);
          void removeRemoteAgentMetadata(taskId);
          return;
        }
      }
      const result = task.isUltraplan || task.isLongRunning ? void 0 : accumulatedLog.findLast((msg) => msg.type === "result");
      if (task.isRemoteReview && logGrew && cachedReviewContent === null) {
        cachedReviewContent = extractReviewTagFromLog(response.newEvents);
      }
      let newProgress;
      if (task.isRemoteReview && logGrew) {
        const open = `<${REMOTE_REVIEW_PROGRESS_TAG}>`;
        const close = `</${REMOTE_REVIEW_PROGRESS_TAG}>`;
        for (const ev of response.newEvents) {
          if (ev.type === "system" && (ev.subtype === "hook_progress" || ev.subtype === "hook_response")) {
            const s = ev.stdout;
            const closeAt = s.lastIndexOf(close);
            const openAt = closeAt === -1 ? -1 : s.lastIndexOf(open, closeAt);
            if (openAt !== -1 && closeAt > openAt) {
              try {
                const p = JSON.parse(s.slice(openAt + open.length, closeAt));
                newProgress = {
                  stage: p.stage,
                  bugsFound: p.bugs_found ?? 0,
                  bugsVerified: p.bugs_verified ?? 0,
                  bugsRefuted: p.bugs_refuted ?? 0
                };
              } catch {
              }
            }
          }
        }
      }
      const hasAnyOutput = accumulatedLog.some((msg) => msg.type === "assistant" || task.isRemoteReview && msg.type === "system" && (msg.subtype === "hook_progress" || msg.subtype === "hook_response"));
      if (response.sessionStatus === "idle" && !logGrew && hasAnyOutput) {
        consecutiveIdlePolls++;
      } else {
        consecutiveIdlePolls = 0;
      }
      const stableIdle = consecutiveIdlePolls >= STABLE_IDLE_POLLS;
      const hasSessionStartHook = accumulatedLog.some((m) => m.type === "system" && (m.subtype === "hook_started" || m.subtype === "hook_progress" || m.subtype === "hook_response") && m.hook_event === "SessionStart");
      const hasAssistantEvents = accumulatedLog.some((m) => m.type === "assistant");
      const sessionDone = task.isRemoteReview && (cachedReviewContent !== null || !hasSessionStartHook && stableIdle && hasAssistantEvents);
      const reviewTimedOut = task.isRemoteReview && Date.now() - task.pollStartedAt > REMOTE_REVIEW_TIMEOUT_MS;
      const newStatus = result ? result.subtype === "success" ? "completed" : "failed" : sessionDone || reviewTimedOut ? "completed" : accumulatedLog.length > 0 ? "running" : "starting";
      let raceTerminated = false;
      updateTaskState(taskId, context.setAppState, (prevTask) => {
        if (prevTask.status !== "running") {
          raceTerminated = true;
          return prevTask;
        }
        const statusUnchanged = newStatus === "running" || newStatus === "starting";
        if (!logGrew && statusUnchanged) {
          return prevTask;
        }
        return {
          ...prevTask,
          status: newStatus === "starting" ? "running" : newStatus,
          log: accumulatedLog,
          // Only re-scan for TodoWrite when log grew — log is append-only,
          // so no growth means no new tool_use blocks. Avoids findLast +
          // some + find + safeParse every second when idle.
          todoList: logGrew ? extractTodoListFromLog(accumulatedLog) : prevTask.todoList,
          reviewProgress: newProgress ?? prevTask.reviewProgress,
          endTime: result || sessionDone || reviewTimedOut ? Date.now() : void 0
        };
      });
      if (raceTerminated) return;
      if (result || sessionDone || reviewTimedOut) {
        const finalStatus = result && result.subtype !== "success" ? "failed" : "completed";
        if (task.isRemoteReview) {
          const reviewContent = cachedReviewContent ?? extractReviewFromLog(accumulatedLog);
          if (reviewContent && finalStatus === "completed") {
            enqueueRemoteReviewNotification(taskId, reviewContent, context.setAppState);
            void evictTaskOutput(taskId);
            void removeRemoteAgentMetadata(taskId);
            return;
          }
          updateTaskState(taskId, context.setAppState, (t) => ({
            ...t,
            status: "failed"
          }));
          const reason = result && result.subtype !== "success" ? "remote session returned an error" : reviewTimedOut && !sessionDone ? "remote session exceeded 30 minutes" : "no review output \u2014 orchestrator may have exited early";
          enqueueRemoteReviewFailureNotification(taskId, reason, context.setAppState);
          void evictTaskOutput(taskId);
          void removeRemoteAgentMetadata(taskId);
          return;
        }
        enqueueRemoteNotification(taskId, task.title, finalStatus, context.setAppState, task.toolUseId);
        void evictTaskOutput(taskId);
        void removeRemoteAgentMetadata(taskId);
        return;
      }
    } catch (error) {
      logError(error);
      consecutiveIdlePolls = 0;
      try {
        const appState = context.getAppState();
        const task = appState.tasks?.[taskId];
        if (task?.isRemoteReview && task.status === "running" && Date.now() - task.pollStartedAt > REMOTE_REVIEW_TIMEOUT_MS) {
          updateTaskState(taskId, context.setAppState, (t) => ({
            ...t,
            status: "failed",
            endTime: Date.now()
          }));
          enqueueRemoteReviewFailureNotification(taskId, "remote session exceeded 30 minutes", context.setAppState);
          void evictTaskOutput(taskId);
          void removeRemoteAgentMetadata(taskId);
          return;
        }
      } catch {
      }
    }
    if (isRunning) {
      setTimeout(poll, POLL_INTERVAL_MS);
    }
  };
  void poll();
  return () => {
    isRunning = false;
  };
}
const RemoteAgentTask = {
  name: "RemoteAgentTask",
  type: "remote_agent",
  async kill(taskId, setAppState) {
    let toolUseId;
    let description;
    let sessionId;
    let killed = false;
    updateTaskState(taskId, setAppState, (task) => {
      if (task.status !== "running") {
        return task;
      }
      toolUseId = task.toolUseId;
      description = task.description;
      sessionId = task.sessionId;
      killed = true;
      return {
        ...task,
        status: "killed",
        notified: true,
        endTime: Date.now()
      };
    });
    if (killed) {
      emitTaskTerminatedSdk(taskId, "stopped", {
        toolUseId,
        summary: description
      });
      if (sessionId) {
        void archiveRemoteSession(sessionId).catch((e) => logForDebugging(`RemoteAgentTask archive failed: ${String(e)}`));
      }
    }
    void evictTaskOutput(taskId);
    void removeRemoteAgentMetadata(taskId);
    logForDebugging(`RemoteAgentTask ${taskId} killed, archiving session ${sessionId ?? "unknown"}`);
  }
};
function getRemoteTaskSessionUrl(sessionId) {
  return getRemoteSessionUrl(sessionId, process.env.SESSION_INGRESS_URL);
}
export {
  RemoteAgentTask,
  checkRemoteAgentEligibility,
  enqueueUltraplanFailureNotification,
  extractPlanFromLog,
  formatPreconditionError,
  getRemoteTaskSessionUrl,
  registerCompletionChecker,
  registerRemoteAgentTask,
  restoreRemoteAgentTasks
};
