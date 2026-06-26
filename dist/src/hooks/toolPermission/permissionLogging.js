const feature = (_name) => false;
import {
  logEvent
} from "../../services/analytics/index.js";
import { sanitizeToolNameForAnalytics } from "../../services/analytics/metadata.js";
import { getCodeEditToolDecisionCounter } from "../../bootstrap/state.js";
import { getLanguageName } from "../../utils/cliHighlight.js";
import { SandboxManager } from "../../utils/sandbox/sandbox-adapter.js";
import { logOTelEvent } from "../../utils/telemetry/events.js";
const CODE_EDITING_TOOLS = ["Edit", "Write", "NotebookEdit"];
function isCodeEditingTool(toolName) {
  return CODE_EDITING_TOOLS.includes(toolName);
}
async function buildCodeEditToolAttributes(tool, input, decision, source) {
  let language;
  if (tool.getPath && input) {
    const parseResult = tool.inputSchema.safeParse(input);
    if (parseResult.success) {
      const filePath = tool.getPath(parseResult.data);
      if (filePath) {
        language = await getLanguageName(filePath);
      }
    }
  }
  return {
    decision,
    source,
    tool_name: tool.name,
    ...language && { language }
  };
}
function sourceToString(source) {
  if (false) {
    return "classifier";
  }
  switch (source.type) {
    case "hook":
      return "hook";
    case "user":
      return source.permanent ? "user_permanent" : "user_temporary";
    case "user_abort":
      return "user_abort";
    case "user_reject":
      return "user_reject";
    default:
      return "unknown";
  }
}
function baseMetadata(messageId, toolName, waitMs) {
  return {
    messageID: messageId,
    toolName: sanitizeToolNameForAnalytics(toolName),
    sandboxEnabled: SandboxManager.isSandboxingEnabled(),
    // Only include wait time when the user was actually prompted (not auto-approved)
    ...waitMs !== void 0 && { waiting_for_user_permission_ms: waitMs }
  };
}
function logApprovalEvent(tool, messageId, source, waitMs) {
  if (source === "config") {
    logEvent(
      "tengu_tool_use_granted_in_config",
      baseMetadata(messageId, tool.name, void 0)
    );
    return;
  }
  if (false) {
    logEvent(
      "tengu_tool_use_granted_by_classifier",
      baseMetadata(messageId, tool.name, waitMs)
    );
    return;
  }
  switch (source.type) {
    case "user":
      logEvent(
        source.permanent ? "tengu_tool_use_granted_in_prompt_permanent" : "tengu_tool_use_granted_in_prompt_temporary",
        baseMetadata(messageId, tool.name, waitMs)
      );
      break;
    case "hook":
      logEvent("tengu_tool_use_granted_by_permission_hook", {
        ...baseMetadata(messageId, tool.name, waitMs),
        permanent: source.permanent ?? false
      });
      break;
    default:
      break;
  }
}
function logRejectionEvent(tool, messageId, source, waitMs) {
  if (source === "config") {
    logEvent(
      "tengu_tool_use_denied_in_config",
      baseMetadata(messageId, tool.name, void 0)
    );
    return;
  }
  logEvent("tengu_tool_use_rejected_in_prompt", {
    ...baseMetadata(messageId, tool.name, waitMs),
    // Distinguish hook rejections from user rejections via separate fields
    ...source.type === "hook" ? { isHook: true } : {
      hasFeedback: source.type === "user_reject" ? source.hasFeedback : false
    }
  });
}
function logPermissionDecision(ctx, args, permissionPromptStartTimeMs) {
  const { tool, input, toolUseContext, messageId, toolUseID } = ctx;
  const { decision, source } = args;
  const waiting_for_user_permission_ms = permissionPromptStartTimeMs !== void 0 ? Date.now() - permissionPromptStartTimeMs : void 0;
  if (args.decision === "accept") {
    logApprovalEvent(
      tool,
      messageId,
      args.source,
      waiting_for_user_permission_ms
    );
  } else {
    logRejectionEvent(
      tool,
      messageId,
      args.source,
      waiting_for_user_permission_ms
    );
  }
  const sourceString = source === "config" ? "config" : sourceToString(source);
  if (isCodeEditingTool(tool.name)) {
    void buildCodeEditToolAttributes(tool, input, decision, sourceString).then(
      (attributes) => getCodeEditToolDecisionCounter()?.add(1, attributes)
    );
  }
  if (!toolUseContext.toolDecisions) {
    toolUseContext.toolDecisions = /* @__PURE__ */ new Map();
  }
  toolUseContext.toolDecisions.set(toolUseID, {
    source: sourceString,
    decision,
    timestamp: Date.now()
  });
  void logOTelEvent("tool_decision", {
    decision,
    source: sourceString,
    tool_name: sanitizeToolNameForAnalytics(tool.name)
  });
}
export {
  buildCodeEditToolAttributes,
  isCodeEditingTool,
  logPermissionDecision
};
