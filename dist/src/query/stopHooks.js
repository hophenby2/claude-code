const feature = (_name) => false;
import { getShortcutDisplay } from "../keybindings/shortcutFormat.js";
import "../memdir/paths.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { createAttachmentMessage } from "../utils/attachments.js";
import "../utils/debug.js";
import { errorMessage } from "../utils/errors.js";
import {
  executeStopHooks,
  executeTaskCompletedHooks,
  executeTeammateIdleHooks,
  getStopHookMessage,
  getTaskCompletedHookMessage,
  getTeammateIdleHookMessage
} from "../utils/hooks.js";
import {
  createStopHookSummaryMessage,
  createSystemMessage,
  createUserInterruptionMessage,
  createUserMessage
} from "../utils/messages.js";
import { getTaskListId, listTasks } from "../utils/tasks.js";
import { getAgentName, getTeamName, isTeammate } from "../utils/teammate.js";
const extractMemoriesModule = false ? null : null;
const jobClassifierModule = false ? null : null;
import { executeAutoDream } from "../services/autoDream/autoDream.js";
import { executePromptSuggestion } from "../services/PromptSuggestion/promptSuggestion.js";
import { isBareMode, isEnvDefinedFalsy } from "../utils/envUtils.js";
import {
  createCacheSafeParams,
  saveCacheSafeParams
} from "../utils/forkedAgent.js";
async function* handleStopHooks(messagesForQuery, assistantMessages, systemPrompt, userContext, systemContext, toolUseContext, querySource, stopHookActive) {
  const hookStartTime = Date.now();
  const stopHookContext = {
    messages: [...messagesForQuery, ...assistantMessages],
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext,
    querySource
  };
  if (querySource === "repl_main_thread" || querySource === "sdk") {
    saveCacheSafeParams(createCacheSafeParams(stopHookContext));
  }
  if (false) {
    const turnAssistantMessages = stopHookContext.messages.filter(
      (m) => m.type === "assistant"
    );
    const p = jobClassifierModule.classifyAndWriteState(process.env.CLAUDE_JOB_DIR, turnAssistantMessages).catch((err) => {
      logForDebugging(`[job] classifier error: ${errorMessage(err)}`, {
        level: "error"
      });
    });
    await Promise.race([
      p,
      // eslint-disable-next-line no-restricted-syntax -- sleep() has no .unref(); timer must not block exit
      new Promise((r) => setTimeout(r, 6e4).unref())
    ]);
  }
  if (!isBareMode()) {
    if (!isEnvDefinedFalsy(process.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION)) {
      void executePromptSuggestion(stopHookContext);
    }
    if (false) {
      void extractMemoriesModule.executeExtractMemories(
        stopHookContext,
        toolUseContext.appendSystemMessage
      );
    }
    if (!toolUseContext.agentId) {
      void executeAutoDream(stopHookContext, toolUseContext.appendSystemMessage);
    }
  }
  if (false) {
    try {
      const { cleanupComputerUseAfterTurn } = await null;
      await cleanupComputerUseAfterTurn(toolUseContext);
    } catch {
    }
  }
  try {
    const blockingErrors = [];
    const appState = toolUseContext.getAppState();
    const permissionMode = appState.toolPermissionContext.mode;
    const generator = executeStopHooks(
      permissionMode,
      toolUseContext.abortController.signal,
      void 0,
      stopHookActive ?? false,
      toolUseContext.agentId,
      toolUseContext,
      [...messagesForQuery, ...assistantMessages],
      toolUseContext.agentType
    );
    let stopHookToolUseID = "";
    let hookCount = 0;
    let preventedContinuation = false;
    let stopReason = "";
    let hasOutput = false;
    const hookErrors = [];
    const hookInfos = [];
    for await (const result of generator) {
      if (result.message) {
        yield result.message;
        if (result.message.type === "progress" && result.message.toolUseID) {
          stopHookToolUseID = result.message.toolUseID;
          hookCount++;
          const progressData = result.message.data;
          if (progressData.command) {
            hookInfos.push({
              command: progressData.command,
              promptText: progressData.promptText
            });
          }
        }
        if (result.message.type === "attachment") {
          const attachment = result.message.attachment;
          if ("hookEvent" in attachment && (attachment.hookEvent === "Stop" || attachment.hookEvent === "SubagentStop")) {
            if (attachment.type === "hook_non_blocking_error") {
              hookErrors.push(
                attachment.stderr || `Exit code ${attachment.exitCode}`
              );
              hasOutput = true;
            } else if (attachment.type === "hook_error_during_execution") {
              hookErrors.push(attachment.content);
              hasOutput = true;
            } else if (attachment.type === "hook_success") {
              if (attachment.stdout && attachment.stdout.trim() || attachment.stderr && attachment.stderr.trim()) {
                hasOutput = true;
              }
            }
            if ("durationMs" in attachment && "command" in attachment) {
              const info = hookInfos.find(
                (i) => i.command === attachment.command && i.durationMs === void 0
              );
              if (info) {
                info.durationMs = attachment.durationMs;
              }
            }
          }
        }
      }
      if (result.blockingError) {
        const userMessage = createUserMessage({
          content: getStopHookMessage(result.blockingError),
          isMeta: true
          // Hide from UI (shown in summary message instead)
        });
        blockingErrors.push(userMessage);
        yield userMessage;
        hasOutput = true;
        hookErrors.push(result.blockingError.blockingError);
      }
      if (result.preventContinuation) {
        preventedContinuation = true;
        stopReason = result.stopReason || "Stop hook prevented continuation";
        yield createAttachmentMessage({
          type: "hook_stopped_continuation",
          message: stopReason,
          hookName: "Stop",
          toolUseID: stopHookToolUseID,
          hookEvent: "Stop"
        });
      }
      if (toolUseContext.abortController.signal.aborted) {
        logEvent("tengu_pre_stop_hooks_cancelled", {
          queryChainId: toolUseContext.queryTracking?.chainId,
          queryDepth: toolUseContext.queryTracking?.depth
        });
        yield createUserInterruptionMessage({
          toolUse: false
        });
        return { blockingErrors: [], preventContinuation: true };
      }
    }
    if (hookCount > 0) {
      yield createStopHookSummaryMessage(
        hookCount,
        hookInfos,
        hookErrors,
        preventedContinuation,
        stopReason,
        hasOutput,
        "suggestion",
        stopHookToolUseID
      );
      if (hookErrors.length > 0) {
        const expandShortcut = getShortcutDisplay(
          "app:toggleTranscript",
          "Global",
          "ctrl+o"
        );
        toolUseContext.addNotification?.({
          key: "stop-hook-error",
          text: `Stop hook error occurred \xB7 ${expandShortcut} to see`,
          priority: "immediate"
        });
      }
    }
    if (preventedContinuation) {
      return { blockingErrors: [], preventContinuation: true };
    }
    if (blockingErrors.length > 0) {
      return { blockingErrors, preventContinuation: false };
    }
    if (isTeammate()) {
      const teammateName = getAgentName() ?? "";
      const teamName = getTeamName() ?? "";
      const teammateBlockingErrors = [];
      let teammatePreventedContinuation = false;
      let teammateStopReason;
      let teammateHookToolUseID = "";
      const taskListId = getTaskListId();
      const tasks = await listTasks(taskListId);
      const inProgressTasks = tasks.filter(
        (t) => t.status === "in_progress" && t.owner === teammateName
      );
      for (const task of inProgressTasks) {
        const taskCompletedGenerator = executeTaskCompletedHooks(
          task.id,
          task.subject,
          task.description,
          teammateName,
          teamName,
          permissionMode,
          toolUseContext.abortController.signal,
          void 0,
          toolUseContext
        );
        for await (const result of taskCompletedGenerator) {
          if (result.message) {
            if (result.message.type === "progress" && result.message.toolUseID) {
              teammateHookToolUseID = result.message.toolUseID;
            }
            yield result.message;
          }
          if (result.blockingError) {
            const userMessage = createUserMessage({
              content: getTaskCompletedHookMessage(result.blockingError),
              isMeta: true
            });
            teammateBlockingErrors.push(userMessage);
            yield userMessage;
          }
          if (result.preventContinuation) {
            teammatePreventedContinuation = true;
            teammateStopReason = result.stopReason || "TaskCompleted hook prevented continuation";
            yield createAttachmentMessage({
              type: "hook_stopped_continuation",
              message: teammateStopReason,
              hookName: "TaskCompleted",
              toolUseID: teammateHookToolUseID,
              hookEvent: "TaskCompleted"
            });
          }
          if (toolUseContext.abortController.signal.aborted) {
            return { blockingErrors: [], preventContinuation: true };
          }
        }
      }
      const teammateIdleGenerator = executeTeammateIdleHooks(
        teammateName,
        teamName,
        permissionMode,
        toolUseContext.abortController.signal
      );
      for await (const result of teammateIdleGenerator) {
        if (result.message) {
          if (result.message.type === "progress" && result.message.toolUseID) {
            teammateHookToolUseID = result.message.toolUseID;
          }
          yield result.message;
        }
        if (result.blockingError) {
          const userMessage = createUserMessage({
            content: getTeammateIdleHookMessage(result.blockingError),
            isMeta: true
          });
          teammateBlockingErrors.push(userMessage);
          yield userMessage;
        }
        if (result.preventContinuation) {
          teammatePreventedContinuation = true;
          teammateStopReason = result.stopReason || "TeammateIdle hook prevented continuation";
          yield createAttachmentMessage({
            type: "hook_stopped_continuation",
            message: teammateStopReason,
            hookName: "TeammateIdle",
            toolUseID: teammateHookToolUseID,
            hookEvent: "TeammateIdle"
          });
        }
        if (toolUseContext.abortController.signal.aborted) {
          return { blockingErrors: [], preventContinuation: true };
        }
      }
      if (teammatePreventedContinuation) {
        return { blockingErrors: [], preventContinuation: true };
      }
      if (teammateBlockingErrors.length > 0) {
        return {
          blockingErrors: teammateBlockingErrors,
          preventContinuation: false
        };
      }
    }
    return { blockingErrors: [], preventContinuation: false };
  } catch (error) {
    const durationMs = Date.now() - hookStartTime;
    logEvent("tengu_stop_hook_error", {
      duration: durationMs,
      queryChainId: toolUseContext.queryTracking?.chainId,
      queryDepth: toolUseContext.queryTracking?.depth
    });
    yield createSystemMessage(
      `Stop hook failed: ${errorMessage(error)}`,
      "warning"
    );
    return { blockingErrors: [], preventContinuation: false };
  }
}
export {
  handleStopHooks
};
