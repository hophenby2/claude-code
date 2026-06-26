import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import chalk from "chalk";
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { every } from "../utils/set.js";
import { getIsRemoteMode } from "../bootstrap/state.js";
import { BLACK_CIRCLE } from "../constants/figures.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { useTerminalNotification } from "../ink/useTerminalNotification.js";
import { Box, Text } from "../ink.js";
import { useShortcutDisplay } from "../keybindings/useShortcutDisplay.js";
import { findToolByName } from "../Tool.js";
import { isAdvisorBlock } from "../utils/advisor.js";
import { collapseBackgroundBashNotifications } from "../utils/collapseBackgroundBashNotifications.js";
import { collapseHookSummaries } from "../utils/collapseHookSummaries.js";
import { collapseReadSearchGroups } from "../utils/collapseReadSearch.js";
import { collapseTeammateShutdowns } from "../utils/collapseTeammateShutdowns.js";
import { getGlobalConfig } from "../utils/config.js";
import { isEnvTruthy } from "../utils/envUtils.js";
import { isFullscreenEnvEnabled } from "../utils/fullscreen.js";
import { applyGrouping } from "../utils/groupToolUses.js";
import { buildMessageLookups, createAssistantMessage, deriveUUID, getMessagesAfterCompactBoundary, getToolUseID, getToolUseIDs, hasUnresolvedHooksFromLookup, isNotEmptyMessage, normalizeMessages, reorderMessagesInUI, shouldShowUserMessage } from "../utils/messages.js";
import { plural } from "../utils/stringUtils.js";
import { renderableSearchText } from "../utils/transcriptSearch.js";
import { Divider } from "./design-system/Divider.js";
import { LogoV2 } from "./LogoV2/LogoV2.js";
import { StreamingMarkdown } from "./Markdown.js";
import { hasContentAfterIndex, MessageRow } from "./MessageRow.js";
import { InVirtualListContext, MessageActionsSelectedContext } from "./messageActions.js";
import { AssistantThinkingMessage } from "./messages/AssistantThinkingMessage.js";
import { isNullRenderingAttachment } from "./messages/nullRenderingAttachments.js";
import { OffscreenFreeze } from "./OffscreenFreeze.js";
import { StatusNotices } from "./StatusNotices.js";
const LogoHeader = React.memo(function LogoHeader2(t0) {
  const $ = _c(3);
  const {
    agentDefinitions
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsx(LogoV2, {});
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== agentDefinitions) {
    t2 = /* @__PURE__ */ jsx(OffscreenFreeze, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      t1,
      /* @__PURE__ */ jsx(React.Suspense, { fallback: null, children: /* @__PURE__ */ jsx(StatusNotices, { agentDefinitions }) })
    ] }) });
    $[1] = agentDefinitions;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
});
const proactiveModule = false ? null : null;
const BRIEF_TOOL_NAME = false ? null.BRIEF_TOOL_NAME : null;
const SEND_USER_FILE_TOOL_NAME = false ? null.SEND_USER_FILE_TOOL_NAME : null;
import { VirtualMessageList } from "./VirtualMessageList.js";
function filterForBriefTool(messages, briefToolNames) {
  const nameSet = new Set(briefToolNames);
  const briefToolUseIDs = /* @__PURE__ */ new Set();
  return messages.filter((msg) => {
    if (msg.type === "system") return msg.subtype !== "api_metrics";
    const block = msg.message?.content[0];
    if (msg.type === "assistant") {
      if (msg.isApiErrorMessage) return true;
      if (block?.type === "tool_use" && block.name && nameSet.has(block.name)) {
        if ("id" in block) {
          briefToolUseIDs.add(block.id);
        }
        return true;
      }
      return false;
    }
    if (msg.type === "user") {
      if (block?.type === "tool_result") {
        return block.tool_use_id !== void 0 && briefToolUseIDs.has(block.tool_use_id);
      }
      return !msg.isMeta;
    }
    if (msg.type === "attachment") {
      const att = msg.attachment;
      return att?.type === "queued_command" && att.commandMode === "prompt" && !att.isMeta && att.origin === void 0;
    }
    return false;
  });
}
function dropTextInBriefTurns(messages, briefToolNames) {
  const nameSet = new Set(briefToolNames);
  const turnsWithBrief = /* @__PURE__ */ new Set();
  const textIndexToTurn = [];
  let turn = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const block = msg.message?.content[0];
    if (msg.type === "user" && block?.type !== "tool_result" && !msg.isMeta) {
      turn++;
      continue;
    }
    if (msg.type === "assistant") {
      if (block?.type === "text") {
        textIndexToTurn[i] = turn;
      } else if (block?.type === "tool_use" && block.name && nameSet.has(block.name)) {
        turnsWithBrief.add(turn);
      }
    }
  }
  if (turnsWithBrief.size === 0) return messages;
  return messages.filter((_, i) => {
    const t = textIndexToTurn[i];
    return t === void 0 || !turnsWithBrief.has(t);
  });
}
const MAX_MESSAGES_TO_SHOW_IN_TRANSCRIPT_MODE = 30;
const MAX_MESSAGES_WITHOUT_VIRTUALIZATION = 200;
const MESSAGE_CAP_STEP = 50;
function computeSliceStart(collapsed, anchorRef, cap = MAX_MESSAGES_WITHOUT_VIRTUALIZATION, step = MESSAGE_CAP_STEP) {
  const anchor = anchorRef.current;
  const anchorIdx = anchor ? collapsed.findIndex((m) => m.uuid === anchor.uuid) : -1;
  let start = anchorIdx >= 0 ? anchorIdx : anchor ? Math.min(anchor.idx, Math.max(0, collapsed.length - cap)) : 0;
  if (collapsed.length - start > cap + step) {
    start = collapsed.length - cap;
  }
  const msgAtStart = collapsed[start];
  if (msgAtStart && (anchor?.uuid !== msgAtStart.uuid || anchor.idx !== start)) {
    anchorRef.current = {
      uuid: msgAtStart.uuid,
      idx: start
    };
  } else if (!msgAtStart && anchor) {
    anchorRef.current = null;
  }
  return start;
}
const MessagesImpl = ({
  messages,
  tools,
  commands,
  verbose,
  toolJSX,
  toolUseConfirmQueue,
  inProgressToolUseIDs,
  isMessageSelectorVisible,
  conversationId,
  screen,
  streamingToolUses,
  showAllInTranscript = false,
  agentDefinitions,
  onOpenRateLimitOptions,
  hideLogo = false,
  isLoading,
  hidePastThinking = false,
  streamingThinking,
  streamingText,
  isBriefOnly = false,
  unseenDivider,
  scrollRef,
  trackStickyPrompt,
  jumpRef,
  onSearchMatchesChange,
  scanElement,
  setPositions,
  disableRenderCap = false,
  cursor = null,
  setCursor,
  cursorNavRef,
  renderRange
}) => {
  const {
    columns
  } = useTerminalSize();
  const toggleShowAllShortcut = useShortcutDisplay("transcript:toggleShowAll", "Transcript", "Ctrl+E");
  const normalizedMessages = useMemo(() => normalizeMessages(messages).filter(isNotEmptyMessage), [messages]);
  const isStreamingThinkingVisible = useMemo(() => {
    if (!streamingThinking) return false;
    if (streamingThinking.isStreaming) return true;
    if (streamingThinking.streamingEndedAt) {
      return Date.now() - streamingThinking.streamingEndedAt < 3e4;
    }
    return false;
  }, [streamingThinking]);
  const lastThinkingBlockId = useMemo(() => {
    if (!hidePastThinking) return null;
    if (isStreamingThinkingVisible) return "streaming";
    for (let i = normalizedMessages.length - 1; i >= 0; i--) {
      const msg = normalizedMessages[i];
      if (msg?.type === "assistant") {
        const content = msg.message.content;
        for (let j = content.length - 1; j >= 0; j--) {
          if (content[j]?.type === "thinking") {
            return `${msg.uuid}:${j}`;
          }
        }
      } else if (msg?.type === "user") {
        const hasToolResult = msg.message.content.some((block) => block.type === "tool_result");
        if (!hasToolResult) {
          return "no-thinking";
        }
      }
    }
    return null;
  }, [normalizedMessages, hidePastThinking, isStreamingThinkingVisible]);
  const latestBashOutputUUID = useMemo(() => {
    for (let i_0 = normalizedMessages.length - 1; i_0 >= 0; i_0--) {
      const msg_0 = normalizedMessages[i_0];
      if (msg_0?.type === "user") {
        const content_0 = msg_0.message.content;
        for (const block_0 of content_0) {
          if (block_0.type === "text") {
            const text = block_0.text;
            if (text.startsWith("<bash-stdout") || text.startsWith("<bash-stderr")) {
              return msg_0.uuid;
            }
          }
        }
      }
    }
    return null;
  }, [normalizedMessages]);
  const normalizedToolUseIDs = useMemo(() => getToolUseIDs(normalizedMessages), [normalizedMessages]);
  const streamingToolUsesWithoutInProgress = useMemo(() => streamingToolUses.filter((stu) => !inProgressToolUseIDs.has(stu.contentBlock.id) && !normalizedToolUseIDs.has(stu.contentBlock.id)), [streamingToolUses, inProgressToolUseIDs, normalizedToolUseIDs]);
  const syntheticStreamingToolUseMessages = useMemo(() => streamingToolUsesWithoutInProgress.flatMap((streamingToolUse) => {
    const msg_1 = createAssistantMessage({
      content: [streamingToolUse.contentBlock]
    });
    msg_1.uuid = deriveUUID(streamingToolUse.contentBlock.id, 0);
    return normalizeMessages([msg_1]);
  }), [streamingToolUsesWithoutInProgress]);
  const isTranscriptMode = screen === "transcript";
  const disableVirtualScroll = useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL), []);
  const virtualScrollRuntimeGate = scrollRef != null && !disableVirtualScroll;
  const shouldTruncate = isTranscriptMode && !showAllInTranscript && !virtualScrollRuntimeGate;
  const sliceAnchorRef = useRef(null);
  const {
    collapsed: collapsed_0,
    lookups: lookups_0,
    hasTruncatedMessages: hasTruncatedMessages_0,
    hiddenMessageCount: hiddenMessageCount_0
  } = useMemo(() => {
    const compactAwareMessages = verbose || isFullscreenEnvEnabled() ? normalizedMessages : getMessagesAfterCompactBoundary(normalizedMessages, {
      includeSnipped: true
    });
    const messagesToShowNotTruncated = reorderMessagesInUI(compactAwareMessages.filter((msg_2) => msg_2.type !== "progress").filter((msg_3) => !isNullRenderingAttachment(msg_3)).filter((_) => shouldShowUserMessage(_, isTranscriptMode)), syntheticStreamingToolUseMessages);
    const briefToolNames = [BRIEF_TOOL_NAME, SEND_USER_FILE_TOOL_NAME].filter((n) => n !== null);
    const dropTextToolNames = [BRIEF_TOOL_NAME].filter((n_0) => n_0 !== null);
    const briefFiltered = briefToolNames.length > 0 && !isTranscriptMode ? isBriefOnly ? filterForBriefTool(messagesToShowNotTruncated, briefToolNames) : dropTextToolNames.length > 0 ? dropTextInBriefTurns(messagesToShowNotTruncated, dropTextToolNames) : messagesToShowNotTruncated : messagesToShowNotTruncated;
    const messagesToShow = shouldTruncate ? briefFiltered.slice(-MAX_MESSAGES_TO_SHOW_IN_TRANSCRIPT_MODE) : briefFiltered;
    const hasTruncatedMessages = shouldTruncate && briefFiltered.length > MAX_MESSAGES_TO_SHOW_IN_TRANSCRIPT_MODE;
    const {
      messages: groupedMessages
    } = applyGrouping(messagesToShow, tools, verbose);
    const collapsed = collapseBackgroundBashNotifications(collapseHookSummaries(collapseTeammateShutdowns(collapseReadSearchGroups(groupedMessages, tools))), verbose);
    const lookups = buildMessageLookups(normalizedMessages, messagesToShow);
    const hiddenMessageCount = messagesToShowNotTruncated.length - MAX_MESSAGES_TO_SHOW_IN_TRANSCRIPT_MODE;
    return {
      collapsed,
      lookups,
      hasTruncatedMessages,
      hiddenMessageCount
    };
  }, [verbose, normalizedMessages, isTranscriptMode, syntheticStreamingToolUseMessages, shouldTruncate, tools, isBriefOnly]);
  const renderableMessages = useMemo(() => {
    const capApplies = !virtualScrollRuntimeGate && !disableRenderCap;
    const sliceStart = capApplies ? computeSliceStart(collapsed_0, sliceAnchorRef) : 0;
    return renderRange ? collapsed_0.slice(renderRange[0], renderRange[1]) : sliceStart > 0 ? collapsed_0.slice(sliceStart) : collapsed_0;
  }, [collapsed_0, renderRange, virtualScrollRuntimeGate, disableRenderCap]);
  const streamingToolUseIDs = useMemo(() => new Set(streamingToolUses.map((__0) => __0.contentBlock.id)), [streamingToolUses]);
  const dividerBeforeIndex = useMemo(() => {
    if (!unseenDivider) return -1;
    const prefix = unseenDivider.firstUnseenUuid.slice(0, 24);
    return renderableMessages.findIndex((m) => m.uuid.slice(0, 24) === prefix);
  }, [unseenDivider, renderableMessages]);
  const selectedIdx = useMemo(() => {
    if (!cursor) return -1;
    return renderableMessages.findIndex((m_0) => m_0.uuid === cursor.uuid);
  }, [cursor, renderableMessages]);
  const [expandedKeys, setExpandedKeys] = useState(() => /* @__PURE__ */ new Set());
  const onItemClick = useCallback((msg_4) => {
    const k = expandKey(msg_4);
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);
  const isItemExpanded = useCallback((msg_5) => expandedKeys.size > 0 && expandedKeys.has(expandKey(msg_5)), [expandedKeys]);
  const lookupsRef = useRef(lookups_0);
  lookupsRef.current = lookups_0;
  const isItemClickable = useCallback((msg_6) => {
    if (msg_6.type === "collapsed_read_search") return true;
    if (msg_6.type === "assistant") {
      const b = msg_6.message.content[0];
      return b != null && isAdvisorBlock(b) && b.type === "advisor_tool_result" && b.content.type === "advisor_result";
    }
    if (msg_6.type !== "user") return false;
    const b_0 = msg_6.message.content[0];
    if (b_0?.type !== "tool_result" || b_0.is_error || !msg_6.toolUseResult) return false;
    const name = lookupsRef.current.toolUseByToolUseID.get(b_0.tool_use_id)?.name;
    const tool = name ? findToolByName(tools, name) : void 0;
    return tool?.isResultTruncated?.(msg_6.toolUseResult) ?? false;
  }, [tools]);
  const canAnimate = (!toolJSX || !!toolJSX.shouldContinueAnimation) && !toolUseConfirmQueue.length && !isMessageSelectorVisible;
  const hasToolsInProgress = inProgressToolUseIDs.size > 0;
  const {
    progress
  } = useTerminalNotification();
  const prevProgressState = useRef(null);
  const progressEnabled = getGlobalConfig().terminalProgressBarEnabled && !getIsRemoteMode() && !(proactiveModule?.isProactiveActive() ?? false);
  useEffect(() => {
    const state = progressEnabled ? hasToolsInProgress ? "indeterminate" : "completed" : null;
    if (prevProgressState.current === state) return;
    prevProgressState.current = state;
    progress(state);
  }, [progress, progressEnabled, hasToolsInProgress]);
  useEffect(() => {
    return () => progress(null);
  }, [progress]);
  const messageKey = useCallback((msg_7) => `${msg_7.uuid}-${conversationId}`, [conversationId]);
  const renderMessageRow = (msg_8, index) => {
    const prevType = index > 0 ? renderableMessages[index - 1]?.type : void 0;
    const isUserContinuation = msg_8.type === "user" && prevType === "user";
    const hasContentAfter = msg_8.type === "collapsed_read_search" && (!!streamingText || hasContentAfterIndex(renderableMessages, index, tools, streamingToolUseIDs));
    const k_0 = messageKey(msg_8);
    const row = /* @__PURE__ */ jsx(MessageRow, { message: msg_8, isUserContinuation, hasContentAfter, tools, commands, verbose: verbose || isItemExpanded(msg_8) || cursor?.expanded === true && index === selectedIdx, inProgressToolUseIDs, streamingToolUseIDs, screen, canAnimate, onOpenRateLimitOptions, lastThinkingBlockId, latestBashOutputUUID, columns, isLoading, lookups: lookups_0 }, k_0);
    const wrapped = /* @__PURE__ */ jsx(MessageActionsSelectedContext.Provider, { value: index === selectedIdx, children: row }, k_0);
    if (unseenDivider && index === dividerBeforeIndex) {
      return [/* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Divider, { title: `${unseenDivider.count} new ${plural(unseenDivider.count, "message")}`, width: columns, color: "inactive" }) }, "unseen-divider"), wrapped];
    }
    return wrapped;
  };
  const searchTextCache = useRef(/* @__PURE__ */ new WeakMap());
  const extractSearchText = useCallback((msg_9) => {
    const cached = searchTextCache.current.get(msg_9);
    if (cached !== void 0) return cached;
    let text_0 = renderableSearchText(msg_9);
    if (msg_9.type === "user" && msg_9.toolUseResult && Array.isArray(msg_9.message.content)) {
      const tr = msg_9.message.content.find((b_1) => b_1.type === "tool_result");
      if (tr && "tool_use_id" in tr) {
        const tu = lookups_0.toolUseByToolUseID.get(tr.tool_use_id);
        const tool_0 = tu && findToolByName(tools, tu.name);
        const extracted = tool_0?.extractSearchText?.(msg_9.toolUseResult);
        if (extracted !== void 0) text_0 = extracted;
      }
    }
    const lowered = text_0.toLowerCase();
    searchTextCache.current.set(msg_9, lowered);
    return lowered;
  }, [tools, lookups_0]);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    !hideLogo && !(renderRange && renderRange[0] > 0) && /* @__PURE__ */ jsx(LogoHeader, { agentDefinitions }),
    hasTruncatedMessages_0 && /* @__PURE__ */ jsx(Divider, { title: `${toggleShowAllShortcut} to show ${chalk.bold(hiddenMessageCount_0)} previous messages`, width: columns }),
    isTranscriptMode && showAllInTranscript && hiddenMessageCount_0 > 0 && // disableRenderCap (e.g. [ dump-to-scrollback) means we're uncapped
    // as a one-shot escape hatch, not a toggle — ctrl+e is dead and
    // nothing is actually "hidden" to restore.
    !disableRenderCap && /* @__PURE__ */ jsx(Divider, { title: `${toggleShowAllShortcut} to hide ${chalk.bold(hiddenMessageCount_0)} previous messages`, width: columns }),
    virtualScrollRuntimeGate ? /* @__PURE__ */ jsx(InVirtualListContext.Provider, { value: true, children: /* @__PURE__ */ jsx(VirtualMessageList, { messages: renderableMessages, scrollRef, columns, itemKey: messageKey, renderItem: renderMessageRow, onItemClick, isItemClickable, isItemExpanded, trackStickyPrompt, selectedIndex: selectedIdx >= 0 ? selectedIdx : void 0, cursorNavRef, setCursor, jumpRef, onSearchMatchesChange, scanElement, setPositions, extractSearchText }) }) : renderableMessages.flatMap(renderMessageRow),
    streamingText && !isBriefOnly && /* @__PURE__ */ jsx(Box, { alignItems: "flex-start", flexDirection: "row", marginTop: 1, width: "100%", children: /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      /* @__PURE__ */ jsx(Box, { minWidth: 2, children: /* @__PURE__ */ jsx(Text, { color: "text", children: BLACK_CIRCLE }) }),
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(StreamingMarkdown, { children: streamingText }) })
    ] }) }),
    isStreamingThinkingVisible && streamingThinking && !isBriefOnly && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(AssistantThinkingMessage, { param: {
      type: "thinking",
      thinking: streamingThinking.thinking
    }, addMargin: false, isTranscriptMode: true, verbose, hideInTranscript: false }) })
  ] });
};
function expandKey(msg) {
  return (msg.type === "assistant" || msg.type === "user" ? getToolUseID(msg) : null) ?? msg.uuid;
}
function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
const Messages = React.memo(MessagesImpl, (prev, next) => {
  const keys = Object.keys(prev);
  for (const key of keys) {
    if (key === "onOpenRateLimitOptions" || key === "scrollRef" || key === "trackStickyPrompt" || key === "setCursor" || key === "cursorNavRef" || key === "jumpRef" || key === "onSearchMatchesChange" || key === "scanElement" || key === "setPositions") continue;
    if (prev[key] !== next[key]) {
      if (key === "streamingToolUses") {
        const p = prev.streamingToolUses;
        const n = next.streamingToolUses;
        if (p.length === n.length && p.every((item, i) => item.contentBlock === n[i]?.contentBlock)) {
          continue;
        }
      }
      if (key === "inProgressToolUseIDs") {
        if (setsEqual(prev.inProgressToolUseIDs, next.inProgressToolUseIDs)) {
          continue;
        }
      }
      if (key === "unseenDivider") {
        const p = prev.unseenDivider;
        const n = next.unseenDivider;
        if (p?.firstUnseenUuid === n?.firstUnseenUuid && p?.count === n?.count) {
          continue;
        }
      }
      if (key === "tools") {
        const p = prev.tools;
        const n = next.tools;
        if (p.length === n.length && p.every((tool, i) => tool.name === n[i]?.name)) {
          continue;
        }
      }
      return false;
    }
  }
  return true;
});
function shouldRenderStatically(message, streamingToolUseIDs, inProgressToolUseIDs, siblingToolUseIDs, screen, lookups) {
  if (screen === "transcript") {
    return true;
  }
  switch (message.type) {
    case "attachment":
    case "user":
    case "assistant": {
      if (message.type === "assistant") {
        const block = message.message.content[0];
        if (block?.type === "server_tool_use") {
          return lookups.resolvedToolUseIDs.has(block.id);
        }
      }
      const toolUseID = getToolUseID(message);
      if (!toolUseID) {
        return true;
      }
      if (streamingToolUseIDs.has(toolUseID)) {
        return false;
      }
      if (inProgressToolUseIDs.has(toolUseID)) {
        return false;
      }
      if (hasUnresolvedHooksFromLookup(toolUseID, "PostToolUse", lookups)) {
        return false;
      }
      return every(siblingToolUseIDs, lookups.resolvedToolUseIDs);
    }
    case "system": {
      return message.subtype !== "api_error";
    }
    case "grouped_tool_use": {
      const allResolved = message.messages.every((msg) => {
        const content = msg.message.content[0];
        return content?.type === "tool_use" && lookups.resolvedToolUseIDs.has(content.id);
      });
      return allResolved;
    }
    case "collapsed_read_search": {
      return false;
    }
  }
}
export {
  Messages,
  computeSliceStart,
  dropTextInBriefTurns,
  filterForBriefTool,
  shouldRenderStatically
};
