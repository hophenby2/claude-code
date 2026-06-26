import { roughTokenCountEstimationForMessages } from "../services/tokenEstimation.js";
import { SYNTHETIC_MESSAGES, SYNTHETIC_MODEL } from "./messages.js";
import { jsonStringify } from "./slowOperations.js";
function getTokenUsage(message) {
  if (message?.type === "assistant" && "usage" in message.message && !(message.message.content[0]?.type === "text" && SYNTHETIC_MESSAGES.has(message.message.content[0].text)) && message.message.model !== SYNTHETIC_MODEL) {
    return message.message.usage;
  }
  return void 0;
}
function getAssistantMessageId(message) {
  if (message?.type === "assistant" && "id" in message.message && message.message.model !== SYNTHETIC_MODEL) {
    return message.message.id;
  }
  return void 0;
}
function getTokenCountFromUsage(usage) {
  return usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + usage.output_tokens;
}
function tokenCountFromLastAPIResponse(messages) {
  let i = messages.length - 1;
  while (i >= 0) {
    const message = messages[i];
    const usage = message ? getTokenUsage(message) : void 0;
    if (usage) {
      return getTokenCountFromUsage(usage);
    }
    i--;
  }
  return 0;
}
function finalContextTokensFromLastResponse(messages) {
  let i = messages.length - 1;
  while (i >= 0) {
    const message = messages[i];
    const usage = message ? getTokenUsage(message) : void 0;
    if (usage) {
      const iterations = usage.iterations;
      if (iterations && iterations.length > 0) {
        const last = iterations.at(-1);
        return last.input_tokens + last.output_tokens;
      }
      return usage.input_tokens + usage.output_tokens;
    }
    i--;
  }
  return 0;
}
function messageTokenCountFromLastAPIResponse(messages) {
  let i = messages.length - 1;
  while (i >= 0) {
    const message = messages[i];
    const usage = message ? getTokenUsage(message) : void 0;
    if (usage) {
      return usage.output_tokens;
    }
    i--;
  }
  return 0;
}
function getCurrentUsage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const usage = message ? getTokenUsage(message) : void 0;
    if (usage) {
      return {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0
      };
    }
  }
  return null;
}
function doesMostRecentAssistantMessageExceed200k(messages) {
  const THRESHOLD = 2e5;
  const lastAsst = messages.findLast((m) => m.type === "assistant");
  if (!lastAsst) return false;
  const usage = getTokenUsage(lastAsst);
  return usage ? getTokenCountFromUsage(usage) > THRESHOLD : false;
}
function getAssistantMessageContentLength(message) {
  let contentLength = 0;
  for (const block of message.message.content) {
    if (block.type === "text") {
      contentLength += block.text.length;
    } else if (block.type === "thinking") {
      contentLength += block.thinking.length;
    } else if (block.type === "redacted_thinking") {
      contentLength += block.data.length;
    } else if (block.type === "tool_use") {
      contentLength += jsonStringify(block.input).length;
    }
  }
  return contentLength;
}
function tokenCountWithEstimation(messages) {
  let i = messages.length - 1;
  while (i >= 0) {
    const message = messages[i];
    const usage = message ? getTokenUsage(message) : void 0;
    if (message && usage) {
      const responseId = getAssistantMessageId(message);
      if (responseId) {
        let j = i - 1;
        while (j >= 0) {
          const prior = messages[j];
          const priorId = prior ? getAssistantMessageId(prior) : void 0;
          if (priorId === responseId) {
            i = j;
          } else if (priorId !== void 0) {
            break;
          }
          j--;
        }
      }
      return getTokenCountFromUsage(usage) + roughTokenCountEstimationForMessages(messages.slice(i + 1));
    }
    i--;
  }
  return roughTokenCountEstimationForMessages(messages);
}
export {
  doesMostRecentAssistantMessageExceed200k,
  finalContextTokensFromLastResponse,
  getAssistantMessageContentLength,
  getCurrentUsage,
  getTokenCountFromUsage,
  getTokenUsage,
  messageTokenCountFromLastAPIResponse,
  tokenCountFromLastAPIResponse,
  tokenCountWithEstimation
};
