const feature = (_name) => false;
import { relative } from "path";
import { getCwd } from "./cwd.js";
import { addInvokedSkill } from "../bootstrap/state.js";
import { asSessionId } from "../types/ids.js";
import { PERMISSION_MODES } from "../types/permissions.js";
import { suppressNextSkillListing } from "./attachments.js";
import {
  copyFileHistoryForResume
} from "./fileHistory.js";
import { logError } from "./log.js";
import {
  createAssistantMessage,
  createUserMessage,
  filterOrphanedThinkingOnlyMessages,
  filterUnresolvedToolUses,
  filterWhitespaceOnlyAssistantMessages,
  isToolUseResultMessage,
  NO_RESPONSE_REQUESTED,
  normalizeMessages
} from "./messages.js";
import { copyPlanForResume } from "./plans.js";
import { processSessionStartHooks } from "./sessionStart.js";
import {
  buildConversationChain,
  checkResumeConsistency,
  getLastSessionLog,
  getSessionIdFromLog,
  isLiteLog,
  loadFullLog,
  loadMessageLogs,
  loadTranscriptFile,
  removeExtraFields
} from "./sessionStorage.js";
const BRIEF_TOOL_NAME = false ? null.BRIEF_TOOL_NAME : null;
const LEGACY_BRIEF_TOOL_NAME = false ? null.LEGACY_BRIEF_TOOL_NAME : null;
const SEND_USER_FILE_TOOL_NAME = false ? null.SEND_USER_FILE_TOOL_NAME : null;
function migrateLegacyAttachmentTypes(message) {
  if (message.type !== "attachment") {
    return message;
  }
  const attachment = message.attachment;
  if (attachment.type === "new_file") {
    return {
      ...message,
      attachment: {
        ...attachment,
        type: "file",
        displayPath: relative(getCwd(), attachment.filename)
      }
    };
  }
  if (attachment.type === "new_directory") {
    return {
      ...message,
      attachment: {
        ...attachment,
        type: "directory",
        displayPath: relative(getCwd(), attachment.path)
      }
    };
  }
  if (!("displayPath" in attachment)) {
    const path = "filename" in attachment ? attachment.filename : "path" in attachment ? attachment.path : "skillDir" in attachment ? attachment.skillDir : void 0;
    if (path) {
      return {
        ...message,
        attachment: {
          ...attachment,
          displayPath: relative(getCwd(), path)
        }
      };
    }
  }
  return message;
}
function deserializeMessages(serializedMessages) {
  return deserializeMessagesWithInterruptDetection(serializedMessages).messages;
}
function deserializeMessagesWithInterruptDetection(serializedMessages) {
  try {
    const migratedMessages = serializedMessages.map(
      migrateLegacyAttachmentTypes
    );
    const validModes = new Set(PERMISSION_MODES);
    for (const msg of migratedMessages) {
      if (msg.type === "user" && msg.permissionMode !== void 0 && !validModes.has(msg.permissionMode)) {
        msg.permissionMode = void 0;
      }
    }
    const filteredToolUses = filterUnresolvedToolUses(
      migratedMessages
    );
    const filteredThinking = filterOrphanedThinkingOnlyMessages(
      filteredToolUses
    );
    const filteredMessages = filterWhitespaceOnlyAssistantMessages(
      filteredThinking
    );
    const internalState = detectTurnInterruption(filteredMessages);
    let turnInterruptionState;
    if (internalState.kind === "interrupted_turn") {
      const [continuationMessage] = normalizeMessages([
        createUserMessage({
          content: "Continue from where you left off.",
          isMeta: true
        })
      ]);
      filteredMessages.push(continuationMessage);
      turnInterruptionState = {
        kind: "interrupted_prompt",
        message: continuationMessage
      };
    } else {
      turnInterruptionState = internalState;
    }
    const lastRelevantIdx = filteredMessages.findLastIndex(
      (m) => m.type !== "system" && m.type !== "progress"
    );
    if (lastRelevantIdx !== -1 && filteredMessages[lastRelevantIdx].type === "user") {
      filteredMessages.splice(
        lastRelevantIdx + 1,
        0,
        createAssistantMessage({
          content: NO_RESPONSE_REQUESTED
        })
      );
    }
    return { messages: filteredMessages, turnInterruptionState };
  } catch (error) {
    logError(error);
    throw error;
  }
}
function detectTurnInterruption(messages) {
  if (messages.length === 0) {
    return { kind: "none" };
  }
  const lastMessageIdx = messages.findLastIndex(
    (m) => m.type !== "system" && m.type !== "progress" && !(m.type === "assistant" && m.isApiErrorMessage)
  );
  const lastMessage = lastMessageIdx !== -1 ? messages[lastMessageIdx] : void 0;
  if (!lastMessage) {
    return { kind: "none" };
  }
  if (lastMessage.type === "assistant") {
    return { kind: "none" };
  }
  if (lastMessage.type === "user") {
    if (lastMessage.isMeta || lastMessage.isCompactSummary) {
      return { kind: "none" };
    }
    if (isToolUseResultMessage(lastMessage)) {
      if (isTerminalToolResult(lastMessage, messages, lastMessageIdx)) {
        return { kind: "none" };
      }
      return { kind: "interrupted_turn" };
    }
    return { kind: "interrupted_prompt", message: lastMessage };
  }
  if (lastMessage.type === "attachment") {
    return { kind: "interrupted_turn" };
  }
  return { kind: "none" };
}
function isTerminalToolResult(result, messages, resultIdx) {
  const content = result.message.content;
  if (!Array.isArray(content)) return false;
  const block = content[0];
  if (block?.type !== "tool_result") return false;
  const toolUseId = block.tool_use_id;
  for (let i = resultIdx - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== "assistant") continue;
    for (const b of msg.message.content) {
      if (b.type === "tool_use" && b.id === toolUseId) {
        return b.name === BRIEF_TOOL_NAME || b.name === LEGACY_BRIEF_TOOL_NAME || b.name === SEND_USER_FILE_TOOL_NAME;
      }
    }
  }
  return false;
}
function restoreSkillStateFromMessages(messages) {
  for (const message of messages) {
    if (message.type !== "attachment") {
      continue;
    }
    if (message.attachment.type === "invoked_skills") {
      for (const skill of message.attachment.skills) {
        if (skill.name && skill.path && skill.content) {
          addInvokedSkill(skill.name, skill.path, skill.content, null);
        }
      }
    }
    if (message.attachment.type === "skill_listing") {
      suppressNextSkillListing();
    }
  }
}
async function loadMessagesFromJsonlPath(path) {
  const { messages: byUuid, leafUuids } = await loadTranscriptFile(path);
  let tip = null;
  let tipTs = 0;
  for (const m of byUuid.values()) {
    if (m.isSidechain || !leafUuids.has(m.uuid)) continue;
    const ts = new Date(m.timestamp).getTime();
    if (ts > tipTs) {
      tipTs = ts;
      tip = m;
    }
  }
  if (!tip) return { messages: [], sessionId: void 0 };
  const chain = buildConversationChain(byUuid, tip);
  return {
    messages: removeExtraFields(chain),
    // Leaf's sessionId — forked sessions copy chain[0] from the source
    // transcript, so the root retains the source session's ID. Matches
    // loadFullLog's mostRecentLeaf.sessionId.
    sessionId: tip.sessionId
  };
}
async function loadConversationForResume(source, sourceJsonlFile) {
  try {
    let log = null;
    let messages = null;
    let sessionId;
    if (source === void 0) {
      const logsPromise = loadMessageLogs();
      let skip = /* @__PURE__ */ new Set();
      if (false) {
        try {
          const { listAllLiveSessions } = await null;
          const live = await listAllLiveSessions();
          skip = new Set(
            live.flatMap(
              (s) => s.kind && s.kind !== "interactive" && s.sessionId ? [s.sessionId] : []
            )
          );
        } catch {
        }
      }
      const logs = await logsPromise;
      log = logs.find((l) => {
        const id = getSessionIdFromLog(l);
        return !id || !skip.has(id);
      }) ?? null;
    } else if (sourceJsonlFile) {
      const loaded = await loadMessagesFromJsonlPath(sourceJsonlFile);
      messages = loaded.messages;
      sessionId = loaded.sessionId;
    } else if (typeof source === "string") {
      log = await getLastSessionLog(source);
      sessionId = source;
    } else {
      log = source;
    }
    if (!log && !messages) {
      return null;
    }
    if (log) {
      if (isLiteLog(log)) {
        log = await loadFullLog(log);
      }
      if (!sessionId) {
        sessionId = getSessionIdFromLog(log);
      }
      if (sessionId) {
        await copyPlanForResume(log, asSessionId(sessionId));
      }
      void copyFileHistoryForResume(log);
      messages = log.messages;
      checkResumeConsistency(messages);
    }
    restoreSkillStateFromMessages(messages);
    const deserialized = deserializeMessagesWithInterruptDetection(messages);
    messages = deserialized.messages;
    const hookMessages = await processSessionStartHooks("resume", { sessionId });
    messages.push(...hookMessages);
    return {
      messages,
      turnInterruptionState: deserialized.turnInterruptionState,
      fileHistorySnapshots: log?.fileHistorySnapshots,
      attributionSnapshots: log?.attributionSnapshots,
      contentReplacements: log?.contentReplacements,
      contextCollapseCommits: log?.contextCollapseCommits,
      contextCollapseSnapshot: log?.contextCollapseSnapshot,
      sessionId,
      // Include session metadata for restoring agent context on resume
      agentName: log?.agentName,
      agentColor: log?.agentColor,
      agentSetting: log?.agentSetting,
      customTitle: log?.customTitle,
      tag: log?.tag,
      mode: log?.mode,
      worktreeSession: log?.worktreeSession,
      prNumber: log?.prNumber,
      prUrl: log?.prUrl,
      prRepository: log?.prRepository,
      // Include full path for cross-directory resume
      fullPath: log?.fullPath
    };
  } catch (error) {
    logError(error);
    throw error;
  }
}
export {
  deserializeMessages,
  deserializeMessagesWithInterruptDetection,
  loadConversationForResume,
  loadMessagesFromJsonlPath,
  restoreSkillStateFromMessages
};
