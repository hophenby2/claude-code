import { randomUUID } from "crypto";
import { rm } from "fs";
import { appendFile, copyFile, mkdir } from "fs/promises";
import { dirname, isAbsolute, join, relative } from "path";
import { getCwdState } from "../../bootstrap/state.js";
import {
  IDLE_SPECULATION_STATE
} from "../../state/AppStateStore.js";
import { commandHasAnyCd } from "../../tools/BashTool/bashPermissions.js";
import { checkReadOnlyConstraints } from "../../tools/BashTool/readOnlyValidation.js";
import { createChildAbortController } from "../../utils/abortController.js";
import { count } from "../../utils/array.js";
import { getGlobalConfig } from "../../utils/config.js";
import { logForDebugging } from "../../utils/debug.js";
import { errorMessage } from "../../utils/errors.js";
import {
  mergeFileStateCaches,
  READ_FILE_STATE_CACHE_SIZE
} from "../../utils/fileStateCache.js";
import {
  createCacheSafeParams,
  runForkedAgent
} from "../../utils/forkedAgent.js";
import { formatDuration, formatNumber } from "../../utils/format.js";
import { logError } from "../../utils/log.js";
import {
  createSystemMessage,
  createUserMessage,
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE
} from "../../utils/messages.js";
import { getClaudeTempDir } from "../../utils/permissions/filesystem.js";
import { extractReadFilesFromMessages } from "../../utils/queryHelpers.js";
import { getTranscriptPath } from "../../utils/sessionStorage.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import {
  logEvent
} from "../analytics/index.js";
import {
  generateSuggestion,
  getPromptVariant,
  getSuggestionSuppressReason,
  logSuggestionSuppressed,
  shouldFilterSuggestion
} from "./promptSuggestion.js";
const MAX_SPECULATION_TURNS = 20;
const MAX_SPECULATION_MESSAGES = 100;
const WRITE_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "NotebookEdit"]);
const SAFE_READ_ONLY_TOOLS = /* @__PURE__ */ new Set([
  "Read",
  "Glob",
  "Grep",
  "ToolSearch",
  "LSP",
  "TaskGet",
  "TaskList"
]);
function safeRemoveOverlay(overlayPath) {
  rm(
    overlayPath,
    { recursive: true, force: true, maxRetries: 3, retryDelay: 100 },
    () => {
    }
  );
}
function getOverlayPath(id) {
  return join(getClaudeTempDir(), "speculation", String(process.pid), id);
}
function denySpeculation(message, reason) {
  return {
    behavior: "deny",
    message,
    decisionReason: { type: "other", reason }
  };
}
async function copyOverlayToMain(overlayPath, writtenPaths, cwd) {
  let allCopied = true;
  for (const rel of writtenPaths) {
    const src = join(overlayPath, rel);
    const dest = join(cwd, rel);
    try {
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(src, dest);
    } catch {
      allCopied = false;
      logForDebugging(`[Speculation] Failed to copy ${rel} to main`);
    }
  }
  return allCopied;
}
function logSpeculation(id, outcome, startTime, suggestionLength, messages, boundary, extras) {
  logEvent("tengu_speculation", {
    speculation_id: id,
    outcome,
    duration_ms: Date.now() - startTime,
    suggestion_length: suggestionLength,
    tools_executed: countToolsInMessages(messages),
    completed: boundary !== null,
    boundary_type: boundary?.type,
    boundary_tool: getBoundaryTool(boundary),
    boundary_detail: getBoundaryDetail(boundary),
    ...extras
  });
}
function countToolsInMessages(messages) {
  const blocks = messages.filter(isUserMessageWithArrayContent).flatMap((m) => m.message.content).filter(
    (b) => typeof b === "object" && b !== null && "type" in b
  );
  return count(blocks, (b) => b.type === "tool_result" && !b.is_error);
}
function getBoundaryTool(boundary) {
  if (!boundary) return void 0;
  switch (boundary.type) {
    case "bash":
      return "Bash";
    case "edit":
    case "denied_tool":
      return boundary.toolName;
    case "complete":
      return void 0;
  }
}
function getBoundaryDetail(boundary) {
  if (!boundary) return void 0;
  switch (boundary.type) {
    case "bash":
      return boundary.command.slice(0, 200);
    case "edit":
      return boundary.filePath;
    case "denied_tool":
      return boundary.detail;
    case "complete":
      return void 0;
  }
}
function isUserMessageWithArrayContent(m) {
  return m.type === "user" && "message" in m && Array.isArray(m.message.content);
}
function prepareMessagesForInjection(messages) {
  const isToolResult = (b) => typeof b === "object" && b !== null && b.type === "tool_result" && typeof b.tool_use_id === "string";
  const isSuccessful = (b) => !b.is_error && !(typeof b.content === "string" && b.content.includes(INTERRUPT_MESSAGE_FOR_TOOL_USE));
  const toolIdsWithSuccessfulResults = new Set(
    messages.filter(isUserMessageWithArrayContent).flatMap((m) => m.message.content).filter(isToolResult).filter(isSuccessful).map((b) => b.tool_use_id)
  );
  const keep = (b) => b.type !== "thinking" && b.type !== "redacted_thinking" && !(b.type === "tool_use" && !toolIdsWithSuccessfulResults.has(b.id)) && !(b.type === "tool_result" && !toolIdsWithSuccessfulResults.has(b.tool_use_id)) && // Abort during speculation yields a standalone interrupt user message
  // (query.ts createUserInterruptionMessage). Strip it so it isn't surfaced
  // to the model as real user input.
  !(b.type === "text" && (b.text === INTERRUPT_MESSAGE || b.text === INTERRUPT_MESSAGE_FOR_TOOL_USE));
  return messages.map((msg) => {
    if (!("message" in msg) || !Array.isArray(msg.message.content)) return msg;
    const content = msg.message.content.filter(keep);
    if (content.length === msg.message.content.length) return msg;
    if (content.length === 0) return null;
    const hasNonWhitespaceContent = content.some(
      (b) => b.type !== "text" || b.text !== void 0 && b.text.trim() !== ""
    );
    if (!hasNonWhitespaceContent) return null;
    return { ...msg, message: { ...msg.message, content } };
  }).filter((m) => m !== null);
}
function createSpeculationFeedbackMessage(messages, boundary, timeSavedMs, sessionTotalMs) {
  if (process.env.USER_TYPE !== "ant") return null;
  if (messages.length === 0 || timeSavedMs === 0) return null;
  const toolUses = countToolsInMessages(messages);
  const tokens = boundary?.type === "complete" ? boundary.outputTokens : null;
  const parts = [];
  if (toolUses > 0) {
    parts.push(`Speculated ${toolUses} tool ${toolUses === 1 ? "use" : "uses"}`);
  } else {
    const turns = messages.length;
    parts.push(`Speculated ${turns} ${turns === 1 ? "turn" : "turns"}`);
  }
  if (tokens !== null) {
    parts.push(`${formatNumber(tokens)} tokens`);
  }
  const savedText = `+${formatDuration(timeSavedMs)} saved`;
  const sessionSuffix = sessionTotalMs !== timeSavedMs ? ` (${formatDuration(sessionTotalMs)} this session)` : "";
  return createSystemMessage(
    `[ANT-ONLY] ${parts.join(" \xB7 ")} \xB7 ${savedText}${sessionSuffix}`,
    "warning"
  );
}
function updateActiveSpeculationState(setAppState, updater) {
  setAppState((prev) => {
    if (prev.speculation.status !== "active") return prev;
    const current = prev.speculation;
    const updates = updater(current);
    const hasChanges = Object.entries(updates).some(
      ([key, value]) => current[key] !== value
    );
    if (!hasChanges) return prev;
    return {
      ...prev,
      speculation: { ...current, ...updates }
    };
  });
}
function resetSpeculationState(setAppState) {
  setAppState((prev) => {
    if (prev.speculation.status === "idle") return prev;
    return { ...prev, speculation: IDLE_SPECULATION_STATE };
  });
}
function isSpeculationEnabled() {
  const enabled = process.env.USER_TYPE === "ant" && (getGlobalConfig().speculationEnabled ?? true);
  logForDebugging(`[Speculation] enabled=${enabled}`);
  return enabled;
}
async function generatePipelinedSuggestion(context, suggestionText, speculatedMessages, setAppState, parentAbortController) {
  try {
    const appState = context.toolUseContext.getAppState();
    const suppressReason = getSuggestionSuppressReason(appState);
    if (suppressReason) {
      logSuggestionSuppressed(`pipeline_${suppressReason}`);
      return;
    }
    const augmentedContext = {
      ...context,
      messages: [
        ...context.messages,
        createUserMessage({ content: suggestionText }),
        ...speculatedMessages
      ]
    };
    const pipelineAbortController = createChildAbortController(
      parentAbortController
    );
    if (pipelineAbortController.signal.aborted) return;
    const promptId = getPromptVariant();
    const { suggestion, generationRequestId } = await generateSuggestion(
      pipelineAbortController,
      promptId,
      createCacheSafeParams(augmentedContext)
    );
    if (pipelineAbortController.signal.aborted) return;
    if (shouldFilterSuggestion(suggestion, promptId)) return;
    logForDebugging(
      `[Speculation] Pipelined suggestion: "${suggestion.slice(0, 50)}..."`
    );
    updateActiveSpeculationState(setAppState, () => ({
      pipelinedSuggestion: {
        text: suggestion,
        promptId,
        generationRequestId
      }
    }));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return;
    logForDebugging(
      `[Speculation] Pipelined suggestion failed: ${errorMessage(error)}`
    );
  }
}
async function startSpeculation(suggestionText, context, setAppState, isPipelined = false, cacheSafeParams) {
  if (!isSpeculationEnabled()) return;
  abortSpeculation(setAppState);
  const id = randomUUID().slice(0, 8);
  const abortController = createChildAbortController(
    context.toolUseContext.abortController
  );
  if (abortController.signal.aborted) return;
  const startTime = Date.now();
  const messagesRef = { current: [] };
  const writtenPathsRef = { current: /* @__PURE__ */ new Set() };
  const overlayPath = getOverlayPath(id);
  const cwd = getCwdState();
  try {
    await mkdir(overlayPath, { recursive: true });
  } catch {
    logForDebugging("[Speculation] Failed to create overlay directory");
    return;
  }
  const contextRef = { current: context };
  setAppState((prev) => ({
    ...prev,
    speculation: {
      status: "active",
      id,
      abort: () => abortController.abort(),
      startTime,
      messagesRef,
      writtenPathsRef,
      boundary: null,
      suggestionLength: suggestionText.length,
      toolUseCount: 0,
      isPipelined,
      contextRef
    }
  }));
  logForDebugging(`[Speculation] Starting speculation ${id}`);
  try {
    const result = await runForkedAgent({
      promptMessages: [createUserMessage({ content: suggestionText })],
      cacheSafeParams: cacheSafeParams ?? createCacheSafeParams(context),
      skipTranscript: true,
      canUseTool: async (tool, input) => {
        const isWriteTool = WRITE_TOOLS.has(tool.name);
        const isSafeReadOnlyTool = SAFE_READ_ONLY_TOOLS.has(tool.name);
        if (isWriteTool) {
          const appState = context.toolUseContext.getAppState();
          const { mode, isBypassPermissionsModeAvailable } = appState.toolPermissionContext;
          const canAutoAcceptEdits = mode === "acceptEdits" || mode === "bypassPermissions" || mode === "plan" && isBypassPermissionsModeAvailable;
          if (!canAutoAcceptEdits) {
            logForDebugging(`[Speculation] Stopping at file edit: ${tool.name}`);
            const editPath = "file_path" in input ? input.file_path : void 0;
            updateActiveSpeculationState(setAppState, () => ({
              boundary: {
                type: "edit",
                toolName: tool.name,
                filePath: editPath ?? "",
                completedAt: Date.now()
              }
            }));
            abortController.abort();
            return denySpeculation(
              "Speculation paused: file edit requires permission",
              "speculation_edit_boundary"
            );
          }
        }
        if (isWriteTool || isSafeReadOnlyTool) {
          const pathKey = "notebook_path" in input ? "notebook_path" : "path" in input ? "path" : "file_path";
          const filePath = input[pathKey];
          if (filePath) {
            const rel = relative(cwd, filePath);
            if (isAbsolute(rel) || rel.startsWith("..")) {
              if (isWriteTool) {
                logForDebugging(
                  `[Speculation] Denied ${tool.name}: path outside cwd: ${filePath}`
                );
                return denySpeculation(
                  "Write outside cwd not allowed during speculation",
                  "speculation_write_outside_root"
                );
              }
              return {
                behavior: "allow",
                updatedInput: input,
                decisionReason: {
                  type: "other",
                  reason: "speculation_read_outside_root"
                }
              };
            }
            if (isWriteTool) {
              if (!writtenPathsRef.current.has(rel)) {
                const overlayFile = join(overlayPath, rel);
                await mkdir(dirname(overlayFile), { recursive: true });
                try {
                  await copyFile(join(cwd, rel), overlayFile);
                } catch {
                }
                writtenPathsRef.current.add(rel);
              }
              input = { ...input, [pathKey]: join(overlayPath, rel) };
            } else {
              if (writtenPathsRef.current.has(rel)) {
                input = { ...input, [pathKey]: join(overlayPath, rel) };
              }
            }
            logForDebugging(
              `[Speculation] ${isWriteTool ? "Write" : "Read"} ${filePath} -> ${input[pathKey]}`
            );
            return {
              behavior: "allow",
              updatedInput: input,
              decisionReason: {
                type: "other",
                reason: "speculation_file_access"
              }
            };
          }
          if (isSafeReadOnlyTool) {
            return {
              behavior: "allow",
              updatedInput: input,
              decisionReason: {
                type: "other",
                reason: "speculation_read_default_cwd"
              }
            };
          }
        }
        if (tool.name === "Bash") {
          const command = "command" in input && typeof input.command === "string" ? input.command : "";
          if (!command || checkReadOnlyConstraints({ command }, commandHasAnyCd(command)).behavior !== "allow") {
            logForDebugging(
              `[Speculation] Stopping at bash: ${command.slice(0, 50) || "missing command"}`
            );
            updateActiveSpeculationState(setAppState, () => ({
              boundary: { type: "bash", command, completedAt: Date.now() }
            }));
            abortController.abort();
            return denySpeculation(
              "Speculation paused: bash boundary",
              "speculation_bash_boundary"
            );
          }
          return {
            behavior: "allow",
            updatedInput: input,
            decisionReason: {
              type: "other",
              reason: "speculation_readonly_bash"
            }
          };
        }
        logForDebugging(`[Speculation] Stopping at denied tool: ${tool.name}`);
        const detail = String(
          "url" in input && input.url || "file_path" in input && input.file_path || "path" in input && input.path || "command" in input && input.command || ""
        ).slice(0, 200);
        updateActiveSpeculationState(setAppState, () => ({
          boundary: {
            type: "denied_tool",
            toolName: tool.name,
            detail,
            completedAt: Date.now()
          }
        }));
        abortController.abort();
        return denySpeculation(
          `Tool ${tool.name} not allowed during speculation`,
          "speculation_unknown_tool"
        );
      },
      querySource: "speculation",
      forkLabel: "speculation",
      maxTurns: MAX_SPECULATION_TURNS,
      overrides: { abortController, requireCanUseTool: true },
      onMessage: (msg) => {
        if (msg.type === "assistant" || msg.type === "user") {
          messagesRef.current.push(msg);
          if (messagesRef.current.length >= MAX_SPECULATION_MESSAGES) {
            abortController.abort();
          }
          if (isUserMessageWithArrayContent(msg)) {
            const newTools = count(
              msg.message.content,
              (b) => b.type === "tool_result" && !b.is_error
            );
            if (newTools > 0) {
              updateActiveSpeculationState(setAppState, (prev) => ({
                toolUseCount: prev.toolUseCount + newTools
              }));
            }
          }
        }
      }
    });
    if (abortController.signal.aborted) return;
    updateActiveSpeculationState(setAppState, () => ({
      boundary: {
        type: "complete",
        completedAt: Date.now(),
        outputTokens: result.totalUsage.output_tokens
      }
    }));
    logForDebugging(
      `[Speculation] Complete: ${countToolsInMessages(messagesRef.current)} tools`
    );
    void generatePipelinedSuggestion(
      contextRef.current,
      suggestionText,
      messagesRef.current,
      setAppState,
      abortController
    );
  } catch (error) {
    abortController.abort();
    if (error instanceof Error && error.name === "AbortError") {
      safeRemoveOverlay(overlayPath);
      resetSpeculationState(setAppState);
      return;
    }
    safeRemoveOverlay(overlayPath);
    logError(error instanceof Error ? error : new Error("Speculation failed"));
    logSpeculation(
      id,
      "error",
      startTime,
      suggestionText.length,
      messagesRef.current,
      null,
      {
        error_type: error instanceof Error ? error.name : "Unknown",
        error_message: errorMessage(error).slice(
          0,
          200
        ),
        error_phase: "start",
        is_pipelined: isPipelined
      }
    );
    resetSpeculationState(setAppState);
  }
}
async function acceptSpeculation(state, setAppState, cleanMessageCount) {
  if (state.status !== "active") return null;
  const {
    id,
    messagesRef,
    writtenPathsRef,
    abort,
    startTime,
    suggestionLength,
    isPipelined
  } = state;
  const messages = messagesRef.current;
  const overlayPath = getOverlayPath(id);
  const acceptedAt = Date.now();
  abort();
  if (cleanMessageCount > 0) {
    await copyOverlayToMain(overlayPath, writtenPathsRef.current, getCwdState());
  }
  safeRemoveOverlay(overlayPath);
  let boundary = state.boundary;
  let timeSavedMs = Math.min(acceptedAt, boundary?.completedAt ?? Infinity) - startTime;
  setAppState((prev) => {
    if (prev.speculation.status === "active" && prev.speculation.boundary) {
      boundary = prev.speculation.boundary;
      const endTime = Math.min(acceptedAt, boundary.completedAt ?? Infinity);
      timeSavedMs = endTime - startTime;
    }
    return {
      ...prev,
      speculation: IDLE_SPECULATION_STATE,
      speculationSessionTimeSavedMs: prev.speculationSessionTimeSavedMs + timeSavedMs
    };
  });
  logForDebugging(
    boundary === null ? `[Speculation] Accept ${id}: still running, using ${messages.length} messages` : `[Speculation] Accept ${id}: already complete`
  );
  logSpeculation(
    id,
    "accepted",
    startTime,
    suggestionLength,
    messages,
    boundary,
    {
      message_count: messages.length,
      time_saved_ms: timeSavedMs,
      is_pipelined: isPipelined
    }
  );
  if (timeSavedMs > 0) {
    const entry = {
      type: "speculation-accept",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      timeSavedMs
    };
    void appendFile(getTranscriptPath(), jsonStringify(entry) + "\n", {
      mode: 384
    }).catch(() => {
      logForDebugging(
        "[Speculation] Failed to write speculation-accept to transcript"
      );
    });
  }
  return { messages, boundary, timeSavedMs };
}
function abortSpeculation(setAppState) {
  setAppState((prev) => {
    if (prev.speculation.status !== "active") return prev;
    const {
      id,
      abort,
      startTime,
      boundary,
      suggestionLength,
      messagesRef,
      isPipelined
    } = prev.speculation;
    logForDebugging(`[Speculation] Aborting ${id}`);
    logSpeculation(
      id,
      "aborted",
      startTime,
      suggestionLength,
      messagesRef.current,
      boundary,
      { abort_reason: "user_typed", is_pipelined: isPipelined }
    );
    abort();
    safeRemoveOverlay(getOverlayPath(id));
    return { ...prev, speculation: IDLE_SPECULATION_STATE };
  });
}
async function handleSpeculationAccept(speculationState, speculationSessionTimeSavedMs, setAppState, input, deps) {
  try {
    const { setMessages, readFileState, cwd } = deps;
    setAppState((prev) => {
      if (prev.promptSuggestion.text === null && prev.promptSuggestion.promptId === null) {
        return prev;
      }
      return {
        ...prev,
        promptSuggestion: {
          text: null,
          promptId: null,
          shownAt: 0,
          acceptedAt: 0,
          generationRequestId: null
        }
      };
    });
    const speculationMessages = speculationState.messagesRef.current;
    let cleanMessages = prepareMessagesForInjection(speculationMessages);
    const userMessage = createUserMessage({ content: input });
    setMessages((prev) => [...prev, userMessage]);
    const result = await acceptSpeculation(
      speculationState,
      setAppState,
      cleanMessages.length
    );
    const isComplete = result?.boundary?.type === "complete";
    if (!isComplete) {
      const lastNonAssistant = cleanMessages.findLastIndex(
        (m) => m.type !== "assistant"
      );
      cleanMessages = cleanMessages.slice(0, lastNonAssistant + 1);
    }
    const timeSavedMs = result?.timeSavedMs ?? 0;
    const newSessionTotal = speculationSessionTimeSavedMs + timeSavedMs;
    const feedbackMessage = createSpeculationFeedbackMessage(
      cleanMessages,
      result?.boundary ?? null,
      timeSavedMs,
      newSessionTotal
    );
    setMessages((prev) => [...prev, ...cleanMessages]);
    const extracted = extractReadFilesFromMessages(
      cleanMessages,
      cwd,
      READ_FILE_STATE_CACHE_SIZE
    );
    readFileState.current = mergeFileStateCaches(
      readFileState.current,
      extracted
    );
    if (feedbackMessage) {
      setMessages((prev) => [...prev, feedbackMessage]);
    }
    logForDebugging(
      `[Speculation] ${result?.boundary?.type ?? "incomplete"}, injected ${cleanMessages.length} messages`
    );
    if (isComplete && speculationState.pipelinedSuggestion) {
      const { text, promptId, generationRequestId } = speculationState.pipelinedSuggestion;
      logForDebugging(
        `[Speculation] Promoting pipelined suggestion: "${text.slice(0, 50)}..."`
      );
      setAppState((prev) => ({
        ...prev,
        promptSuggestion: {
          text,
          promptId,
          shownAt: Date.now(),
          acceptedAt: 0,
          generationRequestId
        }
      }));
      const augmentedContext = {
        ...speculationState.contextRef.current,
        messages: [
          ...speculationState.contextRef.current.messages,
          createUserMessage({ content: input }),
          ...cleanMessages
        ]
      };
      void startSpeculation(text, augmentedContext, setAppState, true);
    }
    return { queryRequired: !isComplete };
  } catch (error) {
    logError(
      error instanceof Error ? error : new Error("handleSpeculationAccept failed")
    );
    logSpeculation(
      speculationState.id,
      "error",
      speculationState.startTime,
      speculationState.suggestionLength,
      speculationState.messagesRef.current,
      speculationState.boundary,
      {
        error_type: error instanceof Error ? error.name : "Unknown",
        error_message: errorMessage(error).slice(
          0,
          200
        ),
        error_phase: "accept",
        is_pipelined: speculationState.isPipelined
      }
    );
    safeRemoveOverlay(getOverlayPath(speculationState.id));
    resetSpeculationState(setAppState);
    return { queryRequired: true };
  }
}
export {
  abortSpeculation,
  acceptSpeculation,
  handleSpeculationAccept,
  isSpeculationEnabled,
  prepareMessagesForInjection,
  startSpeculation
};
