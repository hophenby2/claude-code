import { jsx } from "react/jsx-runtime";
const feature = (_name) => false;
import { memo, useCallback, useEffect, useRef } from "react";
import { logEvent } from "../services/analytics/index.js";
import { useAppState, useSetAppState } from "../state/AppState.js";
import { getIsRemoteMode, getMainThreadAgentType, getOriginalCwd, getSdkBetas, getSessionId } from "../bootstrap/state.js";
import { DEFAULT_OUTPUT_STYLE_NAME } from "../constants/outputStyles.js";
import { useNotifications } from "../context/notifications.js";
import { getTotalAPIDuration, getTotalCost, getTotalDuration, getTotalInputTokens, getTotalLinesAdded, getTotalLinesRemoved, getTotalOutputTokens } from "../cost-tracker.js";
import { useMainLoopModel } from "../hooks/useMainLoopModel.js";
import { useSettings } from "../hooks/useSettings.js";
import { Ansi, Box, Text } from "../ink.js";
import { getRawUtilization } from "../services/claudeAiLimits.js";
import { checkHasTrustDialogAccepted } from "../utils/config.js";
import { calculateContextPercentages, getContextWindowForModel } from "../utils/context.js";
import { getCwd } from "../utils/cwd.js";
import { logForDebugging } from "../utils/debug.js";
import { isFullscreenEnvEnabled } from "../utils/fullscreen.js";
import { createBaseHookInput, executeStatusLineCommand } from "../utils/hooks.js";
import { getLastAssistantMessage } from "../utils/messages.js";
import { getRuntimeMainLoopModel, renderModelName } from "../utils/model/model.js";
import { getCurrentSessionTitle } from "../utils/sessionStorage.js";
import { doesMostRecentAssistantMessageExceed200k, getCurrentUsage } from "../utils/tokens.js";
import { getCurrentWorktreeSession } from "../utils/worktree.js";
import { isVimModeEnabled } from "./PromptInput/utils.js";
function statusLineShouldDisplay(settings) {
  if (false) return false;
  return settings?.statusLine !== void 0;
}
function buildStatusLineCommandInput(permissionMode, exceeds200kTokens, settings, messages, addedDirs, mainLoopModel, vimMode) {
  const agentType = getMainThreadAgentType();
  const worktreeSession = getCurrentWorktreeSession();
  const runtimeModel = getRuntimeMainLoopModel({
    permissionMode,
    mainLoopModel,
    exceeds200kTokens
  });
  const outputStyleName = settings?.outputStyle || DEFAULT_OUTPUT_STYLE_NAME;
  const currentUsage = getCurrentUsage(messages);
  const contextWindowSize = getContextWindowForModel(runtimeModel, getSdkBetas());
  const contextPercentages = calculateContextPercentages(currentUsage, contextWindowSize);
  const sessionId = getSessionId();
  const sessionName = getCurrentSessionTitle(sessionId);
  const rawUtil = getRawUtilization();
  const rateLimits = {
    ...rawUtil.five_hour && {
      five_hour: {
        used_percentage: rawUtil.five_hour.utilization * 100,
        resets_at: rawUtil.five_hour.resets_at
      }
    },
    ...rawUtil.seven_day && {
      seven_day: {
        used_percentage: rawUtil.seven_day.utilization * 100,
        resets_at: rawUtil.seven_day.resets_at
      }
    }
  };
  return {
    ...createBaseHookInput(),
    ...sessionName && {
      session_name: sessionName
    },
    model: {
      id: runtimeModel,
      display_name: renderModelName(runtimeModel)
    },
    workspace: {
      current_dir: getCwd(),
      project_dir: getOriginalCwd(),
      added_dirs: addedDirs
    },
    version: "0.0.0-dev",
    output_style: {
      name: outputStyleName
    },
    cost: {
      total_cost_usd: getTotalCost(),
      total_duration_ms: getTotalDuration(),
      total_api_duration_ms: getTotalAPIDuration(),
      total_lines_added: getTotalLinesAdded(),
      total_lines_removed: getTotalLinesRemoved()
    },
    context_window: {
      total_input_tokens: getTotalInputTokens(),
      total_output_tokens: getTotalOutputTokens(),
      context_window_size: contextWindowSize,
      current_usage: currentUsage,
      used_percentage: contextPercentages.used,
      remaining_percentage: contextPercentages.remaining
    },
    exceeds_200k_tokens: exceeds200kTokens,
    ...(rateLimits.five_hour || rateLimits.seven_day) && {
      rate_limits: rateLimits
    },
    ...isVimModeEnabled() && {
      vim: {
        mode: vimMode ?? "INSERT"
      }
    },
    ...agentType && {
      agent: {
        name: agentType
      }
    },
    ...getIsRemoteMode() && {
      remote: {
        session_id: getSessionId()
      }
    },
    ...worktreeSession && {
      worktree: {
        name: worktreeSession.worktreeName,
        path: worktreeSession.worktreePath,
        branch: worktreeSession.worktreeBranch,
        original_cwd: worktreeSession.originalCwd,
        original_branch: worktreeSession.originalBranch
      }
    }
  };
}
function getLastAssistantMessageId(messages) {
  return getLastAssistantMessage(messages)?.uuid ?? null;
}
function StatusLineInner({
  messagesRef,
  lastAssistantMessageId,
  vimMode
}) {
  const abortControllerRef = useRef(void 0);
  const permissionMode = useAppState((s) => s.toolPermissionContext.mode);
  const additionalWorkingDirectories = useAppState((s) => s.toolPermissionContext.additionalWorkingDirectories);
  const statusLineText = useAppState((s) => s.statusLineText);
  const setAppState = useSetAppState();
  const settings = useSettings();
  const {
    addNotification
  } = useNotifications();
  const mainLoopModel = useMainLoopModel();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const vimModeRef = useRef(vimMode);
  vimModeRef.current = vimMode;
  const permissionModeRef = useRef(permissionMode);
  permissionModeRef.current = permissionMode;
  const addedDirsRef = useRef(additionalWorkingDirectories);
  addedDirsRef.current = additionalWorkingDirectories;
  const mainLoopModelRef = useRef(mainLoopModel);
  mainLoopModelRef.current = mainLoopModel;
  const previousStateRef = useRef({
    messageId: null,
    exceeds200kTokens: false,
    permissionMode,
    vimMode,
    mainLoopModel
  });
  const debounceTimerRef = useRef(void 0);
  const logNextResultRef = useRef(true);
  const doUpdate = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const msgs = messagesRef.current;
    const logResult = logNextResultRef.current;
    logNextResultRef.current = false;
    try {
      let exceeds200kTokens = previousStateRef.current.exceeds200kTokens;
      const currentMessageId = getLastAssistantMessageId(msgs);
      if (currentMessageId !== previousStateRef.current.messageId) {
        exceeds200kTokens = doesMostRecentAssistantMessageExceed200k(msgs);
        previousStateRef.current.messageId = currentMessageId;
        previousStateRef.current.exceeds200kTokens = exceeds200kTokens;
      }
      const statusInput = buildStatusLineCommandInput(permissionModeRef.current, exceeds200kTokens, settingsRef.current, msgs, Array.from(addedDirsRef.current.keys()), mainLoopModelRef.current, vimModeRef.current);
      const text = await executeStatusLineCommand(statusInput, controller.signal, void 0, logResult);
      if (!controller.signal.aborted) {
        setAppState((prev) => {
          if (prev.statusLineText === text) return prev;
          return {
            ...prev,
            statusLineText: text
          };
        });
      }
    } catch {
    }
  }, [messagesRef, setAppState]);
  const scheduleUpdate = useCallback(() => {
    if (debounceTimerRef.current !== void 0) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout((ref, doUpdate2) => {
      ref.current = void 0;
      void doUpdate2();
    }, 300, debounceTimerRef, doUpdate);
  }, [doUpdate]);
  useEffect(() => {
    if (lastAssistantMessageId !== previousStateRef.current.messageId || permissionMode !== previousStateRef.current.permissionMode || vimMode !== previousStateRef.current.vimMode || mainLoopModel !== previousStateRef.current.mainLoopModel) {
      previousStateRef.current.permissionMode = permissionMode;
      previousStateRef.current.vimMode = vimMode;
      previousStateRef.current.mainLoopModel = mainLoopModel;
      scheduleUpdate();
    }
  }, [lastAssistantMessageId, permissionMode, vimMode, mainLoopModel, scheduleUpdate]);
  const statusLineCommand = settings?.statusLine?.command;
  const isFirstSettingsRender = useRef(true);
  useEffect(() => {
    if (isFirstSettingsRender.current) {
      isFirstSettingsRender.current = false;
      return;
    }
    logNextResultRef.current = true;
    void doUpdate();
  }, [statusLineCommand, doUpdate]);
  useEffect(() => {
    const statusLine = settings?.statusLine;
    if (statusLine) {
      logEvent("tengu_status_line_mount", {
        command_length: statusLine.command.length,
        padding: statusLine.padding
      });
      if (settings.disableAllHooks === true) {
        logForDebugging("Status line is configured but disableAllHooks is true", {
          level: "warn"
        });
      }
      if (!checkHasTrustDialogAccepted()) {
        addNotification({
          key: "statusline-trust-blocked",
          text: "statusline skipped \xB7 restart to fix",
          color: "warning",
          priority: "low"
        });
        logForDebugging("Status line command skipped: workspace trust not accepted", {
          level: "warn"
        });
      }
    }
  }, []);
  useEffect(() => {
    void doUpdate();
    return () => {
      abortControllerRef.current?.abort();
      if (debounceTimerRef.current !== void 0) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
  const paddingX = settings?.statusLine?.padding ?? 0;
  return /* @__PURE__ */ jsx(Box, { paddingX, gap: 2, children: statusLineText ? /* @__PURE__ */ jsx(Text, { dimColor: true, wrap: "truncate", children: /* @__PURE__ */ jsx(Ansi, { children: statusLineText }) }) : isFullscreenEnvEnabled() ? /* @__PURE__ */ jsx(Text, { children: " " }) : null });
}
const StatusLine = memo(StatusLineInner);
export {
  StatusLine,
  getLastAssistantMessageId,
  statusLineShouldDisplay
};
