import { jsx, jsxs } from "react/jsx-runtime";
import figures from "figures";
import sample from "lodash-es/sample.js";
import { useRef, useState } from "react";
import { getSpinnerVerbs } from "../../constants/spinnerVerbs.js";
import { TURN_COMPLETION_VERBS } from "../../constants/turnCompletionVerbs.js";
import { useElapsedTime } from "../../hooks/useElapsedTime.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { stringWidth } from "../../ink/stringWidth.js";
import { Box, Text } from "../../ink.js";
import { summarizeRecentActivities } from "../../utils/collapseReadSearch.js";
import { formatDuration, formatNumber, truncateToWidth } from "../../utils/format.js";
import { toInkColor } from "../../utils/ink.js";
import { TEAMMATE_SELECT_HINT } from "./teammateSelectHint.js";
function getMessagePreview(messages) {
  if (!messages?.length) return [];
  const allLines = [];
  const maxLineLength = 80;
  for (let i = messages.length - 1; i >= 0 && allLines.length < 3; i--) {
    const msg = messages[i];
    if (!msg || msg.type !== "user" && msg.type !== "assistant" || !msg.message?.content?.length) {
      continue;
    }
    const content = msg.message.content;
    for (const block of content) {
      if (allLines.length >= 3) break;
      if (!block || typeof block !== "object") continue;
      if ("type" in block && block.type === "tool_use" && "name" in block) {
        const input = "input" in block ? block.input : null;
        let toolLine = `Using ${block.name}\u2026`;
        if (input) {
          const desc = input.description || input.prompt || input.command || input.query || input.pattern;
          if (desc) {
            toolLine = desc.split("\n")[0] ?? toolLine;
          }
        }
        allLines.push(truncateToWidth(toolLine, maxLineLength));
      } else if ("type" in block && block.type === "text" && "text" in block) {
        const textLines = block.text.split("\n").filter((l) => l.trim());
        for (let j = textLines.length - 1; j >= 0 && allLines.length < 3; j--) {
          const line = textLines[j];
          if (!line) continue;
          allLines.push(truncateToWidth(line, maxLineLength));
        }
      }
    }
  }
  return allLines.reverse();
}
function TeammateSpinnerLine({
  teammate,
  isLast,
  isSelected,
  isForegrounded,
  allIdle,
  showPreview
}) {
  const [randomVerb] = useState(() => teammate.spinnerVerb ?? sample(getSpinnerVerbs()));
  const [pastTenseVerb] = useState(() => teammate.pastTenseVerb ?? sample(TURN_COMPLETION_VERBS));
  const isHighlighted = isSelected || isForegrounded;
  const treeChar = isHighlighted ? isLast ? "\u2558\u2550" : "\u255E\u2550" : isLast ? "\u2514\u2500" : "\u251C\u2500";
  const nameColor = toInkColor(teammate.identity.color);
  const {
    columns
  } = useTerminalSize();
  const idleStartRef = useRef(null);
  const frozenDurationRef = useRef(null);
  if (teammate.isIdle && idleStartRef.current === null) {
    idleStartRef.current = Date.now();
  } else if (!teammate.isIdle) {
    idleStartRef.current = null;
  }
  if (!allIdle && frozenDurationRef.current !== null) {
    frozenDurationRef.current = null;
  }
  const idleElapsedTime = useElapsedTime(idleStartRef.current ?? Date.now(), teammate.isIdle && !allIdle);
  if (allIdle && frozenDurationRef.current === null) {
    frozenDurationRef.current = formatDuration(Math.max(0, Date.now() - teammate.startTime - (teammate.totalPausedMs ?? 0)));
  }
  const displayTime = allIdle ? frozenDurationRef.current ?? (() => {
    throw new Error(`frozenDurationRef is null for idle teammate ${teammate.identity.agentName}`);
  })() : idleElapsedTime;
  const basePrefix = 8;
  const fullAgentName = `@${teammate.identity.agentName}`;
  const fullNameWidth = stringWidth(fullAgentName);
  const toolUseCount = teammate.progress?.toolUseCount ?? 0;
  const tokenCount = teammate.progress?.tokenCount ?? 0;
  const statsText = ` \xB7 ${toolUseCount} tool ${toolUseCount === 1 ? "use" : "uses"} \xB7 ${formatNumber(tokenCount)} tokens`;
  const statsWidth = stringWidth(statsText);
  const selectHintText = ` \xB7 ${TEAMMATE_SELECT_HINT}`;
  const selectHintWidth = stringWidth(selectHintText);
  const viewHintText = " \xB7 enter to view";
  const viewHintWidth = stringWidth(viewHintText);
  const minActivityWidth = 25;
  const spaceWithFullName = columns - basePrefix - fullNameWidth - 2;
  const showName = columns >= 60 && spaceWithFullName >= minActivityWidth;
  const nameWidth = showName ? fullNameWidth + 2 : 0;
  const availableForActivity = columns - basePrefix - nameWidth;
  const showViewHint = isSelected && !isForegrounded && availableForActivity > viewHintWidth + statsWidth + minActivityWidth + 5;
  const showSelectHint = isHighlighted && availableForActivity > selectHintWidth + (showViewHint ? viewHintWidth : 0) + statsWidth + minActivityWidth + 5;
  const showStats = availableForActivity > statsWidth + minActivityWidth + 5;
  const extrasCost = (showStats ? statsWidth : 0) + (showSelectHint ? selectHintWidth : 0) + (showViewHint ? viewHintWidth : 0);
  const activityMaxWidth = Math.max(minActivityWidth, availableForActivity - extrasCost - 1);
  const activityText = (() => {
    const activities = teammate.progress?.recentActivities;
    if (activities && activities.length > 0) {
      const summary = summarizeRecentActivities(activities);
      if (summary) return truncateToWidth(summary, activityMaxWidth);
    }
    const desc = teammate.progress?.lastActivity?.activityDescription;
    if (desc) return truncateToWidth(desc, activityMaxWidth);
    return randomVerb;
  })();
  const renderStatus = () => {
    if (teammate.shutdownRequested) {
      return /* @__PURE__ */ jsx(Text, { dimColor: true, children: "[stopping]" });
    }
    if (teammate.awaitingPlanApproval) {
      return /* @__PURE__ */ jsx(Text, { color: "warning", children: "[awaiting approval]" });
    }
    if (teammate.isIdle) {
      if (allIdle) {
        return /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          pastTenseVerb,
          " for ",
          displayTime
        ] });
      }
      return /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Idle for ",
        idleElapsedTime
      ] });
    }
    if (isHighlighted) {
      return null;
    }
    return /* @__PURE__ */ jsx(Text, { dimColor: true, children: activityText?.endsWith("\u2026") ? activityText : `${activityText}\u2026` });
  };
  const previewLines = showPreview ? getMessagePreview(teammate.messages) : [];
  const previewTreeChar = isLast ? "   " : "\u2502  ";
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs(Box, { paddingLeft: 3, children: [
      /* @__PURE__ */ jsx(Text, { color: isSelected ? "suggestion" : void 0, bold: isSelected, children: isSelected ? figures.pointer : " " }),
      /* @__PURE__ */ jsxs(Text, { dimColor: !isSelected, children: [
        treeChar,
        " "
      ] }),
      showName && /* @__PURE__ */ jsxs(Text, { color: isSelected ? "suggestion" : nameColor, children: [
        "@",
        teammate.identity.agentName
      ] }),
      showName && /* @__PURE__ */ jsx(Text, { dimColor: !isSelected, children: ": " }),
      renderStatus(),
      showStats && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " ",
        "\xB7 ",
        toolUseCount,
        " tool ",
        toolUseCount === 1 ? "use" : "uses",
        " \xB7",
        " ",
        formatNumber(tokenCount),
        " tokens"
      ] }),
      showSelectHint && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " \xB7 ",
        TEAMMATE_SELECT_HINT
      ] }),
      showViewHint && /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 enter to view" })
    ] }),
    previewLines.map((line, idx) => /* @__PURE__ */ jsxs(Box, { paddingLeft: 3, children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: " " }),
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        previewTreeChar,
        " "
      ] }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: line })
    ] }, idx))
  ] });
}
export {
  TeammateSpinnerLine
};
