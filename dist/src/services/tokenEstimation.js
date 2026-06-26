import { getAPIProvider } from "../utils/model/providers.js";
import { VERTEX_COUNT_TOKENS_ALLOWED_BETAS } from "../constants/betas.js";
import { getModelBetas } from "../utils/betas.js";
import { getVertexRegionForModel, isEnvTruthy } from "../utils/envUtils.js";
import { logError } from "../utils/log.js";
import { normalizeAttachmentForAPI } from "../utils/messages.js";
import {
  createBedrockRuntimeClient,
  getInferenceProfileBackingModel,
  isFoundationModel
} from "../utils/model/bedrock.js";
import {
  getDefaultSonnetModel,
  getMainLoopModel,
  getSmallFastModel,
  normalizeModelStringForAPI
} from "../utils/model/model.js";
import { jsonStringify } from "../utils/slowOperations.js";
import { isToolReferenceBlock } from "../utils/toolSearch.js";
import { getAPIMetadata, getExtraBodyParams } from "./api/claude.js";
import { getAnthropicClient } from "./api/client.js";
import { withTokenCountVCR } from "./vcr.js";
const TOKEN_COUNT_THINKING_BUDGET = 1024;
const TOKEN_COUNT_MAX_TOKENS = 2048;
function hasThinkingBlocks(messages) {
  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (typeof block === "object" && block !== null && "type" in block && (block.type === "thinking" || block.type === "redacted_thinking")) {
          return true;
        }
      }
    }
  }
  return false;
}
function stripToolSearchFieldsFromMessages(messages) {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) {
      return message;
    }
    const normalizedContent = message.content.map((block) => {
      if (block.type === "tool_use") {
        const toolUse = block;
        return {
          type: "tool_use",
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input
        };
      }
      if (block.type === "tool_result") {
        const toolResult = block;
        if (Array.isArray(toolResult.content)) {
          const filteredContent = toolResult.content.filter(
            (c) => !isToolReferenceBlock(c)
          );
          if (filteredContent.length === 0) {
            return {
              ...toolResult,
              content: [{ type: "text", text: "[tool references]" }]
            };
          }
          if (filteredContent.length !== toolResult.content.length) {
            return {
              ...toolResult,
              content: filteredContent
            };
          }
        }
      }
      return block;
    });
    return {
      ...message,
      content: normalizedContent
    };
  });
}
async function countTokensWithAPI(content) {
  if (!content) {
    return 0;
  }
  const message = {
    role: "user",
    content
  };
  return countMessagesTokensWithAPI([message], []);
}
async function countMessagesTokensWithAPI(messages, tools) {
  return withTokenCountVCR(messages, tools, async () => {
    try {
      const model = getMainLoopModel();
      const betas = getModelBetas(model);
      const containsThinking = hasThinkingBlocks(messages);
      if (getAPIProvider() === "bedrock") {
        return countTokensWithBedrock({
          model: normalizeModelStringForAPI(model),
          messages,
          tools,
          betas,
          containsThinking
        });
      }
      const anthropic = await getAnthropicClient({
        maxRetries: 1,
        model,
        source: "count_tokens"
      });
      const filteredBetas = getAPIProvider() === "vertex" ? betas.filter((b) => VERTEX_COUNT_TOKENS_ALLOWED_BETAS.has(b)) : betas;
      const response = await anthropic.beta.messages.countTokens({
        model: normalizeModelStringForAPI(model),
        messages: (
          // When we pass tools and no messages, we need to pass a dummy message
          // to get an accurate tool token count.
          messages.length > 0 ? messages : [{ role: "user", content: "foo" }]
        ),
        tools,
        ...filteredBetas.length > 0 && { betas: filteredBetas },
        // Enable thinking if messages contain thinking blocks
        ...containsThinking && {
          thinking: {
            type: "enabled",
            budget_tokens: TOKEN_COUNT_THINKING_BUDGET
          }
        }
      });
      if (typeof response.input_tokens !== "number") {
        return null;
      }
      return response.input_tokens;
    } catch (error) {
      logError(error);
      return null;
    }
  });
}
function roughTokenCountEstimation(content, bytesPerToken = 4) {
  return Math.round(content.length / bytesPerToken);
}
function bytesPerTokenForFileType(fileExtension) {
  switch (fileExtension) {
    case "json":
    case "jsonl":
    case "jsonc":
      return 2;
    default:
      return 4;
  }
}
function roughTokenCountEstimationForFileType(content, fileExtension) {
  return roughTokenCountEstimation(
    content,
    bytesPerTokenForFileType(fileExtension)
  );
}
async function countTokensViaHaikuFallback(messages, tools) {
  const containsThinking = hasThinkingBlocks(messages);
  const isVertexGlobalEndpoint = isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) && getVertexRegionForModel(getSmallFastModel()) === "global";
  const isBedrockWithThinking = isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) && containsThinking;
  const isVertexWithThinking = isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) && containsThinking;
  const model = isVertexGlobalEndpoint || isBedrockWithThinking || isVertexWithThinking ? getDefaultSonnetModel() : getSmallFastModel();
  const anthropic = await getAnthropicClient({
    maxRetries: 1,
    model,
    source: "count_tokens"
  });
  const normalizedMessages = stripToolSearchFieldsFromMessages(messages);
  const messagesToSend = normalizedMessages.length > 0 ? normalizedMessages : [{ role: "user", content: "count" }];
  const betas = getModelBetas(model);
  const filteredBetas = getAPIProvider() === "vertex" ? betas.filter((b) => VERTEX_COUNT_TOKENS_ALLOWED_BETAS.has(b)) : betas;
  const response = await anthropic.beta.messages.create({
    model: normalizeModelStringForAPI(model),
    max_tokens: containsThinking ? TOKEN_COUNT_MAX_TOKENS : 1,
    messages: messagesToSend,
    tools: tools.length > 0 ? tools : void 0,
    ...filteredBetas.length > 0 && { betas: filteredBetas },
    metadata: getAPIMetadata(),
    ...getExtraBodyParams(),
    // Enable thinking if messages contain thinking blocks
    ...containsThinking && {
      thinking: {
        type: "enabled",
        budget_tokens: TOKEN_COUNT_THINKING_BUDGET
      }
    }
  });
  const usage = response.usage;
  const inputTokens = usage.input_tokens;
  const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  return inputTokens + cacheCreationTokens + cacheReadTokens;
}
function roughTokenCountEstimationForMessages(messages) {
  let totalTokens = 0;
  for (const message of messages) {
    totalTokens += roughTokenCountEstimationForMessage(message);
  }
  return totalTokens;
}
function roughTokenCountEstimationForMessage(message) {
  if ((message.type === "assistant" || message.type === "user") && message.message?.content) {
    return roughTokenCountEstimationForContent(
      message.message?.content
    );
  }
  if (message.type === "attachment" && message.attachment) {
    const userMessages = normalizeAttachmentForAPI(message.attachment);
    let total = 0;
    for (const userMsg of userMessages) {
      total += roughTokenCountEstimationForContent(userMsg.message.content);
    }
    return total;
  }
  return 0;
}
function roughTokenCountEstimationForContent(content) {
  if (!content) {
    return 0;
  }
  if (typeof content === "string") {
    return roughTokenCountEstimation(content);
  }
  let totalTokens = 0;
  for (const block of content) {
    totalTokens += roughTokenCountEstimationForBlock(block);
  }
  return totalTokens;
}
function roughTokenCountEstimationForBlock(block) {
  if (typeof block === "string") {
    return roughTokenCountEstimation(block);
  }
  if (block.type === "text") {
    return roughTokenCountEstimation(block.text);
  }
  if (block.type === "image" || block.type === "document") {
    return 2e3;
  }
  if (block.type === "tool_result") {
    return roughTokenCountEstimationForContent(block.content);
  }
  if (block.type === "tool_use") {
    return roughTokenCountEstimation(
      block.name + jsonStringify(block.input ?? {})
    );
  }
  if (block.type === "thinking") {
    return roughTokenCountEstimation(block.thinking);
  }
  if (block.type === "redacted_thinking") {
    return roughTokenCountEstimation(block.data);
  }
  return roughTokenCountEstimation(jsonStringify(block));
}
async function countTokensWithBedrock({
  model,
  messages,
  tools,
  betas,
  containsThinking
}) {
  try {
    const client = await createBedrockRuntimeClient();
    const modelId = isFoundationModel(model) ? model : await getInferenceProfileBackingModel(model);
    if (!modelId) {
      return null;
    }
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      // When we pass tools and no messages, we need to pass a dummy message
      // to get an accurate tool token count.
      messages: messages.length > 0 ? messages : [{ role: "user", content: "foo" }],
      max_tokens: containsThinking ? TOKEN_COUNT_MAX_TOKENS : 1,
      ...tools.length > 0 && { tools },
      ...betas.length > 0 && { anthropic_beta: betas },
      ...containsThinking && {
        thinking: {
          type: "enabled",
          budget_tokens: TOKEN_COUNT_THINKING_BUDGET
        }
      }
    };
    const { CountTokensCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const input = {
      modelId,
      input: {
        invokeModel: {
          body: new TextEncoder().encode(jsonStringify(requestBody))
        }
      }
    };
    const response = await client.send(new CountTokensCommand(input));
    const tokenCount = response.inputTokens ?? null;
    return tokenCount;
  } catch (error) {
    logError(error);
    return null;
  }
}
export {
  bytesPerTokenForFileType,
  countMessagesTokensWithAPI,
  countTokensViaHaikuFallback,
  countTokensWithAPI,
  roughTokenCountEstimation,
  roughTokenCountEstimationForFileType,
  roughTokenCountEstimationForMessage,
  roughTokenCountEstimationForMessages
};
