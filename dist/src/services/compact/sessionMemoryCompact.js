import { logForDebugging } from "../../utils/debug.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { errorMessage } from "../../utils/errors.js";
import {
  createCompactBoundaryMessage,
  createUserMessage,
  isCompactBoundaryMessage
} from "../../utils/messages.js";
import { getMainLoopModel } from "../../utils/model/model.js";
import { getSessionMemoryPath } from "../../utils/permissions/filesystem.js";
import { processSessionStartHooks } from "../../utils/sessionStart.js";
import { getTranscriptPath } from "../../utils/sessionStorage.js";
import { tokenCountFromLastAPIResponse } from "../../utils/tokens.js";
import { extractDiscoveredToolNames } from "../../utils/toolSearch.js";
import {
  getDynamicConfig_BLOCKS_ON_INIT,
  getFeatureValue_CACHED_MAY_BE_STALE
} from "../analytics/growthbook.js";
import { logEvent } from "../analytics/index.js";
import {
  isSessionMemoryEmpty,
  truncateSessionMemoryForCompact
} from "../SessionMemory/prompts.js";
import {
  getLastSummarizedMessageId,
  getSessionMemoryContent,
  waitForSessionMemoryExtraction
} from "../SessionMemory/sessionMemoryUtils.js";
import {
  annotateBoundaryWithPreservedSegment,
  buildPostCompactMessages,
  createPlanAttachmentIfNeeded
} from "./compact.js";
import { estimateMessageTokens } from "./microCompact.js";
import { getCompactUserSummaryMessage } from "./prompt.js";
const DEFAULT_SM_COMPACT_CONFIG = {
  minTokens: 1e4,
  minTextBlockMessages: 5,
  maxTokens: 4e4
};
let smCompactConfig = {
  ...DEFAULT_SM_COMPACT_CONFIG
};
let configInitialized = false;
function setSessionMemoryCompactConfig(config) {
  smCompactConfig = {
    ...smCompactConfig,
    ...config
  };
}
function getSessionMemoryCompactConfig() {
  return { ...smCompactConfig };
}
function resetSessionMemoryCompactConfig() {
  smCompactConfig = { ...DEFAULT_SM_COMPACT_CONFIG };
  configInitialized = false;
}
async function initSessionMemoryCompactConfig() {
  if (configInitialized) {
    return;
  }
  configInitialized = true;
  const remoteConfig = await getDynamicConfig_BLOCKS_ON_INIT("tengu_sm_compact_config", {});
  const config = {
    minTokens: remoteConfig.minTokens && remoteConfig.minTokens > 0 ? remoteConfig.minTokens : DEFAULT_SM_COMPACT_CONFIG.minTokens,
    minTextBlockMessages: remoteConfig.minTextBlockMessages && remoteConfig.minTextBlockMessages > 0 ? remoteConfig.minTextBlockMessages : DEFAULT_SM_COMPACT_CONFIG.minTextBlockMessages,
    maxTokens: remoteConfig.maxTokens && remoteConfig.maxTokens > 0 ? remoteConfig.maxTokens : DEFAULT_SM_COMPACT_CONFIG.maxTokens
  };
  setSessionMemoryCompactConfig(config);
}
function hasTextBlocks(message) {
  if (message.type === "assistant") {
    const content = message.message.content;
    return content.some((block) => block.type === "text");
  }
  if (message.type === "user") {
    const content = message.message.content;
    if (typeof content === "string") {
      return content.length > 0;
    }
    if (Array.isArray(content)) {
      return content.some((block) => block.type === "text");
    }
  }
  return false;
}
function getToolResultIds(message) {
  if (message.type !== "user") {
    return [];
  }
  const content = message.message.content;
  if (!Array.isArray(content)) {
    return [];
  }
  const ids = [];
  for (const block of content) {
    if (block.type === "tool_result") {
      ids.push(block.tool_use_id);
    }
  }
  return ids;
}
function hasToolUseWithIds(message, toolUseIds) {
  if (message.type !== "assistant") {
    return false;
  }
  const content = message.message.content;
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some(
    (block) => block.type === "tool_use" && toolUseIds.has(block.id)
  );
}
function adjustIndexToPreserveAPIInvariants(messages, startIndex) {
  if (startIndex <= 0 || startIndex >= messages.length) {
    return startIndex;
  }
  let adjustedIndex = startIndex;
  const allToolResultIds = [];
  for (let i = startIndex; i < messages.length; i++) {
    allToolResultIds.push(...getToolResultIds(messages[i]));
  }
  if (allToolResultIds.length > 0) {
    const toolUseIdsInKeptRange = /* @__PURE__ */ new Set();
    for (let i = adjustedIndex; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.type === "assistant" && Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            toolUseIdsInKeptRange.add(block.id);
          }
        }
      }
    }
    const neededToolUseIds = new Set(
      allToolResultIds.filter((id) => !toolUseIdsInKeptRange.has(id))
    );
    for (let i = adjustedIndex - 1; i >= 0 && neededToolUseIds.size > 0; i--) {
      const message = messages[i];
      if (hasToolUseWithIds(message, neededToolUseIds)) {
        adjustedIndex = i;
        if (message.type === "assistant" && Array.isArray(message.message.content)) {
          for (const block of message.message.content) {
            if (block.type === "tool_use" && neededToolUseIds.has(block.id)) {
              neededToolUseIds.delete(block.id);
            }
          }
        }
      }
    }
  }
  const messageIdsInKeptRange = /* @__PURE__ */ new Set();
  for (let i = adjustedIndex; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type === "assistant" && msg.message.id) {
      messageIdsInKeptRange.add(msg.message.id);
    }
  }
  for (let i = adjustedIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.type === "assistant" && message.message.id && messageIdsInKeptRange.has(message.message.id)) {
      adjustedIndex = i;
    }
  }
  return adjustedIndex;
}
function calculateMessagesToKeepIndex(messages, lastSummarizedIndex) {
  if (messages.length === 0) {
    return 0;
  }
  const config = getSessionMemoryCompactConfig();
  let startIndex = lastSummarizedIndex >= 0 ? lastSummarizedIndex + 1 : messages.length;
  let totalTokens = 0;
  let textBlockMessageCount = 0;
  for (let i = startIndex; i < messages.length; i++) {
    const msg = messages[i];
    totalTokens += estimateMessageTokens([msg]);
    if (hasTextBlocks(msg)) {
      textBlockMessageCount++;
    }
  }
  if (totalTokens >= config.maxTokens) {
    return adjustIndexToPreserveAPIInvariants(messages, startIndex);
  }
  if (totalTokens >= config.minTokens && textBlockMessageCount >= config.minTextBlockMessages) {
    return adjustIndexToPreserveAPIInvariants(messages, startIndex);
  }
  const idx = messages.findLastIndex((m) => isCompactBoundaryMessage(m));
  const floor = idx === -1 ? 0 : idx + 1;
  for (let i = startIndex - 1; i >= floor; i--) {
    const msg = messages[i];
    const msgTokens = estimateMessageTokens([msg]);
    totalTokens += msgTokens;
    if (hasTextBlocks(msg)) {
      textBlockMessageCount++;
    }
    startIndex = i;
    if (totalTokens >= config.maxTokens) {
      break;
    }
    if (totalTokens >= config.minTokens && textBlockMessageCount >= config.minTextBlockMessages) {
      break;
    }
  }
  return adjustIndexToPreserveAPIInvariants(messages, startIndex);
}
function shouldUseSessionMemoryCompaction() {
  if (isEnvTruthy(process.env.ENABLE_CLAUDE_CODE_SM_COMPACT)) {
    return true;
  }
  if (isEnvTruthy(process.env.DISABLE_CLAUDE_CODE_SM_COMPACT)) {
    return false;
  }
  const sessionMemoryFlag = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_session_memory",
    false
  );
  const smCompactFlag = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_sm_compact",
    false
  );
  const shouldUse = sessionMemoryFlag && smCompactFlag;
  if (process.env.USER_TYPE === "ant") {
    logEvent("tengu_sm_compact_flag_check", {
      tengu_session_memory: sessionMemoryFlag,
      tengu_sm_compact: smCompactFlag,
      should_use: shouldUse
    });
  }
  return shouldUse;
}
function createCompactionResultFromSessionMemory(messages, sessionMemory, messagesToKeep, hookResults, transcriptPath, agentId) {
  const preCompactTokenCount = tokenCountFromLastAPIResponse(messages);
  const boundaryMarker = createCompactBoundaryMessage(
    "auto",
    preCompactTokenCount ?? 0,
    messages[messages.length - 1]?.uuid
  );
  const preCompactDiscovered = extractDiscoveredToolNames(messages);
  if (preCompactDiscovered.size > 0) {
    boundaryMarker.compactMetadata.preCompactDiscoveredTools = [
      ...preCompactDiscovered
    ].sort();
  }
  const { truncatedContent, wasTruncated } = truncateSessionMemoryForCompact(sessionMemory);
  let summaryContent = getCompactUserSummaryMessage(
    truncatedContent,
    true,
    transcriptPath,
    true
  );
  if (wasTruncated) {
    const memoryPath = getSessionMemoryPath();
    summaryContent += `

Some session memory sections were truncated for length. The full session memory can be viewed at: ${memoryPath}`;
  }
  const summaryMessages = [
    createUserMessage({
      content: summaryContent,
      isCompactSummary: true,
      isVisibleInTranscriptOnly: true
    })
  ];
  const planAttachment = createPlanAttachmentIfNeeded(agentId);
  const attachments = planAttachment ? [planAttachment] : [];
  return {
    boundaryMarker: annotateBoundaryWithPreservedSegment(
      boundaryMarker,
      summaryMessages[summaryMessages.length - 1].uuid,
      messagesToKeep
    ),
    summaryMessages,
    attachments,
    hookResults,
    messagesToKeep,
    preCompactTokenCount,
    // SM-compact has no compact-API-call, so postCompactTokenCount (kept for
    // event continuity) and truePostCompactTokenCount converge to the same value.
    postCompactTokenCount: estimateMessageTokens(summaryMessages),
    truePostCompactTokenCount: estimateMessageTokens(summaryMessages)
  };
}
async function trySessionMemoryCompaction(messages, agentId, autoCompactThreshold) {
  if (!shouldUseSessionMemoryCompaction()) {
    return null;
  }
  await initSessionMemoryCompactConfig();
  await waitForSessionMemoryExtraction();
  const lastSummarizedMessageId = getLastSummarizedMessageId();
  const sessionMemory = await getSessionMemoryContent();
  if (!sessionMemory) {
    logEvent("tengu_sm_compact_no_session_memory", {});
    return null;
  }
  if (await isSessionMemoryEmpty(sessionMemory)) {
    logEvent("tengu_sm_compact_empty_template", {});
    return null;
  }
  try {
    let lastSummarizedIndex;
    if (lastSummarizedMessageId) {
      lastSummarizedIndex = messages.findIndex(
        (msg) => msg.uuid === lastSummarizedMessageId
      );
      if (lastSummarizedIndex === -1) {
        logEvent("tengu_sm_compact_summarized_id_not_found", {});
        return null;
      }
    } else {
      lastSummarizedIndex = messages.length - 1;
      logEvent("tengu_sm_compact_resumed_session", {});
    }
    const startIndex = calculateMessagesToKeepIndex(
      messages,
      lastSummarizedIndex
    );
    const messagesToKeep = messages.slice(startIndex).filter((m) => !isCompactBoundaryMessage(m));
    const hookResults = await processSessionStartHooks("compact", {
      model: getMainLoopModel()
    });
    const transcriptPath = getTranscriptPath();
    const compactionResult = createCompactionResultFromSessionMemory(
      messages,
      sessionMemory,
      messagesToKeep,
      hookResults,
      transcriptPath,
      agentId
    );
    const postCompactMessages = buildPostCompactMessages(compactionResult);
    const postCompactTokenCount = estimateMessageTokens(postCompactMessages);
    if (autoCompactThreshold !== void 0 && postCompactTokenCount >= autoCompactThreshold) {
      logEvent("tengu_sm_compact_threshold_exceeded", {
        postCompactTokenCount,
        autoCompactThreshold
      });
      return null;
    }
    return {
      ...compactionResult,
      postCompactTokenCount,
      truePostCompactTokenCount: postCompactTokenCount
    };
  } catch (error) {
    logEvent("tengu_sm_compact_error", {});
    if (process.env.USER_TYPE === "ant") {
      logForDebugging(`Session memory compaction error: ${errorMessage(error)}`);
    }
    return null;
  }
}
export {
  DEFAULT_SM_COMPACT_CONFIG,
  adjustIndexToPreserveAPIInvariants,
  calculateMessagesToKeepIndex,
  getSessionMemoryCompactConfig,
  hasTextBlocks,
  resetSessionMemoryCompactConfig,
  setSessionMemoryCompactConfig,
  shouldUseSessionMemoryCompaction,
  trySessionMemoryCompaction
};
