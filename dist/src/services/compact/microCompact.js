const feature = (_name) => false;
import { FILE_EDIT_TOOL_NAME } from "../../tools/FileEditTool/constants.js";
import { FILE_READ_TOOL_NAME } from "../../tools/FileReadTool/prompt.js";
import { FILE_WRITE_TOOL_NAME } from "../../tools/FileWriteTool/prompt.js";
import { GLOB_TOOL_NAME } from "../../tools/GlobTool/prompt.js";
import { GREP_TOOL_NAME } from "../../tools/GrepTool/prompt.js";
import { WEB_FETCH_TOOL_NAME } from "../../tools/WebFetchTool/prompt.js";
import { WEB_SEARCH_TOOL_NAME } from "../../tools/WebSearchTool/prompt.js";
import { logForDebugging } from "../../utils/debug.js";
import "../../utils/model/model.js";
import { SHELL_TOOL_NAMES } from "../../utils/shell/shellToolUtils.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import {
  logEvent
} from "../analytics/index.js";
import "../api/promptCacheBreakDetection.js";
import { roughTokenCountEstimation } from "../tokenEstimation.js";
import {
  clearCompactWarningSuppression,
  suppressCompactWarning
} from "./compactWarningState.js";
import {
  getTimeBasedMCConfig
} from "./timeBasedMCConfig.js";
const TIME_BASED_MC_CLEARED_MESSAGE = "[Old tool result content cleared]";
const IMAGE_MAX_TOKEN_SIZE = 2e3;
const COMPACTABLE_TOOLS = /* @__PURE__ */ new Set([
  FILE_READ_TOOL_NAME,
  ...SHELL_TOOL_NAMES,
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME
]);
let cachedMCModule = null;
let cachedMCState = null;
let pendingCacheEdits = null;
async function getCachedMCModule() {
  if (!cachedMCModule) {
    cachedMCModule = await import("./cachedMicrocompact.js");
  }
  return cachedMCModule;
}
function ensureCachedMCState() {
  if (!cachedMCState && cachedMCModule) {
    cachedMCState = cachedMCModule.createCachedMCState();
  }
  if (!cachedMCState) {
    throw new Error(
      "cachedMCState not initialized \u2014 getCachedMCModule() must be called first"
    );
  }
  return cachedMCState;
}
function consumePendingCacheEdits() {
  const edits = pendingCacheEdits;
  pendingCacheEdits = null;
  return edits;
}
function getPinnedCacheEdits() {
  if (!cachedMCState) {
    return [];
  }
  return cachedMCState.pinnedEdits;
}
function pinCacheEdits(userMessageIndex, block) {
  if (cachedMCState) {
    cachedMCState.pinnedEdits.push({ userMessageIndex, block });
  }
}
function markToolsSentToAPIState() {
  if (cachedMCState && cachedMCModule) {
    cachedMCModule.markToolsSentToAPI(cachedMCState);
  }
}
function resetMicrocompactState() {
  if (cachedMCState && cachedMCModule) {
    cachedMCModule.resetCachedMCState(cachedMCState);
  }
  pendingCacheEdits = null;
}
function calculateToolResultTokens(block) {
  if (!block.content) {
    return 0;
  }
  if (typeof block.content === "string") {
    return roughTokenCountEstimation(block.content);
  }
  return block.content.reduce((sum, item) => {
    if (item.type === "text") {
      return sum + roughTokenCountEstimation(item.text);
    } else if (item.type === "image" || item.type === "document") {
      return sum + IMAGE_MAX_TOKEN_SIZE;
    }
    return sum;
  }, 0);
}
function estimateMessageTokens(messages) {
  let totalTokens = 0;
  for (const message of messages) {
    if (message.type !== "user" && message.type !== "assistant") {
      continue;
    }
    if (!Array.isArray(message.message.content)) {
      continue;
    }
    for (const block of message.message.content) {
      if (block.type === "text") {
        totalTokens += roughTokenCountEstimation(block.text);
      } else if (block.type === "tool_result") {
        totalTokens += calculateToolResultTokens(block);
      } else if (block.type === "image" || block.type === "document") {
        totalTokens += IMAGE_MAX_TOKEN_SIZE;
      } else if (block.type === "thinking") {
        totalTokens += roughTokenCountEstimation(block.thinking);
      } else if (block.type === "redacted_thinking") {
        totalTokens += roughTokenCountEstimation(block.data);
      } else if (block.type === "tool_use") {
        totalTokens += roughTokenCountEstimation(
          block.name + jsonStringify(block.input ?? {})
        );
      } else {
        totalTokens += roughTokenCountEstimation(jsonStringify(block));
      }
    }
  }
  return Math.ceil(totalTokens * (4 / 3));
}
function collectCompactableToolIds(messages) {
  const ids = [];
  for (const message of messages) {
    if (message.type === "assistant" && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type === "tool_use" && COMPACTABLE_TOOLS.has(block.name)) {
          ids.push(block.id);
        }
      }
    }
  }
  return ids;
}
function isMainThreadSource(querySource) {
  return !querySource || querySource.startsWith("repl_main_thread");
}
async function microcompactMessages(messages, toolUseContext, querySource) {
  clearCompactWarningSuppression();
  const timeBasedResult = maybeTimeBasedMicrocompact(messages, querySource);
  if (timeBasedResult) {
    return timeBasedResult;
  }
  if (false) {
    const mod = await getCachedMCModule();
    const model = toolUseContext?.options.mainLoopModel ?? getMainLoopModel();
    if (mod.isCachedMicrocompactEnabled() && mod.isModelSupportedForCacheEditing(model) && isMainThreadSource(querySource)) {
      return await cachedMicrocompactPath(messages, querySource);
    }
  }
  return { messages };
}
async function cachedMicrocompactPath(messages, querySource) {
  const mod = await getCachedMCModule();
  const state = ensureCachedMCState();
  const config = mod.getCachedMCConfig();
  const compactableToolIds = new Set(collectCompactableToolIds(messages));
  for (const message of messages) {
    if (message.type === "user" && Array.isArray(message.message.content)) {
      const groupIds = [];
      for (const block of message.message.content) {
        if (block.type === "tool_result" && compactableToolIds.has(block.tool_use_id) && !state.registeredTools.has(block.tool_use_id)) {
          mod.registerToolResult(state, block.tool_use_id);
          groupIds.push(block.tool_use_id);
        }
      }
      mod.registerToolMessage(state, groupIds);
    }
  }
  const toolsToDelete = mod.getToolResultsToDelete(state);
  if (toolsToDelete.length > 0) {
    const cacheEdits = mod.createCacheEditsBlock(state, toolsToDelete);
    if (cacheEdits) {
      pendingCacheEdits = cacheEdits;
    }
    logForDebugging(
      `Cached MC deleting ${toolsToDelete.length} tool(s): ${toolsToDelete.join(", ")}`
    );
    logEvent("tengu_cached_microcompact", {
      toolsDeleted: toolsToDelete.length,
      deletedToolIds: toolsToDelete.join(
        ","
      ),
      activeToolCount: state.toolOrder.length - state.deletedRefs.size,
      triggerType: "auto",
      threshold: config.triggerThreshold,
      keepRecent: config.keepRecent
    });
    suppressCompactWarning();
    if (false) {
      notifyCacheDeletion(querySource ?? "repl_main_thread");
    }
    const lastAsst = messages.findLast((m) => m.type === "assistant");
    const baseline = lastAsst?.type === "assistant" ? lastAsst.message.usage?.cache_deleted_input_tokens ?? 0 : 0;
    return {
      messages,
      compactionInfo: {
        pendingCacheEdits: {
          trigger: "auto",
          deletedToolIds: toolsToDelete,
          baselineCacheDeletedTokens: baseline
        }
      }
    };
  }
  return { messages };
}
function evaluateTimeBasedTrigger(messages, querySource) {
  const config = getTimeBasedMCConfig();
  if (!config.enabled || !querySource || !isMainThreadSource(querySource)) {
    return null;
  }
  const lastAssistant = messages.findLast((m) => m.type === "assistant");
  if (!lastAssistant) {
    return null;
  }
  const gapMinutes = (Date.now() - new Date(lastAssistant.timestamp).getTime()) / 6e4;
  if (!Number.isFinite(gapMinutes) || gapMinutes < config.gapThresholdMinutes) {
    return null;
  }
  return { gapMinutes, config };
}
function maybeTimeBasedMicrocompact(messages, querySource) {
  const trigger = evaluateTimeBasedTrigger(messages, querySource);
  if (!trigger) {
    return null;
  }
  const { gapMinutes, config } = trigger;
  const compactableIds = collectCompactableToolIds(messages);
  const keepRecent = Math.max(1, config.keepRecent);
  const keepSet = new Set(compactableIds.slice(-keepRecent));
  const clearSet = new Set(compactableIds.filter((id) => !keepSet.has(id)));
  if (clearSet.size === 0) {
    return null;
  }
  let tokensSaved = 0;
  const result = messages.map((message) => {
    if (message.type !== "user" || !Array.isArray(message.message.content)) {
      return message;
    }
    let touched = false;
    const newContent = message.message.content.map((block) => {
      if (block.type === "tool_result" && clearSet.has(block.tool_use_id) && block.content !== TIME_BASED_MC_CLEARED_MESSAGE) {
        tokensSaved += calculateToolResultTokens(block);
        touched = true;
        return { ...block, content: TIME_BASED_MC_CLEARED_MESSAGE };
      }
      return block;
    });
    if (!touched) return message;
    return {
      ...message,
      message: { ...message.message, content: newContent }
    };
  });
  if (tokensSaved === 0) {
    return null;
  }
  logEvent("tengu_time_based_microcompact", {
    gapMinutes: Math.round(gapMinutes),
    gapThresholdMinutes: config.gapThresholdMinutes,
    toolsCleared: clearSet.size,
    toolsKept: keepSet.size,
    keepRecent: config.keepRecent,
    tokensSaved
  });
  logForDebugging(
    `[TIME-BASED MC] gap ${Math.round(gapMinutes)}min > ${config.gapThresholdMinutes}min, cleared ${clearSet.size} tool results (~${tokensSaved} tokens), kept last ${keepSet.size}`
  );
  suppressCompactWarning();
  resetMicrocompactState();
  if (false) {
    notifyCacheDeletion(querySource);
  }
  return { messages: result };
}
export {
  TIME_BASED_MC_CLEARED_MESSAGE,
  consumePendingCacheEdits,
  estimateMessageTokens,
  evaluateTimeBasedTrigger,
  getPinnedCacheEdits,
  markToolsSentToAPIState,
  microcompactMessages,
  pinCacheEdits,
  resetMicrocompactState
};
