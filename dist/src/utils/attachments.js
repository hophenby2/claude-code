import {
  logEvent
} from "../services/analytics/index.js";
import {
  toolMatchesName
} from "../Tool.js";
import {
  FileReadTool,
  MaxFileReadTokenExceededError,
  readImageWithTokenBudget
} from "../tools/FileReadTool/FileReadTool.js";
import { FileTooLargeError, readFileInRange } from "./readFileInRange.js";
import { expandPath } from "./path.js";
import { countCharInString } from "./stringUtils.js";
import { uniq } from "./array.js";
import { getFsImplementation } from "./fsOperations.js";
import { readdir, stat } from "fs/promises";
import { TODO_WRITE_TOOL_NAME } from "../tools/TodoWriteTool/constants.js";
import { TASK_CREATE_TOOL_NAME } from "../tools/TaskCreateTool/constants.js";
import { TASK_UPDATE_TOOL_NAME } from "../tools/TaskUpdateTool/constants.js";
import { BASH_TOOL_NAME } from "../tools/BashTool/toolName.js";
import { SKILL_TOOL_NAME } from "../tools/SkillTool/constants.js";
import {
  listTasks,
  getTaskListId,
  isTodoV2Enabled
} from "./tasks.js";
import { getPlanFilePath, getPlan } from "./plans.js";
import { getConnectedIdeName } from "./ide.js";
import {
  getManagedAndUserConditionalRules,
  getMemoryFilesForNestedDirectory,
  getConditionalRulesForCwdLevelDirectory
} from "./claudemd.js";
import { dirname, parse, relative, resolve } from "path";
import { getCwd } from "./cwd.js";
import { getViewedTeammateTask } from "../state/selectors.js";
import { logError } from "./log.js";
import { logAntError } from "./debug.js";
import { isENOENT, toError } from "./errors.js";
import { diagnosticTracker } from "../services/diagnosticTracking.js";
import {
  getImagePasteIds,
  isValidImagePaste
} from "../types/textInputTypes.js";
import { randomUUID } from "crypto";
import { getSettings_DEPRECATED } from "./settings/settings.js";
import { getSnippetForTwoFileDiff } from "../tools/FileEditTool/utils.js";
import { maybeResizeAndDownsampleImageBlock } from "./imageResizer.js";
import { getSkillToolCommands, getMcpSkillCommands } from "../commands.js";
import uniqBy from "lodash-es/uniqBy.js";
import { getProjectRoot } from "../bootstrap/state.js";
import { formatCommandsWithinBudget } from "../tools/SkillTool/prompt.js";
import { getContextWindowForModel } from "./context.js";
const skillSearchModules = false ? {
  featureCheck: null,
  prefetch: null
} : null;
const autoModeStateModule = false ? null : null;
import {
  MAX_LINES_TO_READ,
  FILE_READ_TOOL_NAME
} from "../tools/FileReadTool/prompt.js";
import { getDefaultFileReadingLimits } from "../tools/FileReadTool/limits.js";
import { cacheKeys } from "./fileStateCache.js";
import {
  createAbortController,
  createChildAbortController
} from "./abortController.js";
import { isAbortError } from "./errors.js";
import {
  getFileModificationTimeAsync,
  isFileWithinReadSizeLimit
} from "./file.js";
import { filterAgentsByMcpRequirements } from "../tools/AgentTool/loadAgentsDir.js";
import { AGENT_TOOL_NAME } from "../tools/AgentTool/constants.js";
import {
  formatAgentLine,
  shouldInjectAgentListInMessages
} from "../tools/AgentTool/prompt.js";
import { filterDeniedAgents } from "./permissions/permissions.js";
import { getSubscriptionType } from "./auth.js";
import { mcpInfoFromString } from "../services/mcp/mcpStringUtils.js";
import {
  matchingRuleForInput,
  pathInAllowedWorkingPath
} from "./permissions/filesystem.js";
import {
  generateTaskAttachments,
  applyTaskOffsetsAndEvictions
} from "./task/framework.js";
import { getTaskOutputPath } from "./task/diskOutput.js";
import { drainPendingMessages } from "../tasks/LocalAgentTask/LocalAgentTask.js";
import {
  getOriginalCwd,
  getSessionId,
  getSdkBetas,
  getTotalCostUSD,
  hasExitedPlanModeInSession,
  setHasExitedPlanMode,
  needsPlanModeExitAttachment,
  setNeedsPlanModeExitAttachment,
  needsAutoModeExitAttachment,
  setNeedsAutoModeExitAttachment,
  getLastEmittedDate,
  setLastEmittedDate
} from "../bootstrap/state.js";
import {
  getDeferredToolsDelta,
  isDeferredToolsDeltaEnabled,
  isToolSearchEnabledOptimistic,
  isToolSearchToolAvailable,
  modelSupportsToolReference
} from "./toolSearch.js";
import {
  getMcpInstructionsDelta,
  isMcpInstructionsDeltaEnabled
} from "./mcpInstructionsDelta.js";
import { CLAUDE_IN_CHROME_MCP_SERVER_NAME } from "./claudeInChrome/common.js";
import { CHROME_TOOL_SEARCH_INSTRUCTIONS } from "./claudeInChrome/prompt.js";
import {
  checkForAsyncHookResponses,
  removeDeliveredAsyncHooks
} from "./hooks/AsyncHookRegistry.js";
import {
  checkForLSPDiagnostics,
  clearAllLSPDiagnostics
} from "../services/lsp/LSPDiagnosticRegistry.js";
import { logForDebugging } from "./debug.js";
import {
  extractTextContent,
  getUserMessageText,
  isThinkingMessage
} from "./messages.js";
import { isHumanTurn } from "./messagePredicates.js";
import { isEnvTruthy, getClaudeConfigHomeDir } from "./envUtils.js";
const feature = (_name) => false;
const BRIEF_TOOL_NAME = false ? null.BRIEF_TOOL_NAME : null;
const sessionTranscriptModule = false ? null : null;
import { hasUltrathinkKeyword, isUltrathinkEnabled } from "./thinking.js";
import {
  tokenCountFromLastAPIResponse,
  tokenCountWithEstimation
} from "./tokens.js";
import {
  getEffectiveContextWindowSize,
  isAutoCompactEnabled
} from "../services/compact/autoCompact.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import {
  hasInstructionsLoadedHook,
  executeInstructionsLoadedHooks
} from "./hooks.js";
import { jsonStringify } from "./slowOperations.js";
import { isPDFExtension } from "./pdfUtils.js";
import { getLocalISODate } from "../constants/common.js";
import { getPDFPageCount } from "./pdf.js";
import { PDF_AT_MENTION_INLINE_THRESHOLD } from "../constants/apiLimits.js";
import { isAgentSwarmsEnabled } from "./agentSwarmsEnabled.js";
import { findRelevantMemories } from "../memdir/findRelevantMemories.js";
import { memoryAge, memoryFreshnessText } from "../memdir/memoryAge.js";
import { getAutoMemPath, isAutoMemoryEnabled } from "../memdir/paths.js";
import { getAgentMemoryDir } from "../tools/AgentTool/agentMemory.js";
import {
  readUnreadMessages,
  markMessagesAsReadByPredicate,
  isShutdownApproved,
  isStructuredProtocolMessage,
  isIdleNotification
} from "./teammateMailbox.js";
import {
  getAgentName,
  getAgentId,
  getTeamName,
  isTeamLead
} from "./teammate.js";
import { isInProcessTeammate } from "./teammateContext.js";
import { removeTeammateFromTeamFile } from "./swarm/teamHelpers.js";
import { unassignTeammateTasks } from "./tasks.js";
import "../buddy/prompt.js";
const TODO_REMINDER_CONFIG = {
  TURNS_SINCE_WRITE: 10,
  TURNS_BETWEEN_REMINDERS: 10
};
const PLAN_MODE_ATTACHMENT_CONFIG = {
  TURNS_BETWEEN_ATTACHMENTS: 5,
  FULL_REMINDER_EVERY_N_ATTACHMENTS: 5
};
const AUTO_MODE_ATTACHMENT_CONFIG = {
  TURNS_BETWEEN_ATTACHMENTS: 5,
  FULL_REMINDER_EVERY_N_ATTACHMENTS: 5
};
const MAX_MEMORY_LINES = 200;
const MAX_MEMORY_BYTES = 4096;
const RELEVANT_MEMORIES_CONFIG = {
  // Per-turn cap (5 × 4KB = 20KB) bounds a single injection, but over a
  // long session the selector keeps surfacing distinct files — ~26K tokens/
  // session observed in prod.  Cap the cumulative bytes: once hit, stop
  // prefetching entirely.  Budget is ~3 full injections; after that the
  // most-relevant memories are already in context.  Scanning messages
  // (rather than tracking in toolUseContext) means compact naturally
  // resets the counter — old attachments are gone from context, so
  // re-surfacing is valid.
  MAX_SESSION_BYTES: 60 * 1024
};
const VERIFY_PLAN_REMINDER_CONFIG = {
  TURNS_BETWEEN_REMINDERS: 10
};
async function getAttachments(input, toolUseContext, ideSelection, queuedCommands, messages, querySource, options) {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS) || isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    return getQueuedCommandAttachments(queuedCommands);
  }
  const abortController = createAbortController();
  const timeoutId = setTimeout((ac) => ac.abort(), 1e3, abortController);
  const context = { ...toolUseContext, abortController };
  const isMainThread = !toolUseContext.agentId;
  const userInputAttachments = input ? [
    maybe(
      "at_mentioned_files",
      () => processAtMentionedFiles(input, context)
    ),
    maybe(
      "mcp_resources",
      () => processMcpResourceAttachments(input, context)
    ),
    maybe(
      "agent_mentions",
      () => Promise.resolve(
        processAgentMentions(
          input,
          toolUseContext.options.agentDefinitions.activeAgents
        )
      )
    ),
    // Skill discovery on turn 0 (user input as signal). Inter-turn
    // discovery runs via startSkillDiscoveryPrefetch in query.ts,
    // gated on write-pivot detection — see skillSearch/prefetch.ts.
    // feature() here lets DCE drop the 'skill_discovery' string (and the
    // function it calls) from external builds.
    //
    // skipSkillDiscovery gates out the SKILL.md-expansion path
    // (getMessagesForPromptSlashCommand). When a skill is invoked, its
    // SKILL.md content is passed as `input` here to extract @-mentions —
    // but that content is NOT user intent and must not trigger discovery.
    // Without this gate, a 110KB SKILL.md fires ~3.3s of chunked AKI
    // queries on every skill invocation (session 13a9afae).
    ...false ? [
      maybe(
        "skill_discovery",
        () => skillSearchModules.prefetch.getTurnZeroSkillDiscovery(
          input,
          messages ?? [],
          context
        )
      )
    ] : []
  ] : [];
  const userAttachmentResults = await Promise.all(userInputAttachments);
  const allThreadAttachments = [
    // queuedCommands is already agent-scoped by the drain gate in query.ts —
    // main thread gets agentId===undefined, subagents get their own agentId.
    // Must run for all threads or subagent notifications drain into the void
    // (removed from queue by removeFromQueue but never attached).
    maybe("queued_commands", () => getQueuedCommandAttachments(queuedCommands)),
    maybe(
      "date_change",
      () => Promise.resolve(getDateChangeAttachments(messages))
    ),
    maybe(
      "ultrathink_effort",
      () => Promise.resolve(getUltrathinkEffortAttachment(input))
    ),
    maybe(
      "deferred_tools_delta",
      () => Promise.resolve(
        getDeferredToolsDeltaAttachment(
          toolUseContext.options.tools,
          toolUseContext.options.mainLoopModel,
          messages,
          {
            callSite: isMainThread ? "attachments_main" : "attachments_subagent",
            querySource
          }
        )
      )
    ),
    maybe(
      "agent_listing_delta",
      () => Promise.resolve(getAgentListingDeltaAttachment(toolUseContext, messages))
    ),
    maybe(
      "mcp_instructions_delta",
      () => Promise.resolve(
        getMcpInstructionsDeltaAttachment(
          toolUseContext.options.mcpClients,
          toolUseContext.options.tools,
          toolUseContext.options.mainLoopModel,
          messages
        )
      )
    ),
    ...false ? [
      maybe(
        "companion_intro",
        () => Promise.resolve(getCompanionIntroAttachment(messages))
      )
    ] : [],
    maybe("changed_files", () => getChangedFiles(context)),
    maybe("nested_memory", () => getNestedMemoryAttachments(context)),
    // relevant_memories moved to async prefetch (startRelevantMemoryPrefetch)
    maybe("dynamic_skill", () => getDynamicSkillAttachments(context)),
    maybe("skill_listing", () => getSkillListingAttachments(context)),
    // Inter-turn skill discovery now runs via startSkillDiscoveryPrefetch
    // (query.ts, concurrent with the main turn). The blocking call that
    // previously lived here was the assistant_turn signal — 97% of those
    // Haiku calls found nothing in prod. Prefetch + await-at-collection
    // replaces it; see src/services/skillSearch/prefetch.ts.
    maybe("plan_mode", () => getPlanModeAttachments(messages, toolUseContext)),
    maybe("plan_mode_exit", () => getPlanModeExitAttachment(toolUseContext)),
    ...false ? [
      maybe(
        "auto_mode",
        () => getAutoModeAttachments(messages, toolUseContext)
      ),
      maybe(
        "auto_mode_exit",
        () => getAutoModeExitAttachment(toolUseContext)
      )
    ] : [],
    maybe(
      "todo_reminders",
      () => isTodoV2Enabled() ? getTaskReminderAttachments(messages, toolUseContext) : getTodoReminderAttachments(messages, toolUseContext)
    ),
    ...isAgentSwarmsEnabled() ? [
      // Skip teammate mailbox for the session_memory forked agent.
      // It shares AppState.teamContext with the leader, so isTeamLead resolves
      // true and it reads+marks-as-read the leader's DMs as ephemeral attachments,
      // silently stealing messages that should be delivered as permanent turns.
      ...querySource === "session_memory" ? [] : [
        maybe(
          "teammate_mailbox",
          async () => getTeammateMailboxAttachments(toolUseContext)
        )
      ],
      maybe(
        "team_context",
        async () => getTeamContextAttachment(messages ?? [])
      )
    ] : [],
    maybe(
      "agent_pending_messages",
      async () => getAgentPendingMessageAttachments(toolUseContext)
    ),
    maybe(
      "critical_system_reminder",
      () => Promise.resolve(getCriticalSystemReminderAttachment(toolUseContext))
    ),
    ...false ? [
      maybe(
        "compaction_reminder",
        () => Promise.resolve(
          getCompactionReminderAttachment(
            messages ?? [],
            toolUseContext.options.mainLoopModel
          )
        )
      )
    ] : [],
    ...false ? [
      maybe(
        "context_efficiency",
        () => Promise.resolve(getContextEfficiencyAttachment(messages ?? []))
      )
    ] : []
  ];
  const mainThreadAttachments = isMainThread ? [
    maybe(
      "ide_selection",
      async () => getSelectedLinesFromIDE(ideSelection, toolUseContext)
    ),
    maybe(
      "ide_opened_file",
      async () => getOpenedFileFromIDE(ideSelection, toolUseContext)
    ),
    maybe(
      "output_style",
      async () => Promise.resolve(getOutputStyleAttachment())
    ),
    maybe(
      "diagnostics",
      async () => getDiagnosticAttachments(toolUseContext)
    ),
    maybe(
      "lsp_diagnostics",
      async () => getLSPDiagnosticAttachments(toolUseContext)
    ),
    maybe(
      "unified_tasks",
      async () => getUnifiedTaskAttachments(toolUseContext)
    ),
    maybe(
      "async_hook_responses",
      async () => getAsyncHookResponseAttachments()
    ),
    maybe(
      "token_usage",
      async () => Promise.resolve(
        getTokenUsageAttachment(
          messages ?? [],
          toolUseContext.options.mainLoopModel
        )
      )
    ),
    maybe(
      "budget_usd",
      async () => Promise.resolve(
        getMaxBudgetUsdAttachment(toolUseContext.options.maxBudgetUsd)
      )
    ),
    maybe(
      "output_token_usage",
      async () => Promise.resolve(getOutputTokenUsageAttachment())
    ),
    maybe(
      "verify_plan_reminder",
      async () => getVerifyPlanReminderAttachment(messages, toolUseContext)
    )
  ] : [];
  const [threadAttachmentResults, mainThreadAttachmentResults] = await Promise.all([
    Promise.all(allThreadAttachments),
    Promise.all(mainThreadAttachments)
  ]);
  clearTimeout(timeoutId);
  return [
    ...userAttachmentResults.flat(),
    ...threadAttachmentResults.flat(),
    ...mainThreadAttachmentResults.flat()
  ].filter((a) => a !== void 0 && a !== null);
}
async function maybe(label, f) {
  const startTime = Date.now();
  try {
    const result = await f();
    const duration = Date.now() - startTime;
    if (Math.random() < 0.05) {
      const attachmentSizeBytes = result.filter((a) => a !== void 0 && a !== null).reduce((total, attachment) => {
        return total + jsonStringify(attachment).length;
      }, 0);
      logEvent("tengu_attachment_compute_duration", {
        label,
        duration_ms: duration,
        attachment_size_bytes: attachmentSizeBytes,
        attachment_count: result.length
      });
    }
    return result;
  } catch (e) {
    const duration = Date.now() - startTime;
    if (Math.random() < 0.05) {
      logEvent("tengu_attachment_compute_duration", {
        label,
        duration_ms: duration,
        error: true
      });
    }
    logError(e);
    logAntError(`Attachment error in ${label}`, e);
    return [];
  }
}
const INLINE_NOTIFICATION_MODES = /* @__PURE__ */ new Set(["prompt", "task-notification"]);
async function getQueuedCommandAttachments(queuedCommands) {
  if (!queuedCommands) {
    return [];
  }
  const filtered = queuedCommands.filter(
    (_) => INLINE_NOTIFICATION_MODES.has(_.mode)
  );
  return Promise.all(
    filtered.map(async (_) => {
      const imageBlocks = await buildImageContentBlocks(_.pastedContents);
      let prompt = _.value;
      if (imageBlocks.length > 0) {
        const textValue = typeof _.value === "string" ? _.value : extractTextContent(_.value, "\n");
        prompt = [{ type: "text", text: textValue }, ...imageBlocks];
      }
      return {
        type: "queued_command",
        prompt,
        source_uuid: _.uuid,
        imagePasteIds: getImagePasteIds(_.pastedContents),
        commandMode: _.mode,
        origin: _.origin,
        isMeta: _.isMeta
      };
    })
  );
}
function getAgentPendingMessageAttachments(toolUseContext) {
  const agentId = toolUseContext.agentId;
  if (!agentId) return [];
  const drained = drainPendingMessages(
    agentId,
    toolUseContext.getAppState,
    toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState
  );
  return drained.map((msg) => ({
    type: "queued_command",
    prompt: msg,
    origin: { kind: "coordinator" },
    isMeta: true
  }));
}
async function buildImageContentBlocks(pastedContents) {
  if (!pastedContents) {
    return [];
  }
  const imageContents = Object.values(pastedContents).filter(isValidImagePaste);
  if (imageContents.length === 0) {
    return [];
  }
  const results = await Promise.all(
    imageContents.map(async (img) => {
      const imageBlock = {
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType || "image/png",
          data: img.content
        }
      };
      const resized = await maybeResizeAndDownsampleImageBlock(imageBlock);
      return resized.block;
    })
  );
  return results;
}
function getPlanModeAttachmentTurnCount(messages) {
  let turnsSinceLastAttachment = 0;
  let foundPlanModeAttachment = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type === "user" && !message.isMeta && !hasToolResultContent(message.message.content)) {
      turnsSinceLastAttachment++;
    } else if (message?.type === "attachment" && (message.attachment.type === "plan_mode" || message.attachment.type === "plan_mode_reentry")) {
      foundPlanModeAttachment = true;
      break;
    }
  }
  return { turnCount: turnsSinceLastAttachment, foundPlanModeAttachment };
}
function countPlanModeAttachmentsSinceLastExit(messages) {
  let count2 = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type === "attachment") {
      if (message.attachment.type === "plan_mode_exit") {
        break;
      }
      if (message.attachment.type === "plan_mode") {
        count2++;
      }
    }
  }
  return count2;
}
async function getPlanModeAttachments(messages, toolUseContext) {
  const appState = toolUseContext.getAppState();
  const permissionContext = appState.toolPermissionContext;
  if (permissionContext.mode !== "plan") {
    return [];
  }
  if (messages && messages.length > 0) {
    const { turnCount, foundPlanModeAttachment } = getPlanModeAttachmentTurnCount(messages);
    if (foundPlanModeAttachment && turnCount < PLAN_MODE_ATTACHMENT_CONFIG.TURNS_BETWEEN_ATTACHMENTS) {
      return [];
    }
  }
  const planFilePath = getPlanFilePath(toolUseContext.agentId);
  const existingPlan = getPlan(toolUseContext.agentId);
  const attachments = [];
  if (hasExitedPlanModeInSession() && existingPlan !== null) {
    attachments.push({ type: "plan_mode_reentry", planFilePath });
    setHasExitedPlanMode(false);
  }
  const attachmentCount = countPlanModeAttachmentsSinceLastExit(messages ?? []) + 1;
  const reminderType = attachmentCount % PLAN_MODE_ATTACHMENT_CONFIG.FULL_REMINDER_EVERY_N_ATTACHMENTS === 1 ? "full" : "sparse";
  attachments.push({
    type: "plan_mode",
    reminderType,
    isSubAgent: !!toolUseContext.agentId,
    planFilePath,
    planExists: existingPlan !== null
  });
  return attachments;
}
async function getPlanModeExitAttachment(toolUseContext) {
  if (!needsPlanModeExitAttachment()) {
    return [];
  }
  const appState = toolUseContext.getAppState();
  if (appState.toolPermissionContext.mode === "plan") {
    setNeedsPlanModeExitAttachment(false);
    return [];
  }
  setNeedsPlanModeExitAttachment(false);
  const planFilePath = getPlanFilePath(toolUseContext.agentId);
  const planExists = getPlan(toolUseContext.agentId) !== null;
  return [{ type: "plan_mode_exit", planFilePath, planExists }];
}
function getAutoModeAttachmentTurnCount(messages) {
  let turnsSinceLastAttachment = 0;
  let foundAutoModeAttachment = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type === "user" && !message.isMeta && !hasToolResultContent(message.message.content)) {
      turnsSinceLastAttachment++;
    } else if (message?.type === "attachment" && message.attachment.type === "auto_mode") {
      foundAutoModeAttachment = true;
      break;
    } else if (message?.type === "attachment" && message.attachment.type === "auto_mode_exit") {
      break;
    }
  }
  return { turnCount: turnsSinceLastAttachment, foundAutoModeAttachment };
}
function countAutoModeAttachmentsSinceLastExit(messages) {
  let count2 = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type === "attachment") {
      if (message.attachment.type === "auto_mode_exit") {
        break;
      }
      if (message.attachment.type === "auto_mode") {
        count2++;
      }
    }
  }
  return count2;
}
async function getAutoModeAttachments(messages, toolUseContext) {
  const appState = toolUseContext.getAppState();
  const permissionContext = appState.toolPermissionContext;
  const inAuto = permissionContext.mode === "auto";
  const inPlanWithAuto = permissionContext.mode === "plan" && (autoModeStateModule?.isAutoModeActive() ?? false);
  if (!inAuto && !inPlanWithAuto) {
    return [];
  }
  if (messages && messages.length > 0) {
    const { turnCount, foundAutoModeAttachment } = getAutoModeAttachmentTurnCount(messages);
    if (foundAutoModeAttachment && turnCount < AUTO_MODE_ATTACHMENT_CONFIG.TURNS_BETWEEN_ATTACHMENTS) {
      return [];
    }
  }
  const attachmentCount = countAutoModeAttachmentsSinceLastExit(messages ?? []) + 1;
  const reminderType = attachmentCount % AUTO_MODE_ATTACHMENT_CONFIG.FULL_REMINDER_EVERY_N_ATTACHMENTS === 1 ? "full" : "sparse";
  return [{ type: "auto_mode", reminderType }];
}
async function getAutoModeExitAttachment(toolUseContext) {
  if (!needsAutoModeExitAttachment()) {
    return [];
  }
  const appState = toolUseContext.getAppState();
  if (appState.toolPermissionContext.mode === "auto" || (autoModeStateModule?.isAutoModeActive() ?? false)) {
    setNeedsAutoModeExitAttachment(false);
    return [];
  }
  setNeedsAutoModeExitAttachment(false);
  return [{ type: "auto_mode_exit" }];
}
function getDateChangeAttachments(messages) {
  const currentDate = getLocalISODate();
  const lastDate = getLastEmittedDate();
  if (lastDate === null) {
    setLastEmittedDate(currentDate);
    return [];
  }
  if (currentDate === lastDate) {
    return [];
  }
  setLastEmittedDate(currentDate);
  if (false) {
    if (getKairosActive() && messages !== void 0) {
      sessionTranscriptModule?.flushOnDateChange(messages, currentDate);
    }
  }
  return [{ type: "date_change", newDate: currentDate }];
}
function getUltrathinkEffortAttachment(input) {
  if (!isUltrathinkEnabled() || !input || !hasUltrathinkKeyword(input)) {
    return [];
  }
  logEvent("tengu_ultrathink", {});
  return [{ type: "ultrathink_effort", level: "high" }];
}
function getDeferredToolsDeltaAttachment(tools, model, messages, scanContext) {
  if (!isDeferredToolsDeltaEnabled()) return [];
  if (!isToolSearchEnabledOptimistic()) return [];
  if (!modelSupportsToolReference(model)) return [];
  if (!isToolSearchToolAvailable(tools)) return [];
  const delta = getDeferredToolsDelta(tools, messages ?? [], scanContext);
  if (!delta) return [];
  return [{ type: "deferred_tools_delta", ...delta }];
}
function getAgentListingDeltaAttachment(toolUseContext, messages) {
  if (!shouldInjectAgentListInMessages()) return [];
  if (!toolUseContext.options.tools.some((t) => toolMatchesName(t, AGENT_TOOL_NAME))) {
    return [];
  }
  const { activeAgents, allowedAgentTypes } = toolUseContext.options.agentDefinitions;
  const mcpServers = /* @__PURE__ */ new Set();
  for (const tool of toolUseContext.options.tools) {
    const info = mcpInfoFromString(tool.name);
    if (info) mcpServers.add(info.serverName);
  }
  const permissionContext = toolUseContext.getAppState().toolPermissionContext;
  let filtered = filterDeniedAgents(
    filterAgentsByMcpRequirements(activeAgents, [...mcpServers]),
    permissionContext,
    AGENT_TOOL_NAME
  );
  if (allowedAgentTypes) {
    filtered = filtered.filter((a) => allowedAgentTypes.includes(a.agentType));
  }
  const announced = /* @__PURE__ */ new Set();
  for (const msg of messages ?? []) {
    if (msg.type !== "attachment") continue;
    if (msg.attachment.type !== "agent_listing_delta") continue;
    for (const t of msg.attachment.addedTypes) announced.add(t);
    for (const t of msg.attachment.removedTypes) announced.delete(t);
  }
  const currentTypes = new Set(filtered.map((a) => a.agentType));
  const added = filtered.filter((a) => !announced.has(a.agentType));
  const removed = [];
  for (const t of announced) {
    if (!currentTypes.has(t)) removed.push(t);
  }
  if (added.length === 0 && removed.length === 0) return [];
  added.sort((a, b) => a.agentType.localeCompare(b.agentType));
  removed.sort();
  return [
    {
      type: "agent_listing_delta",
      addedTypes: added.map((a) => a.agentType),
      addedLines: added.map(formatAgentLine),
      removedTypes: removed,
      isInitial: announced.size === 0,
      showConcurrencyNote: getSubscriptionType() !== "pro"
    }
  ];
}
function getMcpInstructionsDeltaAttachment(mcpClients, tools, model, messages) {
  if (!isMcpInstructionsDeltaEnabled()) return [];
  const clientSide = [];
  if (isToolSearchEnabledOptimistic() && modelSupportsToolReference(model) && isToolSearchToolAvailable(tools)) {
    clientSide.push({
      serverName: CLAUDE_IN_CHROME_MCP_SERVER_NAME,
      block: CHROME_TOOL_SEARCH_INSTRUCTIONS
    });
  }
  const delta = getMcpInstructionsDelta(mcpClients, messages ?? [], clientSide);
  if (!delta) return [];
  return [{ type: "mcp_instructions_delta", ...delta }];
}
function getCriticalSystemReminderAttachment(toolUseContext) {
  const reminder = toolUseContext.criticalSystemReminder_EXPERIMENTAL;
  if (!reminder) {
    return [];
  }
  return [{ type: "critical_system_reminder", content: reminder }];
}
function getOutputStyleAttachment() {
  const settings = getSettings_DEPRECATED();
  const outputStyle = settings?.outputStyle || "default";
  if (outputStyle === "default") {
    return [];
  }
  return [
    {
      type: "output_style",
      style: outputStyle
    }
  ];
}
async function getSelectedLinesFromIDE(ideSelection, toolUseContext) {
  const ideName = getConnectedIdeName(toolUseContext.options.mcpClients);
  if (!ideName || ideSelection?.lineStart === void 0 || !ideSelection.text || !ideSelection.filePath) {
    return [];
  }
  const appState = toolUseContext.getAppState();
  if (isFileReadDenied(ideSelection.filePath, appState.toolPermissionContext)) {
    return [];
  }
  return [
    {
      type: "selected_lines_in_ide",
      ideName,
      lineStart: ideSelection.lineStart,
      lineEnd: ideSelection.lineStart + ideSelection.lineCount - 1,
      filename: ideSelection.filePath,
      content: ideSelection.text,
      displayPath: relative(getCwd(), ideSelection.filePath)
    }
  ];
}
function getDirectoriesToProcess(targetPath, originalCwd) {
  const targetDir = dirname(resolve(targetPath));
  const nestedDirs = [];
  let currentDir = targetDir;
  while (currentDir !== originalCwd && currentDir !== parse(currentDir).root) {
    if (currentDir.startsWith(originalCwd)) {
      nestedDirs.push(currentDir);
    }
    currentDir = dirname(currentDir);
  }
  nestedDirs.reverse();
  const cwdLevelDirs = [];
  currentDir = originalCwd;
  while (currentDir !== parse(currentDir).root) {
    cwdLevelDirs.push(currentDir);
    currentDir = dirname(currentDir);
  }
  cwdLevelDirs.reverse();
  return { nestedDirs, cwdLevelDirs };
}
function isInstructionsMemoryType(type) {
  return type === "User" || type === "Project" || type === "Local" || type === "Managed";
}
function memoryFilesToAttachments(memoryFiles, toolUseContext, triggerFilePath) {
  const attachments = [];
  const shouldFireHook = hasInstructionsLoadedHook();
  for (const memoryFile of memoryFiles) {
    if (toolUseContext.loadedNestedMemoryPaths?.has(memoryFile.path)) {
      continue;
    }
    if (!toolUseContext.readFileState.has(memoryFile.path)) {
      attachments.push({
        type: "nested_memory",
        path: memoryFile.path,
        content: memoryFile,
        displayPath: relative(getCwd(), memoryFile.path)
      });
      toolUseContext.loadedNestedMemoryPaths?.add(memoryFile.path);
      toolUseContext.readFileState.set(memoryFile.path, {
        content: memoryFile.contentDiffersFromDisk ? memoryFile.rawContent ?? memoryFile.content : memoryFile.content,
        timestamp: Date.now(),
        offset: void 0,
        limit: void 0,
        isPartialView: memoryFile.contentDiffersFromDisk
      });
      if (shouldFireHook && isInstructionsMemoryType(memoryFile.type)) {
        const loadReason = memoryFile.globs ? "path_glob_match" : memoryFile.parent ? "include" : "nested_traversal";
        void executeInstructionsLoadedHooks(
          memoryFile.path,
          memoryFile.type,
          loadReason,
          {
            globs: memoryFile.globs,
            triggerFilePath,
            parentFilePath: memoryFile.parent
          }
        );
      }
    }
  }
  return attachments;
}
async function getNestedMemoryAttachmentsForFile(filePath, toolUseContext, appState) {
  const attachments = [];
  try {
    if (!pathInAllowedWorkingPath(filePath, appState.toolPermissionContext)) {
      return attachments;
    }
    const processedPaths = /* @__PURE__ */ new Set();
    const originalCwd = getOriginalCwd();
    const managedUserRules = await getManagedAndUserConditionalRules(
      filePath,
      processedPaths
    );
    attachments.push(
      ...memoryFilesToAttachments(managedUserRules, toolUseContext, filePath)
    );
    const { nestedDirs, cwdLevelDirs } = getDirectoriesToProcess(
      filePath,
      originalCwd
    );
    const skipProjectLevel = getFeatureValue_CACHED_MAY_BE_STALE(
      "tengu_paper_halyard",
      false
    );
    for (const dir of nestedDirs) {
      const memoryFiles = (await getMemoryFilesForNestedDirectory(dir, filePath, processedPaths)).filter(
        (f) => !skipProjectLevel || f.type !== "Project" && f.type !== "Local"
      );
      attachments.push(
        ...memoryFilesToAttachments(memoryFiles, toolUseContext, filePath)
      );
    }
    for (const dir of cwdLevelDirs) {
      const conditionalRules = (await getConditionalRulesForCwdLevelDirectory(
        dir,
        filePath,
        processedPaths
      )).filter(
        (f) => !skipProjectLevel || f.type !== "Project" && f.type !== "Local"
      );
      attachments.push(
        ...memoryFilesToAttachments(conditionalRules, toolUseContext, filePath)
      );
    }
  } catch (error) {
    logError(error);
  }
  return attachments;
}
async function getOpenedFileFromIDE(ideSelection, toolUseContext) {
  if (!ideSelection?.filePath || ideSelection.text) {
    return [];
  }
  const appState = toolUseContext.getAppState();
  if (isFileReadDenied(ideSelection.filePath, appState.toolPermissionContext)) {
    return [];
  }
  const nestedMemoryAttachments = await getNestedMemoryAttachmentsForFile(
    ideSelection.filePath,
    toolUseContext,
    appState
  );
  return [
    ...nestedMemoryAttachments,
    {
      type: "opened_file_in_ide",
      filename: ideSelection.filePath
    }
  ];
}
async function processAtMentionedFiles(input, toolUseContext) {
  const files = extractAtMentionedFiles(input);
  if (files.length === 0) return [];
  const appState = toolUseContext.getAppState();
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const { filename, lineStart, lineEnd } = parseAtMentionedFileLines(file);
        const absoluteFilename = expandPath(filename);
        if (isFileReadDenied(absoluteFilename, appState.toolPermissionContext)) {
          return null;
        }
        try {
          const stats = await stat(absoluteFilename);
          if (stats.isDirectory()) {
            try {
              const entries = await readdir(absoluteFilename, {
                withFileTypes: true
              });
              const MAX_DIR_ENTRIES = 1e3;
              const truncated = entries.length > MAX_DIR_ENTRIES;
              const names = entries.slice(0, MAX_DIR_ENTRIES).map((e) => e.name);
              if (truncated) {
                names.push(
                  `\u2026 and ${entries.length - MAX_DIR_ENTRIES} more entries`
                );
              }
              const stdout = names.join("\n");
              logEvent("tengu_at_mention_extracting_directory_success", {});
              return {
                type: "directory",
                path: absoluteFilename,
                content: stdout,
                displayPath: relative(getCwd(), absoluteFilename)
              };
            } catch {
              return null;
            }
          }
        } catch {
        }
        return await generateFileAttachment(
          absoluteFilename,
          toolUseContext,
          "tengu_at_mention_extracting_filename_success",
          "tengu_at_mention_extracting_filename_error",
          "at-mention",
          {
            offset: lineStart,
            limit: lineEnd && lineStart ? lineEnd - lineStart + 1 : void 0
          }
        );
      } catch {
        logEvent("tengu_at_mention_extracting_filename_error", {});
      }
    })
  );
  return results.filter(Boolean);
}
function processAgentMentions(input, agents) {
  const agentMentions = extractAgentMentions(input);
  if (agentMentions.length === 0) return [];
  const results = agentMentions.map((mention) => {
    const agentType = mention.replace("agent-", "");
    const agentDef = agents.find((def) => def.agentType === agentType);
    if (!agentDef) {
      logEvent("tengu_at_mention_agent_not_found", {});
      return null;
    }
    logEvent("tengu_at_mention_agent_success", {});
    return {
      type: "agent_mention",
      agentType: agentDef.agentType
    };
  });
  return results.filter(
    (result) => result !== null
  );
}
async function processMcpResourceAttachments(input, toolUseContext) {
  const resourceMentions = extractMcpResourceMentions(input);
  if (resourceMentions.length === 0) return [];
  const mcpClients = toolUseContext.options.mcpClients || [];
  const results = await Promise.all(
    resourceMentions.map(async (mention) => {
      try {
        const [serverName, ...uriParts] = mention.split(":");
        const uri = uriParts.join(":");
        if (!serverName || !uri) {
          logEvent("tengu_at_mention_mcp_resource_error", {});
          return null;
        }
        const client = mcpClients.find((c) => c.name === serverName);
        if (!client || client.type !== "connected") {
          logEvent("tengu_at_mention_mcp_resource_error", {});
          return null;
        }
        const serverResources = toolUseContext.options.mcpResources?.[serverName] || [];
        const resourceInfo = serverResources.find((r) => r.uri === uri);
        if (!resourceInfo) {
          logEvent("tengu_at_mention_mcp_resource_error", {});
          return null;
        }
        try {
          const result = await client.client.readResource({
            uri
          });
          logEvent("tengu_at_mention_mcp_resource_success", {});
          return {
            type: "mcp_resource",
            server: serverName,
            uri,
            name: resourceInfo.name || uri,
            description: resourceInfo.description,
            content: result
          };
        } catch (error) {
          logEvent("tengu_at_mention_mcp_resource_error", {});
          logError(error);
          return null;
        }
      } catch {
        logEvent("tengu_at_mention_mcp_resource_error", {});
        return null;
      }
    })
  );
  return results.filter(
    (result) => result !== null
  );
}
async function getChangedFiles(toolUseContext) {
  const filePaths = cacheKeys(toolUseContext.readFileState);
  if (filePaths.length === 0) return [];
  const appState = toolUseContext.getAppState();
  const results = await Promise.all(
    filePaths.map(async (filePath) => {
      const fileState = toolUseContext.readFileState.get(filePath);
      if (!fileState) return null;
      if (fileState.offset !== void 0 || fileState.limit !== void 0) {
        return null;
      }
      const normalizedPath = expandPath(filePath);
      if (isFileReadDenied(normalizedPath, appState.toolPermissionContext)) {
        return null;
      }
      try {
        const mtime = await getFileModificationTimeAsync(normalizedPath);
        if (mtime <= fileState.timestamp) {
          return null;
        }
        const fileInput = { file_path: normalizedPath };
        const isValid = await FileReadTool.validateInput(
          fileInput,
          toolUseContext
        );
        if (!isValid.result) {
          return null;
        }
        const result = await FileReadTool.call(fileInput, toolUseContext);
        if (result.data.type === "text") {
          const snippet = getSnippetForTwoFileDiff(
            fileState.content,
            result.data.file.content
          );
          if (snippet === "") {
            return null;
          }
          return {
            type: "edited_text_file",
            filename: normalizedPath,
            snippet
          };
        }
        if (result.data.type === "image") {
          try {
            const data = await readImageWithTokenBudget(normalizedPath);
            return {
              type: "edited_image_file",
              filename: normalizedPath,
              content: data
            };
          } catch (compressionError) {
            logError(compressionError);
            logEvent("tengu_watched_file_compression_failed", {
              file: normalizedPath
            });
            return null;
          }
        }
        return null;
      } catch (err) {
        if (isENOENT(err)) {
          toolUseContext.readFileState.delete(filePath);
        }
        return null;
      }
    })
  );
  return results.filter((result) => result != null);
}
async function getNestedMemoryAttachments(toolUseContext) {
  if (!toolUseContext.nestedMemoryAttachmentTriggers || toolUseContext.nestedMemoryAttachmentTriggers.size === 0) {
    return [];
  }
  const appState = toolUseContext.getAppState();
  const attachments = [];
  for (const filePath of toolUseContext.nestedMemoryAttachmentTriggers) {
    const nestedAttachments = await getNestedMemoryAttachmentsForFile(
      filePath,
      toolUseContext,
      appState
    );
    attachments.push(...nestedAttachments);
  }
  toolUseContext.nestedMemoryAttachmentTriggers.clear();
  return attachments;
}
async function getRelevantMemoryAttachments(input, agents, readFileState, recentTools, signal, alreadySurfaced) {
  const memoryDirs = extractAgentMentions(input).flatMap((mention) => {
    const agentType = mention.replace("agent-", "");
    const agentDef = agents.find((def) => def.agentType === agentType);
    return agentDef?.memory ? [getAgentMemoryDir(agentType, agentDef.memory)] : [];
  });
  const dirs = memoryDirs.length > 0 ? memoryDirs : [getAutoMemPath()];
  const allResults = await Promise.all(
    dirs.map(
      (dir) => findRelevantMemories(
        input,
        dir,
        signal,
        recentTools,
        alreadySurfaced
      ).catch(() => [])
    )
  );
  const selected = allResults.flat().filter((m) => !readFileState.has(m.path) && !alreadySurfaced.has(m.path)).slice(0, 5);
  const memories = await readMemoriesForSurfacing(selected, signal);
  if (memories.length === 0) {
    return [];
  }
  return [{ type: "relevant_memories", memories }];
}
function collectSurfacedMemories(messages) {
  const paths = /* @__PURE__ */ new Set();
  let totalBytes = 0;
  for (const m of messages) {
    if (m.type === "attachment" && m.attachment.type === "relevant_memories") {
      for (const mem of m.attachment.memories) {
        paths.add(mem.path);
        totalBytes += mem.content.length;
      }
    }
  }
  return { paths, totalBytes };
}
async function readMemoriesForSurfacing(selected, signal) {
  const results = await Promise.all(
    selected.map(async ({ path: filePath, mtimeMs }) => {
      try {
        const result = await readFileInRange(
          filePath,
          0,
          MAX_MEMORY_LINES,
          MAX_MEMORY_BYTES,
          signal,
          { truncateOnByteLimit: true }
        );
        const truncated = result.totalLines > MAX_MEMORY_LINES || result.truncatedByBytes;
        const content = truncated ? result.content + `

> This memory file was truncated (${result.truncatedByBytes ? `${MAX_MEMORY_BYTES} byte limit` : `first ${MAX_MEMORY_LINES} lines`}). Use the ${FILE_READ_TOOL_NAME} tool to view the complete file at: ${filePath}` : result.content;
        return {
          path: filePath,
          content,
          mtimeMs,
          header: memoryHeader(filePath, mtimeMs),
          limit: truncated ? result.lineCount : void 0
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter((r) => r !== null);
}
function memoryHeader(path, mtimeMs) {
  const staleness = memoryFreshnessText(mtimeMs);
  return staleness ? `${staleness}

Memory: ${path}:` : `Memory (saved ${memoryAge(mtimeMs)}): ${path}:`;
}
function startRelevantMemoryPrefetch(messages, toolUseContext) {
  if (!isAutoMemoryEnabled() || !getFeatureValue_CACHED_MAY_BE_STALE("tengu_moth_copse", false)) {
    return void 0;
  }
  const lastUserMessage = messages.findLast((m) => m.type === "user" && !m.isMeta);
  if (!lastUserMessage) {
    return void 0;
  }
  const input = getUserMessageText(lastUserMessage);
  if (!input || !/\s/.test(input.trim())) {
    return void 0;
  }
  const surfaced = collectSurfacedMemories(messages);
  if (surfaced.totalBytes >= RELEVANT_MEMORIES_CONFIG.MAX_SESSION_BYTES) {
    return void 0;
  }
  const controller = createChildAbortController(toolUseContext.abortController);
  const firedAt = Date.now();
  const promise = getRelevantMemoryAttachments(
    input,
    toolUseContext.options.agentDefinitions.activeAgents,
    toolUseContext.readFileState,
    collectRecentSuccessfulTools(messages, lastUserMessage),
    controller.signal,
    surfaced.paths
  ).catch((e) => {
    if (!isAbortError(e)) {
      logError(e);
    }
    return [];
  });
  const handle = {
    promise,
    settledAt: null,
    consumedOnIteration: -1,
    [Symbol.dispose]() {
      controller.abort();
      logEvent("tengu_memdir_prefetch_collected", {
        hidden_by_first_iteration: handle.settledAt !== null && handle.consumedOnIteration === 0,
        consumed_on_iteration: handle.consumedOnIteration,
        latency_ms: (handle.settledAt ?? Date.now()) - firedAt
      });
    }
  };
  void promise.finally(() => {
    handle.settledAt = Date.now();
  });
  return handle;
}
function isToolResultBlock(b) {
  return typeof b === "object" && b !== null && b.type === "tool_result" && typeof b.tool_use_id === "string";
}
function hasToolResultContent(content) {
  return Array.isArray(content) && content.some(isToolResultBlock);
}
function collectRecentSuccessfulTools(messages, lastUserMessage) {
  const useIdToName = /* @__PURE__ */ new Map();
  const resultByUseId = /* @__PURE__ */ new Map();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (isHumanTurn(m) && m !== lastUserMessage) break;
    if (m.type === "assistant" && typeof m.message.content !== "string") {
      for (const block of m.message.content) {
        if (block.type === "tool_use") useIdToName.set(block.id, block.name);
      }
    } else if (m.type === "user" && "message" in m && Array.isArray(m.message.content)) {
      for (const block of m.message.content) {
        if (isToolResultBlock(block)) {
          resultByUseId.set(block.tool_use_id, block.is_error === true);
        }
      }
    }
  }
  const failed = /* @__PURE__ */ new Set();
  const succeeded = /* @__PURE__ */ new Set();
  for (const [id, name] of useIdToName) {
    const errored = resultByUseId.get(id);
    if (errored === void 0) continue;
    if (errored) {
      failed.add(name);
    } else {
      succeeded.add(name);
    }
  }
  return [...succeeded].filter((t) => !failed.has(t));
}
function filterDuplicateMemoryAttachments(attachments, readFileState) {
  return attachments.map((attachment) => {
    if (attachment.type !== "relevant_memories") return attachment;
    const filtered = attachment.memories.filter(
      (m) => !readFileState.has(m.path)
    );
    for (const m of filtered) {
      readFileState.set(m.path, {
        content: m.content,
        timestamp: m.mtimeMs,
        offset: void 0,
        limit: m.limit
      });
    }
    return filtered.length > 0 ? { ...attachment, memories: filtered } : null;
  }).filter((a) => a !== null);
}
async function getDynamicSkillAttachments(toolUseContext) {
  const attachments = [];
  if (toolUseContext.dynamicSkillDirTriggers && toolUseContext.dynamicSkillDirTriggers.size > 0) {
    const perDirResults = await Promise.all(
      Array.from(toolUseContext.dynamicSkillDirTriggers).map(async (skillDir) => {
        try {
          const entries = await readdir(skillDir, { withFileTypes: true });
          const candidates = entries.filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);
          const checked = await Promise.all(
            candidates.map(async (name) => {
              try {
                await stat(resolve(skillDir, name, "SKILL.md"));
                return name;
              } catch {
                return null;
              }
            })
          );
          return {
            skillDir,
            skillNames: checked.filter((n) => n !== null)
          };
        } catch {
          return { skillDir, skillNames: [] };
        }
      })
    );
    for (const { skillDir, skillNames } of perDirResults) {
      if (skillNames.length > 0) {
        attachments.push({
          type: "dynamic_skill",
          skillDir,
          skillNames,
          displayPath: relative(getCwd(), skillDir)
        });
      }
    }
    toolUseContext.dynamicSkillDirTriggers.clear();
  }
  return attachments;
}
const sentSkillNames = /* @__PURE__ */ new Map();
function resetSentSkillNames() {
  sentSkillNames.clear();
  suppressNext = false;
}
function suppressNextSkillListing() {
  suppressNext = true;
}
let suppressNext = false;
const FILTERED_LISTING_MAX = 30;
function filterToBundledAndMcp(commands) {
  const filtered = commands.filter(
    (cmd) => cmd.loadedFrom === "bundled" || cmd.loadedFrom === "mcp"
  );
  if (filtered.length > FILTERED_LISTING_MAX) {
    return filtered.filter((cmd) => cmd.loadedFrom === "bundled");
  }
  return filtered;
}
async function getSkillListingAttachments(toolUseContext) {
  if (process.env.NODE_ENV === "test") {
    return [];
  }
  if (!toolUseContext.options.tools.some((t) => toolMatchesName(t, SKILL_TOOL_NAME))) {
    return [];
  }
  const cwd = getProjectRoot();
  const localCommands = await getSkillToolCommands(cwd);
  const mcpSkills = getMcpSkillCommands(
    toolUseContext.getAppState().mcp.commands
  );
  let allCommands = mcpSkills.length > 0 ? uniqBy([...localCommands, ...mcpSkills], "name") : localCommands;
  if (false) {
    allCommands = filterToBundledAndMcp(allCommands);
  }
  const agentKey = toolUseContext.agentId ?? "";
  let sent = sentSkillNames.get(agentKey);
  if (!sent) {
    sent = /* @__PURE__ */ new Set();
    sentSkillNames.set(agentKey, sent);
  }
  if (suppressNext) {
    suppressNext = false;
    for (const cmd of allCommands) {
      sent.add(cmd.name);
    }
    return [];
  }
  const newSkills = allCommands.filter((cmd) => !sent.has(cmd.name));
  if (newSkills.length === 0) {
    return [];
  }
  const isInitial = sent.size === 0;
  for (const cmd of newSkills) {
    sent.add(cmd.name);
  }
  logForDebugging(
    `Sending ${newSkills.length} skills via attachment (${isInitial ? "initial" : "dynamic"}, ${sent.size} total sent)`
  );
  const contextWindowTokens = getContextWindowForModel(
    toolUseContext.options.mainLoopModel,
    getSdkBetas()
  );
  const content = formatCommandsWithinBudget(newSkills, contextWindowTokens);
  return [
    {
      type: "skill_listing",
      content,
      skillCount: newSkills.length,
      isInitial
    }
  ];
}
function extractAtMentionedFiles(content) {
  const quotedAtMentionRegex = /(^|\s)@"([^"]+)"/g;
  const regularAtMentionRegex = /(^|\s)@([^\s]+)\b/g;
  const quotedMatches = [];
  const regularMatches = [];
  let match;
  while ((match = quotedAtMentionRegex.exec(content)) !== null) {
    if (match[2] && !match[2].endsWith(" (agent)")) {
      quotedMatches.push(match[2]);
    }
  }
  const regularMatchArray = content.match(regularAtMentionRegex) || [];
  regularMatchArray.forEach((match2) => {
    const filename = match2.slice(match2.indexOf("@") + 1);
    if (!filename.startsWith('"')) {
      regularMatches.push(filename);
    }
  });
  return uniq([...quotedMatches, ...regularMatches]);
}
function extractMcpResourceMentions(content) {
  const atMentionRegex = /(^|\s)@([^\s]+:[^\s]+)\b/g;
  const matches = content.match(atMentionRegex) || [];
  return uniq(matches.map((match) => match.slice(match.indexOf("@") + 1)));
}
function extractAgentMentions(content) {
  const results = [];
  const quotedAgentRegex = /(^|\s)@"([\w:.@-]+) \(agent\)"/g;
  let match;
  while ((match = quotedAgentRegex.exec(content)) !== null) {
    if (match[2]) {
      results.push(match[2]);
    }
  }
  const unquotedAgentRegex = /(^|\s)@(agent-[\w:.@-]+)/g;
  const unquotedMatches = content.match(unquotedAgentRegex) || [];
  for (const m of unquotedMatches) {
    results.push(m.slice(m.indexOf("@") + 1));
  }
  return uniq(results);
}
function parseAtMentionedFileLines(mention) {
  const match = mention.match(/^([^#]+)(?:#L(\d+)(?:-(\d+))?)?(?:#[^#]*)?$/);
  if (!match) {
    return { filename: mention };
  }
  const [, filename, lineStartStr, lineEndStr] = match;
  const lineStart = lineStartStr ? parseInt(lineStartStr, 10) : void 0;
  const lineEnd = lineEndStr ? parseInt(lineEndStr, 10) : lineStart;
  return { filename: filename ?? mention, lineStart, lineEnd };
}
async function getDiagnosticAttachments(toolUseContext) {
  if (!toolUseContext.options.tools.some((t) => toolMatchesName(t, BASH_TOOL_NAME))) {
    return [];
  }
  const newDiagnostics = await diagnosticTracker.getNewDiagnostics();
  if (newDiagnostics.length === 0) {
    return [];
  }
  return [
    {
      type: "diagnostics",
      files: newDiagnostics,
      isNew: true
    }
  ];
}
async function getLSPDiagnosticAttachments(toolUseContext) {
  if (!toolUseContext.options.tools.some((t) => toolMatchesName(t, BASH_TOOL_NAME))) {
    return [];
  }
  logForDebugging("LSP Diagnostics: getLSPDiagnosticAttachments called");
  try {
    const diagnosticSets = checkForLSPDiagnostics();
    if (diagnosticSets.length === 0) {
      return [];
    }
    logForDebugging(
      `LSP Diagnostics: Found ${diagnosticSets.length} pending diagnostic set(s)`
    );
    const attachments = diagnosticSets.map(({ files }) => ({
      type: "diagnostics",
      files,
      isNew: true
    }));
    if (diagnosticSets.length > 0) {
      clearAllLSPDiagnostics();
      logForDebugging(
        `LSP Diagnostics: Cleared ${diagnosticSets.length} delivered diagnostic(s) from registry`
      );
    }
    logForDebugging(
      `LSP Diagnostics: Returning ${attachments.length} diagnostic attachment(s)`
    );
    return attachments;
  } catch (error) {
    const err = toError(error);
    logError(
      new Error(`Failed to get LSP diagnostic attachments: ${err.message}`)
    );
    return [];
  }
}
async function* getAttachmentMessages(input, toolUseContext, ideSelection, queuedCommands, messages, querySource, options) {
  const attachments = await getAttachments(
    input,
    toolUseContext,
    ideSelection,
    queuedCommands,
    messages,
    querySource,
    options
  );
  if (attachments.length === 0) {
    return;
  }
  logEvent("tengu_attachments", {
    attachment_types: attachments.map(
      (_) => _.type
    )
  });
  for (const attachment of attachments) {
    yield createAttachmentMessage(attachment);
  }
}
async function tryGetPDFReference(filename) {
  const ext = parse(filename).ext.toLowerCase();
  if (!isPDFExtension(ext)) {
    return null;
  }
  try {
    const [stats, pageCount] = await Promise.all([
      getFsImplementation().stat(filename),
      getPDFPageCount(filename)
    ]);
    const effectivePageCount = pageCount ?? Math.ceil(stats.size / (100 * 1024));
    if (effectivePageCount > PDF_AT_MENTION_INLINE_THRESHOLD) {
      logEvent("tengu_pdf_reference_attachment", {
        pageCount: effectivePageCount,
        fileSize: stats.size,
        hadPdfinfo: pageCount !== null
      });
      return {
        type: "pdf_reference",
        filename,
        pageCount: effectivePageCount,
        fileSize: stats.size,
        displayPath: relative(getCwd(), filename)
      };
    }
  } catch {
  }
  return null;
}
async function generateFileAttachment(filename, toolUseContext, successEventName, errorEventName, mode, options) {
  const { offset, limit } = options ?? {};
  const appState = toolUseContext.getAppState();
  if (isFileReadDenied(filename, appState.toolPermissionContext)) {
    return null;
  }
  if (mode === "at-mention" && !isFileWithinReadSizeLimit(
    filename,
    getDefaultFileReadingLimits().maxSizeBytes
  )) {
    const ext = parse(filename).ext.toLowerCase();
    if (!isPDFExtension(ext)) {
      try {
        const stats = await getFsImplementation().stat(filename);
        logEvent("tengu_attachment_file_too_large", {
          size_bytes: stats.size,
          mode
        });
        return null;
      } catch {
      }
    }
  }
  if (mode === "at-mention") {
    const pdfRef = await tryGetPDFReference(filename);
    if (pdfRef) {
      return pdfRef;
    }
  }
  const existingFileState = toolUseContext.readFileState.get(filename);
  if (existingFileState && mode === "at-mention") {
    try {
      const mtimeMs = await getFileModificationTimeAsync(filename);
      if (existingFileState.timestamp <= mtimeMs && mtimeMs === existingFileState.timestamp) {
        logEvent(successEventName, {});
        return {
          type: "already_read_file",
          filename,
          displayPath: relative(getCwd(), filename),
          content: {
            type: "text",
            file: {
              filePath: filename,
              content: existingFileState.content,
              numLines: countCharInString(existingFileState.content, "\n") + 1,
              startLine: offset ?? 1,
              totalLines: countCharInString(existingFileState.content, "\n") + 1
            }
          }
        };
      }
    } catch {
    }
  }
  try {
    const fileInput = {
      file_path: filename,
      offset,
      limit
    };
    async function readTruncatedFile() {
      if (mode === "compact") {
        return {
          type: "compact_file_reference",
          filename,
          displayPath: relative(getCwd(), filename)
        };
      }
      const appState2 = toolUseContext.getAppState();
      if (isFileReadDenied(filename, appState2.toolPermissionContext)) {
        return null;
      }
      try {
        const truncatedInput = {
          file_path: filename,
          offset: offset ?? 1,
          limit: MAX_LINES_TO_READ
        };
        const result = await FileReadTool.call(truncatedInput, toolUseContext);
        logEvent(successEventName, {});
        return {
          type: "file",
          filename,
          content: result.data,
          truncated: true,
          displayPath: relative(getCwd(), filename)
        };
      } catch {
        logEvent(errorEventName, {});
        return null;
      }
    }
    const isValid = await FileReadTool.validateInput(fileInput, toolUseContext);
    if (!isValid.result) {
      return null;
    }
    try {
      const result = await FileReadTool.call(fileInput, toolUseContext);
      logEvent(successEventName, {});
      return {
        type: "file",
        filename,
        content: result.data,
        displayPath: relative(getCwd(), filename)
      };
    } catch (error) {
      if (error instanceof MaxFileReadTokenExceededError || error instanceof FileTooLargeError) {
        return await readTruncatedFile();
      }
      throw error;
    }
  } catch {
    logEvent(errorEventName, {});
    return null;
  }
}
function createAttachmentMessage(attachment) {
  return {
    attachment,
    type: "attachment",
    uuid: randomUUID(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function getTodoReminderTurnCounts(messages) {
  let lastTodoWriteIndex = -1;
  let lastReminderIndex = -1;
  let assistantTurnsSinceWrite = 0;
  let assistantTurnsSinceReminder = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type === "assistant") {
      if (isThinkingMessage(message)) {
        continue;
      }
      if (lastTodoWriteIndex === -1 && "message" in message && Array.isArray(message.message?.content) && message.message.content.some(
        (block) => block.type === "tool_use" && block.name === "TodoWrite"
      )) {
        lastTodoWriteIndex = i;
      }
      if (lastTodoWriteIndex === -1) assistantTurnsSinceWrite++;
      if (lastReminderIndex === -1) assistantTurnsSinceReminder++;
    } else if (lastReminderIndex === -1 && message?.type === "attachment" && message.attachment.type === "todo_reminder") {
      lastReminderIndex = i;
    }
    if (lastTodoWriteIndex !== -1 && lastReminderIndex !== -1) {
      break;
    }
  }
  return {
    turnsSinceLastTodoWrite: assistantTurnsSinceWrite,
    turnsSinceLastReminder: assistantTurnsSinceReminder
  };
}
async function getTodoReminderAttachments(messages, toolUseContext) {
  if (!toolUseContext.options.tools.some(
    (t) => toolMatchesName(t, TODO_WRITE_TOOL_NAME)
  )) {
    return [];
  }
  if (BRIEF_TOOL_NAME && toolUseContext.options.tools.some((t) => toolMatchesName(t, BRIEF_TOOL_NAME))) {
    return [];
  }
  if (!messages || messages.length === 0) {
    return [];
  }
  const { turnsSinceLastTodoWrite, turnsSinceLastReminder } = getTodoReminderTurnCounts(messages);
  if (turnsSinceLastTodoWrite >= TODO_REMINDER_CONFIG.TURNS_SINCE_WRITE && turnsSinceLastReminder >= TODO_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS) {
    const todoKey = toolUseContext.agentId ?? getSessionId();
    const appState = toolUseContext.getAppState();
    const todos = appState.todos[todoKey] ?? [];
    return [
      {
        type: "todo_reminder",
        content: todos,
        itemCount: todos.length
      }
    ];
  }
  return [];
}
function getTaskReminderTurnCounts(messages) {
  let lastTaskManagementIndex = -1;
  let lastReminderIndex = -1;
  let assistantTurnsSinceTaskManagement = 0;
  let assistantTurnsSinceReminder = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type === "assistant") {
      if (isThinkingMessage(message)) {
        continue;
      }
      if (lastTaskManagementIndex === -1 && "message" in message && Array.isArray(message.message?.content) && message.message.content.some(
        (block) => block.type === "tool_use" && (block.name === TASK_CREATE_TOOL_NAME || block.name === TASK_UPDATE_TOOL_NAME)
      )) {
        lastTaskManagementIndex = i;
      }
      if (lastTaskManagementIndex === -1) assistantTurnsSinceTaskManagement++;
      if (lastReminderIndex === -1) assistantTurnsSinceReminder++;
    } else if (lastReminderIndex === -1 && message?.type === "attachment" && message.attachment.type === "task_reminder") {
      lastReminderIndex = i;
    }
    if (lastTaskManagementIndex !== -1 && lastReminderIndex !== -1) {
      break;
    }
  }
  return {
    turnsSinceLastTaskManagement: assistantTurnsSinceTaskManagement,
    turnsSinceLastReminder: assistantTurnsSinceReminder
  };
}
async function getTaskReminderAttachments(messages, toolUseContext) {
  if (!isTodoV2Enabled()) {
    return [];
  }
  if (process.env.USER_TYPE === "ant") {
    return [];
  }
  if (BRIEF_TOOL_NAME && toolUseContext.options.tools.some((t) => toolMatchesName(t, BRIEF_TOOL_NAME))) {
    return [];
  }
  if (!toolUseContext.options.tools.some(
    (t) => toolMatchesName(t, TASK_UPDATE_TOOL_NAME)
  )) {
    return [];
  }
  if (!messages || messages.length === 0) {
    return [];
  }
  const { turnsSinceLastTaskManagement, turnsSinceLastReminder } = getTaskReminderTurnCounts(messages);
  if (turnsSinceLastTaskManagement >= TODO_REMINDER_CONFIG.TURNS_SINCE_WRITE && turnsSinceLastReminder >= TODO_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS) {
    const tasks = await listTasks(getTaskListId());
    return [
      {
        type: "task_reminder",
        content: tasks,
        itemCount: tasks.length
      }
    ];
  }
  return [];
}
async function getUnifiedTaskAttachments(toolUseContext) {
  const appState = toolUseContext.getAppState();
  const { attachments, updatedTaskOffsets, evictedTaskIds } = await generateTaskAttachments(appState);
  applyTaskOffsetsAndEvictions(
    toolUseContext.setAppState,
    updatedTaskOffsets,
    evictedTaskIds
  );
  return attachments.map((taskAttachment) => ({
    type: "task_status",
    taskId: taskAttachment.taskId,
    taskType: taskAttachment.taskType,
    status: taskAttachment.status,
    description: taskAttachment.description,
    deltaSummary: taskAttachment.deltaSummary,
    outputFilePath: getTaskOutputPath(taskAttachment.taskId)
  }));
}
async function getAsyncHookResponseAttachments() {
  const responses = await checkForAsyncHookResponses();
  if (responses.length === 0) {
    return [];
  }
  logForDebugging(
    `Hooks: getAsyncHookResponseAttachments found ${responses.length} responses`
  );
  const attachments = responses.map(
    ({
      processId,
      response,
      hookName,
      hookEvent,
      toolName,
      pluginId,
      stdout,
      stderr,
      exitCode
    }) => {
      logForDebugging(
        `Hooks: Creating attachment for ${processId} (${hookName}): ${jsonStringify(response)}`
      );
      return {
        type: "async_hook_response",
        processId,
        hookName,
        hookEvent,
        toolName,
        response,
        stdout,
        stderr,
        exitCode
      };
    }
  );
  if (responses.length > 0) {
    const processIds = responses.map((r) => r.processId);
    removeDeliveredAsyncHooks(processIds);
    logForDebugging(
      `Hooks: Removed ${processIds.length} delivered hooks from registry`
    );
  }
  logForDebugging(
    `Hooks: getAsyncHookResponseAttachments found ${attachments.length} attachments`
  );
  return attachments;
}
async function getTeammateMailboxAttachments(toolUseContext) {
  if (!isAgentSwarmsEnabled()) {
    return [];
  }
  if (process.env.USER_TYPE !== "ant") {
    return [];
  }
  const appState = toolUseContext.getAppState();
  const envAgentName = getAgentName();
  const teamName = getTeamName(appState.teamContext);
  const teamLeadStatus = isTeamLead(appState.teamContext);
  const viewedTeammate = getViewedTeammateTask(appState);
  let agentName = viewedTeammate?.identity.agentName ?? envAgentName;
  if (!agentName && teamLeadStatus && appState.teamContext) {
    const leadAgentId = appState.teamContext.leadAgentId;
    agentName = appState.teamContext.teammates[leadAgentId]?.name || "team-lead";
  }
  logForDebugging(
    `[SwarmMailbox] getTeammateMailboxAttachments called: envAgentName=${envAgentName}, isTeamLead=${teamLeadStatus}, resolved agentName=${agentName}, teamName=${teamName}`
  );
  if (!agentName) {
    logForDebugging(
      `[SwarmMailbox] Not checking inbox - not in a swarm or team lead`
    );
    return [];
  }
  logForDebugging(
    `[SwarmMailbox] Checking inbox for agent="${agentName}" team="${teamName || "default"}"`
  );
  const allUnreadMessages = await readUnreadMessages(agentName, teamName);
  const unreadMessages = allUnreadMessages.filter(
    (m) => !isStructuredProtocolMessage(m.text)
  );
  logForDebugging(
    `[MailboxBridge] Found ${allUnreadMessages.length} unread message(s) for "${agentName}" (${allUnreadMessages.length - unreadMessages.length} structured protocol messages filtered out)`
  );
  const pendingInboxMessages = viewedTeammate || isInProcessTeammate() ? [] : appState.inbox.messages.filter((m) => m.status === "pending");
  logForDebugging(
    `[SwarmMailbox] Found ${pendingInboxMessages.length} pending message(s) in AppState.inbox`
  );
  const seen = /* @__PURE__ */ new Set();
  let allMessages = [];
  for (const m of [...unreadMessages, ...pendingInboxMessages]) {
    const key = `${m.from}|${m.timestamp}|${m.text.slice(0, 100)}`;
    if (!seen.has(key)) {
      seen.add(key);
      allMessages.push({
        from: m.from,
        text: m.text,
        timestamp: m.timestamp,
        color: m.color,
        summary: m.summary
      });
    }
  }
  const idleAgentByIndex = /* @__PURE__ */ new Map();
  const latestIdleByAgent = /* @__PURE__ */ new Map();
  for (let i = 0; i < allMessages.length; i++) {
    const idle = isIdleNotification(allMessages[i].text);
    if (idle) {
      idleAgentByIndex.set(i, idle.from);
      latestIdleByAgent.set(idle.from, i);
    }
  }
  if (idleAgentByIndex.size > latestIdleByAgent.size) {
    const beforeCount = allMessages.length;
    allMessages = allMessages.filter((_m, i) => {
      const agent = idleAgentByIndex.get(i);
      if (agent === void 0) return true;
      return latestIdleByAgent.get(agent) === i;
    });
    logForDebugging(
      `[SwarmMailbox] Collapsed ${beforeCount - allMessages.length} duplicate idle notification(s)`
    );
  }
  if (allMessages.length === 0) {
    logForDebugging(`[SwarmMailbox] No messages to deliver, returning empty`);
    return [];
  }
  logForDebugging(
    `[SwarmMailbox] Returning ${allMessages.length} message(s) as attachment for "${agentName}" (${unreadMessages.length} from file, ${pendingInboxMessages.length} from AppState, after dedup)`
  );
  const attachment = [
    {
      type: "teammate_mailbox",
      messages: allMessages
    }
  ];
  if (unreadMessages.length > 0) {
    await markMessagesAsReadByPredicate(
      agentName,
      (m) => !isStructuredProtocolMessage(m.text),
      teamName
    );
    logForDebugging(
      `[MailboxBridge] marked ${unreadMessages.length} non-structured message(s) as read for agent="${agentName}" team="${teamName || "default"}"`
    );
  }
  if (teamLeadStatus && teamName) {
    for (const m of allMessages) {
      const shutdownApproval = isShutdownApproved(m.text);
      if (shutdownApproval) {
        const teammateToRemove = shutdownApproval.from;
        logForDebugging(
          `[SwarmMailbox] Processing shutdown_approved from ${teammateToRemove}`
        );
        const teammateId = appState.teamContext?.teammates ? Object.entries(appState.teamContext.teammates).find(
          ([, t]) => t.name === teammateToRemove
        )?.[0] : void 0;
        if (teammateId) {
          removeTeammateFromTeamFile(teamName, {
            agentId: teammateId,
            name: teammateToRemove
          });
          logForDebugging(
            `[SwarmMailbox] Removed ${teammateToRemove} from team file`
          );
          await unassignTeammateTasks(
            teamName,
            teammateId,
            teammateToRemove,
            "shutdown"
          );
          toolUseContext.setAppState((prev) => {
            if (!prev.teamContext?.teammates) return prev;
            if (!(teammateId in prev.teamContext.teammates)) return prev;
            const { [teammateId]: _, ...remainingTeammates } = prev.teamContext.teammates;
            return {
              ...prev,
              teamContext: {
                ...prev.teamContext,
                teammates: remainingTeammates
              }
            };
          });
        }
      }
    }
  }
  if (pendingInboxMessages.length > 0) {
    const pendingIds = new Set(pendingInboxMessages.map((m) => m.id));
    toolUseContext.setAppState((prev) => ({
      ...prev,
      inbox: {
        messages: prev.inbox.messages.map(
          (m) => pendingIds.has(m.id) ? { ...m, status: "processed" } : m
        )
      }
    }));
  }
  return attachment;
}
function getTeamContextAttachment(messages) {
  const teamName = getTeamName();
  const agentId = getAgentId();
  const agentName = getAgentName();
  if (!teamName || !agentId) {
    return [];
  }
  const hasAssistantMessage = messages.some((m) => m.type === "assistant");
  if (hasAssistantMessage) {
    return [];
  }
  const configDir = getClaudeConfigHomeDir();
  const teamConfigPath = `${configDir}/teams/${teamName}/config.json`;
  const taskListPath = `${configDir}/tasks/${teamName}/`;
  return [
    {
      type: "team_context",
      agentId,
      agentName: agentName || agentId,
      teamName,
      teamConfigPath,
      taskListPath
    }
  ];
}
function getTokenUsageAttachment(messages, model) {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT)) {
    return [];
  }
  const contextWindow = getEffectiveContextWindowSize(model);
  const usedTokens = tokenCountFromLastAPIResponse(messages);
  return [
    {
      type: "token_usage",
      used: usedTokens,
      total: contextWindow,
      remaining: contextWindow - usedTokens
    }
  ];
}
function getOutputTokenUsageAttachment() {
  if (false) {
    const budget = getCurrentTurnTokenBudget();
    if (budget === null || budget <= 0) {
      return [];
    }
    return [
      {
        type: "output_token_usage",
        turn: getTurnOutputTokens(),
        session: getTotalOutputTokens(),
        budget
      }
    ];
  }
  return [];
}
function getMaxBudgetUsdAttachment(maxBudgetUsd) {
  if (maxBudgetUsd === void 0) {
    return [];
  }
  const usedCost = getTotalCostUSD();
  const remainingBudget = maxBudgetUsd - usedCost;
  return [
    {
      type: "budget_usd",
      used: usedCost,
      total: maxBudgetUsd,
      remaining: remainingBudget
    }
  ];
}
function getVerifyPlanReminderTurnCount(messages) {
  let turnCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && isHumanTurn(message)) {
      turnCount++;
    }
    if (message?.type === "attachment" && message.attachment.type === "plan_mode_exit") {
      return turnCount;
    }
  }
  return 0;
}
async function getVerifyPlanReminderAttachment(messages, toolUseContext) {
  if (process.env.USER_TYPE !== "ant" || !isEnvTruthy(process.env.CLAUDE_CODE_VERIFY_PLAN)) {
    return [];
  }
  const appState = toolUseContext.getAppState();
  const pending = appState.pendingPlanVerification;
  if (!pending || pending.verificationStarted || pending.verificationCompleted) {
    return [];
  }
  if (messages && messages.length > 0) {
    const turnCount = getVerifyPlanReminderTurnCount(messages);
    if (turnCount === 0 || turnCount % VERIFY_PLAN_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS !== 0) {
      return [];
    }
  }
  return [{ type: "verify_plan_reminder" }];
}
function getCompactionReminderAttachment(messages, model) {
  if (!getFeatureValue_CACHED_MAY_BE_STALE("tengu_marble_fox", false)) {
    return [];
  }
  if (!isAutoCompactEnabled()) {
    return [];
  }
  const contextWindow = getContextWindowForModel(model, getSdkBetas());
  if (contextWindow < 1e6) {
    return [];
  }
  const effectiveWindow = getEffectiveContextWindowSize(model);
  const usedTokens = tokenCountWithEstimation(messages);
  if (usedTokens < effectiveWindow * 0.25) {
    return [];
  }
  return [{ type: "compaction_reminder" }];
}
function getContextEfficiencyAttachment(messages) {
  if (true) {
    return [];
  }
  const { isSnipRuntimeEnabled, shouldNudgeForSnips } = (
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("../services/compact/snipCompact.js")
  );
  if (!isSnipRuntimeEnabled()) {
    return [];
  }
  if (!shouldNudgeForSnips(messages)) {
    return [];
  }
  return [{ type: "context_efficiency" }];
}
function isFileReadDenied(filePath, toolPermissionContext) {
  const denyRule = matchingRuleForInput(
    filePath,
    toolPermissionContext,
    "read",
    "deny"
  );
  return denyRule !== null;
}
export {
  AUTO_MODE_ATTACHMENT_CONFIG,
  PLAN_MODE_ATTACHMENT_CONFIG,
  RELEVANT_MEMORIES_CONFIG,
  TODO_REMINDER_CONFIG,
  VERIFY_PLAN_REMINDER_CONFIG,
  collectRecentSuccessfulTools,
  collectSurfacedMemories,
  createAttachmentMessage,
  extractAgentMentions,
  extractAtMentionedFiles,
  extractMcpResourceMentions,
  filterDuplicateMemoryAttachments,
  filterToBundledAndMcp,
  generateFileAttachment,
  getAgentListingDeltaAttachment,
  getAgentPendingMessageAttachments,
  getAttachmentMessages,
  getAttachments,
  getChangedFiles,
  getCompactionReminderAttachment,
  getContextEfficiencyAttachment,
  getDateChangeAttachments,
  getDeferredToolsDeltaAttachment,
  getDirectoriesToProcess,
  getMcpInstructionsDeltaAttachment,
  getQueuedCommandAttachments,
  getVerifyPlanReminderTurnCount,
  memoryFilesToAttachments,
  memoryHeader,
  parseAtMentionedFileLines,
  readMemoriesForSurfacing,
  resetSentSkillNames,
  startRelevantMemoryPrefetch,
  suppressNextSkillListing,
  tryGetPDFReference
};
