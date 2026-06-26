import { Fragment, jsx, jsxs } from "react/jsx-runtime";
const feature = (_name) => false;
import { memo, useMemo, useRef } from "react";
import { isBridgeEnabled } from "../../bridge/bridgeEnabled.js";
import { getBridgeStatus } from "../../bridge/bridgeStatusUtil.js";
import { useSetPromptOverlay } from "../../context/promptOverlayContext.js";
import { useSettings } from "../../hooks/useSettings.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { Box, Text } from "../../ink.js";
import { useAppState } from "../../state/AppState.js";
import { isFullscreenEnvEnabled } from "../../utils/fullscreen.js";
import "../../utils/undercover.js";
import { useCoordinatorTaskCount } from "../CoordinatorAgentStatus.js";
import { getLastAssistantMessageId, StatusLine, statusLineShouldDisplay } from "../StatusLine.js";
import { Notifications } from "./Notifications.js";
import { PromptInputFooterLeftSide } from "./PromptInputFooterLeftSide.js";
import { PromptInputFooterSuggestions } from "./PromptInputFooterSuggestions.js";
import { PromptInputHelpMenu } from "./PromptInputHelpMenu.js";
function PromptInputFooter({
  apiKeyStatus,
  debug,
  exitMessage,
  vimMode,
  mode,
  autoUpdaterResult,
  isAutoUpdating,
  verbose,
  onAutoUpdaterResult,
  onChangeIsUpdating,
  suggestions,
  selectedSuggestion,
  maxColumnWidth,
  toolPermissionContext,
  helpOpen,
  suppressHint: suppressHintFromProps,
  isLoading,
  tasksSelected,
  teamsSelected,
  bridgeSelected,
  tmuxSelected,
  teammateFooterIndex,
  ideSelection,
  mcpClients,
  isPasting = false,
  isInputWrapped = false,
  messages,
  isSearching,
  historyQuery,
  setHistoryQuery,
  historyFailedMatch,
  onOpenTasksDialog
}) {
  const settings = useSettings();
  const {
    columns,
    rows
  } = useTerminalSize();
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const lastAssistantMessageId = useMemo(() => getLastAssistantMessageId(messages), [messages]);
  const isNarrow = columns < 80;
  const isFullscreen = isFullscreenEnvEnabled();
  const isShort = isFullscreen && rows < 24;
  const coordinatorTaskCount = useCoordinatorTaskCount();
  const coordinatorTaskIndex = useAppState((s) => s.coordinatorTaskIndex);
  const pillSelected = tasksSelected && (coordinatorTaskCount === 0 || coordinatorTaskIndex < 0);
  const suppressHint = suppressHintFromProps || statusLineShouldDisplay(settings) || isSearching;
  const overlayData = useMemo(() => isFullscreen && suggestions.length ? {
    suggestions,
    selectedSuggestion,
    maxColumnWidth
  } : null, [isFullscreen, suggestions, selectedSuggestion, maxColumnWidth]);
  useSetPromptOverlay(overlayData);
  if (suggestions.length && !isFullscreen) {
    return /* @__PURE__ */ jsx(Box, { paddingX: 2, paddingY: 0, children: /* @__PURE__ */ jsx(PromptInputFooterSuggestions, { suggestions, selectedSuggestion, maxColumnWidth }) });
  }
  if (helpOpen) {
    return /* @__PURE__ */ jsx(PromptInputHelpMenu, { dimColor: true, fixedWidth: true, paddingX: 2 });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Box, { flexDirection: isNarrow ? "column" : "row", justifyContent: isNarrow ? "flex-start" : "space-between", paddingX: 2, gap: isNarrow ? 0 : 1, children: [
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", flexShrink: isNarrow ? 0 : 1, children: [
        mode === "prompt" && !isShort && !exitMessage.show && !isPasting && statusLineShouldDisplay(settings) && /* @__PURE__ */ jsx(StatusLine, { messagesRef, lastAssistantMessageId, vimMode }),
        /* @__PURE__ */ jsx(PromptInputFooterLeftSide, { exitMessage, vimMode, mode, toolPermissionContext, suppressHint, isLoading, tasksSelected: pillSelected, teamsSelected, teammateFooterIndex, tmuxSelected, isPasting, isSearching, historyQuery, setHistoryQuery, historyFailedMatch, onOpenTasksDialog })
      ] }),
      /* @__PURE__ */ jsxs(Box, { flexShrink: 1, gap: 1, children: [
        isFullscreen ? null : /* @__PURE__ */ jsx(Notifications, { apiKeyStatus, autoUpdaterResult, debug, isAutoUpdating, verbose, messages, onAutoUpdaterResult, onChangeIsUpdating, ideSelection, mcpClients, isInputWrapped, isNarrow }),
        false,
        /* @__PURE__ */ jsx(BridgeStatusIndicator, { bridgeSelected })
      ] })
    ] }),
    false
  ] });
}
var PromptInputFooter_default = memo(PromptInputFooter);
function BridgeStatusIndicator({
  bridgeSelected
}) {
  if (true) return null;
  const enabled = useAppState((s) => s.replBridgeEnabled);
  const connected = useAppState((s_0) => s_0.replBridgeConnected);
  const sessionActive = useAppState((s_1) => s_1.replBridgeSessionActive);
  const reconnecting = useAppState((s_2) => s_2.replBridgeReconnecting);
  const explicit = useAppState((s_3) => s_3.replBridgeExplicit);
  if (!isBridgeEnabled() || !enabled) return null;
  const status = getBridgeStatus({
    error: void 0,
    connected,
    sessionActive,
    reconnecting
  });
  if (!explicit && status.label !== "Remote Control reconnecting") {
    return null;
  }
  return /* @__PURE__ */ jsxs(Text, { color: bridgeSelected ? "background" : status.color, inverse: bridgeSelected, wrap: "truncate", children: [
    status.label,
    bridgeSelected && /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 Enter to view" })
  ] });
}
export {
  PromptInputFooter_default as default
};
