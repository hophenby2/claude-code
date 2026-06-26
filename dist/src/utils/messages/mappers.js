import { randomUUID } from "crypto";
import { getSessionId } from "../../bootstrap/state.js";
import {
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG
} from "../../constants/xml.js";
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from "../../tools/ExitPlanModeTool/constants.js";
import stripAnsi from "strip-ansi";
import { createAssistantMessage } from "../messages.js";
import { getPlan } from "../plans.js";
function toInternalMessages(messages) {
  return messages.flatMap((message) => {
    switch (message.type) {
      case "assistant":
        return [
          {
            type: "assistant",
            message: message.message,
            uuid: message.uuid,
            requestId: void 0,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }
        ];
      case "user":
        return [
          {
            type: "user",
            message: message.message,
            uuid: message.uuid ?? randomUUID(),
            timestamp: message.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
            isMeta: message.isSynthetic
          }
        ];
      case "system":
        if (message.subtype === "compact_boundary") {
          const compactMsg = message;
          return [
            {
              type: "system",
              content: "Conversation compacted",
              level: "info",
              subtype: "compact_boundary",
              compactMetadata: fromSDKCompactMetadata(
                compactMsg.compact_metadata
              ),
              uuid: message.uuid,
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            }
          ];
        }
        return [];
      default:
        return [];
    }
  });
}
function toSDKCompactMetadata(meta) {
  const seg = meta.preservedSegment;
  return {
    trigger: meta.trigger,
    pre_tokens: meta.preTokens,
    ...seg && {
      preserved_segment: {
        head_uuid: seg.headUuid,
        anchor_uuid: seg.anchorUuid,
        tail_uuid: seg.tailUuid
      }
    }
  };
}
function fromSDKCompactMetadata(meta) {
  const seg = meta.preserved_segment;
  return {
    trigger: meta.trigger,
    preTokens: meta.pre_tokens,
    ...seg && {
      preservedSegment: {
        headUuid: seg.head_uuid,
        anchorUuid: seg.anchor_uuid,
        tailUuid: seg.tail_uuid
      }
    }
  };
}
function toSDKMessages(messages) {
  return messages.flatMap((message) => {
    switch (message.type) {
      case "assistant":
        return [
          {
            type: "assistant",
            message: normalizeAssistantMessageForSDK(message),
            session_id: getSessionId(),
            parent_tool_use_id: null,
            uuid: message.uuid,
            error: message.error
          }
        ];
      case "user":
        return [
          {
            type: "user",
            message: message.message,
            session_id: getSessionId(),
            parent_tool_use_id: null,
            uuid: message.uuid,
            timestamp: message.timestamp,
            isSynthetic: message.isMeta || message.isVisibleInTranscriptOnly,
            // Structured tool output (not the string content sent to the
            // model — the full Output object). Rides the protobuf catchall
            // so web viewers can read things like BriefTool's file_uuid
            // without it polluting model context.
            ...message.toolUseResult !== void 0 ? { tool_use_result: message.toolUseResult } : {}
          }
        ];
      case "system":
        if (message.subtype === "compact_boundary" && message.compactMetadata) {
          return [
            {
              type: "system",
              subtype: "compact_boundary",
              session_id: getSessionId(),
              uuid: message.uuid,
              compact_metadata: toSDKCompactMetadata(message.compactMetadata)
            }
          ];
        }
        if (message.subtype === "local_command" && (message.content.includes(`<${LOCAL_COMMAND_STDOUT_TAG}>`) || message.content.includes(`<${LOCAL_COMMAND_STDERR_TAG}>`))) {
          return [
            localCommandOutputToSDKAssistantMessage(
              message.content,
              message.uuid
            )
          ];
        }
        return [];
      default:
        return [];
    }
  });
}
function localCommandOutputToSDKAssistantMessage(rawContent, uuid) {
  const cleanContent = stripAnsi(rawContent).replace(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/, "$1").replace(/<local-command-stderr>([\s\S]*?)<\/local-command-stderr>/, "$1").trim();
  const synthetic = createAssistantMessage({ content: cleanContent });
  return {
    type: "assistant",
    message: synthetic.message,
    parent_tool_use_id: null,
    session_id: getSessionId(),
    uuid
  };
}
function toSDKRateLimitInfo(limits) {
  if (!limits) {
    return void 0;
  }
  return {
    status: limits.status,
    ...limits.resetsAt !== void 0 && { resetsAt: limits.resetsAt },
    ...limits.rateLimitType !== void 0 && {
      rateLimitType: limits.rateLimitType
    },
    ...limits.utilization !== void 0 && {
      utilization: limits.utilization
    },
    ...limits.overageStatus !== void 0 && {
      overageStatus: limits.overageStatus
    },
    ...limits.overageResetsAt !== void 0 && {
      overageResetsAt: limits.overageResetsAt
    },
    ...limits.overageDisabledReason !== void 0 && {
      overageDisabledReason: limits.overageDisabledReason
    },
    ...limits.isUsingOverage !== void 0 && {
      isUsingOverage: limits.isUsingOverage
    },
    ...limits.surpassedThreshold !== void 0 && {
      surpassedThreshold: limits.surpassedThreshold
    }
  };
}
function normalizeAssistantMessageForSDK(message) {
  const content = message.message.content;
  if (!Array.isArray(content)) {
    return message.message;
  }
  const normalizedContent = content.map((block) => {
    if (block.type !== "tool_use") {
      return block;
    }
    if (block.name === EXIT_PLAN_MODE_V2_TOOL_NAME) {
      const plan = getPlan();
      if (plan) {
        return {
          ...block,
          input: { ...block.input, plan }
        };
      }
    }
    return block;
  });
  return {
    ...message.message,
    content: normalizedContent
  };
}
export {
  fromSDKCompactMetadata,
  localCommandOutputToSDKAssistantMessage,
  toInternalMessages,
  toSDKCompactMetadata,
  toSDKMessages,
  toSDKRateLimitInfo
};
