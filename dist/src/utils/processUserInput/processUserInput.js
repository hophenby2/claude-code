const feature = (_name) => false;
import { randomUUID } from "crypto";
import { logEvent } from "../../services/analytics/index.js";
import { getContentText } from "../messages.js";
import {
  findCommand,
  getCommandName,
  isBridgeSafeCommand
} from "../../commands.js";
import {
  isValidImagePaste
} from "../../types/textInputTypes.js";
import {
  createAttachmentMessage,
  getAttachmentMessages
} from "../attachments.js";
import { toArray } from "../generators.js";
import {
  executeUserPromptSubmitHooks,
  getUserPromptSubmitHookBlockingMessage
} from "../hooks.js";
import {
  createImageMetadataText,
  maybeResizeAndDownsampleImageBlock
} from "../imageResizer.js";
import { storeImages } from "../imageStore.js";
import {
  createCommandInputMessage,
  createSystemMessage,
  createUserMessage
} from "../messages.js";
import { queryCheckpoint } from "../queryProfiler.js";
import { parseSlashCommand } from "../slashCommandParsing.js";
import "../ultraplan/keyword.js";
import { processTextPrompt } from "./processTextPrompt.js";
async function processUserInput({
  input,
  preExpansionInput,
  mode,
  setToolJSX,
  context,
  pastedContents,
  ideSelection,
  messages,
  setUserInputOnProcessing,
  uuid,
  isAlreadyProcessing,
  querySource,
  canUseTool,
  skipSlashCommands,
  bridgeOrigin,
  isMeta,
  skipAttachments
}) {
  const inputString = typeof input === "string" ? input : null;
  if (mode === "prompt" && inputString !== null && !isMeta) {
    setUserInputOnProcessing?.(inputString);
  }
  queryCheckpoint("query_process_user_input_base_start");
  const appState = context.getAppState();
  const result = await processUserInputBase(
    input,
    mode,
    setToolJSX,
    context,
    pastedContents,
    ideSelection,
    messages,
    uuid,
    isAlreadyProcessing,
    querySource,
    canUseTool,
    appState.toolPermissionContext.mode,
    skipSlashCommands,
    bridgeOrigin,
    isMeta,
    skipAttachments,
    preExpansionInput
  );
  queryCheckpoint("query_process_user_input_base_end");
  if (!result.shouldQuery) {
    return result;
  }
  queryCheckpoint("query_hooks_start");
  const inputMessage = getContentText(input) || "";
  for await (const hookResult of executeUserPromptSubmitHooks(
    inputMessage,
    appState.toolPermissionContext.mode,
    context,
    context.requestPrompt
  )) {
    if (hookResult.message?.type === "progress") {
      continue;
    }
    if (hookResult.blockingError) {
      const blockingMessage = getUserPromptSubmitHookBlockingMessage(
        hookResult.blockingError
      );
      return {
        messages: [
          // TODO: Make this an attachment message
          createSystemMessage(
            `${blockingMessage}

Original prompt: ${input}`,
            "warning"
          )
        ],
        shouldQuery: false,
        allowedTools: result.allowedTools
      };
    }
    if (hookResult.preventContinuation) {
      const message = hookResult.stopReason ? `Operation stopped by hook: ${hookResult.stopReason}` : "Operation stopped by hook";
      result.messages.push(
        createUserMessage({
          content: message
        })
      );
      result.shouldQuery = false;
      return result;
    }
    if (hookResult.additionalContexts && hookResult.additionalContexts.length > 0) {
      result.messages.push(
        createAttachmentMessage({
          type: "hook_additional_context",
          content: hookResult.additionalContexts.map(applyTruncation),
          hookName: "UserPromptSubmit",
          toolUseID: `hook-${randomUUID()}`,
          hookEvent: "UserPromptSubmit"
        })
      );
    }
    if (hookResult.message) {
      switch (hookResult.message.attachment.type) {
        case "hook_success":
          if (!hookResult.message.attachment.content) {
            break;
          }
          result.messages.push({
            ...hookResult.message,
            attachment: {
              ...hookResult.message.attachment,
              content: applyTruncation(hookResult.message.attachment.content)
            }
          });
          break;
        default:
          result.messages.push(hookResult.message);
          break;
      }
    }
  }
  queryCheckpoint("query_hooks_end");
  return result;
}
const MAX_HOOK_OUTPUT_LENGTH = 1e4;
function applyTruncation(content) {
  if (content.length > MAX_HOOK_OUTPUT_LENGTH) {
    return `${content.substring(0, MAX_HOOK_OUTPUT_LENGTH)}\u2026 [output truncated - exceeded ${MAX_HOOK_OUTPUT_LENGTH} characters]`;
  }
  return content;
}
async function processUserInputBase(input, mode, setToolJSX, context, pastedContents, ideSelection, messages, uuid, isAlreadyProcessing, querySource, canUseTool, permissionMode, skipSlashCommands, bridgeOrigin, isMeta, skipAttachments, preExpansionInput) {
  let inputString = null;
  let precedingInputBlocks = [];
  const imageMetadataTexts = [];
  let normalizedInput = input;
  if (typeof input === "string") {
    inputString = input;
  } else if (input.length > 0) {
    queryCheckpoint("query_image_processing_start");
    const processedBlocks = [];
    for (const block of input) {
      if (block.type === "image") {
        const resized = await maybeResizeAndDownsampleImageBlock(block);
        if (resized.dimensions) {
          const metadataText = createImageMetadataText(resized.dimensions);
          if (metadataText) {
            imageMetadataTexts.push(metadataText);
          }
        }
        processedBlocks.push(resized.block);
      } else {
        processedBlocks.push(block);
      }
    }
    normalizedInput = processedBlocks;
    queryCheckpoint("query_image_processing_end");
    const lastBlock = processedBlocks[processedBlocks.length - 1];
    if (lastBlock?.type === "text") {
      inputString = lastBlock.text;
      precedingInputBlocks = processedBlocks.slice(0, -1);
    } else {
      precedingInputBlocks = processedBlocks;
    }
  }
  if (inputString === null && mode !== "prompt") {
    throw new Error(`Mode: ${mode} requires a string input.`);
  }
  const imageContents = pastedContents ? Object.values(pastedContents).filter(isValidImagePaste) : [];
  const imagePasteIds = imageContents.map((img) => img.id);
  const storedImagePaths = pastedContents ? await storeImages(pastedContents) : /* @__PURE__ */ new Map();
  queryCheckpoint("query_pasted_image_processing_start");
  const imageProcessingResults = await Promise.all(
    imageContents.map(async (pastedImage) => {
      const imageBlock = {
        type: "image",
        source: {
          type: "base64",
          media_type: pastedImage.mediaType || "image/png",
          data: pastedImage.content
        }
      };
      logEvent("tengu_pasted_image_resize_attempt", {
        original_size_bytes: pastedImage.content.length
      });
      const resized = await maybeResizeAndDownsampleImageBlock(imageBlock);
      return {
        resized,
        originalDimensions: pastedImage.dimensions,
        sourcePath: pastedImage.sourcePath ?? storedImagePaths.get(pastedImage.id)
      };
    })
  );
  const imageContentBlocks = [];
  for (const {
    resized,
    originalDimensions,
    sourcePath
  } of imageProcessingResults) {
    if (resized.dimensions) {
      const metadataText = createImageMetadataText(
        resized.dimensions,
        sourcePath
      );
      if (metadataText) {
        imageMetadataTexts.push(metadataText);
      }
    } else if (originalDimensions) {
      const metadataText = createImageMetadataText(
        originalDimensions,
        sourcePath
      );
      if (metadataText) {
        imageMetadataTexts.push(metadataText);
      }
    } else if (sourcePath) {
      imageMetadataTexts.push(`[Image source: ${sourcePath}]`);
    }
    imageContentBlocks.push(resized.block);
  }
  queryCheckpoint("query_pasted_image_processing_end");
  let effectiveSkipSlash = skipSlashCommands;
  if (bridgeOrigin && inputString !== null && inputString.startsWith("/")) {
    const parsed = parseSlashCommand(inputString);
    const cmd = parsed ? findCommand(parsed.commandName, context.options.commands) : void 0;
    if (cmd) {
      if (isBridgeSafeCommand(cmd)) {
        effectiveSkipSlash = false;
      } else {
        const msg = `/${getCommandName(cmd)} isn't available over Remote Control.`;
        return {
          messages: [
            createUserMessage({ content: inputString, uuid }),
            createCommandInputMessage(
              `<local-command-stdout>${msg}</local-command-stdout>`
            )
          ],
          shouldQuery: false,
          resultText: msg
        };
      }
    }
  }
  if (false) {
    logEvent("tengu_ultraplan_keyword", {});
    const rewritten = replaceUltraplanKeyword(inputString).trim();
    const { processSlashCommand } = await null;
    const slashResult = await processSlashCommand(
      `/ultraplan ${rewritten}`,
      precedingInputBlocks,
      imageContentBlocks,
      [],
      context,
      setToolJSX,
      uuid,
      isAlreadyProcessing,
      canUseTool
    );
    return addImageMetadataMessage(slashResult, imageMetadataTexts);
  }
  const shouldExtractAttachments = !skipAttachments && inputString !== null && (mode !== "prompt" || effectiveSkipSlash || !inputString.startsWith("/"));
  queryCheckpoint("query_attachment_loading_start");
  const attachmentMessages = shouldExtractAttachments ? await toArray(
    getAttachmentMessages(
      inputString,
      context,
      ideSelection ?? null,
      [],
      // queuedCommands - handled by query.ts for mid-turn attachments
      messages,
      querySource
    )
  ) : [];
  queryCheckpoint("query_attachment_loading_end");
  if (inputString !== null && mode === "bash") {
    const { processBashCommand } = await import("./processBashCommand.js");
    return addImageMetadataMessage(
      await processBashCommand(
        inputString,
        precedingInputBlocks,
        attachmentMessages,
        context,
        setToolJSX
      ),
      imageMetadataTexts
    );
  }
  if (inputString !== null && !effectiveSkipSlash && inputString.startsWith("/")) {
    const { processSlashCommand } = await import("./processSlashCommand.js");
    const slashResult = await processSlashCommand(
      inputString,
      precedingInputBlocks,
      imageContentBlocks,
      attachmentMessages,
      context,
      setToolJSX,
      uuid,
      isAlreadyProcessing,
      canUseTool
    );
    return addImageMetadataMessage(slashResult, imageMetadataTexts);
  }
  if (inputString !== null && mode === "prompt") {
    const trimmedInput = inputString.trim();
    const agentMention = attachmentMessages.find(
      (m) => m.attachment.type === "agent_mention"
    );
    if (agentMention) {
      const agentMentionString = `@agent-${agentMention.attachment.agentType}`;
      const isSubagentOnly = trimmedInput === agentMentionString;
      const isPrefix = trimmedInput.startsWith(agentMentionString) && !isSubagentOnly;
      logEvent("tengu_subagent_at_mention", {
        is_subagent_only: isSubagentOnly,
        is_prefix: isPrefix
      });
    }
  }
  return addImageMetadataMessage(
    processTextPrompt(
      normalizedInput,
      imageContentBlocks,
      imagePasteIds,
      attachmentMessages,
      uuid,
      permissionMode,
      isMeta
    ),
    imageMetadataTexts
  );
}
function addImageMetadataMessage(result, imageMetadataTexts) {
  if (imageMetadataTexts.length > 0) {
    result.messages.push(
      createUserMessage({
        content: imageMetadataTexts.map((text) => ({ type: "text", text })),
        isMeta: true
      })
    );
  }
  return result;
}
export {
  processUserInput
};
