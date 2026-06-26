import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import * as React from "react";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { stringWidth } from "../ink/stringWidth.js";
import { Box, Text } from "../ink.js";
import { useAppState } from "../state/AppState.js";
import { isInProcessTeammateTask } from "../tasks/InProcessTeammateTask/types.js";
import { AGENT_COLOR_TO_THEME_COLOR } from "../tools/AgentTool/agentColorManager.js";
import { isAgentSwarmsEnabled } from "../utils/agentSwarmsEnabled.js";
import { count } from "../utils/array.js";
import { summarizeRecentActivities } from "../utils/collapseReadSearch.js";
import { truncateToWidth } from "../utils/format.js";
import { isTodoV2Enabled } from "../utils/tasks.js";
import ThemedText from "./design-system/ThemedText.js";
const RECENT_COMPLETED_TTL_MS = 3e4;
function byIdAsc(a, b) {
  const aNum = parseInt(a.id, 10);
  const bNum = parseInt(b.id, 10);
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum - bNum;
  }
  return a.id.localeCompare(b.id);
}
function TaskListV2({
  tasks,
  isStandalone = false
}) {
  const teamContext = useAppState((s) => s.teamContext);
  const appStateTasks = useAppState((s_0) => s_0.tasks);
  const [, forceUpdate] = React.useState(0);
  const {
    rows,
    columns
  } = useTerminalSize();
  const completionTimestampsRef = React.useRef(/* @__PURE__ */ new Map());
  const previousCompletedIdsRef = React.useRef(null);
  if (previousCompletedIdsRef.current === null) {
    previousCompletedIdsRef.current = new Set(tasks.filter((t) => t.status === "completed").map((t_0) => t_0.id));
  }
  const maxDisplay = rows <= 10 ? 0 : Math.min(10, Math.max(3, rows - 14));
  const currentCompletedIds = new Set(tasks.filter((t_1) => t_1.status === "completed").map((t_2) => t_2.id));
  const now = Date.now();
  for (const id of currentCompletedIds) {
    if (!previousCompletedIdsRef.current.has(id)) {
      completionTimestampsRef.current.set(id, now);
    }
  }
  for (const id_0 of completionTimestampsRef.current.keys()) {
    if (!currentCompletedIds.has(id_0)) {
      completionTimestampsRef.current.delete(id_0);
    }
  }
  previousCompletedIdsRef.current = currentCompletedIds;
  React.useEffect(() => {
    if (completionTimestampsRef.current.size === 0) {
      return;
    }
    const currentNow = Date.now();
    let earliestExpiry = Infinity;
    for (const ts of completionTimestampsRef.current.values()) {
      const expiry = ts + RECENT_COMPLETED_TTL_MS;
      if (expiry > currentNow && expiry < earliestExpiry) {
        earliestExpiry = expiry;
      }
    }
    if (earliestExpiry === Infinity) {
      return;
    }
    const timer = setTimeout((forceUpdate_0) => forceUpdate_0((n) => n + 1), earliestExpiry - currentNow, forceUpdate);
    return () => clearTimeout(timer);
  }, [tasks]);
  if (!isTodoV2Enabled()) {
    return null;
  }
  if (tasks.length === 0) {
    return null;
  }
  const teammateColors = {};
  if (isAgentSwarmsEnabled() && teamContext?.teammates) {
    for (const teammate of Object.values(teamContext.teammates)) {
      if (teammate.color) {
        const themeColor = AGENT_COLOR_TO_THEME_COLOR[teammate.color];
        if (themeColor) {
          teammateColors[teammate.name] = themeColor;
        }
      }
    }
  }
  const teammateActivity = {};
  const activeTeammates = /* @__PURE__ */ new Set();
  if (isAgentSwarmsEnabled()) {
    for (const bgTask of Object.values(appStateTasks)) {
      if (isInProcessTeammateTask(bgTask) && bgTask.status === "running") {
        activeTeammates.add(bgTask.identity.agentName);
        activeTeammates.add(bgTask.identity.agentId);
        const activities = bgTask.progress?.recentActivities;
        const desc = (activities && summarizeRecentActivities(activities)) ?? bgTask.progress?.lastActivity?.activityDescription;
        if (desc) {
          teammateActivity[bgTask.identity.agentName] = desc;
          teammateActivity[bgTask.identity.agentId] = desc;
        }
      }
    }
  }
  const completedCount = count(tasks, (t_3) => t_3.status === "completed");
  const pendingCount = count(tasks, (t_4) => t_4.status === "pending");
  const inProgressCount = tasks.length - completedCount - pendingCount;
  const unresolvedTaskIds = new Set(tasks.filter((t_5) => t_5.status !== "completed").map((t_6) => t_6.id));
  const needsTruncation = tasks.length > maxDisplay;
  let visibleTasks;
  let hiddenTasks;
  if (needsTruncation) {
    const recentCompleted = [];
    const olderCompleted = [];
    for (const task of tasks.filter((t_7) => t_7.status === "completed")) {
      const ts_0 = completionTimestampsRef.current.get(task.id);
      if (ts_0 && now - ts_0 < RECENT_COMPLETED_TTL_MS) {
        recentCompleted.push(task);
      } else {
        olderCompleted.push(task);
      }
    }
    recentCompleted.sort(byIdAsc);
    olderCompleted.sort(byIdAsc);
    const inProgress = tasks.filter((t_8) => t_8.status === "in_progress").sort(byIdAsc);
    const pending = tasks.filter((t_9) => t_9.status === "pending").sort((a, b) => {
      const aBlocked = a.blockedBy.some((id_1) => unresolvedTaskIds.has(id_1));
      const bBlocked = b.blockedBy.some((id_2) => unresolvedTaskIds.has(id_2));
      if (aBlocked !== bBlocked) {
        return aBlocked ? 1 : -1;
      }
      return byIdAsc(a, b);
    });
    const prioritized = [...recentCompleted, ...inProgress, ...pending, ...olderCompleted];
    visibleTasks = prioritized.slice(0, maxDisplay);
    hiddenTasks = prioritized.slice(maxDisplay);
  } else {
    visibleTasks = [...tasks].sort(byIdAsc);
    hiddenTasks = [];
  }
  let hiddenSummary = "";
  if (hiddenTasks.length > 0) {
    const parts = [];
    const hiddenPending = count(hiddenTasks, (t_10) => t_10.status === "pending");
    const hiddenInProgress = count(hiddenTasks, (t_11) => t_11.status === "in_progress");
    const hiddenCompleted = count(hiddenTasks, (t_12) => t_12.status === "completed");
    if (hiddenInProgress > 0) {
      parts.push(`${hiddenInProgress} in progress`);
    }
    if (hiddenPending > 0) {
      parts.push(`${hiddenPending} pending`);
    }
    if (hiddenCompleted > 0) {
      parts.push(`${hiddenCompleted} completed`);
    }
    hiddenSummary = ` \u2026 +${parts.join(", ")}`;
  }
  const content = /* @__PURE__ */ jsxs(Fragment, { children: [
    visibleTasks.map((task_0) => /* @__PURE__ */ jsx(TaskItem, { task: task_0, ownerColor: task_0.owner ? teammateColors[task_0.owner] : void 0, openBlockers: task_0.blockedBy.filter((id_3) => unresolvedTaskIds.has(id_3)), activity: task_0.owner ? teammateActivity[task_0.owner] : void 0, ownerActive: task_0.owner ? activeTeammates.has(task_0.owner) : false, columns }, task_0.id)),
    maxDisplay > 0 && hiddenSummary && /* @__PURE__ */ jsx(Text, { dimColor: true, children: hiddenSummary })
  ] });
  if (isStandalone) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, marginLeft: 2, children: [
      /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: tasks.length }),
        " tasks (",
        /* @__PURE__ */ jsx(Text, { bold: true, children: completedCount }),
        " done, ",
        inProgressCount > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: inProgressCount }),
          " in progress, "
        ] }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: pendingCount }),
        " open)"
      ] }) }),
      content
    ] });
  }
  return /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: content });
}
function getTaskIcon(status) {
  switch (status) {
    case "completed":
      return {
        icon: figures.tick,
        color: "success"
      };
    case "in_progress":
      return {
        icon: figures.squareSmallFilled,
        color: "claude"
      };
    case "pending":
      return {
        icon: figures.squareSmall,
        color: void 0
      };
  }
}
function TaskItem(t0) {
  const $ = _c(37);
  const {
    task,
    ownerColor,
    openBlockers,
    activity,
    ownerActive,
    columns
  } = t0;
  const isCompleted = task.status === "completed";
  const isInProgress = task.status === "in_progress";
  const isBlocked = openBlockers.length > 0;
  let t1;
  if ($[0] !== task.status) {
    t1 = getTaskIcon(task.status);
    $[0] = task.status;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const {
    icon,
    color
  } = t1;
  const showActivity = isInProgress && !isBlocked && activity;
  const showOwner = columns >= 60 && task.owner && ownerActive;
  let t2;
  if ($[2] !== showOwner || $[3] !== task.owner) {
    t2 = showOwner ? stringWidth(` (@${task.owner})`) : 0;
    $[2] = showOwner;
    $[3] = task.owner;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  const ownerWidth = t2;
  const maxSubjectWidth = Math.max(15, columns - 15 - ownerWidth);
  let t3;
  if ($[5] !== maxSubjectWidth || $[6] !== task.subject) {
    t3 = truncateToWidth(task.subject, maxSubjectWidth);
    $[5] = maxSubjectWidth;
    $[6] = task.subject;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  const displaySubject = t3;
  const maxActivityWidth = Math.max(15, columns - 15);
  let t4;
  if ($[8] !== activity || $[9] !== maxActivityWidth) {
    t4 = activity ? truncateToWidth(activity, maxActivityWidth) : void 0;
    $[8] = activity;
    $[9] = maxActivityWidth;
    $[10] = t4;
  } else {
    t4 = $[10];
  }
  const displayActivity = t4;
  let t5;
  if ($[11] !== color || $[12] !== icon) {
    t5 = /* @__PURE__ */ jsxs(Text, { color, children: [
      icon,
      " "
    ] });
    $[11] = color;
    $[12] = icon;
    $[13] = t5;
  } else {
    t5 = $[13];
  }
  const t6 = isCompleted || isBlocked;
  let t7;
  if ($[14] !== displaySubject || $[15] !== isCompleted || $[16] !== isInProgress || $[17] !== t6) {
    t7 = /* @__PURE__ */ jsx(Text, { bold: isInProgress, strikethrough: isCompleted, dimColor: t6, children: displaySubject });
    $[14] = displaySubject;
    $[15] = isCompleted;
    $[16] = isInProgress;
    $[17] = t6;
    $[18] = t7;
  } else {
    t7 = $[18];
  }
  let t8;
  if ($[19] !== ownerColor || $[20] !== showOwner || $[21] !== task.owner) {
    t8 = showOwner && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " (",
      ownerColor ? /* @__PURE__ */ jsxs(ThemedText, { color: ownerColor, children: [
        "@",
        task.owner
      ] }) : `@${task.owner}`,
      ")"
    ] });
    $[19] = ownerColor;
    $[20] = showOwner;
    $[21] = task.owner;
    $[22] = t8;
  } else {
    t8 = $[22];
  }
  let t9;
  if ($[23] !== isBlocked || $[24] !== openBlockers) {
    t9 = isBlocked && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " ",
      figures.pointerSmall,
      " blocked by",
      " ",
      [...openBlockers].sort(_temp).map(_temp2).join(", ")
    ] });
    $[23] = isBlocked;
    $[24] = openBlockers;
    $[25] = t9;
  } else {
    t9 = $[25];
  }
  let t10;
  if ($[26] !== t5 || $[27] !== t7 || $[28] !== t8 || $[29] !== t9) {
    t10 = /* @__PURE__ */ jsxs(Box, { children: [
      t5,
      t7,
      t8,
      t9
    ] });
    $[26] = t5;
    $[27] = t7;
    $[28] = t8;
    $[29] = t9;
    $[30] = t10;
  } else {
    t10 = $[30];
  }
  let t11;
  if ($[31] !== displayActivity || $[32] !== showActivity) {
    t11 = showActivity && displayActivity && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "  ",
      displayActivity,
      figures.ellipsis
    ] }) });
    $[31] = displayActivity;
    $[32] = showActivity;
    $[33] = t11;
  } else {
    t11 = $[33];
  }
  let t12;
  if ($[34] !== t10 || $[35] !== t11) {
    t12 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t10,
      t11
    ] });
    $[34] = t10;
    $[35] = t11;
    $[36] = t12;
  } else {
    t12 = $[36];
  }
  return t12;
}
function _temp2(id) {
  return `#${id}`;
}
function _temp(a, b) {
  return parseInt(a, 10) - parseInt(b, 10);
}
export {
  TaskListV2
};
