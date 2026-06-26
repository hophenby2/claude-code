import { randomUUID } from "crypto";
import { setPromptId } from "../../bootstrap/state.js";
import { logEvent } from "../../services/analytics/index.js";
import { createUserMessage } from "../messages.js";
import { logOTelEvent, redactIfDisabled } from "../telemetry/events.js";
import { startInteractionSpan } from "../telemetry/sessionTracing.js";
import {
  matchesKeepGoingKeyword,
  matchesNegativeKeyword
} from "../userPromptKeywords.js";
function processTextPrompt(input, imageContentBlocks, imagePasteIds, attachmentMessages, uuid, permissionMode, isMeta) {
  const promptId = randomUUID();
  setPromptId(promptId);
  const userPromptText = typeof input === "string" ? input : input.find((block) => block.type === "text")?.text || "";
  startInteractionSpan(userPromptText);
  const otelPromptText = typeof input === "string" ? input : input.findLast((block) => block.type === "text")?.text || "";
  if (otelPromptText) {
    void logOTelEvent("user_prompt", {
      prompt_length: String(otelPromptText.length),
      prompt: redactIfDisabled(otelPromptText),
      "prompt.id": promptId
    });
  }
  const isNegative = matchesNegativeKeyword(userPromptText);
  const isKeepGoing = matchesKeepGoingKeyword(userPromptText);
  logEvent("tengu_input_prompt", {
    is_negative: isNegative,
    is_keep_going: isKeepGoing
  });
  if (imageContentBlocks.length > 0) {
    const textContent = typeof input === "string" ? input.trim() ? [{ type: "text", text: input }] : [] : input;
    const userMessage2 = createUserMessage({
      content: [...textContent, ...imageContentBlocks],
      uuid,
      imagePasteIds: imagePasteIds.length > 0 ? imagePasteIds : void 0,
      permissionMode,
      isMeta: isMeta || void 0
    });
    return {
      messages: [userMessage2, ...attachmentMessages],
      shouldQuery: true
    };
  }
  const userMessage = createUserMessage({
    content: input,
    uuid,
    permissionMode,
    isMeta: isMeta || void 0
  });
  return {
    messages: [userMessage, ...attachmentMessages],
    shouldQuery: true
  };
}
export {
  processTextPrompt
};
