import { jsx, jsxs } from "react/jsx-runtime";
import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
const coordinatorModule = false ? require2("../../coordinator/coordinatorMode.js") : void 0;
import { Box, Text, Link } from "../../ink.js";
import figures from "figures";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isVimModeEnabled } from "./utils.js";
import { useShortcutDisplay } from "../../keybindings/useShortcutDisplay.js";
import { isDefaultMode, permissionModeSymbol, permissionModeTitle, getModeColor } from "../../utils/permissions/PermissionMode.js";
import { BackgroundTaskStatus } from "../tasks/BackgroundTaskStatus.js";
import { isBackgroundTask } from "../../tasks/types.js";
import "../../tasks/LocalAgentTask/LocalAgentTask.js";
import "../CoordinatorAgentStatus.js";
import { count } from "../../utils/array.js";
import { shouldHideTasksFooter } from "../tasks/taskStatusUtils.js";
import { isAgentSwarmsEnabled } from "../../utils/agentSwarmsEnabled.js";
import { TeamStatus } from "../teams/TeamStatus.js";
import { isInProcessEnabled } from "../../utils/swarm/backends/registry.js";
import { useAppState, useAppStateStore } from "../../state/AppState.js";
import { getIsRemoteMode } from "../../bootstrap/state.js";
import HistorySearchInput from "./HistorySearchInput.js";
import { usePrStatus } from "../../hooks/usePrStatus.js";
import { KeyboardShortcutHint } from "../design-system/KeyboardShortcutHint.js";
import { Byline } from "../design-system/Byline.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { useTasksV2 } from "../../hooks/useTasksV2.js";
import { formatDuration } from "../../utils/format.js";
import "./VoiceIndicator.js";
import "../../hooks/useVoiceEnabled.js";
import "../../context/voice.js";
import { isFullscreenEnvEnabled } from "../../utils/fullscreen.js";
import { isXtermJs } from "../../ink/terminal.js";
import { useHasSelection, useSelection } from "../../ink/hooks/use-selection.js";
import { getGlobalConfig } from "../../utils/config.js";
import { getPlatform } from "../../utils/platform.js";
import { PrBadge } from "../PrBadge.js";
const proactiveModule = false ? require2("../../proactive/index.js") : null;
const NO_OP_SUBSCRIBE = (_cb) => () => {
};
const NULL = () => null;
const MAX_VOICE_HINT_SHOWS = 3;
function ProactiveCountdown() {
  const $ = _c(7);
  const nextTickAt = useSyncExternalStore(proactiveModule?.subscribeToProactiveChanges ?? NO_OP_SUBSCRIBE, proactiveModule?.getNextTickAt ?? NULL, NULL);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  let t0;
  let t1;
  if ($[0] !== nextTickAt) {
    t0 = () => {
      if (nextTickAt === null) {
        setRemainingSeconds(null);
        return;
      }
      const update = function update2() {
        const remaining = Math.max(0, Math.ceil((nextTickAt - Date.now()) / 1e3));
        setRemainingSeconds(remaining);
      };
      update();
      const interval = setInterval(update, 1e3);
      return () => clearInterval(interval);
    };
    t1 = [nextTickAt];
    $[0] = nextTickAt;
    $[1] = t0;
    $[2] = t1;
  } else {
    t0 = $[1];
    t1 = $[2];
  }
  useEffect(t0, t1);
  if (remainingSeconds === null) {
    return null;
  }
  const t2 = remainingSeconds * 1e3;
  let t3;
  if ($[3] !== t2) {
    t3 = formatDuration(t2, {
      mostSignificantOnly: true
    });
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "waiting",
      " ",
      t3
    ] });
    $[5] = t3;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  return t4;
}
function PromptInputFooterLeftSide(t0) {
  const $ = _c(27);
  const {
    exitMessage,
    vimMode,
    mode,
    toolPermissionContext,
    suppressHint,
    isLoading,
    tasksSelected,
    teamsSelected,
    tmuxSelected,
    teammateFooterIndex,
    isPasting,
    isSearching,
    historyQuery,
    setHistoryQuery,
    historyFailedMatch,
    onOpenTasksDialog
  } = t0;
  if (exitMessage.show) {
    let t12;
    if ($[0] !== exitMessage.key) {
      t12 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Press ",
        exitMessage.key,
        " again to exit"
      ] }, "exit-message");
      $[0] = exitMessage.key;
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    return t12;
  }
  if (isPasting) {
    let t12;
    if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Pasting text\u2026" }, "pasting-message");
      $[2] = t12;
    } else {
      t12 = $[2];
    }
    return t12;
  }
  let t1;
  if ($[3] !== isSearching || $[4] !== vimMode) {
    t1 = isVimModeEnabled() && vimMode === "INSERT" && !isSearching;
    $[3] = isSearching;
    $[4] = vimMode;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  const showVim = t1;
  let t2;
  if ($[6] !== historyFailedMatch || $[7] !== historyQuery || $[8] !== isSearching || $[9] !== setHistoryQuery) {
    t2 = isSearching && /* @__PURE__ */ jsx(HistorySearchInput, { value: historyQuery, onChange: setHistoryQuery, historyFailedMatch });
    $[6] = historyFailedMatch;
    $[7] = historyQuery;
    $[8] = isSearching;
    $[9] = setHistoryQuery;
    $[10] = t2;
  } else {
    t2 = $[10];
  }
  let t3;
  if ($[11] !== showVim) {
    t3 = showVim ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: "-- INSERT --" }, "vim-insert") : null;
    $[11] = showVim;
    $[12] = t3;
  } else {
    t3 = $[12];
  }
  const t4 = !suppressHint && !showVim;
  let t5;
  if ($[13] !== isLoading || $[14] !== mode || $[15] !== onOpenTasksDialog || $[16] !== t4 || $[17] !== tasksSelected || $[18] !== teammateFooterIndex || $[19] !== teamsSelected || $[20] !== tmuxSelected || $[21] !== toolPermissionContext) {
    t5 = /* @__PURE__ */ jsx(ModeIndicator, { mode, toolPermissionContext, showHint: t4, isLoading, tasksSelected, teamsSelected, teammateFooterIndex, tmuxSelected, onOpenTasksDialog });
    $[13] = isLoading;
    $[14] = mode;
    $[15] = onOpenTasksDialog;
    $[16] = t4;
    $[17] = tasksSelected;
    $[18] = teammateFooterIndex;
    $[19] = teamsSelected;
    $[20] = tmuxSelected;
    $[21] = toolPermissionContext;
    $[22] = t5;
  } else {
    t5 = $[22];
  }
  let t6;
  if ($[23] !== t2 || $[24] !== t3 || $[25] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Box, { justifyContent: "flex-start", gap: 1, children: [
      t2,
      t3,
      t5
    ] });
    $[23] = t2;
    $[24] = t3;
    $[25] = t5;
    $[26] = t6;
  } else {
    t6 = $[26];
  }
  return t6;
}
function ModeIndicator({
  mode,
  toolPermissionContext,
  showHint,
  isLoading,
  tasksSelected,
  teamsSelected,
  tmuxSelected,
  teammateFooterIndex,
  onOpenTasksDialog
}) {
  const {
    columns
  } = useTerminalSize();
  const modeCycleShortcut = useShortcutDisplay("chat:cycleMode", "Chat", "shift+tab");
  const tasks = useAppState((s) => s.tasks);
  const teamContext = useAppState((s_0) => s_0.teamContext);
  const store = useAppStateStore();
  const [remoteSessionUrl] = useState(() => store.getState().remoteSessionUrl);
  const viewSelectionMode = useAppState((s_1) => s_1.viewSelectionMode);
  const viewingAgentTaskId = useAppState((s_2) => s_2.viewingAgentTaskId);
  const expandedView = useAppState((s_3) => s_3.expandedView);
  const showSpinnerTree = expandedView === "teammates";
  const prStatus = usePrStatus(isLoading, isPrStatusEnabled());
  const hasTmuxSession = useAppState((s_4) => false);
  const nextTickAt = useSyncExternalStore(proactiveModule?.subscribeToProactiveChanges ?? NO_OP_SUBSCRIBE, proactiveModule?.getNextTickAt ?? NULL, NULL);
  const voiceEnabled = false ? useVoiceEnabled() : false;
  const voiceState = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useVoiceState((s_5) => s_5.voiceState)
  ) : "idle";
  const voiceWarmingUp = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useVoiceState((s_6) => s_6.voiceWarmingUp)
  ) : false;
  const hasSelection = useHasSelection();
  const selGetState = useSelection().getState;
  const hasNextTick = nextTickAt !== null;
  const isCoordinator = false ? coordinatorModule?.isCoordinatorMode() === true : false;
  const runningTaskCount = useMemo(() => count(Object.values(tasks), (t) => isBackgroundTask(t) && true), [tasks]);
  const tasksV2 = useTasksV2();
  const hasTaskItems = tasksV2 !== void 0 && tasksV2.length > 0;
  const escShortcut = useShortcutDisplay("chat:cancel", "Chat", "esc").toLowerCase();
  const todosShortcut = useShortcutDisplay("app:toggleTodos", "Global", "ctrl+t");
  const killAgentsShortcut = useShortcutDisplay("chat:killAgents", "Chat", "ctrl+x ctrl+k");
  const voiceKeyShortcut = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useShortcutDisplay("voice:pushToTalk", "Chat", "Space")
  ) : "";
  const [voiceHintUnderCap] = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useState(() => (getGlobalConfig().voiceFooterHintSeenCount ?? 0) < MAX_VOICE_HINT_SHOWS)
  ) : [false];
  const voiceHintIncrementedRef = false ? useRef(false) : null;
  useEffect(() => {
    if (false) {
      if (!voiceEnabled || !voiceHintUnderCap) return;
      if (voiceHintIncrementedRef?.current) return;
      if (voiceHintIncrementedRef) voiceHintIncrementedRef.current = true;
      const newCount = (getGlobalConfig().voiceFooterHintSeenCount ?? 0) + 1;
      saveGlobalConfig((prev) => {
        if ((prev.voiceFooterHintSeenCount ?? 0) >= newCount) return prev;
        return {
          ...prev,
          voiceFooterHintSeenCount: newCount
        };
      });
    }
  }, [voiceEnabled, voiceHintUnderCap]);
  const isKillAgentsConfirmShowing = useAppState((s_7) => s_7.notifications.current?.key === "kill-agents-confirm");
  const hasTeams = isAgentSwarmsEnabled() && !isInProcessEnabled() && teamContext !== void 0 && count(Object.values(teamContext.teammates), (t_0) => t_0.name !== "team-lead") > 0;
  if (mode === "bash") {
    return /* @__PURE__ */ jsx(Text, { color: "bashBorder", children: "! for bash mode" });
  }
  const currentMode = toolPermissionContext?.mode;
  const hasActiveMode = !isDefaultMode(currentMode);
  const viewedTask = viewingAgentTaskId ? tasks[viewingAgentTaskId] : void 0;
  const isViewingTeammate = viewSelectionMode === "viewing-agent" && viewedTask?.type === "in_process_teammate";
  const isViewingCompletedTeammate = isViewingTeammate && viewedTask != null && viewedTask.status !== "running";
  const hasBackgroundTasks = runningTaskCount > 0 || isViewingTeammate;
  const primaryItemCount = (isCoordinator || hasActiveMode ? 1 : 0) + (hasBackgroundTasks ? 1 : 0) + (hasTeams ? 1 : 0);
  const shouldShowPrStatus = isPrStatusEnabled() && prStatus.number !== null && prStatus.reviewState !== null && prStatus.url !== null && primaryItemCount < 2 && (primaryItemCount === 0 || columns >= 80);
  const shouldShowModeHint = primaryItemCount < 2;
  const hasInProcessTeammates = !showSpinnerTree && hasBackgroundTasks && Object.values(tasks).some((t_1) => t_1.type === "in_process_teammate");
  const hasTeammatePills = hasInProcessTeammates || !showSpinnerTree && isViewingTeammate;
  const modePart = currentMode && hasActiveMode && !getIsRemoteMode() ? /* @__PURE__ */ jsxs(Text, { color: getModeColor(currentMode), children: [
    permissionModeSymbol(currentMode),
    " ",
    permissionModeTitle(currentMode).toLowerCase(),
    " on",
    shouldShowModeHint && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " ",
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: modeCycleShortcut, action: "cycle", parens: true })
    ] })
  ] }, "mode") : null;
  const parts = [
    // Remote session indicator
    ...remoteSessionUrl ? [/* @__PURE__ */ jsx(Link, { url: remoteSessionUrl, children: /* @__PURE__ */ jsxs(Text, { color: "ide", children: [
      figures.circleDouble,
      " remote"
    ] }) }, "remote")] : [],
    // BackgroundTaskStatus is NOT in parts — it renders as a Box sibling so
    // its click-target Box isn't nested inside the <Text wrap="truncate">
    // wrapper (reconciler throws on Box-in-Text).
    // Tmux pill (ant-only) — appears right after tasks in nav order
    ...false ? [/* @__PURE__ */ jsx(TungstenPill, { selected: tmuxSelected }, "tmux")] : [],
    ...isAgentSwarmsEnabled() && hasTeams ? [/* @__PURE__ */ jsx(TeamStatus, { teamsSelected, showHint: showHint && !hasBackgroundTasks }, "teams")] : [],
    ...shouldShowPrStatus ? [/* @__PURE__ */ jsx(PrBadge, { number: prStatus.number, url: prStatus.url, reviewState: prStatus.reviewState }, "pr-status")] : []
  ];
  const hasAnyInProcessTeammates = Object.values(tasks).some((t_2) => t_2.type === "in_process_teammate" && t_2.status === "running");
  const hasRunningAgentTasks = Object.values(tasks).some((t_3) => t_3.type === "local_agent" && t_3.status === "running");
  const hintParts = showHint ? getSpinnerHintParts(isLoading, escShortcut, todosShortcut, killAgentsShortcut, hasTaskItems, expandedView, hasAnyInProcessTeammates, hasRunningAgentTasks, isKillAgentsConfirmShowing) : [];
  if (isViewingCompletedTeammate) {
    parts.push(/* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: escShortcut, action: "return to team lead" }) }, "esc-return"));
  } else if (false) {
    parts.push(/* @__PURE__ */ jsx(ProactiveCountdown, {}, "proactive"));
  } else if (!hasTeammatePills && showHint) {
    parts.push(...hintParts);
  }
  if (hasTeammatePills) {
    const otherParts = [...modePart ? [modePart] : [], ...parts, ...isViewingCompletedTeammate ? [] : hintParts];
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(BackgroundTaskStatus, { tasksSelected, isViewingTeammate, teammateFooterIndex, isLeaderIdle: !isLoading, onOpenDialog: onOpenTasksDialog }) }),
      otherParts.length > 0 && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Byline, { children: otherParts }) })
    ] });
  }
  const hasCoordinatorTasks = false;
  const tasksPart = hasBackgroundTasks && !hasTeammatePills && !shouldHideTasksFooter(tasks, showSpinnerTree) ? /* @__PURE__ */ jsx(BackgroundTaskStatus, { tasksSelected, isViewingTeammate, teammateFooterIndex, isLeaderIdle: !isLoading, onOpenDialog: onOpenTasksDialog }) : null;
  if (parts.length === 0 && !tasksPart && !modePart && showHint) {
    parts.push(/* @__PURE__ */ jsx(Text, { dimColor: true, children: "? for shortcuts" }, "shortcuts-hint"));
  }
  const copyOnSelect = getGlobalConfig().copyOnSelect ?? true;
  const selectionHintHasContent = hasSelection && (!copyOnSelect || isXtermJs());
  if (false) {
    parts.push(/* @__PURE__ */ jsx(VoiceWarmupHint, {}, "voice-warmup"));
  } else if (isFullscreenEnvEnabled() && selectionHintHasContent) {
    const isMac = getPlatform() === "macos";
    const altClickFailed = isMac && (selGetState()?.lastPressHadAlt ?? false);
    parts.push(/* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      !copyOnSelect && /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "ctrl+c", action: "copy" }),
      isXtermJs() && (altClickFailed ? /* @__PURE__ */ jsx(Text, { children: "set macOptionClickForcesSelection in VS Code settings" }) : /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: isMac ? "option+click" : "shift+click", action: "native select" }))
    ] }) }, "selection-copy"));
  } else if (false) {
    parts.push(/* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "hold ",
      voiceKeyShortcut,
      " to speak"
    ] }, "voice-hint"));
  }
  if ((tasksPart || hasCoordinatorTasks) && showHint && !hasTeams) {
    parts.push(/* @__PURE__ */ jsx(Text, { dimColor: true, children: tasksSelected ? /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "view tasks" }) : /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2193", action: "manage" }) }, "manage-tasks"));
  }
  if (parts.length === 0 && !tasksPart && !modePart) {
    return isFullscreenEnvEnabled() ? /* @__PURE__ */ jsx(Text, { children: " " }) : null;
  }
  return /* @__PURE__ */ jsxs(Box, { height: 1, overflow: "hidden", children: [
    modePart && /* @__PURE__ */ jsxs(Box, { flexShrink: 0, children: [
      modePart,
      (tasksPart || parts.length > 0) && /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 " })
    ] }),
    tasksPart && /* @__PURE__ */ jsxs(Box, { flexShrink: 0, children: [
      tasksPart,
      parts.length > 0 && /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 " })
    ] }),
    parts.length > 0 && /* @__PURE__ */ jsx(Text, { wrap: "truncate", children: /* @__PURE__ */ jsx(Byline, { children: parts }) })
  ] });
}
function getSpinnerHintParts(isLoading, escShortcut, todosShortcut, killAgentsShortcut, hasTaskItems, expandedView, hasTeammates, hasRunningAgentTasks, isKillAgentsConfirmShowing) {
  let toggleAction;
  if (hasTeammates) {
    switch (expandedView) {
      case "none":
        toggleAction = "show tasks";
        break;
      case "tasks":
        toggleAction = "show teammates";
        break;
      case "teammates":
        toggleAction = "hide";
        break;
    }
  } else {
    toggleAction = expandedView === "tasks" ? "hide tasks" : "show tasks";
  }
  const showToggleHint = hasTaskItems || hasTeammates;
  return [...isLoading ? [/* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: escShortcut, action: "interrupt" }) }, "esc")] : [], ...!isLoading && hasRunningAgentTasks && !isKillAgentsConfirmShowing ? [/* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: killAgentsShortcut, action: "stop agents" }) }, "kill-agents")] : [], ...showToggleHint ? [/* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: todosShortcut, action: toggleAction }) }, "toggle-tasks")] : []];
}
function isPrStatusEnabled() {
  return getGlobalConfig().prStatusFooterEnabled ?? true;
}
export {
  PromptInputFooterLeftSide
};
