import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import { basename } from "path";
import { getIsRemoteMode } from "../../bootstrap/state.js";
import { ENTRYPOINT_NAME } from "../../memdir/memdir.js";
import {
  formatMemoryManifest,
  scanMemoryFiles
} from "../../memdir/memoryScan.js";
import {
  getAutoMemPath,
  isAutoMemoryEnabled,
  isAutoMemPath
} from "../../memdir/paths.js";
import { BASH_TOOL_NAME } from "../../tools/BashTool/toolName.js";
import { FILE_EDIT_TOOL_NAME } from "../../tools/FileEditTool/constants.js";
import { FILE_READ_TOOL_NAME } from "../../tools/FileReadTool/prompt.js";
import { FILE_WRITE_TOOL_NAME } from "../../tools/FileWriteTool/prompt.js";
import { GLOB_TOOL_NAME } from "../../tools/GlobTool/prompt.js";
import { GREP_TOOL_NAME } from "../../tools/GrepTool/prompt.js";
import { REPL_TOOL_NAME } from "../../tools/REPLTool/constants.js";
import { createAbortController } from "../../utils/abortController.js";
import { count, uniq } from "../../utils/array.js";
import { logForDebugging } from "../../utils/debug.js";
import {
  createCacheSafeParams,
  runForkedAgent
} from "../../utils/forkedAgent.js";
import {
  createMemorySavedMessage,
  createUserMessage
} from "../../utils/messages.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../analytics/growthbook.js";
import { logEvent } from "../analytics/index.js";
import { sanitizeToolNameForAnalytics } from "../analytics/metadata.js";
import {
  buildExtractAutoOnlyPrompt
} from "./prompts.js";
const teamMemPaths = false ? require2("../../memdir/teamMemPaths.js") : null;
function isModelVisibleMessage(message) {
  return message.type === "user" || message.type === "assistant";
}
function countModelVisibleMessagesSince(messages, sinceUuid) {
  if (sinceUuid === null || sinceUuid === void 0) {
    return count(messages, isModelVisibleMessage);
  }
  let foundStart = false;
  let n = 0;
  for (const message of messages) {
    if (!foundStart) {
      if (message.uuid === sinceUuid) {
        foundStart = true;
      }
      continue;
    }
    if (isModelVisibleMessage(message)) {
      n++;
    }
  }
  if (!foundStart) {
    return count(messages, isModelVisibleMessage);
  }
  return n;
}
function hasMemoryWritesSince(messages, sinceUuid) {
  let foundStart = sinceUuid === void 0;
  for (const message of messages) {
    if (!foundStart) {
      if (message.uuid === sinceUuid) {
        foundStart = true;
      }
      continue;
    }
    if (message.type !== "assistant") {
      continue;
    }
    const content = message.message.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      const filePath = getWrittenFilePath(block);
      if (filePath !== void 0 && isAutoMemPath(filePath)) {
        return true;
      }
    }
  }
  return false;
}
function denyAutoMemTool(tool, reason) {
  logForDebugging(`[autoMem] denied ${tool.name}: ${reason}`);
  logEvent("tengu_auto_mem_tool_denied", {
    tool_name: sanitizeToolNameForAnalytics(tool.name)
  });
  return {
    behavior: "deny",
    message: reason,
    decisionReason: { type: "other", reason }
  };
}
function createAutoMemCanUseTool(memoryDir) {
  return async (tool, input) => {
    if (tool.name === REPL_TOOL_NAME) {
      return { behavior: "allow", updatedInput: input };
    }
    if (tool.name === FILE_READ_TOOL_NAME || tool.name === GREP_TOOL_NAME || tool.name === GLOB_TOOL_NAME) {
      return { behavior: "allow", updatedInput: input };
    }
    if (tool.name === BASH_TOOL_NAME) {
      const parsed = tool.inputSchema.safeParse(input);
      if (parsed.success && tool.isReadOnly(parsed.data)) {
        return { behavior: "allow", updatedInput: input };
      }
      return denyAutoMemTool(
        tool,
        "Only read-only shell commands are permitted in this context (ls, find, grep, cat, stat, wc, head, tail, and similar)"
      );
    }
    if ((tool.name === FILE_EDIT_TOOL_NAME || tool.name === FILE_WRITE_TOOL_NAME) && "file_path" in input) {
      const filePath = input.file_path;
      if (typeof filePath === "string" && isAutoMemPath(filePath)) {
        return { behavior: "allow", updatedInput: input };
      }
    }
    return denyAutoMemTool(
      tool,
      `only ${FILE_READ_TOOL_NAME}, ${GREP_TOOL_NAME}, ${GLOB_TOOL_NAME}, read-only ${BASH_TOOL_NAME}, and ${FILE_EDIT_TOOL_NAME}/${FILE_WRITE_TOOL_NAME} within ${memoryDir} are allowed`
    );
  };
}
function getWrittenFilePath(block) {
  if (block.type !== "tool_use" || block.name !== FILE_EDIT_TOOL_NAME && block.name !== FILE_WRITE_TOOL_NAME) {
    return void 0;
  }
  const input = block.input;
  if (typeof input === "object" && input !== null && "file_path" in input) {
    const fp = input.file_path;
    return typeof fp === "string" ? fp : void 0;
  }
  return void 0;
}
function extractWrittenPaths(agentMessages) {
  const paths = [];
  for (const message of agentMessages) {
    if (message.type !== "assistant") {
      continue;
    }
    const content = message.message.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      const filePath = getWrittenFilePath(block);
      if (filePath !== void 0) {
        paths.push(filePath);
      }
    }
  }
  return uniq(paths);
}
let extractor = null;
let drainer = async () => {
};
function initExtractMemories() {
  const inFlightExtractions = /* @__PURE__ */ new Set();
  let lastMemoryMessageUuid;
  let hasLoggedGateFailure = false;
  let inProgress = false;
  let turnsSinceLastExtraction = 0;
  let pendingContext;
  async function runExtraction({
    context,
    appendSystemMessage,
    isTrailingRun
  }) {
    const { messages } = context;
    const memoryDir = getAutoMemPath();
    const newMessageCount = countModelVisibleMessagesSince(
      messages,
      lastMemoryMessageUuid
    );
    if (hasMemoryWritesSince(messages, lastMemoryMessageUuid)) {
      logForDebugging(
        "[extractMemories] skipping \u2014 conversation already wrote to memory files"
      );
      const lastMessage = messages.at(-1);
      if (lastMessage?.uuid) {
        lastMemoryMessageUuid = lastMessage.uuid;
      }
      logEvent("tengu_extract_memories_skipped_direct_write", {
        message_count: newMessageCount
      });
      return;
    }
    const teamMemoryEnabled = false ? teamMemPaths.isTeamMemoryEnabled() : false;
    const skipIndex = getFeatureValue_CACHED_MAY_BE_STALE(
      "tengu_moth_copse",
      false
    );
    const canUseTool = createAutoMemCanUseTool(memoryDir);
    const cacheSafeParams = createCacheSafeParams(context);
    if (!isTrailingRun) {
      turnsSinceLastExtraction++;
      if (turnsSinceLastExtraction < (getFeatureValue_CACHED_MAY_BE_STALE("tengu_bramble_lintel", null) ?? 1)) {
        return;
      }
    }
    turnsSinceLastExtraction = 0;
    inProgress = true;
    const startTime = Date.now();
    try {
      logForDebugging(
        `[extractMemories] starting \u2014 ${newMessageCount} new messages, memoryDir=${memoryDir}`
      );
      const existingMemories = formatMemoryManifest(
        await scanMemoryFiles(memoryDir, createAbortController().signal)
      );
      const userPrompt = false ? buildExtractCombinedPrompt(
        newMessageCount,
        existingMemories,
        skipIndex
      ) : buildExtractAutoOnlyPrompt(
        newMessageCount,
        existingMemories,
        skipIndex
      );
      const result = await runForkedAgent({
        promptMessages: [createUserMessage({ content: userPrompt })],
        cacheSafeParams,
        canUseTool,
        querySource: "extract_memories",
        forkLabel: "extract_memories",
        // The extractMemories subagent does not need to record to transcript.
        // Doing so can create race conditions with the main thread.
        skipTranscript: true,
        // Well-behaved extractions complete in 2-4 turns (read → write).
        // A hard cap prevents verification rabbit-holes from burning turns.
        maxTurns: 5
      });
      const lastMessage = messages.at(-1);
      if (lastMessage?.uuid) {
        lastMemoryMessageUuid = lastMessage.uuid;
      }
      const writtenPaths = extractWrittenPaths(result.messages);
      const turnCount = count(result.messages, (m) => m.type === "assistant");
      const totalInput = result.totalUsage.input_tokens + result.totalUsage.cache_creation_input_tokens + result.totalUsage.cache_read_input_tokens;
      const hitPct = totalInput > 0 ? (result.totalUsage.cache_read_input_tokens / totalInput * 100).toFixed(1) : "0.0";
      logForDebugging(
        `[extractMemories] finished \u2014 ${writtenPaths.length} files written, cache: read=${result.totalUsage.cache_read_input_tokens} create=${result.totalUsage.cache_creation_input_tokens} input=${result.totalUsage.input_tokens} (${hitPct}% hit)`
      );
      if (writtenPaths.length > 0) {
        logForDebugging(
          `[extractMemories] memories saved: ${writtenPaths.join(", ")}`
        );
      } else {
        logForDebugging("[extractMemories] no memories saved this run");
      }
      const memoryPaths = writtenPaths.filter(
        (p) => basename(p) !== ENTRYPOINT_NAME
      );
      const teamCount = false ? count(memoryPaths, teamMemPaths.isTeamMemPath) : 0;
      logEvent("tengu_extract_memories_extraction", {
        input_tokens: result.totalUsage.input_tokens,
        output_tokens: result.totalUsage.output_tokens,
        cache_read_input_tokens: result.totalUsage.cache_read_input_tokens,
        cache_creation_input_tokens: result.totalUsage.cache_creation_input_tokens,
        message_count: newMessageCount,
        turn_count: turnCount,
        files_written: writtenPaths.length,
        memories_saved: memoryPaths.length,
        team_memories_saved: teamCount,
        duration_ms: Date.now() - startTime
      });
      logForDebugging(
        `[extractMemories] writtenPaths=${writtenPaths.length} memoryPaths=${memoryPaths.length} appendSystemMessage defined=${appendSystemMessage != null}`
      );
      if (memoryPaths.length > 0) {
        const msg = createMemorySavedMessage(memoryPaths);
        if (false) {
          msg.teamCount = teamCount;
        }
        appendSystemMessage?.(msg);
      }
    } catch (error) {
      logForDebugging(`[extractMemories] error: ${error}`);
      logEvent("tengu_extract_memories_error", {
        duration_ms: Date.now() - startTime
      });
    } finally {
      inProgress = false;
      const trailing = pendingContext;
      pendingContext = void 0;
      if (trailing) {
        logForDebugging(
          "[extractMemories] running trailing extraction for stashed context"
        );
        await runExtraction({
          context: trailing.context,
          appendSystemMessage: trailing.appendSystemMessage,
          isTrailingRun: true
        });
      }
    }
  }
  async function executeExtractMemoriesImpl(context, appendSystemMessage) {
    if (context.toolUseContext.agentId) {
      return;
    }
    if (!getFeatureValue_CACHED_MAY_BE_STALE("tengu_passport_quail", false)) {
      if (process.env.USER_TYPE === "ant" && !hasLoggedGateFailure) {
        hasLoggedGateFailure = true;
        logEvent("tengu_extract_memories_gate_disabled", {});
      }
      return;
    }
    if (!isAutoMemoryEnabled()) {
      return;
    }
    if (getIsRemoteMode()) {
      return;
    }
    if (inProgress) {
      logForDebugging(
        "[extractMemories] extraction in progress \u2014 stashing for trailing run"
      );
      logEvent("tengu_extract_memories_coalesced", {});
      pendingContext = { context, appendSystemMessage };
      return;
    }
    await runExtraction({ context, appendSystemMessage });
  }
  extractor = async (context, appendSystemMessage) => {
    const p = executeExtractMemoriesImpl(context, appendSystemMessage);
    inFlightExtractions.add(p);
    try {
      await p;
    } finally {
      inFlightExtractions.delete(p);
    }
  };
  drainer = async (timeoutMs = 6e4) => {
    if (inFlightExtractions.size === 0) return;
    await Promise.race([
      Promise.all(inFlightExtractions).catch(() => {
      }),
      // eslint-disable-next-line no-restricted-syntax -- sleep() has no .unref(); timer must not block exit
      new Promise((r) => setTimeout(r, timeoutMs).unref())
    ]);
  };
}
async function executeExtractMemories(context, appendSystemMessage) {
  await extractor?.(context, appendSystemMessage);
}
async function drainPendingExtraction(timeoutMs) {
  await drainer(timeoutMs);
}
export {
  createAutoMemCanUseTool,
  drainPendingExtraction,
  executeExtractMemories,
  initExtractMemories
};
