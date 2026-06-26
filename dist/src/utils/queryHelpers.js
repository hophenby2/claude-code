import last from "lodash-es/last.js";
import {
  getSessionId,
  isSessionPersistenceDisabled
} from "../bootstrap/state.js";
import { runTools } from "../services/tools/toolOrchestration.js";
import { findToolByName } from "../Tool.js";
import { BASH_TOOL_NAME } from "../tools/BashTool/toolName.js";
import { FILE_EDIT_TOOL_NAME } from "../tools/FileEditTool/constants.js";
import {
  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB
} from "../tools/FileReadTool/prompt.js";
import { FILE_WRITE_TOOL_NAME } from "../tools/FileWriteTool/prompt.js";
import { logForDebugging } from "./debug.js";
import { isEnvTruthy } from "./envUtils.js";
import { isFsInaccessible } from "./errors.js";
import { getFileModificationTime, stripLineNumberPrefix } from "./file.js";
import { readFileSyncWithMetadata } from "./fileRead.js";
import {
  createFileStateCacheWithSizeLimit
} from "./fileStateCache.js";
import { isNotEmptyMessage, normalizeMessages } from "./messages.js";
import { expandPath } from "./path.js";
import { recordTranscript } from "./sessionStorage.js";
const ASK_READ_FILE_STATE_CACHE_SIZE = 10;
function isResultSuccessful(message, stopReason = null) {
  if (!message) return false;
  if (message.type === "assistant") {
    const lastContent = last(message.message.content);
    return lastContent?.type === "text" || lastContent?.type === "thinking" || lastContent?.type === "redacted_thinking";
  }
  if (message.type === "user") {
    const content = message.message.content;
    if (Array.isArray(content) && content.length > 0 && content.every((block) => "type" in block && block.type === "tool_result")) {
      return true;
    }
  }
  return stopReason === "end_turn";
}
const MAX_TOOL_PROGRESS_TRACKING_ENTRIES = 100;
const TOOL_PROGRESS_THROTTLE_MS = 3e4;
const toolProgressLastSentTime = /* @__PURE__ */ new Map();
function* normalizeMessage(message) {
  switch (message.type) {
    case "assistant":
      for (const _ of normalizeMessages([message])) {
        if (!isNotEmptyMessage(_)) {
          continue;
        }
        yield {
          type: "assistant",
          message: _.message,
          parent_tool_use_id: null,
          session_id: getSessionId(),
          uuid: _.uuid,
          error: _.error
        };
      }
      return;
    case "progress":
      if (message.data.type === "agent_progress" || message.data.type === "skill_progress") {
        for (const _ of normalizeMessages([message.data.message])) {
          switch (_.type) {
            case "assistant":
              if (!isNotEmptyMessage(_)) {
                break;
              }
              yield {
                type: "assistant",
                message: _.message,
                parent_tool_use_id: message.parentToolUseID,
                session_id: getSessionId(),
                uuid: _.uuid,
                error: _.error
              };
              break;
            case "user":
              yield {
                type: "user",
                message: _.message,
                parent_tool_use_id: message.parentToolUseID,
                session_id: getSessionId(),
                uuid: _.uuid,
                timestamp: _.timestamp,
                isSynthetic: _.isMeta || _.isVisibleInTranscriptOnly,
                tool_use_result: _.mcpMeta ? { content: _.toolUseResult, ..._.mcpMeta } : _.toolUseResult
              };
              break;
          }
        }
      } else if (message.data.type === "bash_progress" || message.data.type === "powershell_progress") {
        if (!isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) && !process.env.CLAUDE_CODE_CONTAINER_ID) {
          break;
        }
        const trackingKey = message.parentToolUseID;
        const now = Date.now();
        const lastSent = toolProgressLastSentTime.get(trackingKey) || 0;
        const timeSinceLastSent = now - lastSent;
        if (timeSinceLastSent >= TOOL_PROGRESS_THROTTLE_MS) {
          if (toolProgressLastSentTime.size >= MAX_TOOL_PROGRESS_TRACKING_ENTRIES) {
            const firstKey = toolProgressLastSentTime.keys().next().value;
            if (firstKey !== void 0) {
              toolProgressLastSentTime.delete(firstKey);
            }
          }
          toolProgressLastSentTime.set(trackingKey, now);
          yield {
            type: "tool_progress",
            tool_use_id: message.toolUseID,
            tool_name: message.data.type === "bash_progress" ? "Bash" : "PowerShell",
            parent_tool_use_id: message.parentToolUseID,
            elapsed_time_seconds: message.data.elapsedTimeSeconds,
            task_id: message.data.taskId,
            session_id: getSessionId(),
            uuid: message.uuid
          };
        }
      }
      break;
    case "user":
      for (const _ of normalizeMessages([message])) {
        yield {
          type: "user",
          message: _.message,
          parent_tool_use_id: null,
          session_id: getSessionId(),
          uuid: _.uuid,
          timestamp: _.timestamp,
          isSynthetic: _.isMeta || _.isVisibleInTranscriptOnly,
          tool_use_result: _.mcpMeta ? { content: _.toolUseResult, ..._.mcpMeta } : _.toolUseResult
        };
      }
      return;
    default:
  }
}
async function* handleOrphanedPermission(orphanedPermission, tools, mutableMessages, processUserInputContext) {
  const persistSession = !isSessionPersistenceDisabled();
  const { permissionResult, assistantMessage } = orphanedPermission;
  const { toolUseID } = permissionResult;
  if (!toolUseID) {
    return;
  }
  const content = assistantMessage.message.content;
  let toolUseBlock;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "tool_use" && block.id === toolUseID) {
        toolUseBlock = block;
        break;
      }
    }
  }
  if (!toolUseBlock) {
    return;
  }
  const toolName = toolUseBlock.name;
  const toolInput = toolUseBlock.input;
  const toolDefinition = findToolByName(tools, toolName);
  if (!toolDefinition) {
    return;
  }
  let finalInput = toolInput;
  if (permissionResult.behavior === "allow") {
    if (permissionResult.updatedInput !== void 0) {
      finalInput = permissionResult.updatedInput;
    } else {
      logForDebugging(
        `Orphaned permission for ${toolName}: updatedInput is undefined, falling back to original tool input`,
        { level: "warn" }
      );
    }
  }
  const finalToolUseBlock = {
    ...toolUseBlock,
    input: finalInput
  };
  const canUseTool = async () => ({
    ...permissionResult,
    decisionReason: {
      type: "mode",
      mode: "default"
    }
  });
  const alreadyPresent = mutableMessages.some(
    (m) => m.type === "assistant" && Array.isArray(m.message.content) && m.message.content.some(
      (b) => b.type === "tool_use" && "id" in b && b.id === toolUseID
    )
  );
  if (!alreadyPresent) {
    mutableMessages.push(assistantMessage);
    if (persistSession) {
      await recordTranscript(mutableMessages);
    }
  }
  const sdkAssistantMessage = {
    ...assistantMessage,
    session_id: getSessionId(),
    parent_tool_use_id: null
  };
  yield sdkAssistantMessage;
  for await (const update of runTools(
    [finalToolUseBlock],
    [assistantMessage],
    canUseTool,
    processUserInputContext
  )) {
    if (update.message) {
      mutableMessages.push(update.message);
      if (persistSession) {
        await recordTranscript(mutableMessages);
      }
      const sdkMessage = {
        ...update.message,
        session_id: getSessionId(),
        parent_tool_use_id: null
      };
      yield sdkMessage;
    }
  }
}
function extractReadFilesFromMessages(messages, cwd, maxSize = ASK_READ_FILE_STATE_CACHE_SIZE) {
  const cache = createFileStateCacheWithSizeLimit(maxSize);
  const fileReadToolUseIds = /* @__PURE__ */ new Map();
  const fileWriteToolUseIds = /* @__PURE__ */ new Map();
  const fileEditToolUseIds = /* @__PURE__ */ new Map();
  for (const message of messages) {
    if (message.type === "assistant" && Array.isArray(message.message.content)) {
      for (const content of message.message.content) {
        if (content.type === "tool_use" && content.name === FILE_READ_TOOL_NAME) {
          const input = content.input;
          if (input?.file_path && input?.offset === void 0 && input?.limit === void 0) {
            const absolutePath = expandPath(input.file_path, cwd);
            fileReadToolUseIds.set(content.id, absolutePath);
          }
        } else if (content.type === "tool_use" && content.name === FILE_WRITE_TOOL_NAME) {
          const input = content.input;
          if (input?.file_path && input?.content) {
            const absolutePath = expandPath(input.file_path, cwd);
            fileWriteToolUseIds.set(content.id, {
              filePath: absolutePath,
              content: input.content
            });
          }
        } else if (content.type === "tool_use" && content.name === FILE_EDIT_TOOL_NAME) {
          const input = content.input;
          if (input?.file_path) {
            const absolutePath = expandPath(input.file_path, cwd);
            fileEditToolUseIds.set(content.id, absolutePath);
          }
        }
      }
    }
  }
  for (const message of messages) {
    if (message.type === "user" && Array.isArray(message.message.content)) {
      for (const content of message.message.content) {
        if (content.type === "tool_result" && content.tool_use_id) {
          const readFilePath = fileReadToolUseIds.get(content.tool_use_id);
          if (readFilePath && typeof content.content === "string" && // Dedup stubs contain no file content — the earlier real Read
          // already cached it. Chronological last-wins would otherwise
          // overwrite the real entry with stub text.
          !content.content.startsWith(FILE_UNCHANGED_STUB)) {
            const processedContent = content.content.replace(
              /<system-reminder>[\s\S]*?<\/system-reminder>/g,
              ""
            );
            const fileContent = processedContent.split("\n").map(stripLineNumberPrefix).join("\n").trim();
            if (message.timestamp) {
              const timestamp = new Date(message.timestamp).getTime();
              cache.set(readFilePath, {
                content: fileContent,
                timestamp,
                offset: void 0,
                limit: void 0
              });
            }
          }
          const writeToolData = fileWriteToolUseIds.get(content.tool_use_id);
          if (writeToolData && message.timestamp) {
            const timestamp = new Date(message.timestamp).getTime();
            cache.set(writeToolData.filePath, {
              content: writeToolData.content,
              timestamp,
              offset: void 0,
              limit: void 0
            });
          }
          const editFilePath = fileEditToolUseIds.get(content.tool_use_id);
          if (editFilePath && content.is_error !== true) {
            try {
              const { content: diskContent } = readFileSyncWithMetadata(editFilePath);
              cache.set(editFilePath, {
                content: diskContent,
                timestamp: getFileModificationTime(editFilePath),
                offset: void 0,
                limit: void 0
              });
            } catch (e) {
              if (!isFsInaccessible(e)) {
                throw e;
              }
            }
          }
        }
      }
    }
  }
  return cache;
}
function extractBashToolsFromMessages(messages) {
  const tools = /* @__PURE__ */ new Set();
  for (const message of messages) {
    if (message.type === "assistant" && Array.isArray(message.message.content)) {
      for (const content of message.message.content) {
        if (content.type === "tool_use" && content.name === BASH_TOOL_NAME) {
          const { input } = content;
          if (typeof input !== "object" || input === null || !("command" in input))
            continue;
          const cmd = extractCliName(
            typeof input.command === "string" ? input.command : void 0
          );
          if (cmd) {
            tools.add(cmd);
          }
        }
      }
    }
  }
  return tools;
}
const STRIPPED_COMMANDS = /* @__PURE__ */ new Set(["sudo"]);
function extractCliName(command) {
  if (!command) return void 0;
  const tokens = command.trim().split(/\s+/);
  for (const token of tokens) {
    if (/^[A-Za-z_]\w*=/.test(token)) continue;
    if (STRIPPED_COMMANDS.has(token)) continue;
    return token;
  }
  return void 0;
}
export {
  extractBashToolsFromMessages,
  extractReadFilesFromMessages,
  handleOrphanedPermission,
  isResultSuccessful,
  normalizeMessage
};
