import { writeFile } from "fs/promises";
import memoize from "lodash-es/memoize.js";
import { getIsRemoteMode } from "../../bootstrap/state.js";
import { getSystemPrompt } from "../../constants/prompts.js";
import { getSystemContext, getUserContext } from "../../context.js";
import { FILE_EDIT_TOOL_NAME } from "../../tools/FileEditTool/constants.js";
import {
  FileReadTool
} from "../../tools/FileReadTool/FileReadTool.js";
import { count } from "../../utils/array.js";
import {
  createCacheSafeParams,
  createSubagentContext,
  runForkedAgent
} from "../../utils/forkedAgent.js";
import { getFsImplementation } from "../../utils/fsOperations.js";
import {
  registerPostSamplingHook
} from "../../utils/hooks/postSamplingHooks.js";
import {
  createUserMessage,
  hasToolCallsInLastAssistantTurn
} from "../../utils/messages.js";
import {
  getSessionMemoryDir,
  getSessionMemoryPath
} from "../../utils/permissions/filesystem.js";
import { sequential } from "../../utils/sequential.js";
import { asSystemPrompt } from "../../utils/systemPromptType.js";
import { getTokenUsage, tokenCountWithEstimation } from "../../utils/tokens.js";
import { logEvent } from "../analytics/index.js";
import { isAutoCompactEnabled } from "../compact/autoCompact.js";
import {
  buildSessionMemoryUpdatePrompt,
  loadSessionMemoryTemplate
} from "./prompts.js";
import {
  DEFAULT_SESSION_MEMORY_CONFIG,
  getSessionMemoryConfig,
  getToolCallsBetweenUpdates,
  hasMetInitializationThreshold,
  hasMetUpdateThreshold,
  isSessionMemoryInitialized,
  markExtractionCompleted,
  markExtractionStarted,
  markSessionMemoryInitialized,
  recordExtractionTokenCount,
  setLastSummarizedMessageId,
  setSessionMemoryConfig
} from "./sessionMemoryUtils.js";
import { errorMessage, getErrnoCode } from "../../utils/errors.js";
import {
  getDynamicConfig_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_MAY_BE_STALE
} from "../analytics/growthbook.js";
function isSessionMemoryGateEnabled() {
  return getFeatureValue_CACHED_MAY_BE_STALE("tengu_session_memory", false);
}
function getSessionMemoryRemoteConfig() {
  return getDynamicConfig_CACHED_MAY_BE_STALE(
    "tengu_sm_config",
    {}
  );
}
let lastMemoryMessageUuid;
function resetLastMemoryMessageUuid() {
  lastMemoryMessageUuid = void 0;
}
function countToolCallsSince(messages, sinceUuid) {
  let toolCallCount = 0;
  let foundStart = sinceUuid === null || sinceUuid === void 0;
  for (const message of messages) {
    if (!foundStart) {
      if (message.uuid === sinceUuid) {
        foundStart = true;
      }
      continue;
    }
    if (message.type === "assistant") {
      const content = message.message.content;
      if (Array.isArray(content)) {
        toolCallCount += count(content, (block) => block.type === "tool_use");
      }
    }
  }
  return toolCallCount;
}
function shouldExtractMemory(messages) {
  const currentTokenCount = tokenCountWithEstimation(messages);
  if (!isSessionMemoryInitialized()) {
    if (!hasMetInitializationThreshold(currentTokenCount)) {
      return false;
    }
    markSessionMemoryInitialized();
  }
  const hasMetTokenThreshold = hasMetUpdateThreshold(currentTokenCount);
  const toolCallsSinceLastUpdate = countToolCallsSince(
    messages,
    lastMemoryMessageUuid
  );
  const hasMetToolCallThreshold = toolCallsSinceLastUpdate >= getToolCallsBetweenUpdates();
  const hasToolCallsInLastTurn = hasToolCallsInLastAssistantTurn(messages);
  const shouldExtract = hasMetTokenThreshold && hasMetToolCallThreshold || hasMetTokenThreshold && !hasToolCallsInLastTurn;
  if (shouldExtract) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.uuid) {
      lastMemoryMessageUuid = lastMessage.uuid;
    }
    return true;
  }
  return false;
}
async function setupSessionMemoryFile(toolUseContext) {
  const fs = getFsImplementation();
  const sessionMemoryDir = getSessionMemoryDir();
  await fs.mkdir(sessionMemoryDir, { mode: 448 });
  const memoryPath = getSessionMemoryPath();
  try {
    await writeFile(memoryPath, "", {
      encoding: "utf-8",
      mode: 384,
      flag: "wx"
    });
    const template = await loadSessionMemoryTemplate();
    await writeFile(memoryPath, template, {
      encoding: "utf-8",
      mode: 384
    });
  } catch (e) {
    const code = getErrnoCode(e);
    if (code !== "EEXIST") {
      throw e;
    }
  }
  toolUseContext.readFileState.delete(memoryPath);
  const result = await FileReadTool.call(
    { file_path: memoryPath },
    toolUseContext
  );
  let currentMemory = "";
  const output = result.data;
  if (output.type === "text") {
    currentMemory = output.file.content;
  }
  logEvent("tengu_session_memory_file_read", {
    content_length: currentMemory.length
  });
  return { memoryPath, currentMemory };
}
const initSessionMemoryConfigIfNeeded = memoize(() => {
  const remoteConfig = getSessionMemoryRemoteConfig();
  const config = {
    minimumMessageTokensToInit: remoteConfig.minimumMessageTokensToInit && remoteConfig.minimumMessageTokensToInit > 0 ? remoteConfig.minimumMessageTokensToInit : DEFAULT_SESSION_MEMORY_CONFIG.minimumMessageTokensToInit,
    minimumTokensBetweenUpdate: remoteConfig.minimumTokensBetweenUpdate && remoteConfig.minimumTokensBetweenUpdate > 0 ? remoteConfig.minimumTokensBetweenUpdate : DEFAULT_SESSION_MEMORY_CONFIG.minimumTokensBetweenUpdate,
    toolCallsBetweenUpdates: remoteConfig.toolCallsBetweenUpdates && remoteConfig.toolCallsBetweenUpdates > 0 ? remoteConfig.toolCallsBetweenUpdates : DEFAULT_SESSION_MEMORY_CONFIG.toolCallsBetweenUpdates
  };
  setSessionMemoryConfig(config);
});
let hasLoggedGateFailure = false;
const extractSessionMemory = sequential(async function(context) {
  const { messages, toolUseContext, querySource } = context;
  if (querySource !== "repl_main_thread") {
    return;
  }
  if (!isSessionMemoryGateEnabled()) {
    if (process.env.USER_TYPE === "ant" && !hasLoggedGateFailure) {
      hasLoggedGateFailure = true;
      logEvent("tengu_session_memory_gate_disabled", {});
    }
    return;
  }
  initSessionMemoryConfigIfNeeded();
  if (!shouldExtractMemory(messages)) {
    return;
  }
  markExtractionStarted();
  const setupContext = createSubagentContext(toolUseContext);
  const { memoryPath, currentMemory } = await setupSessionMemoryFile(setupContext);
  const userPrompt = await buildSessionMemoryUpdatePrompt(
    currentMemory,
    memoryPath
  );
  await runForkedAgent({
    promptMessages: [createUserMessage({ content: userPrompt })],
    cacheSafeParams: createCacheSafeParams(context),
    canUseTool: createMemoryFileCanUseTool(memoryPath),
    querySource: "session_memory",
    forkLabel: "session_memory",
    overrides: { readFileState: setupContext.readFileState }
  });
  const lastMessage = messages[messages.length - 1];
  const usage = lastMessage ? getTokenUsage(lastMessage) : void 0;
  const config = getSessionMemoryConfig();
  logEvent("tengu_session_memory_extraction", {
    input_tokens: usage?.input_tokens,
    output_tokens: usage?.output_tokens,
    cache_read_input_tokens: usage?.cache_read_input_tokens ?? void 0,
    cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? void 0,
    config_min_message_tokens_to_init: config.minimumMessageTokensToInit,
    config_min_tokens_between_update: config.minimumTokensBetweenUpdate,
    config_tool_calls_between_updates: config.toolCallsBetweenUpdates
  });
  recordExtractionTokenCount(tokenCountWithEstimation(messages));
  updateLastSummarizedMessageIdIfSafe(messages);
  markExtractionCompleted();
});
function initSessionMemory() {
  if (getIsRemoteMode()) return;
  const autoCompactEnabled = isAutoCompactEnabled();
  if (process.env.USER_TYPE === "ant") {
    logEvent("tengu_session_memory_init", {
      auto_compact_enabled: autoCompactEnabled
    });
  }
  if (!autoCompactEnabled) {
    return;
  }
  registerPostSamplingHook(extractSessionMemory);
}
async function manuallyExtractSessionMemory(messages, toolUseContext) {
  if (messages.length === 0) {
    return { success: false, error: "No messages to summarize" };
  }
  markExtractionStarted();
  try {
    const setupContext = createSubagentContext(toolUseContext);
    const { memoryPath, currentMemory } = await setupSessionMemoryFile(setupContext);
    const userPrompt = await buildSessionMemoryUpdatePrompt(
      currentMemory,
      memoryPath
    );
    const { tools, mainLoopModel } = toolUseContext.options;
    const [rawSystemPrompt, userContext, systemContext] = await Promise.all([
      getSystemPrompt(tools, mainLoopModel),
      getUserContext(),
      getSystemContext()
    ]);
    const systemPrompt = asSystemPrompt(rawSystemPrompt);
    await runForkedAgent({
      promptMessages: [createUserMessage({ content: userPrompt })],
      cacheSafeParams: {
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext: setupContext,
        forkContextMessages: messages
      },
      canUseTool: createMemoryFileCanUseTool(memoryPath),
      querySource: "session_memory",
      forkLabel: "session_memory_manual",
      overrides: { readFileState: setupContext.readFileState }
    });
    logEvent("tengu_session_memory_manual_extraction", {});
    recordExtractionTokenCount(tokenCountWithEstimation(messages));
    updateLastSummarizedMessageIdIfSafe(messages);
    return { success: true, memoryPath };
  } catch (error) {
    return {
      success: false,
      error: errorMessage(error)
    };
  } finally {
    markExtractionCompleted();
  }
}
function createMemoryFileCanUseTool(memoryPath) {
  return async (tool, input) => {
    if (tool.name === FILE_EDIT_TOOL_NAME && typeof input === "object" && input !== null && "file_path" in input) {
      const filePath = input.file_path;
      if (typeof filePath === "string" && filePath === memoryPath) {
        return { behavior: "allow", updatedInput: input };
      }
    }
    return {
      behavior: "deny",
      message: `only ${FILE_EDIT_TOOL_NAME} on ${memoryPath} is allowed`,
      decisionReason: {
        type: "other",
        reason: `only ${FILE_EDIT_TOOL_NAME} on ${memoryPath} is allowed`
      }
    };
  };
}
function updateLastSummarizedMessageIdIfSafe(messages) {
  if (!hasToolCallsInLastAssistantTurn(messages)) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.uuid) {
      setLastSummarizedMessageId(lastMessage.uuid);
    }
  }
}
export {
  createMemoryFileCanUseTool,
  initSessionMemory,
  manuallyExtractSessionMemory,
  resetLastMemoryMessageUuid,
  shouldExtractMemory
};
