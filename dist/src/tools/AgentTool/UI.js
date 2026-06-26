import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { ConfigurableShortcutHint } from "../../components/ConfigurableShortcutHint.js";
import { CtrlOToExpand, SubAgentProvider } from "../../components/CtrlOToExpand.js";
import { Byline } from "../../components/design-system/Byline.js";
import { KeyboardShortcutHint } from "../../components/design-system/KeyboardShortcutHint.js";
import { AgentProgressLine } from "../../components/AgentProgressLine.js";
import { FallbackToolUseErrorMessage } from "../../components/FallbackToolUseErrorMessage.js";
import { FallbackToolUseRejectedMessage } from "../../components/FallbackToolUseRejectedMessage.js";
import { Markdown } from "../../components/Markdown.js";
import { Message as MessageComponent } from "../../components/Message.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { ToolUseLoader } from "../../components/ToolUseLoader.js";
import { Box, Text } from "../../ink.js";
import "../../services/api/dumpPrompts.js";
import { findToolByName } from "../../Tool.js";
import { count } from "../../utils/array.js";
import { getSearchOrReadFromContent, getSearchReadSummaryText } from "../../utils/collapseReadSearch.js";
import "../../utils/file.js";
import { formatDuration, formatNumber } from "../../utils/format.js";
import { buildSubagentLookups, createAssistantMessage, EMPTY_LOOKUPS } from "../../utils/messages.js";
import { getMainLoopModel, parseUserSpecifiedModel, renderModelName } from "../../utils/model/model.js";
import { inputSchema } from "./AgentTool.js";
import { getAgentColor } from "./agentColorManager.js";
import { GENERAL_PURPOSE_AGENT } from "./built-in/generalPurposeAgent.js";
const MAX_PROGRESS_MESSAGES_TO_SHOW = 3;
function hasProgressMessage(data) {
  if (!("message" in data)) {
    return false;
  }
  const msg = data.message;
  return msg != null && typeof msg === "object" && "type" in msg;
}
function getSearchOrReadInfo(progressMessage, tools, toolUseByID) {
  if (!hasProgressMessage(progressMessage.data)) {
    return null;
  }
  const message = progressMessage.data.message;
  if (message.type === "assistant") {
    return getSearchOrReadFromContent(message.message.content[0], tools);
  }
  if (message.type === "user") {
    const content = message.message.content[0];
    if (content?.type === "tool_result") {
      const toolUse = toolUseByID.get(content.tool_use_id);
      if (toolUse) {
        return getSearchOrReadFromContent(toolUse, tools);
      }
    }
  }
  return null;
}
function processProgressMessages(messages, tools, isAgentRunning) {
  if (true) {
    return messages.filter((m) => hasProgressMessage(m.data) && m.data.message.type !== "user").map((m) => ({
      type: "original",
      message: m
    }));
  }
  const result = [];
  let currentGroup = null;
  function flushGroup(isActive) {
    if (currentGroup && (currentGroup.searchCount > 0 || currentGroup.readCount > 0 || currentGroup.replCount > 0)) {
      result.push({
        type: "summary",
        searchCount: currentGroup.searchCount,
        readCount: currentGroup.readCount,
        replCount: currentGroup.replCount,
        uuid: `summary-${currentGroup.startUuid}`,
        isActive
      });
    }
    currentGroup = null;
  }
  const agentMessages = messages.filter((m) => hasProgressMessage(m.data));
  const toolUseByID = /* @__PURE__ */ new Map();
  for (const msg of agentMessages) {
    if (msg.data.message.type === "assistant") {
      for (const c of msg.data.message.message.content) {
        if (c.type === "tool_use") {
          toolUseByID.set(c.id, c);
        }
      }
    }
    const info = getSearchOrReadInfo(msg, tools, toolUseByID);
    if (info && (info.isSearch || info.isRead || info.isREPL)) {
      if (!currentGroup) {
        currentGroup = {
          searchCount: 0,
          readCount: 0,
          replCount: 0,
          startUuid: msg.uuid
        };
      }
      if (msg.data.message.type === "user") {
        if (info.isSearch) {
          currentGroup.searchCount++;
        } else if (info.isREPL) {
          currentGroup.replCount++;
        } else if (info.isRead) {
          currentGroup.readCount++;
        }
      }
    } else {
      flushGroup(false);
      if (msg.data.message.type !== "user") {
        result.push({
          type: "original",
          message: msg
        });
      }
    }
  }
  flushGroup(isAgentRunning);
  return result;
}
const ESTIMATED_LINES_PER_TOOL = 9;
const TERMINAL_BUFFER_LINES = 7;
function AgentPromptDisplay(t0) {
  const $ = _c(3);
  const {
    prompt,
    dim: t1
  } = t0;
  t1 === void 0 ? false : t1;
  let t2;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsx(Text, { color: "success", bold: true, children: "Prompt:" });
    $[0] = t2;
  } else {
    t2 = $[0];
  }
  let t3;
  if ($[1] !== prompt) {
    t3 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t2,
      /* @__PURE__ */ jsx(Box, { paddingLeft: 2, children: /* @__PURE__ */ jsx(Markdown, { children: prompt }) })
    ] });
    $[1] = prompt;
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  return t3;
}
function AgentResponseDisplay(t0) {
  const $ = _c(5);
  const {
    content
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsx(Text, { color: "success", bold: true, children: "Response:" });
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== content) {
    t2 = content.map(_temp);
    $[1] = content;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== t2) {
    t3 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t1,
      t2
    ] });
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  return t3;
}
function _temp(block, index) {
  return /* @__PURE__ */ jsx(Box, { paddingLeft: 2, marginTop: index === 0 ? 0 : 1, children: /* @__PURE__ */ jsx(Markdown, { children: block.text }) }, index);
}
function VerboseAgentTranscript(t0) {
  const $ = _c(15);
  const {
    progressMessages,
    tools,
    verbose
  } = t0;
  let t1;
  if ($[0] !== progressMessages) {
    t1 = buildSubagentLookups(progressMessages.filter(_temp2).map(_temp3));
    $[0] = progressMessages;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const {
    lookups: agentLookups,
    inProgressToolUseIDs
  } = t1;
  let t2;
  if ($[2] !== agentLookups || $[3] !== inProgressToolUseIDs || $[4] !== progressMessages || $[5] !== tools || $[6] !== verbose) {
    const filteredMessages = progressMessages.filter(_temp4);
    let t32;
    if ($[8] !== agentLookups || $[9] !== inProgressToolUseIDs || $[10] !== tools || $[11] !== verbose) {
      t32 = (progressMessage) => /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(MessageComponent, { message: progressMessage.data.message, lookups: agentLookups, addMargin: false, tools, commands: [], verbose, inProgressToolUseIDs, progressMessagesForMessage: [], shouldAnimate: false, shouldShowDot: false, isTranscriptMode: false, isStatic: true }) }, progressMessage.uuid);
      $[8] = agentLookups;
      $[9] = inProgressToolUseIDs;
      $[10] = tools;
      $[11] = verbose;
      $[12] = t32;
    } else {
      t32 = $[12];
    }
    t2 = filteredMessages.map(t32);
    $[2] = agentLookups;
    $[3] = inProgressToolUseIDs;
    $[4] = progressMessages;
    $[5] = tools;
    $[6] = verbose;
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  let t3;
  if ($[13] !== t2) {
    t3 = /* @__PURE__ */ jsx(Fragment, { children: t2 });
    $[13] = t2;
    $[14] = t3;
  } else {
    t3 = $[14];
  }
  return t3;
}
function _temp4(pm_1) {
  if (!hasProgressMessage(pm_1.data)) {
    return false;
  }
  const msg = pm_1.data.message;
  if (msg.type === "user" && msg.toolUseResult === void 0) {
    return false;
  }
  return true;
}
function _temp3(pm_0) {
  return pm_0.data;
}
function _temp2(pm) {
  return hasProgressMessage(pm.data);
}
function renderToolResultMessage(data, progressMessagesForMessage, {
  tools,
  verbose,
  theme,
  isTranscriptMode = false
}) {
  const internal = data;
  if (internal.status === "remote_launched") {
    return /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
      "Remote agent launched",
      " ",
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "\xB7 ",
        internal.taskId,
        " \xB7 ",
        internal.sessionUrl
      ] })
    ] }) }) });
  }
  if (data.status === "async_launched") {
    const {
      prompt: prompt2
    } = data;
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
        "Backgrounded agent",
        !isTranscriptMode && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          " (",
          /* @__PURE__ */ jsxs(Byline, { children: [
            /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2193", action: "manage" }),
            prompt2 && /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "app:toggleTranscript", context: "Global", fallback: "ctrl+o", description: "expand" })
          ] }),
          ")"
        ] })
      ] }) }),
      isTranscriptMode && prompt2 && /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(AgentPromptDisplay, { prompt: prompt2, theme }) })
    ] });
  }
  if (data.status !== "completed") {
    return null;
  }
  const {
    agentId,
    totalDurationMs,
    totalToolUseCount,
    totalTokens,
    usage,
    content,
    prompt
  } = data;
  const result = [totalToolUseCount === 1 ? "1 tool use" : `${totalToolUseCount} tool uses`, formatNumber(totalTokens) + " tokens", formatDuration(totalDurationMs)];
  const completionMessage = `Done (${result.join(" \xB7 ")})`;
  const finalAssistantMessage = createAssistantMessage({
    content: completionMessage,
    usage: {
      ...usage,
      inference_geo: null,
      iterations: null,
      speed: null
    }
  });
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    false,
    isTranscriptMode && prompt && /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(AgentPromptDisplay, { prompt, theme }) }),
    isTranscriptMode ? /* @__PURE__ */ jsx(SubAgentProvider, { children: /* @__PURE__ */ jsx(VerboseAgentTranscript, { progressMessages: progressMessagesForMessage, tools, verbose }) }) : null,
    isTranscriptMode && content && content.length > 0 && /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(AgentResponseDisplay, { content, theme }) }),
    /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(MessageComponent, { message: finalAssistantMessage, lookups: EMPTY_LOOKUPS, addMargin: false, tools, commands: [], verbose, inProgressToolUseIDs: /* @__PURE__ */ new Set(), progressMessagesForMessage: [], shouldAnimate: false, shouldShowDot: false, isTranscriptMode: false, isStatic: true }) }),
    !isTranscriptMode && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "  ",
      /* @__PURE__ */ jsx(CtrlOToExpand, {})
    ] })
  ] });
}
function renderToolUseMessage({
  description,
  prompt
}) {
  if (!description || !prompt) {
    return null;
  }
  return description;
}
function renderToolUseTag(input) {
  const tags = [];
  if (input.model) {
    const mainModel = getMainLoopModel();
    const agentModel = parseUserSpecifiedModel(input.model);
    if (agentModel !== mainModel) {
      tags.push(/* @__PURE__ */ jsx(Box, { flexWrap: "nowrap", marginLeft: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: renderModelName(agentModel) }) }, "model"));
    }
  }
  if (tags.length === 0) {
    return null;
  }
  return /* @__PURE__ */ jsx(Fragment, { children: tags });
}
const INITIALIZING_TEXT = "Initializing\u2026";
function renderToolUseProgressMessage(progressMessages, {
  tools,
  verbose,
  terminalSize,
  inProgressToolCallCount,
  isTranscriptMode = false
}) {
  if (!progressMessages.length) {
    return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: INITIALIZING_TEXT }) });
  }
  const toolToolRenderLinesEstimate = (inProgressToolCallCount ?? 1) * ESTIMATED_LINES_PER_TOOL + TERMINAL_BUFFER_LINES;
  const shouldUseCondensedMode = !isTranscriptMode && terminalSize && terminalSize.rows && terminalSize.rows < toolToolRenderLinesEstimate;
  const getProgressStats = () => {
    const toolUseCount = count(progressMessages, (msg) => {
      if (!hasProgressMessage(msg.data)) {
        return false;
      }
      const message = msg.data.message;
      return message.message.content.some((content) => content.type === "tool_use");
    });
    const latestAssistant = progressMessages.findLast((msg) => hasProgressMessage(msg.data) && msg.data.message.type === "assistant");
    let tokens = null;
    if (latestAssistant?.data.message.type === "assistant") {
      const usage = latestAssistant.data.message.message.usage;
      tokens = (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + usage.input_tokens + usage.output_tokens;
    }
    return {
      toolUseCount,
      tokens
    };
  };
  if (shouldUseCondensedMode) {
    const {
      toolUseCount,
      tokens
    } = getProgressStats();
    return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "In progress\u2026 \xB7 ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: toolUseCount }),
      " tool",
      " ",
      toolUseCount === 1 ? "use" : "uses",
      tokens && ` \xB7 ${formatNumber(tokens)} tokens`,
      " \xB7",
      " ",
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "app:toggleTranscript", context: "Global", fallback: "ctrl+o", description: "expand", parens: true })
    ] }) });
  }
  const processedMessages = processProgressMessages(progressMessages, tools, true);
  const displayedMessages = isTranscriptMode ? processedMessages : processedMessages.slice(-MAX_PROGRESS_MESSAGES_TO_SHOW);
  const hiddenMessages = isTranscriptMode ? [] : processedMessages.slice(0, Math.max(0, processedMessages.length - MAX_PROGRESS_MESSAGES_TO_SHOW));
  const hiddenToolUseCount = count(hiddenMessages, (m) => {
    if (m.type === "summary") {
      return m.searchCount + m.readCount + m.replCount > 0;
    }
    const data = m.message.data;
    if (!hasProgressMessage(data)) {
      return false;
    }
    return data.message.message.content.some((content) => content.type === "tool_use");
  });
  const firstData = progressMessages[0]?.data;
  const prompt = firstData && hasProgressMessage(firstData) ? firstData.prompt : void 0;
  if (displayedMessages.length === 0 && !(isTranscriptMode && prompt)) {
    return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: INITIALIZING_TEXT }) });
  }
  const {
    lookups: subagentLookups,
    inProgressToolUseIDs: collapsedInProgressIDs
  } = buildSubagentLookups(progressMessages.filter((pm) => hasProgressMessage(pm.data)).map((pm) => pm.data));
  return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs(SubAgentProvider, { children: [
      isTranscriptMode && prompt && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(AgentPromptDisplay, { prompt }) }),
      displayedMessages.map((processed) => {
        if (processed.type === "summary") {
          const summaryText = getSearchReadSummaryText(processed.searchCount, processed.readCount, processed.isActive, processed.replCount);
          return /* @__PURE__ */ jsx(Box, { height: 1, overflow: "hidden", children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: summaryText }) }, processed.uuid);
        }
        return /* @__PURE__ */ jsx(MessageComponent, { message: processed.message.data.message, lookups: subagentLookups, addMargin: false, tools, commands: [], verbose, inProgressToolUseIDs: collapsedInProgressIDs, progressMessagesForMessage: [], shouldAnimate: false, shouldShowDot: false, style: "condensed", isTranscriptMode: false, isStatic: true }, processed.message.uuid);
      })
    ] }),
    hiddenToolUseCount > 0 && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "+",
      hiddenToolUseCount,
      " more tool",
      " ",
      hiddenToolUseCount === 1 ? "use" : "uses",
      " ",
      /* @__PURE__ */ jsx(CtrlOToExpand, {})
    ] })
  ] }) });
}
function renderToolUseRejectedMessage(_input, {
  progressMessagesForMessage,
  tools,
  verbose,
  isTranscriptMode
}) {
  const firstData = progressMessagesForMessage[0]?.data;
  const agentId = firstData && hasProgressMessage(firstData) ? firstData.agentId : void 0;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    false,
    renderToolUseProgressMessage(progressMessagesForMessage, {
      tools,
      verbose,
      isTranscriptMode
    }),
    /* @__PURE__ */ jsx(FallbackToolUseRejectedMessage, {})
  ] });
}
function renderToolUseErrorMessage(result, {
  progressMessagesForMessage,
  tools,
  verbose,
  isTranscriptMode
}) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    renderToolUseProgressMessage(progressMessagesForMessage, {
      tools,
      verbose,
      isTranscriptMode
    }),
    /* @__PURE__ */ jsx(FallbackToolUseErrorMessage, { result, verbose })
  ] });
}
function calculateAgentStats(progressMessages) {
  const toolUseCount = count(progressMessages, (msg) => {
    if (!hasProgressMessage(msg.data)) {
      return false;
    }
    const message = msg.data.message;
    return message.type === "user" && message.message.content.some((content) => content.type === "tool_result");
  });
  const latestAssistant = progressMessages.findLast((msg) => hasProgressMessage(msg.data) && msg.data.message.type === "assistant");
  let tokens = null;
  if (latestAssistant?.data.message.type === "assistant") {
    const usage = latestAssistant.data.message.message.usage;
    tokens = (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + usage.input_tokens + usage.output_tokens;
  }
  return {
    toolUseCount,
    tokens
  };
}
function renderGroupedAgentToolUse(toolUses, options) {
  const {
    shouldAnimate,
    tools
  } = options;
  const agentStats = toolUses.map(({
    param,
    isResolved,
    isError,
    progressMessages,
    result
  }) => {
    const stats = calculateAgentStats(progressMessages);
    const lastToolInfo = extractLastToolInfo(progressMessages, tools);
    const parsedInput = inputSchema().safeParse(param.input);
    const isTeammateSpawn = result?.output?.status === "teammate_spawned";
    let agentType;
    let description;
    let color;
    let descriptionColor;
    let taskDescription;
    if (isTeammateSpawn && parsedInput.success && parsedInput.data.name) {
      agentType = `@${parsedInput.data.name}`;
      const subagentType = parsedInput.data.subagent_type;
      description = isCustomSubagentType(subagentType) ? subagentType : void 0;
      taskDescription = parsedInput.data.description;
      descriptionColor = isCustomSubagentType(subagentType) ? getAgentColor(subagentType) : void 0;
    } else {
      agentType = parsedInput.success ? userFacingName(parsedInput.data) : "Agent";
      description = parsedInput.success ? parsedInput.data.description : void 0;
      color = parsedInput.success ? userFacingNameBackgroundColor(parsedInput.data) : void 0;
      taskDescription = void 0;
    }
    const launchedAsAsync = parsedInput.success && "run_in_background" in parsedInput.data && parsedInput.data.run_in_background === true;
    const outputStatus = result?.output?.status;
    const backgroundedMidExecution = outputStatus === "async_launched" || outputStatus === "remote_launched";
    const isAsync = launchedAsAsync || backgroundedMidExecution || isTeammateSpawn;
    const name = parsedInput.success ? parsedInput.data.name : void 0;
    return {
      id: param.id,
      agentType,
      description,
      toolUseCount: stats.toolUseCount,
      tokens: stats.tokens,
      isResolved,
      isError,
      isAsync,
      color,
      descriptionColor,
      lastToolInfo,
      taskDescription,
      name
    };
  });
  const anyUnresolved = toolUses.some((t) => !t.isResolved);
  const anyError = toolUses.some((t) => t.isError);
  const allComplete = !anyUnresolved;
  const allSameType = agentStats.length > 0 && agentStats.every((stat) => stat.agentType === agentStats[0]?.agentType);
  const commonType = allSameType && agentStats[0]?.agentType !== "Agent" ? agentStats[0]?.agentType : null;
  const allAsync = agentStats.every((stat) => stat.isAsync);
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
    /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      /* @__PURE__ */ jsx(ToolUseLoader, { shouldAnimate: shouldAnimate && anyUnresolved, isUnresolved: anyUnresolved, isError: anyError }),
      /* @__PURE__ */ jsxs(Text, { children: [
        allComplete ? allAsync ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: toolUses.length }),
          " background agents launched",
          " ",
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2193", action: "manage", parens: true }) })
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: toolUses.length }),
          " ",
          commonType ? `${commonType} agents` : "agents",
          " finished"
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          "Running ",
          /* @__PURE__ */ jsx(Text, { bold: true, children: toolUses.length }),
          " ",
          commonType ? `${commonType} agents` : "agents",
          "\u2026"
        ] }),
        " "
      ] }),
      !allAsync && /* @__PURE__ */ jsx(CtrlOToExpand, {})
    ] }),
    agentStats.map((stat, index) => /* @__PURE__ */ jsx(AgentProgressLine, { agentType: stat.agentType, description: stat.description, descriptionColor: stat.descriptionColor, taskDescription: stat.taskDescription, toolUseCount: stat.toolUseCount, tokens: stat.tokens, color: stat.color, isLast: index === agentStats.length - 1, isResolved: stat.isResolved, isError: stat.isError, isAsync: stat.isAsync, shouldAnimate, lastToolInfo: stat.lastToolInfo, hideType: allSameType, name: stat.name }, stat.id))
  ] });
}
function userFacingName(input) {
  if (input?.subagent_type && input.subagent_type !== GENERAL_PURPOSE_AGENT.agentType) {
    if (input.subagent_type === "worker") {
      return "Agent";
    }
    return input.subagent_type;
  }
  return "Agent";
}
function userFacingNameBackgroundColor(input) {
  if (!input?.subagent_type) {
    return void 0;
  }
  return getAgentColor(input.subagent_type);
}
function extractLastToolInfo(progressMessages, tools) {
  const toolUseByID = /* @__PURE__ */ new Map();
  for (const pm of progressMessages) {
    if (!hasProgressMessage(pm.data)) {
      continue;
    }
    if (pm.data.message.type === "assistant") {
      for (const c of pm.data.message.message.content) {
        if (c.type === "tool_use") {
          toolUseByID.set(c.id, c);
        }
      }
    }
  }
  let searchCount = 0;
  let readCount = 0;
  for (let i = progressMessages.length - 1; i >= 0; i--) {
    const msg = progressMessages[i];
    if (!hasProgressMessage(msg.data)) {
      continue;
    }
    const info = getSearchOrReadInfo(msg, tools, toolUseByID);
    if (info && (info.isSearch || info.isRead)) {
      if (msg.data.message.type === "user") {
        if (info.isSearch) {
          searchCount++;
        } else if (info.isRead) {
          readCount++;
        }
      }
    } else {
      break;
    }
  }
  if (searchCount + readCount >= 2) {
    return getSearchReadSummaryText(searchCount, readCount, true);
  }
  const lastToolResult = progressMessages.findLast((msg) => {
    if (!hasProgressMessage(msg.data)) {
      return false;
    }
    const message = msg.data.message;
    return message.type === "user" && message.message.content.some((c) => c.type === "tool_result");
  });
  if (lastToolResult?.data.message.type === "user") {
    const toolResultBlock = lastToolResult.data.message.message.content.find((c) => c.type === "tool_result");
    if (toolResultBlock?.type === "tool_result") {
      const toolUseBlock = toolUseByID.get(toolResultBlock.tool_use_id);
      if (toolUseBlock) {
        const tool = findToolByName(tools, toolUseBlock.name);
        if (!tool) {
          return toolUseBlock.name;
        }
        const input = toolUseBlock.input;
        const parsedInput = tool.inputSchema.safeParse(input);
        const userFacingToolName = tool.userFacingName(parsedInput.success ? parsedInput.data : void 0);
        if (tool.getToolUseSummary) {
          const summary = tool.getToolUseSummary(parsedInput.success ? parsedInput.data : void 0);
          if (summary) {
            return `${userFacingToolName}: ${summary}`;
          }
        }
        return userFacingToolName;
      }
    }
  }
  return null;
}
function isCustomSubagentType(subagentType) {
  return !!subagentType && subagentType !== GENERAL_PURPOSE_AGENT.agentType && subagentType !== "worker";
}
export {
  AgentPromptDisplay,
  AgentResponseDisplay,
  extractLastToolInfo,
  renderGroupedAgentToolUse,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseRejectedMessage,
  renderToolUseTag,
  userFacingName,
  userFacingNameBackgroundColor
};
