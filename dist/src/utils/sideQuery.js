import {
  getLastApiCompletionTimestamp,
  setLastApiCompletionTimestamp
} from "../bootstrap/state.js";
import { STRUCTURED_OUTPUTS_BETA_HEADER } from "../constants/betas.js";
import {
  getAttributionHeader,
  getCLISyspromptPrefix
} from "../constants/system.js";
import { logEvent } from "../services/analytics/index.js";
import { getAPIMetadata } from "../services/api/claude.js";
import { getAnthropicClient } from "../services/api/client.js";
import { getModelBetas, modelSupportsStructuredOutputs } from "./betas.js";
import { computeFingerprint } from "./fingerprint.js";
import { normalizeModelStringForAPI } from "./model/model.js";
function extractFirstUserMessageText(messages) {
  const firstUserMessage = messages.find((m) => m.role === "user");
  if (!firstUserMessage) return "";
  const content = firstUserMessage.content;
  if (typeof content === "string") return content;
  const textBlock = content.find((block) => block.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}
async function sideQuery(opts) {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    output_format,
    max_tokens = 1024,
    maxRetries = 2,
    signal,
    skipSystemPromptPrefix,
    temperature,
    thinking,
    stop_sequences
  } = opts;
  const client = await getAnthropicClient({
    maxRetries,
    model,
    source: "side_query"
  });
  const betas = [...getModelBetas(model)];
  if (output_format && modelSupportsStructuredOutputs(model) && !betas.includes(STRUCTURED_OUTPUTS_BETA_HEADER)) {
    betas.push(STRUCTURED_OUTPUTS_BETA_HEADER);
  }
  const messageText = extractFirstUserMessageText(messages);
  const fingerprint = computeFingerprint(messageText, "0.0.0");
  const attributionHeader = getAttributionHeader(fingerprint);
  const systemBlocks = [
    attributionHeader ? { type: "text", text: attributionHeader } : null,
    // Skip CLI system prompt prefix for internal classifiers that provide their own prompt
    ...skipSystemPromptPrefix ? [] : [
      {
        type: "text",
        text: getCLISyspromptPrefix({
          isNonInteractive: false,
          hasAppendSystemPrompt: false
        })
      }
    ],
    ...Array.isArray(system) ? system : system ? [{ type: "text", text: system }] : []
  ].filter((block) => block !== null);
  let thinkingConfig;
  if (thinking === false) {
    thinkingConfig = { type: "disabled" };
  } else if (thinking !== void 0) {
    thinkingConfig = {
      type: "enabled",
      budget_tokens: Math.min(thinking, max_tokens - 1)
    };
  }
  const normalizedModel = normalizeModelStringForAPI(model);
  const start = Date.now();
  const response = await client.beta.messages.create(
    {
      model: normalizedModel,
      max_tokens,
      system: systemBlocks,
      messages,
      ...tools && { tools },
      ...tool_choice && { tool_choice },
      ...output_format && { output_config: { format: output_format } },
      ...temperature !== void 0 && { temperature },
      ...stop_sequences && { stop_sequences },
      ...thinkingConfig && { thinking: thinkingConfig },
      ...betas.length > 0 && { betas },
      metadata: getAPIMetadata()
    },
    { signal }
  );
  const requestId = response._request_id ?? void 0;
  const now = Date.now();
  const lastCompletion = getLastApiCompletionTimestamp();
  logEvent("tengu_api_success", {
    requestId,
    querySource: opts.querySource,
    model: normalizedModel,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
    uncachedInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs: lastCompletion !== null ? now - lastCompletion : void 0
  });
  setLastApiCompletionTimestamp(now);
  return response;
}
export {
  sideQuery
};
