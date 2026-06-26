import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { getOriginalCwd, getSessionId } from "../bootstrap/state.js";
import {
  BYTES_PER_TOKEN,
  DEFAULT_MAX_RESULT_SIZE_CHARS,
  MAX_TOOL_RESULT_BYTES,
  MAX_TOOL_RESULTS_PER_MESSAGE_CHARS
} from "../constants/toolLimits.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import { logEvent } from "../services/analytics/index.js";
import { sanitizeToolNameForAnalytics } from "../services/analytics/metadata.js";
import { logForDebugging } from "./debug.js";
import { getErrnoCode, toError } from "./errors.js";
import { formatFileSize } from "./format.js";
import { logError } from "./log.js";
import { getProjectDir } from "./sessionStorage.js";
import { jsonStringify } from "./slowOperations.js";
const TOOL_RESULTS_SUBDIR = "tool-results";
const PERSISTED_OUTPUT_TAG = "<persisted-output>";
const PERSISTED_OUTPUT_CLOSING_TAG = "</persisted-output>";
const TOOL_RESULT_CLEARED_MESSAGE = "[Old tool result content cleared]";
const PERSIST_THRESHOLD_OVERRIDE_FLAG = "tengu_satin_quoll";
function getPersistenceThreshold(toolName, declaredMaxResultSizeChars) {
  if (!Number.isFinite(declaredMaxResultSizeChars)) {
    return declaredMaxResultSizeChars;
  }
  const overrides = getFeatureValue_CACHED_MAY_BE_STALE(PERSIST_THRESHOLD_OVERRIDE_FLAG, {});
  const override = overrides?.[toolName];
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override;
  }
  return Math.min(declaredMaxResultSizeChars, DEFAULT_MAX_RESULT_SIZE_CHARS);
}
function getSessionDir() {
  return join(getProjectDir(getOriginalCwd()), getSessionId());
}
function getToolResultsDir() {
  return join(getSessionDir(), TOOL_RESULTS_SUBDIR);
}
const PREVIEW_SIZE_BYTES = 2e3;
function getToolResultPath(id, isJson) {
  const ext = isJson ? "json" : "txt";
  return join(getToolResultsDir(), `${id}.${ext}`);
}
async function ensureToolResultsDir() {
  try {
    await mkdir(getToolResultsDir(), { recursive: true });
  } catch {
  }
}
async function persistToolResult(content, toolUseId) {
  const isJson = Array.isArray(content);
  if (isJson) {
    const hasNonTextContent = content.some((block) => block.type !== "text");
    if (hasNonTextContent) {
      return {
        error: "Cannot persist tool results containing non-text content"
      };
    }
  }
  await ensureToolResultsDir();
  const filepath = getToolResultPath(toolUseId, isJson);
  const contentStr = isJson ? jsonStringify(content, null, 2) : content;
  try {
    await writeFile(filepath, contentStr, { encoding: "utf-8", flag: "wx" });
    logForDebugging(
      `Persisted tool result to ${filepath} (${formatFileSize(contentStr.length)})`
    );
  } catch (error) {
    if (getErrnoCode(error) !== "EEXIST") {
      logError(toError(error));
      return { error: getFileSystemErrorMessage(toError(error)) };
    }
  }
  const { preview, hasMore } = generatePreview(contentStr, PREVIEW_SIZE_BYTES);
  return {
    filepath,
    originalSize: contentStr.length,
    isJson,
    preview,
    hasMore
  };
}
function buildLargeToolResultMessage(result) {
  let message = `${PERSISTED_OUTPUT_TAG}
`;
  message += `Output too large (${formatFileSize(result.originalSize)}). Full output saved to: ${result.filepath}

`;
  message += `Preview (first ${formatFileSize(PREVIEW_SIZE_BYTES)}):
`;
  message += result.preview;
  message += result.hasMore ? "\n...\n" : "\n";
  message += PERSISTED_OUTPUT_CLOSING_TAG;
  return message;
}
async function processToolResultBlock(tool, toolUseResult, toolUseID) {
  const toolResultBlock = tool.mapToolResultToToolResultBlockParam(
    toolUseResult,
    toolUseID
  );
  return maybePersistLargeToolResult(
    toolResultBlock,
    tool.name,
    getPersistenceThreshold(tool.name, tool.maxResultSizeChars)
  );
}
async function processPreMappedToolResultBlock(toolResultBlock, toolName, maxResultSizeChars) {
  return maybePersistLargeToolResult(
    toolResultBlock,
    toolName,
    getPersistenceThreshold(toolName, maxResultSizeChars)
  );
}
function isToolResultContentEmpty(content) {
  if (!content) return true;
  if (typeof content === "string") return content.trim() === "";
  if (!Array.isArray(content)) return false;
  if (content.length === 0) return true;
  return content.every(
    (block) => typeof block === "object" && "type" in block && block.type === "text" && "text" in block && (typeof block.text !== "string" || block.text.trim() === "")
  );
}
async function maybePersistLargeToolResult(toolResultBlock, toolName, persistenceThreshold) {
  const content = toolResultBlock.content;
  if (isToolResultContentEmpty(content)) {
    logEvent("tengu_tool_empty_result", {
      toolName: sanitizeToolNameForAnalytics(toolName)
    });
    return {
      ...toolResultBlock,
      content: `(${toolName} completed with no output)`
    };
  }
  if (!content) {
    return toolResultBlock;
  }
  if (hasImageBlock(content)) {
    return toolResultBlock;
  }
  const size = contentSize(content);
  const threshold = persistenceThreshold ?? MAX_TOOL_RESULT_BYTES;
  if (size <= threshold) {
    return toolResultBlock;
  }
  const result = await persistToolResult(content, toolResultBlock.tool_use_id);
  if (isPersistError(result)) {
    return toolResultBlock;
  }
  const message = buildLargeToolResultMessage(result);
  logEvent("tengu_tool_result_persisted", {
    toolName: sanitizeToolNameForAnalytics(toolName),
    originalSizeBytes: result.originalSize,
    persistedSizeBytes: message.length,
    estimatedOriginalTokens: Math.ceil(result.originalSize / BYTES_PER_TOKEN),
    estimatedPersistedTokens: Math.ceil(message.length / BYTES_PER_TOKEN),
    thresholdUsed: threshold
  });
  return { ...toolResultBlock, content: message };
}
function generatePreview(content, maxBytes) {
  if (content.length <= maxBytes) {
    return { preview: content, hasMore: false };
  }
  const truncated = content.slice(0, maxBytes);
  const lastNewline = truncated.lastIndexOf("\n");
  const cutPoint = lastNewline > maxBytes * 0.5 ? lastNewline : maxBytes;
  return { preview: content.slice(0, cutPoint), hasMore: true };
}
function isPersistError(result) {
  return "error" in result;
}
function createContentReplacementState() {
  return { seenIds: /* @__PURE__ */ new Set(), replacements: /* @__PURE__ */ new Map() };
}
function cloneContentReplacementState(source) {
  return {
    seenIds: new Set(source.seenIds),
    replacements: new Map(source.replacements)
  };
}
function getPerMessageBudgetLimit() {
  const override = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_hawthorn_window",
    null
  );
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override;
  }
  return MAX_TOOL_RESULTS_PER_MESSAGE_CHARS;
}
function provisionContentReplacementState(initialMessages, initialContentReplacements) {
  const enabled = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_hawthorn_steeple",
    false
  );
  if (!enabled) return void 0;
  if (initialMessages) {
    return reconstructContentReplacementState(
      initialMessages,
      initialContentReplacements ?? []
    );
  }
  return createContentReplacementState();
}
function isContentAlreadyCompacted(content) {
  return typeof content === "string" && content.startsWith(PERSISTED_OUTPUT_TAG);
}
function hasImageBlock(content) {
  return Array.isArray(content) && content.some(
    (b) => typeof b === "object" && "type" in b && b.type === "image"
  );
}
function contentSize(content) {
  if (typeof content === "string") return content.length;
  return content.reduce(
    (sum, b) => sum + (b.type === "text" ? b.text.length : 0),
    0
  );
}
function buildToolNameMap(messages) {
  const map = /* @__PURE__ */ new Map();
  for (const message of messages) {
    if (message.type !== "assistant") continue;
    const content = message.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === "tool_use") {
        map.set(block.id, block.name);
      }
    }
  }
  return map;
}
function collectCandidatesFromMessage(message) {
  if (message.type !== "user" || !Array.isArray(message.message.content)) {
    return [];
  }
  return message.message.content.flatMap((block) => {
    if (block.type !== "tool_result" || !block.content) return [];
    if (isContentAlreadyCompacted(block.content)) return [];
    if (hasImageBlock(block.content)) return [];
    return [
      {
        toolUseId: block.tool_use_id,
        content: block.content,
        size: contentSize(block.content)
      }
    ];
  });
}
function collectCandidatesByMessage(messages) {
  const groups = [];
  let current = [];
  const flush = () => {
    if (current.length > 0) groups.push(current);
    current = [];
  };
  const seenAsstIds = /* @__PURE__ */ new Set();
  for (const message of messages) {
    if (message.type === "user") {
      current.push(...collectCandidatesFromMessage(message));
    } else if (message.type === "assistant") {
      if (!seenAsstIds.has(message.message.id)) {
        flush();
        seenAsstIds.add(message.message.id);
      }
    }
  }
  flush();
  return groups;
}
function partitionByPriorDecision(candidates, state) {
  return candidates.reduce(
    (acc, c) => {
      const replacement = state.replacements.get(c.toolUseId);
      if (replacement !== void 0) {
        acc.mustReapply.push({ ...c, replacement });
      } else if (state.seenIds.has(c.toolUseId)) {
        acc.frozen.push(c);
      } else {
        acc.fresh.push(c);
      }
      return acc;
    },
    { mustReapply: [], frozen: [], fresh: [] }
  );
}
function selectFreshToReplace(fresh, frozenSize, limit) {
  const sorted = [...fresh].sort((a, b) => b.size - a.size);
  const selected = [];
  let remaining = frozenSize + fresh.reduce((sum, c) => sum + c.size, 0);
  for (const c of sorted) {
    if (remaining <= limit) break;
    selected.push(c);
    remaining -= c.size;
  }
  return selected;
}
function replaceToolResultContents(messages, replacementMap) {
  return messages.map((message) => {
    if (message.type !== "user" || !Array.isArray(message.message.content)) {
      return message;
    }
    const content = message.message.content;
    const needsReplace = content.some(
      (b) => b.type === "tool_result" && replacementMap.has(b.tool_use_id)
    );
    if (!needsReplace) return message;
    return {
      ...message,
      message: {
        ...message.message,
        content: content.map((block) => {
          if (block.type !== "tool_result") return block;
          const replacement = replacementMap.get(block.tool_use_id);
          return replacement === void 0 ? block : { ...block, content: replacement };
        })
      }
    };
  });
}
async function buildReplacement(candidate) {
  const result = await persistToolResult(candidate.content, candidate.toolUseId);
  if (isPersistError(result)) return null;
  return {
    content: buildLargeToolResultMessage(result),
    originalSize: result.originalSize
  };
}
async function enforceToolResultBudget(messages, state, skipToolNames = /* @__PURE__ */ new Set()) {
  const candidatesByMessage = collectCandidatesByMessage(messages);
  const nameByToolUseId = skipToolNames.size > 0 ? buildToolNameMap(messages) : void 0;
  const shouldSkip = (id) => nameByToolUseId !== void 0 && skipToolNames.has(nameByToolUseId.get(id) ?? "");
  const limit = getPerMessageBudgetLimit();
  const replacementMap = /* @__PURE__ */ new Map();
  const toPersist = [];
  let reappliedCount = 0;
  let messagesOverBudget = 0;
  for (const candidates of candidatesByMessage) {
    const { mustReapply, frozen, fresh } = partitionByPriorDecision(
      candidates,
      state
    );
    mustReapply.forEach((c) => replacementMap.set(c.toolUseId, c.replacement));
    reappliedCount += mustReapply.length;
    if (fresh.length === 0) {
      candidates.forEach((c) => state.seenIds.add(c.toolUseId));
      continue;
    }
    const skipped = fresh.filter((c) => shouldSkip(c.toolUseId));
    skipped.forEach((c) => state.seenIds.add(c.toolUseId));
    const eligible = fresh.filter((c) => !shouldSkip(c.toolUseId));
    const frozenSize = frozen.reduce((sum, c) => sum + c.size, 0);
    const freshSize = eligible.reduce((sum, c) => sum + c.size, 0);
    const selected = frozenSize + freshSize > limit ? selectFreshToReplace(eligible, frozenSize, limit) : [];
    const selectedIds = new Set(selected.map((c) => c.toolUseId));
    candidates.filter((c) => !selectedIds.has(c.toolUseId)).forEach((c) => state.seenIds.add(c.toolUseId));
    if (selected.length === 0) continue;
    messagesOverBudget++;
    toPersist.push(...selected);
  }
  if (replacementMap.size === 0 && toPersist.length === 0) {
    return { messages, newlyReplaced: [] };
  }
  const freshReplacements = await Promise.all(
    toPersist.map(async (c) => [c, await buildReplacement(c)])
  );
  const newlyReplaced = [];
  let replacedSize = 0;
  for (const [candidate, replacement] of freshReplacements) {
    state.seenIds.add(candidate.toolUseId);
    if (replacement === null) continue;
    replacedSize += candidate.size;
    replacementMap.set(candidate.toolUseId, replacement.content);
    state.replacements.set(candidate.toolUseId, replacement.content);
    newlyReplaced.push({
      kind: "tool-result",
      toolUseId: candidate.toolUseId,
      replacement: replacement.content
    });
    logEvent("tengu_tool_result_persisted_message_budget", {
      originalSizeBytes: replacement.originalSize,
      persistedSizeBytes: replacement.content.length,
      estimatedOriginalTokens: Math.ceil(
        replacement.originalSize / BYTES_PER_TOKEN
      ),
      estimatedPersistedTokens: Math.ceil(
        replacement.content.length / BYTES_PER_TOKEN
      )
    });
  }
  if (replacementMap.size === 0) {
    return { messages, newlyReplaced: [] };
  }
  if (newlyReplaced.length > 0) {
    logForDebugging(
      `Per-message budget: persisted ${newlyReplaced.length} tool results across ${messagesOverBudget} over-budget message(s), shed ~${formatFileSize(replacedSize)}, ${reappliedCount} re-applied`
    );
    logEvent("tengu_message_level_tool_result_budget_enforced", {
      resultsPersisted: newlyReplaced.length,
      messagesOverBudget,
      replacedSizeBytes: replacedSize,
      reapplied: reappliedCount
    });
  }
  return {
    messages: replaceToolResultContents(messages, replacementMap),
    newlyReplaced
  };
}
async function applyToolResultBudget(messages, state, writeToTranscript, skipToolNames) {
  if (!state) return messages;
  const result = await enforceToolResultBudget(messages, state, skipToolNames);
  if (result.newlyReplaced.length > 0) {
    writeToTranscript?.(result.newlyReplaced);
  }
  return result.messages;
}
function reconstructContentReplacementState(messages, records, inheritedReplacements) {
  const state = createContentReplacementState();
  const candidateIds = new Set(
    collectCandidatesByMessage(messages).flat().map((c) => c.toolUseId)
  );
  for (const id of candidateIds) {
    state.seenIds.add(id);
  }
  for (const r of records) {
    if (r.kind === "tool-result" && candidateIds.has(r.toolUseId)) {
      state.replacements.set(r.toolUseId, r.replacement);
    }
  }
  if (inheritedReplacements) {
    for (const [id, replacement] of inheritedReplacements) {
      if (candidateIds.has(id) && !state.replacements.has(id)) {
        state.replacements.set(id, replacement);
      }
    }
  }
  return state;
}
function reconstructForSubagentResume(parentState, resumedMessages, sidechainRecords) {
  if (!parentState) return void 0;
  return reconstructContentReplacementState(
    resumedMessages,
    sidechainRecords,
    parentState.replacements
  );
}
function getFileSystemErrorMessage(error) {
  const nodeError = error;
  if (nodeError.code) {
    switch (nodeError.code) {
      case "ENOENT":
        return `Directory not found: ${nodeError.path ?? "unknown path"}`;
      case "EACCES":
        return `Permission denied: ${nodeError.path ?? "unknown path"}`;
      case "ENOSPC":
        return "No space left on device";
      case "EROFS":
        return "Read-only file system";
      case "EMFILE":
        return "Too many open files";
      case "EEXIST":
        return `File already exists: ${nodeError.path ?? "unknown path"}`;
      default:
        return `${nodeError.code}: ${nodeError.message}`;
    }
  }
  return error.message;
}
export {
  PERSISTED_OUTPUT_CLOSING_TAG,
  PERSISTED_OUTPUT_TAG,
  PREVIEW_SIZE_BYTES,
  TOOL_RESULTS_SUBDIR,
  TOOL_RESULT_CLEARED_MESSAGE,
  applyToolResultBudget,
  buildLargeToolResultMessage,
  cloneContentReplacementState,
  createContentReplacementState,
  enforceToolResultBudget,
  ensureToolResultsDir,
  generatePreview,
  getPerMessageBudgetLimit,
  getPersistenceThreshold,
  getToolResultPath,
  getToolResultsDir,
  isPersistError,
  isToolResultContentEmpty,
  persistToolResult,
  processPreMappedToolResultBlock,
  processToolResultBlock,
  provisionContentReplacementState,
  reconstructContentReplacementState,
  reconstructForSubagentResume
};
