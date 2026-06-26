import { createHash } from "crypto";
import { getIsNonInteractiveSession } from "../../bootstrap/state.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import { sanitizeToolNameForAnalytics } from "../../services/analytics/metadata.js";
import { isEnvTruthy } from "../envUtils.js";
import { jsonParse, jsonStringify } from "../slowOperations.js";
import { logOTelEvent } from "./events.js";
const seenHashes = /* @__PURE__ */ new Set();
const lastReportedMessageHash = /* @__PURE__ */ new Map();
function clearBetaTracingState() {
  seenHashes.clear();
  lastReportedMessageHash.clear();
}
const MAX_CONTENT_SIZE = 60 * 1024;
function isBetaTracingEnabled() {
  const baseEnabled = isEnvTruthy(process.env.ENABLE_BETA_TRACING_DETAILED) && Boolean(process.env.BETA_TRACING_ENDPOINT);
  if (!baseEnabled) {
    return false;
  }
  if (process.env.USER_TYPE !== "ant") {
    return getIsNonInteractiveSession() || getFeatureValue_CACHED_MAY_BE_STALE("tengu_trace_lantern", false);
  }
  return true;
}
function truncateContent(content, maxSize = MAX_CONTENT_SIZE) {
  if (content.length <= maxSize) {
    return { content, truncated: false };
  }
  return {
    content: content.slice(0, maxSize) + "\n\n[TRUNCATED - Content exceeds 60KB limit]",
    truncated: true
  };
}
function shortHash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}
function hashSystemPrompt(systemPrompt) {
  return `sp_${shortHash(systemPrompt)}`;
}
function hashMessage(message) {
  const content = jsonStringify(message.message.content);
  return `msg_${shortHash(content)}`;
}
const SYSTEM_REMINDER_REGEX = /^<system-reminder>\n?([\s\S]*?)\n?<\/system-reminder>$/;
function extractSystemReminderContent(text) {
  const match = text.trim().match(SYSTEM_REMINDER_REGEX);
  return match && match[1] ? match[1].trim() : null;
}
function formatMessagesForContext(messages) {
  const contextParts = [];
  const systemReminders = [];
  for (const message of messages) {
    const content = message.message.content;
    if (typeof content === "string") {
      const reminderContent = extractSystemReminderContent(content);
      if (reminderContent) {
        systemReminders.push(reminderContent);
      } else {
        contextParts.push(`[USER]
${content}`);
      }
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text") {
          const reminderContent = extractSystemReminderContent(block.text);
          if (reminderContent) {
            systemReminders.push(reminderContent);
          } else {
            contextParts.push(`[USER]
${block.text}`);
          }
        } else if (block.type === "tool_result") {
          const resultContent = typeof block.content === "string" ? block.content : jsonStringify(block.content);
          const reminderContent = extractSystemReminderContent(resultContent);
          if (reminderContent) {
            systemReminders.push(reminderContent);
          } else {
            contextParts.push(
              `[TOOL RESULT: ${block.tool_use_id}]
${resultContent}`
            );
          }
        }
      }
    }
  }
  return { contextParts, systemReminders };
}
function addBetaInteractionAttributes(span, userPrompt) {
  if (!isBetaTracingEnabled()) {
    return;
  }
  const { content: truncatedPrompt, truncated } = truncateContent(
    `[USER PROMPT]
${userPrompt}`
  );
  span.setAttributes({
    new_context: truncatedPrompt,
    ...truncated && {
      new_context_truncated: true,
      new_context_original_length: userPrompt.length
    }
  });
}
function addBetaLLMRequestAttributes(span, newContext, messagesForAPI) {
  if (!isBetaTracingEnabled()) {
    return;
  }
  if (newContext?.systemPrompt) {
    const promptHash = hashSystemPrompt(newContext.systemPrompt);
    const preview = newContext.systemPrompt.slice(0, 500);
    span.setAttribute("system_prompt_hash", promptHash);
    span.setAttribute("system_prompt_preview", preview);
    span.setAttribute("system_prompt_length", newContext.systemPrompt.length);
    if (!seenHashes.has(promptHash)) {
      seenHashes.add(promptHash);
      const { content: truncatedPrompt, truncated } = truncateContent(
        newContext.systemPrompt
      );
      void logOTelEvent("system_prompt", {
        system_prompt_hash: promptHash,
        system_prompt: truncatedPrompt,
        system_prompt_length: String(newContext.systemPrompt.length),
        ...truncated && { system_prompt_truncated: "true" }
      });
    }
  }
  if (newContext?.tools) {
    try {
      const toolsArray = jsonParse(newContext.tools);
      const toolsWithHashes = toolsArray.map((tool) => {
        const toolJson = jsonStringify(tool);
        const toolHash = shortHash(toolJson);
        return {
          name: typeof tool.name === "string" ? tool.name : "unknown",
          hash: toolHash,
          json: toolJson
        };
      });
      span.setAttribute(
        "tools",
        jsonStringify(
          toolsWithHashes.map(({ name, hash }) => ({ name, hash }))
        )
      );
      span.setAttribute("tools_count", toolsWithHashes.length);
      for (const { name, hash, json } of toolsWithHashes) {
        if (!seenHashes.has(`tool_${hash}`)) {
          seenHashes.add(`tool_${hash}`);
          const { content: truncatedTool, truncated } = truncateContent(json);
          void logOTelEvent("tool", {
            tool_name: sanitizeToolNameForAnalytics(name),
            tool_hash: hash,
            tool: truncatedTool,
            ...truncated && { tool_truncated: "true" }
          });
        }
      }
    } catch {
      span.setAttribute("tools_parse_error", true);
    }
  }
  if (messagesForAPI && messagesForAPI.length > 0 && newContext?.querySource) {
    const querySource = newContext.querySource;
    const lastHash = lastReportedMessageHash.get(querySource);
    let startIndex = 0;
    if (lastHash) {
      for (let i = 0; i < messagesForAPI.length; i++) {
        const msg = messagesForAPI[i];
        if (msg && hashMessage(msg) === lastHash) {
          startIndex = i + 1;
          break;
        }
      }
    }
    const newMessages = messagesForAPI.slice(startIndex).filter((m) => m.type === "user");
    if (newMessages.length > 0) {
      const { contextParts, systemReminders } = formatMessagesForContext(newMessages);
      if (contextParts.length > 0) {
        const fullContext = contextParts.join("\n\n---\n\n");
        const { content: truncatedContext, truncated } = truncateContent(fullContext);
        span.setAttributes({
          new_context: truncatedContext,
          new_context_message_count: newMessages.length,
          ...truncated && {
            new_context_truncated: true,
            new_context_original_length: fullContext.length
          }
        });
      }
      if (systemReminders.length > 0) {
        const fullReminders = systemReminders.join("\n\n---\n\n");
        const { content: truncatedReminders, truncated: remindersTruncated } = truncateContent(fullReminders);
        span.setAttributes({
          system_reminders: truncatedReminders,
          system_reminders_count: systemReminders.length,
          ...remindersTruncated && {
            system_reminders_truncated: true,
            system_reminders_original_length: fullReminders.length
          }
        });
      }
      const lastMessage = messagesForAPI[messagesForAPI.length - 1];
      if (lastMessage) {
        lastReportedMessageHash.set(querySource, hashMessage(lastMessage));
      }
    }
  }
}
function addBetaLLMResponseAttributes(endAttributes, metadata) {
  if (!isBetaTracingEnabled() || !metadata) {
    return;
  }
  if (metadata.modelOutput !== void 0) {
    const { content: modelOutput, truncated: outputTruncated } = truncateContent(metadata.modelOutput);
    endAttributes["response.model_output"] = modelOutput;
    if (outputTruncated) {
      endAttributes["response.model_output_truncated"] = true;
      endAttributes["response.model_output_original_length"] = metadata.modelOutput.length;
    }
  }
  if (process.env.USER_TYPE === "ant" && metadata.thinkingOutput !== void 0) {
    const { content: thinkingOutput, truncated: thinkingTruncated } = truncateContent(metadata.thinkingOutput);
    endAttributes["response.thinking_output"] = thinkingOutput;
    if (thinkingTruncated) {
      endAttributes["response.thinking_output_truncated"] = true;
      endAttributes["response.thinking_output_original_length"] = metadata.thinkingOutput.length;
    }
  }
}
function addBetaToolInputAttributes(span, toolName, toolInput) {
  if (!isBetaTracingEnabled()) {
    return;
  }
  const { content: truncatedInput, truncated } = truncateContent(
    `[TOOL INPUT: ${toolName}]
${toolInput}`
  );
  span.setAttributes({
    tool_input: truncatedInput,
    ...truncated && {
      tool_input_truncated: true,
      tool_input_original_length: toolInput.length
    }
  });
}
function addBetaToolResultAttributes(endAttributes, toolName, toolResult) {
  if (!isBetaTracingEnabled()) {
    return;
  }
  const { content: truncatedResult, truncated } = truncateContent(
    `[TOOL RESULT: ${toolName}]
${toolResult}`
  );
  endAttributes["new_context"] = truncatedResult;
  if (truncated) {
    endAttributes["new_context_truncated"] = true;
    endAttributes["new_context_original_length"] = toolResult.length;
  }
}
export {
  addBetaInteractionAttributes,
  addBetaLLMRequestAttributes,
  addBetaLLMResponseAttributes,
  addBetaToolInputAttributes,
  addBetaToolResultAttributes,
  clearBetaTracingState,
  isBetaTracingEnabled,
  truncateContent
};
