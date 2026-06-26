import {
  logEvent
} from "../../../services/analytics/index.js";
import { sanitizeToolNameForAnalytics } from "../../../services/analytics/metadata.js";
import {
  CLAUDE_FOLDER_PERMISSION_PATTERN,
  FILE_EDIT_TOOL_NAME,
  GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN
} from "../../../tools/FileEditTool/constants.js";
import { env } from "../../../utils/env.js";
import { generateSuggestions } from "../../../utils/permissions/filesystem.js";
import {
  logUnaryEvent
} from "../../../utils/unaryLogging.js";
function logPermissionEvent(event, completionType, languageName, messageId, hasFeedback) {
  void logUnaryEvent({
    completion_type: completionType,
    event,
    metadata: {
      language_name: languageName,
      message_id: messageId,
      platform: env.platform,
      hasFeedback: hasFeedback ?? false
    }
  });
}
function handleAcceptOnce(params, options) {
  const { messageId, toolUseConfirm, onDone, completionType, languageName } = params;
  logPermissionEvent("accept", completionType, languageName, messageId);
  logEvent("tengu_accept_submitted", {
    toolName: sanitizeToolNameForAnalytics(
      toolUseConfirm.tool.name
    ),
    isMcp: toolUseConfirm.tool.isMcp ?? false,
    has_instructions: !!options?.feedback,
    instructions_length: options?.feedback?.length ?? 0,
    entered_feedback_mode: options?.enteredFeedbackMode ?? false
  });
  onDone();
  toolUseConfirm.onAllow(toolUseConfirm.input, [], options?.feedback);
}
function handleAcceptSession(params, options) {
  const {
    messageId,
    path,
    toolUseConfirm,
    toolPermissionContext,
    onDone,
    completionType,
    languageName,
    operationType
  } = params;
  logPermissionEvent("accept", completionType, languageName, messageId);
  if (options?.scope === "claude-folder" || options?.scope === "global-claude-folder") {
    const pattern = options.scope === "global-claude-folder" ? GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN : CLAUDE_FOLDER_PERMISSION_PATTERN;
    const suggestions2 = [
      {
        type: "addRules",
        rules: [
          {
            toolName: FILE_EDIT_TOOL_NAME,
            ruleContent: pattern
          }
        ],
        behavior: "allow",
        destination: "session"
      }
    ];
    onDone();
    toolUseConfirm.onAllow(toolUseConfirm.input, suggestions2);
    return;
  }
  const suggestions = path ? generateSuggestions(path, operationType, toolPermissionContext) : [];
  onDone();
  toolUseConfirm.onAllow(toolUseConfirm.input, suggestions);
}
function handleReject(params, options) {
  const {
    messageId,
    toolUseConfirm,
    onDone,
    onReject,
    completionType,
    languageName
  } = params;
  logPermissionEvent(
    "reject",
    completionType,
    languageName,
    messageId,
    options?.hasFeedback
  );
  logEvent("tengu_reject_submitted", {
    toolName: sanitizeToolNameForAnalytics(
      toolUseConfirm.tool.name
    ),
    isMcp: toolUseConfirm.tool.isMcp ?? false,
    has_instructions: !!options?.feedback,
    instructions_length: options?.feedback?.length ?? 0,
    entered_feedback_mode: options?.enteredFeedbackMode ?? false
  });
  onDone();
  onReject();
  toolUseConfirm.onReject(options?.feedback);
}
const PERMISSION_HANDLERS = {
  "accept-once": handleAcceptOnce,
  "accept-session": handleAcceptSession,
  reject: handleReject
};
export {
  PERMISSION_HANDLERS
};
