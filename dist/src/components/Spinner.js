import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../ink.js";
import { useEffect, useRef, useState } from "react";
import { computeGlimmerIndex, computeShimmerSegments, SHIMMER_INTERVAL_MS } from "../bridge/bridgeStatusUtil.js";
const feature = (_name) => false;
import "../bootstrap/state.js";
import "../services/analytics/growthbook.js";
import "../utils/envUtils.js";
import { count } from "../utils/array.js";
import sample from "lodash-es/sample.js";
import { formatDuration } from "../utils/format.js";
import { activityManager } from "../utils/activityManager.js";
import { getSpinnerVerbs } from "../constants/spinnerVerbs.js";
import { MessageResponse } from "./MessageResponse.js";
import { TaskListV2 } from "./TaskListV2.js";
import { useTasksV2 } from "../hooks/useTasksV2.js";
import { useAppState } from "../state/AppState.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { stringWidth } from "../ink/stringWidth.js";
import { getDefaultCharacters } from "./Spinner/index.js";
import { SpinnerAnimationRow } from "./Spinner/SpinnerAnimationRow.js";
import { useSettings } from "../hooks/useSettings.js";
import { isInProcessTeammateTask } from "../tasks/InProcessTeammateTask/types.js";
import { isBackgroundTask } from "../tasks/types.js";
import { getAllInProcessTeammateTasks } from "../tasks/InProcessTeammateTask/InProcessTeammateTask.js";
import { getEffortSuffix } from "../utils/effort.js";
import { getMainLoopModel } from "../utils/model/model.js";
import { getViewedTeammateTask } from "../state/selectors.js";
import { TEARDROP_ASTERISK } from "../constants/figures.js";
import "figures";
import "../bootstrap/state.js";
import { TeammateSpinnerTree } from "./Spinner/TeammateSpinnerTree.js";
import { useAnimationFrame } from "../ink.js";
import { getGlobalConfig } from "../utils/config.js";
const DEFAULT_CHARACTERS = getDefaultCharacters();
const SPINNER_FRAMES = [...DEFAULT_CHARACTERS, ...[...DEFAULT_CHARACTERS].reverse()];
function SpinnerWithVerb(props) {
  const isBriefOnly = useAppState((s) => s.isBriefOnly);
  const viewingAgentTaskId = useAppState((s_0) => s_0.viewingAgentTaskId);
  const briefEnvEnabled = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_BRIEF), [])
  ) : false;
  if (false) {
    return /* @__PURE__ */ jsx(BriefSpinner, { mode: props.mode, overrideMessage: props.overrideMessage });
  }
  return /* @__PURE__ */ jsx(SpinnerWithVerbInner, { ...props });
}
function SpinnerWithVerbInner({
  mode,
  loadingStartTimeRef,
  totalPausedMsRef,
  pauseStartTimeRef,
  spinnerTip,
  responseLengthRef,
  overrideColor,
  overrideShimmerColor,
  overrideMessage,
  spinnerSuffix,
  verbose,
  hasActiveTools = false,
  leaderIsIdle = false
}) {
  const settings = useSettings();
  const reducedMotion = settings.prefersReducedMotion ?? false;
  const tasks = useAppState((s) => s.tasks);
  const viewingAgentTaskId = useAppState((s_0) => s_0.viewingAgentTaskId);
  const expandedView = useAppState((s_1) => s_1.expandedView);
  const showExpandedTodos = expandedView === "tasks";
  const showSpinnerTree = expandedView === "teammates";
  const selectedIPAgentIndex = useAppState((s_2) => s_2.selectedIPAgentIndex);
  const viewSelectionMode = useAppState((s_3) => s_3.viewSelectionMode);
  const foregroundedTeammate = viewingAgentTaskId ? getViewedTeammateTask({
    viewingAgentTaskId,
    tasks
  }) : void 0;
  const {
    columns
  } = useTerminalSize();
  const tasksV2 = useTasksV2();
  const [thinkingStatus, setThinkingStatus] = useState(null);
  const thinkingStartRef = useRef(null);
  useEffect(() => {
    let showDurationTimer = null;
    let clearStatusTimer = null;
    if (mode === "thinking") {
      if (thinkingStartRef.current === null) {
        thinkingStartRef.current = Date.now();
        setThinkingStatus("thinking");
      }
    } else if (thinkingStartRef.current !== null) {
      const duration = Date.now() - thinkingStartRef.current;
      const elapsed = Date.now() - thinkingStartRef.current;
      const remainingThinkingTime = Math.max(0, 2e3 - elapsed);
      thinkingStartRef.current = null;
      const showDuration = () => {
        setThinkingStatus(duration);
        clearStatusTimer = setTimeout(setThinkingStatus, 2e3, null);
      };
      if (remainingThinkingTime > 0) {
        showDurationTimer = setTimeout(showDuration, remainingThinkingTime);
      } else {
        showDuration();
      }
    }
    return () => {
      if (showDurationTimer) clearTimeout(showDurationTimer);
      if (clearStatusTimer) clearTimeout(clearStatusTimer);
    };
  }, [mode]);
  const currentTodo = tasksV2?.find((task) => task.status !== "pending" && task.status !== "completed");
  const nextTask = findNextPendingTask(tasksV2);
  const [randomVerb] = useState(() => sample(getSpinnerVerbs()));
  const leaderVerb = overrideMessage ?? currentTodo?.activeForm ?? currentTodo?.subject ?? randomVerb;
  const effectiveVerb = foregroundedTeammate && !foregroundedTeammate.isIdle ? foregroundedTeammate.spinnerVerb ?? randomVerb : leaderVerb;
  const message = effectiveVerb + "\u2026";
  useEffect(() => {
    const operationId = "spinner-" + mode;
    activityManager.startCLIActivity(operationId);
    return () => {
      activityManager.endCLIActivity(operationId);
    };
  }, [mode]);
  const effortValue = useAppState((s_4) => s_4.effortValue);
  const effortSuffix = getEffortSuffix(getMainLoopModel(), effortValue);
  const runningTeammates = getAllInProcessTeammateTasks(tasks).filter((t) => t.status === "running");
  const hasRunningTeammates = runningTeammates.length > 0;
  const allIdle = hasRunningTeammates && runningTeammates.every((t_0) => t_0.isIdle);
  let teammateTokens = 0;
  if (!showSpinnerTree) {
    for (const task_0 of Object.values(tasks)) {
      if (isInProcessTeammateTask(task_0) && task_0.status === "running") {
        if (task_0.progress?.tokenCount) {
          teammateTokens += task_0.progress.tokenCount;
        }
      }
    }
  }
  const elapsedSnapshot = pauseStartTimeRef.current !== null ? pauseStartTimeRef.current - loadingStartTimeRef.current - totalPausedMsRef.current : Date.now() - loadingStartTimeRef.current - totalPausedMsRef.current;
  const leaderTokenCount = Math.round(responseLengthRef.current / 4);
  const defaultColor = "claude";
  const defaultShimmerColor = "claudeShimmer";
  const messageColor = overrideColor ?? defaultColor;
  const shimmerColor = overrideShimmerColor ?? defaultShimmerColor;
  let ttftText = null;
  if (false) {
    ttftText = computeTtftText(apiMetricsRef.current);
  }
  if (leaderIsIdle && hasRunningTeammates && !foregroundedTeammate) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: "100%", alignItems: "flex-start", children: [
      /* @__PURE__ */ jsx(Box, { flexDirection: "row", flexWrap: "wrap", marginTop: 1, width: "100%", children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        TEARDROP_ASTERISK,
        " Idle",
        !allIdle && " \xB7 teammates running"
      ] }) }),
      showSpinnerTree && /* @__PURE__ */ jsx(TeammateSpinnerTree, { selectedIndex: selectedIPAgentIndex, isInSelectionMode: viewSelectionMode === "selecting-agent", allIdle, leaderTokenCount, leaderIdleText: "Idle" })
    ] });
  }
  if (foregroundedTeammate?.isIdle) {
    const idleText = allIdle ? `${TEARDROP_ASTERISK} Worked for ${formatDuration(Date.now() - foregroundedTeammate.startTime)}` : `${TEARDROP_ASTERISK} Idle`;
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: "100%", alignItems: "flex-start", children: [
      /* @__PURE__ */ jsx(Box, { flexDirection: "row", flexWrap: "wrap", marginTop: 1, width: "100%", children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: idleText }) }),
      showSpinnerTree && hasRunningTeammates && /* @__PURE__ */ jsx(TeammateSpinnerTree, { selectedIndex: selectedIPAgentIndex, isInSelectionMode: viewSelectionMode === "selecting-agent", allIdle, leaderVerb: leaderIsIdle ? void 0 : leaderVerb, leaderIdleText: leaderIsIdle ? "Idle" : void 0, leaderTokenCount })
    ] });
  }
  let contextTipsActive = false;
  const tipsEnabled = settings.spinnerTipsEnabled !== false;
  const showClearTip = tipsEnabled && elapsedSnapshot > 18e5;
  const showBtwTip = tipsEnabled && elapsedSnapshot > 3e4 && !getGlobalConfig().btwUseCount;
  const effectiveTip = contextTipsActive ? void 0 : showClearTip && !nextTask ? "Use /clear to start fresh when switching topics and free up context" : showBtwTip && !nextTask ? "Use /btw to ask a quick side question without interrupting Claude's current work" : spinnerTip;
  let budgetText = null;
  if (false) {
    const budget = getCurrentTurnTokenBudget();
    if (budget !== null && budget > 0) {
      const tokens = getTurnOutputTokens();
      if (tokens >= budget) {
        budgetText = `Target: ${formatNumber(tokens)} used (${formatNumber(budget)} min ${figures.tick})`;
      } else {
        const pct = Math.round(tokens / budget * 100);
        const remaining = budget - tokens;
        const rate = elapsedSnapshot > 5e3 && tokens >= 2e3 ? tokens / elapsedSnapshot : 0;
        const eta = rate > 0 ? ` \xB7 ~${formatDuration(remaining / rate, {
          mostSignificantOnly: true
        })}` : "";
        budgetText = `Target: ${formatNumber(tokens)} / ${formatNumber(budget)} (${pct}%)${eta}`;
      }
    }
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: "100%", alignItems: "flex-start", children: [
    /* @__PURE__ */ jsx(SpinnerAnimationRow, { mode, reducedMotion, hasActiveTools, responseLengthRef, message, messageColor, shimmerColor, overrideColor, loadingStartTimeRef, totalPausedMsRef, pauseStartTimeRef, spinnerSuffix, verbose, columns, hasRunningTeammates, teammateTokens, foregroundedTeammate, leaderIsIdle, thinkingStatus, effortSuffix }),
    showSpinnerTree && hasRunningTeammates ? /* @__PURE__ */ jsx(TeammateSpinnerTree, { selectedIndex: selectedIPAgentIndex, isInSelectionMode: viewSelectionMode === "selecting-agent", allIdle, leaderVerb: leaderIsIdle ? void 0 : leaderVerb, leaderIdleText: leaderIsIdle ? "Idle" : void 0, leaderTokenCount }) : showExpandedTodos && tasksV2 && tasksV2.length > 0 ? /* @__PURE__ */ jsx(Box, { width: "100%", flexDirection: "column", children: /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(TaskListV2, { tasks: tasksV2 }) }) }) : nextTask || effectiveTip || budgetText ? (
      // IMPORTANT: we need this width="100%" to avoid an Ink bug where the
      // tip gets duplicated over and over while the spinner is running if
      // the terminal is very small. TODO: fix this in Ink.
      /* @__PURE__ */ jsxs(Box, { width: "100%", flexDirection: "column", children: [
        budgetText && /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: budgetText }) }),
        (nextTask || effectiveTip) && /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: nextTask ? `Next: ${nextTask.subject}` : `Tip: ${effectiveTip}` }) })
      ] })
    ) : null
  ] });
}
function BriefSpinner(t0) {
  const $ = _c(31);
  const {
    mode,
    overrideMessage
  } = t0;
  const settings = useSettings();
  const reducedMotion = settings.prefersReducedMotion ?? false;
  const [randomVerb] = useState(_temp4);
  const verb = overrideMessage ?? randomVerb;
  const connStatus = useAppState(_temp5);
  let t1;
  let t2;
  if ($[0] !== mode) {
    t1 = () => {
      const operationId = "spinner-" + mode;
      activityManager.startCLIActivity(operationId);
      return () => {
        activityManager.endCLIActivity(operationId);
      };
    };
    t2 = [mode];
    $[0] = mode;
    $[1] = t1;
    $[2] = t2;
  } else {
    t1 = $[1];
    t2 = $[2];
  }
  useEffect(t1, t2);
  const [, time] = useAnimationFrame(reducedMotion ? null : 120);
  const runningCount = useAppState(_temp6);
  const showConnWarning = connStatus === "reconnecting" || connStatus === "disconnected";
  const connText = connStatus === "reconnecting" ? "Reconnecting" : "Disconnected";
  const dotFrame = Math.floor(time / 300) % 3;
  let t3;
  if ($[3] !== dotFrame || $[4] !== reducedMotion) {
    t3 = reducedMotion ? "\u2026  " : ".".repeat(dotFrame + 1).padEnd(3);
    $[3] = dotFrame;
    $[4] = reducedMotion;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  const dots = t3;
  let t4;
  if ($[6] !== verb) {
    t4 = stringWidth(verb);
    $[6] = verb;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  const verbWidth = t4;
  let t5;
  if ($[8] !== reducedMotion || $[9] !== showConnWarning || $[10] !== time || $[11] !== verb || $[12] !== verbWidth) {
    const glimmerIndex = reducedMotion || showConnWarning ? -100 : computeGlimmerIndex(Math.floor(time / SHIMMER_INTERVAL_MS), verbWidth);
    t5 = computeShimmerSegments(verb, glimmerIndex);
    $[8] = reducedMotion;
    $[9] = showConnWarning;
    $[10] = time;
    $[11] = verb;
    $[12] = verbWidth;
    $[13] = t5;
  } else {
    t5 = $[13];
  }
  const {
    before,
    shimmer,
    after
  } = t5;
  const {
    columns
  } = useTerminalSize();
  const rightText = runningCount > 0 ? `${runningCount} in background` : "";
  let t6;
  if ($[14] !== connText || $[15] !== showConnWarning || $[16] !== verbWidth) {
    t6 = showConnWarning ? stringWidth(connText) : verbWidth;
    $[14] = connText;
    $[15] = showConnWarning;
    $[16] = verbWidth;
    $[17] = t6;
  } else {
    t6 = $[17];
  }
  const leftWidth = t6 + 3;
  const pad = Math.max(1, columns - 2 - leftWidth - stringWidth(rightText));
  let t7;
  if ($[18] !== after || $[19] !== before || $[20] !== connText || $[21] !== dots || $[22] !== shimmer || $[23] !== showConnWarning) {
    t7 = showConnWarning ? /* @__PURE__ */ jsx(Text, { color: "error", children: connText + dots }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      before ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: before }) : null,
      shimmer ? /* @__PURE__ */ jsx(Text, { children: shimmer }) : null,
      after ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: after }) : null,
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: dots })
    ] });
    $[18] = after;
    $[19] = before;
    $[20] = connText;
    $[21] = dots;
    $[22] = shimmer;
    $[23] = showConnWarning;
    $[24] = t7;
  } else {
    t7 = $[24];
  }
  let t8;
  if ($[25] !== pad || $[26] !== rightText) {
    t8 = rightText ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Text, { children: " ".repeat(pad) }),
      /* @__PURE__ */ jsx(Text, { color: "subtle", children: rightText })
    ] }) : null;
    $[25] = pad;
    $[26] = rightText;
    $[27] = t8;
  } else {
    t8 = $[27];
  }
  let t9;
  if ($[28] !== t7 || $[29] !== t8) {
    t9 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", width: "100%", marginTop: 1, paddingLeft: 2, children: [
      t7,
      t8
    ] });
    $[28] = t7;
    $[29] = t8;
    $[30] = t9;
  } else {
    t9 = $[30];
  }
  return t9;
}
function _temp6(s_0) {
  return count(Object.values(s_0.tasks), isBackgroundTask) + s_0.remoteBackgroundTaskCount;
}
function _temp5(s) {
  return s.remoteConnectionStatus;
}
function _temp4() {
  return sample(getSpinnerVerbs()) ?? "Working";
}
function BriefIdleStatus() {
  const $ = _c(9);
  const connStatus = useAppState(_temp7);
  const runningCount = useAppState(_temp8);
  const {
    columns
  } = useTerminalSize();
  const showConnWarning = connStatus === "reconnecting" || connStatus === "disconnected";
  const connText = connStatus === "reconnecting" ? "Reconnecting\u2026" : "Disconnected";
  const leftText = showConnWarning ? connText : "";
  const rightText = runningCount > 0 ? `${runningCount} in background` : "";
  if (!leftText && !rightText) {
    let t02;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t02 = /* @__PURE__ */ jsx(Box, { height: 2 });
      $[0] = t02;
    } else {
      t02 = $[0];
    }
    return t02;
  }
  const pad = Math.max(1, columns - 2 - stringWidth(leftText) - stringWidth(rightText));
  let t0;
  if ($[1] !== leftText) {
    t0 = leftText ? /* @__PURE__ */ jsx(Text, { color: "error", children: leftText }) : null;
    $[1] = leftText;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  let t1;
  if ($[3] !== pad || $[4] !== rightText) {
    t1 = rightText ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Text, { children: " ".repeat(pad) }),
      /* @__PURE__ */ jsx(Text, { color: "subtle", children: rightText })
    ] }) : null;
    $[3] = pad;
    $[4] = rightText;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  let t2;
  if ($[6] !== t0 || $[7] !== t1) {
    t2 = /* @__PURE__ */ jsx(Box, { marginTop: 1, paddingLeft: 2, children: /* @__PURE__ */ jsxs(Text, { children: [
      t0,
      t1
    ] }) });
    $[6] = t0;
    $[7] = t1;
    $[8] = t2;
  } else {
    t2 = $[8];
  }
  return t2;
}
function _temp8(s_0) {
  return count(Object.values(s_0.tasks), isBackgroundTask) + s_0.remoteBackgroundTaskCount;
}
function _temp7(s) {
  return s.remoteConnectionStatus;
}
function Spinner() {
  const $ = _c(8);
  const settings = useSettings();
  const reducedMotion = settings.prefersReducedMotion ?? false;
  const [ref, time] = useAnimationFrame(reducedMotion ? null : 120);
  if (reducedMotion) {
    let t02;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t02 = /* @__PURE__ */ jsx(Text, { color: "text", children: "\u25CF" });
      $[0] = t02;
    } else {
      t02 = $[0];
    }
    let t12;
    if ($[1] !== ref) {
      t12 = /* @__PURE__ */ jsx(Box, { ref, flexWrap: "wrap", height: 1, width: 2, children: t02 });
      $[1] = ref;
      $[2] = t12;
    } else {
      t12 = $[2];
    }
    return t12;
  }
  const frame = Math.floor(time / 120) % SPINNER_FRAMES.length;
  const t0 = SPINNER_FRAMES[frame];
  let t1;
  if ($[3] !== t0) {
    t1 = /* @__PURE__ */ jsx(Text, { color: "text", children: t0 });
    $[3] = t0;
    $[4] = t1;
  } else {
    t1 = $[4];
  }
  let t2;
  if ($[5] !== ref || $[6] !== t1) {
    t2 = /* @__PURE__ */ jsx(Box, { ref, flexWrap: "wrap", height: 1, width: 2, children: t1 });
    $[5] = ref;
    $[6] = t1;
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  return t2;
}
function findNextPendingTask(tasks) {
  if (!tasks) {
    return void 0;
  }
  const pendingTasks = tasks.filter((t) => t.status === "pending");
  if (pendingTasks.length === 0) {
    return void 0;
  }
  const unresolvedIds = new Set(tasks.filter((t) => t.status !== "completed").map((t) => t.id));
  return pendingTasks.find((t) => !t.blockedBy.some((id) => unresolvedIds.has(id))) ?? pendingTasks[0];
}
export {
  BriefIdleStatus,
  Spinner,
  SpinnerWithVerb
};
