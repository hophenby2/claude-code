import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import { useEffect, useState } from "react";
import { useNotifications } from "../../context/notifications.js";
import { logEvent } from "../../services/analytics/index.js";
import { useAppState } from "../../state/AppState.js";
import "../../context/voice.js";
import { useIdeConnectionStatus } from "../../hooks/useIdeConnectionStatus.js";
import { useMainLoopModel } from "../../hooks/useMainLoopModel.js";
import "../../hooks/useVoiceEnabled.js";
import { Box, Text } from "../../ink.js";
import { useClaudeAiLimits } from "../../services/claudeAiLimitsHook.js";
import { calculateTokenWarningState } from "../../services/compact/autoCompact.js";
import { getApiKeyHelperElapsedMs, getConfiguredApiKeyHelper, getSubscriptionType } from "../../utils/auth.js";
import { getExternalEditor } from "../../utils/editor.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { formatDuration } from "../../utils/format.js";
import { setEnvHookNotifier } from "../../utils/hooks/fileChangedWatcher.js";
import { toIDEDisplayName } from "../../utils/ide.js";
import { getMessagesAfterCompactBoundary } from "../../utils/messages.js";
import { tokenCountFromLastAPIResponse } from "../../utils/tokens.js";
import { AutoUpdaterWrapper } from "../AutoUpdaterWrapper.js";
import { ConfigurableShortcutHint } from "../ConfigurableShortcutHint.js";
import { IdeStatusIndicator } from "../IdeStatusIndicator.js";
import { MemoryUsageIndicator } from "../MemoryUsageIndicator.js";
import { SentryErrorBoundary } from "../SentryErrorBoundary.js";
import { TokenWarning } from "../TokenWarning.js";
import { SandboxPromptFooterHint } from "./SandboxPromptFooterHint.js";
const VoiceIndicator = false ? require2("./VoiceIndicator.js").VoiceIndicator : () => null;
const FOOTER_TEMPORARY_STATUS_TIMEOUT = 5e3;
function Notifications(t0) {
  const $ = _c(34);
  const {
    apiKeyStatus,
    autoUpdaterResult,
    debug,
    isAutoUpdating,
    verbose,
    messages,
    onAutoUpdaterResult,
    onChangeIsUpdating,
    ideSelection,
    mcpClients,
    isInputWrapped: t1,
    isNarrow: t2
  } = t0;
  const isInputWrapped = t1 === void 0 ? false : t1;
  const isNarrow = t2 === void 0 ? false : t2;
  let t3;
  if ($[0] !== messages) {
    const messagesForTokenCount = getMessagesAfterCompactBoundary(messages);
    t3 = tokenCountFromLastAPIResponse(messagesForTokenCount);
    $[0] = messages;
    $[1] = t3;
  } else {
    t3 = $[1];
  }
  const tokenUsage = t3;
  const mainLoopModel = useMainLoopModel();
  let t4;
  if ($[2] !== mainLoopModel || $[3] !== tokenUsage) {
    t4 = calculateTokenWarningState(tokenUsage, mainLoopModel);
    $[2] = mainLoopModel;
    $[3] = tokenUsage;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  const isShowingCompactMessage = t4.isAboveWarningThreshold;
  const {
    status: ideStatus
  } = useIdeConnectionStatus(mcpClients);
  const notifications = useAppState(_temp);
  const {
    addNotification,
    removeNotification
  } = useNotifications();
  const claudeAiLimits = useClaudeAiLimits();
  let t5;
  let t6;
  if ($[5] !== addNotification) {
    t5 = () => {
      setEnvHookNotifier((text, isError) => {
        addNotification({
          key: "env-hook",
          text,
          color: isError ? "error" : void 0,
          priority: isError ? "medium" : "low",
          timeoutMs: isError ? 8e3 : 5e3
        });
      });
      return _temp2;
    };
    t6 = [addNotification];
    $[5] = addNotification;
    $[6] = t5;
    $[7] = t6;
  } else {
    t5 = $[6];
    t6 = $[7];
  }
  useEffect(t5, t6);
  const shouldShowIdeSelection = ideStatus === "connected" && (ideSelection?.filePath || ideSelection?.text && ideSelection.lineCount > 0);
  const shouldShowAutoUpdater = !shouldShowIdeSelection || isAutoUpdating || autoUpdaterResult?.status !== "success";
  const isInOverageMode = claudeAiLimits.isUsingOverage;
  let t7;
  if ($[8] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t7 = getSubscriptionType();
    $[8] = t7;
  } else {
    t7 = $[8];
  }
  const subscriptionType = t7;
  const isTeamOrEnterprise = subscriptionType === "team" || subscriptionType === "enterprise";
  let t8;
  if ($[9] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t8 = getExternalEditor();
    $[9] = t8;
  } else {
    t8 = $[9];
  }
  const editor = t8;
  const shouldShowExternalEditorHint = isInputWrapped && !isShowingCompactMessage && apiKeyStatus !== "invalid" && apiKeyStatus !== "missing" && editor !== void 0;
  let t10;
  let t9;
  if ($[10] !== addNotification || $[11] !== removeNotification || $[12] !== shouldShowExternalEditorHint) {
    t9 = () => {
      if (shouldShowExternalEditorHint && editor) {
        logEvent("tengu_external_editor_hint_shown", {});
        addNotification({
          key: "external-editor-hint",
          jsx: /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "chat:externalEditor", context: "Chat", fallback: "ctrl+g", description: `edit in ${toIDEDisplayName(editor)}` }) }),
          priority: "immediate",
          timeoutMs: 5e3
        });
      } else {
        removeNotification("external-editor-hint");
      }
    };
    t10 = [shouldShowExternalEditorHint, editor, addNotification, removeNotification];
    $[10] = addNotification;
    $[11] = removeNotification;
    $[12] = shouldShowExternalEditorHint;
    $[13] = t10;
    $[14] = t9;
  } else {
    t10 = $[13];
    t9 = $[14];
  }
  useEffect(t9, t10);
  const t11 = isNarrow ? "flex-start" : "flex-end";
  const t12 = isInOverageMode ?? false;
  let t13;
  if ($[15] !== apiKeyStatus || $[16] !== autoUpdaterResult || $[17] !== debug || $[18] !== ideSelection || $[19] !== isAutoUpdating || $[20] !== isShowingCompactMessage || $[21] !== mainLoopModel || $[22] !== mcpClients || $[23] !== notifications || $[24] !== onAutoUpdaterResult || $[25] !== onChangeIsUpdating || $[26] !== shouldShowAutoUpdater || $[27] !== t12 || $[28] !== tokenUsage || $[29] !== verbose) {
    t13 = /* @__PURE__ */ jsx(NotificationContent, { ideSelection, mcpClients, notifications, isInOverageMode: t12, isTeamOrEnterprise, apiKeyStatus, debug, verbose, tokenUsage, mainLoopModel, shouldShowAutoUpdater, autoUpdaterResult, isAutoUpdating, isShowingCompactMessage, onAutoUpdaterResult, onChangeIsUpdating });
    $[15] = apiKeyStatus;
    $[16] = autoUpdaterResult;
    $[17] = debug;
    $[18] = ideSelection;
    $[19] = isAutoUpdating;
    $[20] = isShowingCompactMessage;
    $[21] = mainLoopModel;
    $[22] = mcpClients;
    $[23] = notifications;
    $[24] = onAutoUpdaterResult;
    $[25] = onChangeIsUpdating;
    $[26] = shouldShowAutoUpdater;
    $[27] = t12;
    $[28] = tokenUsage;
    $[29] = verbose;
    $[30] = t13;
  } else {
    t13 = $[30];
  }
  let t14;
  if ($[31] !== t11 || $[32] !== t13) {
    t14 = /* @__PURE__ */ jsx(SentryErrorBoundary, { children: /* @__PURE__ */ jsx(Box, { flexDirection: "column", alignItems: t11, flexShrink: 0, overflowX: "hidden", children: t13 }) });
    $[31] = t11;
    $[32] = t13;
    $[33] = t14;
  } else {
    t14 = $[33];
  }
  return t14;
}
function _temp2() {
  return setEnvHookNotifier(null);
}
function _temp(s) {
  return s.notifications;
}
function NotificationContent({
  ideSelection,
  mcpClients,
  notifications,
  isInOverageMode,
  isTeamOrEnterprise,
  apiKeyStatus,
  debug,
  verbose,
  tokenUsage,
  mainLoopModel,
  shouldShowAutoUpdater,
  autoUpdaterResult,
  isAutoUpdating,
  isShowingCompactMessage,
  onAutoUpdaterResult,
  onChangeIsUpdating
}) {
  const [apiKeyHelperSlow, setApiKeyHelperSlow] = useState(null);
  useEffect(() => {
    if (!getConfiguredApiKeyHelper()) return;
    const interval = setInterval((setSlow) => {
      const ms = getApiKeyHelperElapsedMs();
      const next = ms >= 1e4 ? formatDuration(ms) : null;
      setSlow((prev) => next === prev ? prev : next);
    }, 1e3, setApiKeyHelperSlow);
    return () => clearInterval(interval);
  }, []);
  const voiceState = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useVoiceState((s) => s.voiceState)
  ) : "idle";
  const voiceEnabled = false ? useVoiceEnabled() : false;
  const voiceError = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useVoiceState((s_0) => s_0.voiceError)
  ) : null;
  const isBriefOnly = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAppState((s_1) => s_1.isBriefOnly)
  ) : false;
  if (false) {
    return /* @__PURE__ */ jsx(VoiceIndicator, { voiceState });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(IdeStatusIndicator, { ideSelection, mcpClients }),
    notifications.current && ("jsx" in notifications.current ? /* @__PURE__ */ jsx(Text, { wrap: "truncate", children: notifications.current.jsx }, notifications.current.key) : /* @__PURE__ */ jsx(Text, { color: notifications.current.color, dimColor: !notifications.current.color, wrap: "truncate", children: notifications.current.text })),
    isInOverageMode && !isTeamOrEnterprise && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, wrap: "truncate", children: "Now using extra usage" }) }),
    apiKeyHelperSlow && /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsxs(Text, { color: "warning", wrap: "truncate", children: [
        "apiKeyHelper is taking a while",
        " "
      ] }),
      /* @__PURE__ */ jsxs(Text, { dimColor: true, wrap: "truncate", children: [
        "(",
        apiKeyHelperSlow,
        ")"
      ] })
    ] }),
    (apiKeyStatus === "invalid" || apiKeyStatus === "missing") && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { color: "error", wrap: "truncate", children: isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ? "Authentication error \xB7 Try again" : "Not logged in \xB7 Run /login" }) }),
    debug && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { color: "warning", wrap: "truncate", children: "Debug mode" }) }),
    apiKeyStatus !== "invalid" && apiKeyStatus !== "missing" && verbose && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { dimColor: true, wrap: "truncate", children: [
      tokenUsage,
      " tokens"
    ] }) }),
    !isBriefOnly && /* @__PURE__ */ jsx(TokenWarning, { tokenUsage, model: mainLoopModel }),
    shouldShowAutoUpdater && /* @__PURE__ */ jsx(AutoUpdaterWrapper, { verbose, onAutoUpdaterResult, autoUpdaterResult, isUpdating: isAutoUpdating, onChangeIsUpdating, showSuccessMessage: !isShowingCompactMessage }),
    false ? voiceEnabled && voiceError && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { color: "error", wrap: "truncate", children: voiceError }) }) : null,
    /* @__PURE__ */ jsx(MemoryUsageIndicator, {}),
    /* @__PURE__ */ jsx(SandboxPromptFooterHint, {})
  ] });
}
export {
  FOOTER_TEMPORARY_STATUS_TIMEOUT,
  Notifications
};
