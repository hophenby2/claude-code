const feature = (_name) => false;
import { randomUUID } from "crypto";
import last from "lodash-es/last.js";
import {
  getSessionId,
  isSessionPersistenceDisabled
} from "./bootstrap/state.js";
import { accumulateUsage, updateUsage } from "./services/api/claude.js";
import { EMPTY_USAGE } from "./services/api/logging.js";
import stripAnsi from "strip-ansi";
import { getSlashCommandToolSkills } from "./commands.js";
import {
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG
} from "./constants/xml.js";
import {
  getModelUsage,
  getTotalAPIDuration,
  getTotalCost
} from "./cost-tracker.js";
import { loadMemoryPrompt } from "./memdir/memdir.js";
import { hasAutoMemPathOverride } from "./memdir/paths.js";
import { query } from "./query.js";
import { categorizeRetryableAPIError } from "./services/api/errors.js";
import { toolMatchesName } from "./Tool.js";
import { SYNTHETIC_OUTPUT_TOOL_NAME } from "./tools/SyntheticOutputTool/SyntheticOutputTool.js";
import { createAbortController } from "./utils/abortController.js";
import { getGlobalConfig } from "./utils/config.js";
import { getCwd } from "./utils/cwd.js";
import { isBareMode, isEnvTruthy } from "./utils/envUtils.js";
import { getFastModeState } from "./utils/fastMode.js";
import {
  fileHistoryEnabled,
  fileHistoryMakeSnapshot
} from "./utils/fileHistory.js";
import {
  cloneFileStateCache
} from "./utils/fileStateCache.js";
import { headlessProfilerCheckpoint } from "./utils/headlessProfiler.js";
import { registerStructuredOutputEnforcement } from "./utils/hooks/hookHelpers.js";
import { getInMemoryErrors } from "./utils/log.js";
import { countToolCalls, SYNTHETIC_MESSAGES } from "./utils/messages.js";
import {
  getMainLoopModel,
  parseUserSpecifiedModel
} from "./utils/model/model.js";
import { loadAllPluginsCacheOnly } from "./utils/plugins/pluginLoader.js";
import {
  processUserInput
} from "./utils/processUserInput/processUserInput.js";
import { fetchSystemPromptParts } from "./utils/queryContext.js";
import { setCwd } from "./utils/Shell.js";
import {
  flushSessionStorage,
  recordTranscript
} from "./utils/sessionStorage.js";
import { asSystemPrompt } from "./utils/systemPromptType.js";
import { resolveThemeSetting } from "./utils/systemTheme.js";
import {
  shouldEnableThinkingByDefault
} from "./utils/thinking.js";
const messageSelector = () => require("./components/MessageSelector.js");
import {
  localCommandOutputToSDKAssistantMessage,
  toSDKCompactMetadata
} from "./utils/messages/mappers.js";
import {
  buildSystemInitMessage,
  sdkCompatToolName
} from "./utils/messages/systemInit.js";
import {
  getScratchpadDir,
  isScratchpadEnabled
} from "./utils/permissions/filesystem.js";
import {
  handleOrphanedPermission,
  isResultSuccessful,
  normalizeMessage
} from "./utils/queryHelpers.js";
const getCoordinatorUserContext = false ? null.getCoordinatorUserContext : () => ({});
const snipModule = false ? null : null;
const snipProjection = false ? null : null;
class QueryEngine {
  config;
  mutableMessages;
  abortController;
  permissionDenials;
  totalUsage;
  hasHandledOrphanedPermission = false;
  readFileState;
  // Turn-scoped skill discovery tracking (feeds was_discovered on
  // tengu_skill_tool_invocation). Must persist across the two
  // processUserInputContext rebuilds inside submitMessage, but is cleared
  // at the start of each submitMessage to avoid unbounded growth across
  // many turns in SDK mode.
  discoveredSkillNames = /* @__PURE__ */ new Set();
  loadedNestedMemoryPaths = /* @__PURE__ */ new Set();
  constructor(config) {
    this.config = config;
    this.mutableMessages = config.initialMessages ?? [];
    this.abortController = config.abortController ?? createAbortController();
    this.permissionDenials = [];
    this.readFileState = config.readFileCache;
    this.totalUsage = EMPTY_USAGE;
  }
  async *submitMessage(prompt, options) {
    const {
      cwd,
      commands,
      tools,
      mcpClients,
      verbose = false,
      thinkingConfig,
      maxTurns,
      maxBudgetUsd,
      taskBudget,
      canUseTool,
      customSystemPrompt,
      appendSystemPrompt,
      userSpecifiedModel,
      fallbackModel,
      jsonSchema,
      getAppState,
      setAppState,
      replayUserMessages = false,
      includePartialMessages = false,
      agents = [],
      setSDKStatus,
      orphanedPermission
    } = this.config;
    this.discoveredSkillNames.clear();
    setCwd(cwd);
    const persistSession = !isSessionPersistenceDisabled();
    const startTime = Date.now();
    const wrappedCanUseTool = async (tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision) => {
      const result2 = await canUseTool(
        tool,
        input,
        toolUseContext,
        assistantMessage,
        toolUseID,
        forceDecision
      );
      if (result2.behavior !== "allow") {
        this.permissionDenials.push({
          tool_name: sdkCompatToolName(tool.name),
          tool_use_id: toolUseID,
          tool_input: input
        });
      }
      return result2;
    };
    const initialAppState = getAppState();
    const initialMainLoopModel = userSpecifiedModel ? parseUserSpecifiedModel(userSpecifiedModel) : getMainLoopModel();
    const initialThinkingConfig = thinkingConfig ? thinkingConfig : shouldEnableThinkingByDefault() !== false ? { type: "adaptive" } : { type: "disabled" };
    headlessProfilerCheckpoint("before_getSystemPrompt");
    const customPrompt = typeof customSystemPrompt === "string" ? customSystemPrompt : void 0;
    const {
      defaultSystemPrompt,
      userContext: baseUserContext,
      systemContext
    } = await fetchSystemPromptParts({
      tools,
      mainLoopModel: initialMainLoopModel,
      additionalWorkingDirectories: Array.from(
        initialAppState.toolPermissionContext.additionalWorkingDirectories.keys()
      ),
      mcpClients,
      customSystemPrompt: customPrompt
    });
    headlessProfilerCheckpoint("after_getSystemPrompt");
    const userContext = {
      ...baseUserContext,
      ...getCoordinatorUserContext(
        mcpClients,
        isScratchpadEnabled() ? getScratchpadDir() : void 0
      )
    };
    const memoryMechanicsPrompt = customPrompt !== void 0 && hasAutoMemPathOverride() ? await loadMemoryPrompt() : null;
    const systemPrompt = asSystemPrompt([
      ...customPrompt !== void 0 ? [customPrompt] : defaultSystemPrompt,
      ...memoryMechanicsPrompt ? [memoryMechanicsPrompt] : [],
      ...appendSystemPrompt ? [appendSystemPrompt] : []
    ]);
    const hasStructuredOutputTool = tools.some(
      (t) => toolMatchesName(t, SYNTHETIC_OUTPUT_TOOL_NAME)
    );
    if (jsonSchema && hasStructuredOutputTool) {
      registerStructuredOutputEnforcement(setAppState, getSessionId());
    }
    let processUserInputContext = {
      messages: this.mutableMessages,
      // Slash commands that mutate the message array (e.g. /force-snip)
      // call setMessages(fn).  In interactive mode this writes back to
      // AppState; in print mode we write back to mutableMessages so the
      // rest of the query loop (push at :389, snapshot at :392) sees
      // the result.  The second processUserInputContext below (after
      // slash-command processing) keeps the no-op — nothing else calls
      // setMessages past that point.
      setMessages: (fn) => {
        this.mutableMessages = fn(this.mutableMessages);
      },
      onChangeAPIKey: () => {
      },
      handleElicitation: this.config.handleElicitation,
      options: {
        commands,
        debug: false,
        // we use stdout, so don't want to clobber it
        tools,
        verbose,
        mainLoopModel: initialMainLoopModel,
        thinkingConfig: initialThinkingConfig,
        mcpClients,
        mcpResources: {},
        ideInstallationStatus: null,
        isNonInteractiveSession: true,
        customSystemPrompt,
        appendSystemPrompt,
        agentDefinitions: { activeAgents: agents, allAgents: [] },
        theme: resolveThemeSetting(getGlobalConfig().theme),
        maxBudgetUsd
      },
      getAppState,
      setAppState,
      abortController: this.abortController,
      readFileState: this.readFileState,
      nestedMemoryAttachmentTriggers: /* @__PURE__ */ new Set(),
      loadedNestedMemoryPaths: this.loadedNestedMemoryPaths,
      dynamicSkillDirTriggers: /* @__PURE__ */ new Set(),
      discoveredSkillNames: this.discoveredSkillNames,
      setInProgressToolUseIDs: () => {
      },
      setResponseLength: () => {
      },
      updateFileHistoryState: (updater) => {
        setAppState((prev) => {
          const updated = updater(prev.fileHistory);
          if (updated === prev.fileHistory) return prev;
          return { ...prev, fileHistory: updated };
        });
      },
      updateAttributionState: (updater) => {
        setAppState((prev) => {
          const updated = updater(prev.attribution);
          if (updated === prev.attribution) return prev;
          return { ...prev, attribution: updated };
        });
      },
      setSDKStatus
    };
    if (orphanedPermission && !this.hasHandledOrphanedPermission) {
      this.hasHandledOrphanedPermission = true;
      for await (const message of handleOrphanedPermission(
        orphanedPermission,
        tools,
        this.mutableMessages,
        processUserInputContext
      )) {
        yield message;
      }
    }
    const {
      messages: messagesFromUserInput,
      shouldQuery,
      allowedTools,
      model: modelFromUserInput,
      resultText
    } = await processUserInput({
      input: prompt,
      mode: "prompt",
      setToolJSX: () => {
      },
      context: {
        ...processUserInputContext,
        messages: this.mutableMessages
      },
      messages: this.mutableMessages,
      uuid: options?.uuid,
      isMeta: options?.isMeta,
      querySource: "sdk"
    });
    this.mutableMessages.push(...messagesFromUserInput);
    const messages = [...this.mutableMessages];
    if (persistSession && messagesFromUserInput.length > 0) {
      const transcriptPromise = recordTranscript(messages);
      if (isBareMode()) {
        void transcriptPromise;
      } else {
        await transcriptPromise;
        if (isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) || isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)) {
          await flushSessionStorage();
        }
      }
    }
    const replayableMessages = messagesFromUserInput.filter(
      (msg) => msg.type === "user" && !msg.isMeta && // Skip synthetic caveat messages
      !msg.toolUseResult && // Skip tool results (they'll be acked from query)
      messageSelector().selectableUserMessagesFilter(msg) || // Skip non-user-authored messages (task notifications, etc.)
      msg.type === "system" && msg.subtype === "compact_boundary"
      // Always ack compact boundaries
    );
    const messagesToAck = replayUserMessages ? replayableMessages : [];
    setAppState((prev) => ({
      ...prev,
      toolPermissionContext: {
        ...prev.toolPermissionContext,
        alwaysAllowRules: {
          ...prev.toolPermissionContext.alwaysAllowRules,
          command: allowedTools
        }
      }
    }));
    const mainLoopModel = modelFromUserInput ?? initialMainLoopModel;
    processUserInputContext = {
      messages,
      setMessages: () => {
      },
      onChangeAPIKey: () => {
      },
      handleElicitation: this.config.handleElicitation,
      options: {
        commands,
        debug: false,
        tools,
        verbose,
        mainLoopModel,
        thinkingConfig: initialThinkingConfig,
        mcpClients,
        mcpResources: {},
        ideInstallationStatus: null,
        isNonInteractiveSession: true,
        customSystemPrompt,
        appendSystemPrompt,
        theme: resolveThemeSetting(getGlobalConfig().theme),
        agentDefinitions: { activeAgents: agents, allAgents: [] },
        maxBudgetUsd
      },
      getAppState,
      setAppState,
      abortController: this.abortController,
      readFileState: this.readFileState,
      nestedMemoryAttachmentTriggers: /* @__PURE__ */ new Set(),
      loadedNestedMemoryPaths: this.loadedNestedMemoryPaths,
      dynamicSkillDirTriggers: /* @__PURE__ */ new Set(),
      discoveredSkillNames: this.discoveredSkillNames,
      setInProgressToolUseIDs: () => {
      },
      setResponseLength: () => {
      },
      updateFileHistoryState: processUserInputContext.updateFileHistoryState,
      updateAttributionState: processUserInputContext.updateAttributionState,
      setSDKStatus
    };
    headlessProfilerCheckpoint("before_skills_plugins");
    const [skills, { enabled: enabledPlugins }] = await Promise.all([
      getSlashCommandToolSkills(getCwd()),
      loadAllPluginsCacheOnly()
    ]);
    headlessProfilerCheckpoint("after_skills_plugins");
    yield buildSystemInitMessage({
      tools,
      mcpClients,
      model: mainLoopModel,
      permissionMode: initialAppState.toolPermissionContext.mode,
      // TODO: avoid the cast
      commands,
      agents,
      skills,
      plugins: enabledPlugins,
      fastMode: initialAppState.fastMode
    });
    headlessProfilerCheckpoint("system_message_yielded");
    if (!shouldQuery) {
      for (const msg of messagesFromUserInput) {
        if (msg.type === "user" && typeof msg.message.content === "string" && (msg.message.content.includes(`<${LOCAL_COMMAND_STDOUT_TAG}>`) || msg.message.content.includes(`<${LOCAL_COMMAND_STDERR_TAG}>`) || msg.isCompactSummary)) {
          yield {
            type: "user",
            message: {
              ...msg.message,
              content: stripAnsi(msg.message.content)
            },
            session_id: getSessionId(),
            parent_tool_use_id: null,
            uuid: msg.uuid,
            timestamp: msg.timestamp,
            isReplay: !msg.isCompactSummary,
            isSynthetic: msg.isMeta || msg.isVisibleInTranscriptOnly
          };
        }
        if (msg.type === "system" && msg.subtype === "local_command" && typeof msg.content === "string" && (msg.content.includes(`<${LOCAL_COMMAND_STDOUT_TAG}>`) || msg.content.includes(`<${LOCAL_COMMAND_STDERR_TAG}>`))) {
          yield localCommandOutputToSDKAssistantMessage(msg.content, msg.uuid);
        }
        if (msg.type === "system" && msg.subtype === "compact_boundary") {
          yield {
            type: "system",
            subtype: "compact_boundary",
            session_id: getSessionId(),
            uuid: msg.uuid,
            compact_metadata: toSDKCompactMetadata(msg.compactMetadata)
          };
        }
      }
      if (persistSession) {
        await recordTranscript(messages);
        if (isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) || isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)) {
          await flushSessionStorage();
        }
      }
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        duration_ms: Date.now() - startTime,
        duration_api_ms: getTotalAPIDuration(),
        num_turns: messages.length - 1,
        result: resultText ?? "",
        stop_reason: null,
        session_id: getSessionId(),
        total_cost_usd: getTotalCost(),
        usage: this.totalUsage,
        modelUsage: getModelUsage(),
        permission_denials: this.permissionDenials,
        fast_mode_state: getFastModeState(
          mainLoopModel,
          initialAppState.fastMode
        ),
        uuid: randomUUID()
      };
      return;
    }
    if (fileHistoryEnabled() && persistSession) {
      messagesFromUserInput.filter(messageSelector().selectableUserMessagesFilter).forEach((message) => {
        void fileHistoryMakeSnapshot(
          (updater) => {
            setAppState((prev) => ({
              ...prev,
              fileHistory: updater(prev.fileHistory)
            }));
          },
          message.uuid
        );
      });
    }
    let currentMessageUsage = EMPTY_USAGE;
    let turnCount = 1;
    let hasAcknowledgedInitialMessages = false;
    let structuredOutputFromTool;
    let lastStopReason = null;
    const errorLogWatermark = getInMemoryErrors().at(-1);
    const initialStructuredOutputCalls = jsonSchema ? countToolCalls(this.mutableMessages, SYNTHETIC_OUTPUT_TOOL_NAME) : 0;
    for await (const message of query({
      messages,
      systemPrompt,
      userContext,
      systemContext,
      canUseTool: wrappedCanUseTool,
      toolUseContext: processUserInputContext,
      fallbackModel,
      querySource: "sdk",
      maxTurns,
      taskBudget
    })) {
      if (message.type === "assistant" || message.type === "user" || message.type === "system" && message.subtype === "compact_boundary") {
        if (persistSession && message.type === "system" && message.subtype === "compact_boundary") {
          const tailUuid = message.compactMetadata?.preservedSegment?.tailUuid;
          if (tailUuid) {
            const tailIdx = this.mutableMessages.findLastIndex(
              (m) => m.uuid === tailUuid
            );
            if (tailIdx !== -1) {
              await recordTranscript(this.mutableMessages.slice(0, tailIdx + 1));
            }
          }
        }
        messages.push(message);
        if (persistSession) {
          if (message.type === "assistant") {
            void recordTranscript(messages);
          } else {
            await recordTranscript(messages);
          }
        }
        if (!hasAcknowledgedInitialMessages && messagesToAck.length > 0) {
          hasAcknowledgedInitialMessages = true;
          for (const msgToAck of messagesToAck) {
            if (msgToAck.type === "user") {
              yield {
                type: "user",
                message: msgToAck.message,
                session_id: getSessionId(),
                parent_tool_use_id: null,
                uuid: msgToAck.uuid,
                timestamp: msgToAck.timestamp,
                isReplay: true
              };
            }
          }
        }
      }
      if (message.type === "user") {
        turnCount++;
      }
      switch (message.type) {
        case "tombstone":
          break;
        case "assistant":
          if (message.message.stop_reason != null) {
            lastStopReason = message.message.stop_reason;
          }
          this.mutableMessages.push(message);
          yield* normalizeMessage(message);
          break;
        case "progress":
          this.mutableMessages.push(message);
          if (persistSession) {
            messages.push(message);
            void recordTranscript(messages);
          }
          yield* normalizeMessage(message);
          break;
        case "user":
          this.mutableMessages.push(message);
          yield* normalizeMessage(message);
          break;
        case "stream_event":
          if (message.event.type === "message_start") {
            currentMessageUsage = EMPTY_USAGE;
            currentMessageUsage = updateUsage(
              currentMessageUsage,
              message.event.message.usage
            );
          }
          if (message.event.type === "message_delta") {
            currentMessageUsage = updateUsage(
              currentMessageUsage,
              message.event.usage
            );
            if (message.event.delta.stop_reason != null) {
              lastStopReason = message.event.delta.stop_reason;
            }
          }
          if (message.event.type === "message_stop") {
            this.totalUsage = accumulateUsage(
              this.totalUsage,
              currentMessageUsage
            );
          }
          if (includePartialMessages) {
            yield {
              type: "stream_event",
              event: message.event,
              session_id: getSessionId(),
              parent_tool_use_id: null,
              uuid: randomUUID()
            };
          }
          break;
        case "attachment":
          this.mutableMessages.push(message);
          if (persistSession) {
            messages.push(message);
            void recordTranscript(messages);
          }
          if (message.attachment.type === "structured_output") {
            structuredOutputFromTool = message.attachment.data;
          } else if (message.attachment.type === "max_turns_reached") {
            if (persistSession) {
              if (isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) || isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)) {
                await flushSessionStorage();
              }
            }
            yield {
              type: "result",
              subtype: "error_max_turns",
              duration_ms: Date.now() - startTime,
              duration_api_ms: getTotalAPIDuration(),
              is_error: true,
              num_turns: message.attachment.turnCount,
              stop_reason: lastStopReason,
              session_id: getSessionId(),
              total_cost_usd: getTotalCost(),
              usage: this.totalUsage,
              modelUsage: getModelUsage(),
              permission_denials: this.permissionDenials,
              fast_mode_state: getFastModeState(
                mainLoopModel,
                initialAppState.fastMode
              ),
              uuid: randomUUID(),
              errors: [
                `Reached maximum number of turns (${message.attachment.maxTurns})`
              ]
            };
            return;
          } else if (replayUserMessages && message.attachment.type === "queued_command") {
            yield {
              type: "user",
              message: {
                role: "user",
                content: message.attachment.prompt
              },
              session_id: getSessionId(),
              parent_tool_use_id: null,
              uuid: message.attachment.source_uuid || message.uuid,
              timestamp: message.timestamp,
              isReplay: true
            };
          }
          break;
        case "stream_request_start":
          break;
        case "system": {
          const snipResult = this.config.snipReplay?.(
            message,
            this.mutableMessages
          );
          if (snipResult !== void 0) {
            if (snipResult.executed) {
              this.mutableMessages.length = 0;
              this.mutableMessages.push(...snipResult.messages);
            }
            break;
          }
          this.mutableMessages.push(message);
          if (message.subtype === "compact_boundary" && message.compactMetadata) {
            const mutableBoundaryIdx = this.mutableMessages.length - 1;
            if (mutableBoundaryIdx > 0) {
              this.mutableMessages.splice(0, mutableBoundaryIdx);
            }
            const localBoundaryIdx = messages.length - 1;
            if (localBoundaryIdx > 0) {
              messages.splice(0, localBoundaryIdx);
            }
            yield {
              type: "system",
              subtype: "compact_boundary",
              session_id: getSessionId(),
              uuid: message.uuid,
              compact_metadata: toSDKCompactMetadata(message.compactMetadata)
            };
          }
          if (message.subtype === "api_error") {
            yield {
              type: "system",
              subtype: "api_retry",
              attempt: message.retryAttempt,
              max_retries: message.maxRetries,
              retry_delay_ms: message.retryInMs,
              error_status: message.error.status ?? null,
              error: categorizeRetryableAPIError(message.error),
              session_id: getSessionId(),
              uuid: message.uuid
            };
          }
          break;
        }
        case "tool_use_summary":
          yield {
            type: "tool_use_summary",
            summary: message.summary,
            preceding_tool_use_ids: message.precedingToolUseIds,
            session_id: getSessionId(),
            uuid: message.uuid
          };
          break;
      }
      if (maxBudgetUsd !== void 0 && getTotalCost() >= maxBudgetUsd) {
        if (persistSession) {
          if (isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) || isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)) {
            await flushSessionStorage();
          }
        }
        yield {
          type: "result",
          subtype: "error_max_budget_usd",
          duration_ms: Date.now() - startTime,
          duration_api_ms: getTotalAPIDuration(),
          is_error: true,
          num_turns: turnCount,
          stop_reason: lastStopReason,
          session_id: getSessionId(),
          total_cost_usd: getTotalCost(),
          usage: this.totalUsage,
          modelUsage: getModelUsage(),
          permission_denials: this.permissionDenials,
          fast_mode_state: getFastModeState(
            mainLoopModel,
            initialAppState.fastMode
          ),
          uuid: randomUUID(),
          errors: [`Reached maximum budget ($${maxBudgetUsd})`]
        };
        return;
      }
      if (message.type === "user" && jsonSchema) {
        const currentCalls = countToolCalls(
          this.mutableMessages,
          SYNTHETIC_OUTPUT_TOOL_NAME
        );
        const callsThisQuery = currentCalls - initialStructuredOutputCalls;
        const maxRetries = parseInt(
          process.env.MAX_STRUCTURED_OUTPUT_RETRIES || "5",
          10
        );
        if (callsThisQuery >= maxRetries) {
          if (persistSession) {
            if (isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) || isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)) {
              await flushSessionStorage();
            }
          }
          yield {
            type: "result",
            subtype: "error_max_structured_output_retries",
            duration_ms: Date.now() - startTime,
            duration_api_ms: getTotalAPIDuration(),
            is_error: true,
            num_turns: turnCount,
            stop_reason: lastStopReason,
            session_id: getSessionId(),
            total_cost_usd: getTotalCost(),
            usage: this.totalUsage,
            modelUsage: getModelUsage(),
            permission_denials: this.permissionDenials,
            fast_mode_state: getFastModeState(
              mainLoopModel,
              initialAppState.fastMode
            ),
            uuid: randomUUID(),
            errors: [
              `Failed to provide valid structured output after ${maxRetries} attempts`
            ]
          };
          return;
        }
      }
    }
    const result = messages.findLast(
      (m) => m.type === "assistant" || m.type === "user"
    );
    const edeResultType = result?.type ?? "undefined";
    const edeLastContentType = result?.type === "assistant" ? last(result.message.content)?.type ?? "none" : "n/a";
    if (persistSession) {
      if (isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) || isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)) {
        await flushSessionStorage();
      }
    }
    if (!isResultSuccessful(result, lastStopReason)) {
      yield {
        type: "result",
        subtype: "error_during_execution",
        duration_ms: Date.now() - startTime,
        duration_api_ms: getTotalAPIDuration(),
        is_error: true,
        num_turns: turnCount,
        stop_reason: lastStopReason,
        session_id: getSessionId(),
        total_cost_usd: getTotalCost(),
        usage: this.totalUsage,
        modelUsage: getModelUsage(),
        permission_denials: this.permissionDenials,
        fast_mode_state: getFastModeState(
          mainLoopModel,
          initialAppState.fastMode
        ),
        uuid: randomUUID(),
        // Diagnostic prefix: these are what isResultSuccessful() checks — if
        // the result type isn't assistant-with-text/thinking or user-with-
        // tool_result, and stop_reason isn't end_turn, that's why this fired.
        // errors[] is turn-scoped via the watermark; previously it dumped the
        // entire process's logError buffer (ripgrep timeouts, ENOENT, etc).
        errors: (() => {
          const all = getInMemoryErrors();
          const start = errorLogWatermark ? all.lastIndexOf(errorLogWatermark) + 1 : 0;
          return [
            `[ede_diagnostic] result_type=${edeResultType} last_content_type=${edeLastContentType} stop_reason=${lastStopReason}`,
            ...all.slice(start).map((_) => _.error)
          ];
        })()
      };
      return;
    }
    let textResult = "";
    let isApiError = false;
    if (result.type === "assistant") {
      const lastContent = last(result.message.content);
      if (lastContent?.type === "text" && !SYNTHETIC_MESSAGES.has(lastContent.text)) {
        textResult = lastContent.text;
      }
      isApiError = Boolean(result.isApiErrorMessage);
    }
    yield {
      type: "result",
      subtype: "success",
      is_error: isApiError,
      duration_ms: Date.now() - startTime,
      duration_api_ms: getTotalAPIDuration(),
      num_turns: turnCount,
      result: textResult,
      stop_reason: lastStopReason,
      session_id: getSessionId(),
      total_cost_usd: getTotalCost(),
      usage: this.totalUsage,
      modelUsage: getModelUsage(),
      permission_denials: this.permissionDenials,
      structured_output: structuredOutputFromTool,
      fast_mode_state: getFastModeState(
        mainLoopModel,
        initialAppState.fastMode
      ),
      uuid: randomUUID()
    };
  }
  interrupt() {
    this.abortController.abort();
  }
  getMessages() {
    return this.mutableMessages;
  }
  getReadFileState() {
    return this.readFileState;
  }
  getSessionId() {
    return getSessionId();
  }
  setModel(model) {
    this.config.userSpecifiedModel = model;
  }
}
async function* ask({
  commands,
  prompt,
  promptUuid,
  isMeta,
  cwd,
  tools,
  mcpClients,
  verbose = false,
  thinkingConfig,
  maxTurns,
  maxBudgetUsd,
  taskBudget,
  canUseTool,
  mutableMessages = [],
  getReadFileCache,
  setReadFileCache,
  customSystemPrompt,
  appendSystemPrompt,
  userSpecifiedModel,
  fallbackModel,
  jsonSchema,
  getAppState,
  setAppState,
  abortController,
  replayUserMessages = false,
  includePartialMessages = false,
  handleElicitation,
  agents = [],
  setSDKStatus,
  orphanedPermission
}) {
  const engine = new QueryEngine({
    cwd,
    tools,
    commands,
    mcpClients,
    agents,
    canUseTool,
    getAppState,
    setAppState,
    initialMessages: mutableMessages,
    readFileCache: cloneFileStateCache(getReadFileCache()),
    customSystemPrompt,
    appendSystemPrompt,
    userSpecifiedModel,
    fallbackModel,
    thinkingConfig,
    maxTurns,
    maxBudgetUsd,
    taskBudget,
    jsonSchema,
    verbose,
    handleElicitation,
    replayUserMessages,
    includePartialMessages,
    setSDKStatus,
    abortController,
    orphanedPermission,
    ...false ? {
      snipReplay: (yielded, store) => {
        if (!snipProjection.isSnipBoundaryMessage(yielded))
          return void 0;
        return snipModule.snipCompactIfNeeded(store, { force: true });
      }
    } : {}
  });
  try {
    yield* engine.submitMessage(prompt, {
      uuid: promptUuid,
      isMeta
    });
  } finally {
    setReadFileCache(engine.getReadFileState());
  }
}
export {
  QueryEngine,
  ask
};
