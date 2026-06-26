const feature = (_name) => false;
import chalk from "chalk";
import { markPostCompaction } from "../../bootstrap/state.js";
import { getSystemPrompt } from "../../constants/prompts.js";
import { getSystemContext, getUserContext } from "../../context.js";
import { getShortcutDisplay } from "../../keybindings/shortcutFormat.js";
import "../../services/api/promptCacheBreakDetection.js";
import {
  compactConversation,
  ERROR_MESSAGE_INCOMPLETE_RESPONSE,
  ERROR_MESSAGE_NOT_ENOUGH_MESSAGES,
  ERROR_MESSAGE_USER_ABORT,
  mergeHookInstructions
} from "../../services/compact/compact.js";
import { suppressCompactWarning } from "../../services/compact/compactWarningState.js";
import { microcompactMessages } from "../../services/compact/microCompact.js";
import { runPostCompactCleanup } from "../../services/compact/postCompactCleanup.js";
import { trySessionMemoryCompaction } from "../../services/compact/sessionMemoryCompact.js";
import { setLastSummarizedMessageId } from "../../services/SessionMemory/sessionMemoryUtils.js";
import { hasExactErrorMessage } from "../../utils/errors.js";
import { executePreCompactHooks } from "../../utils/hooks.js";
import { logError } from "../../utils/log.js";
import { getMessagesAfterCompactBoundary } from "../../utils/messages.js";
import { getUpgradeMessage } from "../../utils/model/contextWindowUpgradeCheck.js";
import {
  buildEffectiveSystemPrompt
} from "../../utils/systemPrompt.js";
const reactiveCompact = false ? null : null;
const call = async (args, context) => {
  const { abortController } = context;
  let { messages } = context;
  messages = getMessagesAfterCompactBoundary(messages);
  if (messages.length === 0) {
    throw new Error("No messages to compact");
  }
  const customInstructions = args.trim();
  try {
    if (!customInstructions) {
      const sessionMemoryResult = await trySessionMemoryCompaction(
        messages,
        context.agentId
      );
      if (sessionMemoryResult) {
        getUserContext.cache.clear?.();
        runPostCompactCleanup();
        if (false) {
          notifyCompaction(
            context.options.querySource ?? "compact",
            context.agentId
          );
        }
        markPostCompaction();
        suppressCompactWarning();
        return {
          type: "compact",
          compactionResult: sessionMemoryResult,
          displayText: buildDisplayText(context)
        };
      }
    }
    if (reactiveCompact?.isReactiveOnlyMode()) {
      return await compactViaReactive(
        messages,
        context,
        customInstructions,
        reactiveCompact
      );
    }
    const microcompactResult = await microcompactMessages(messages, context);
    const messagesForCompact = microcompactResult.messages;
    const result = await compactConversation(
      messagesForCompact,
      context,
      await getCacheSharingParams(context, messagesForCompact),
      false,
      customInstructions,
      false
    );
    setLastSummarizedMessageId(void 0);
    suppressCompactWarning();
    getUserContext.cache.clear?.();
    runPostCompactCleanup();
    return {
      type: "compact",
      compactionResult: result,
      displayText: buildDisplayText(context, result.userDisplayMessage)
    };
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error("Compaction canceled.");
    } else if (hasExactErrorMessage(error, ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)) {
      throw new Error(ERROR_MESSAGE_NOT_ENOUGH_MESSAGES);
    } else if (hasExactErrorMessage(error, ERROR_MESSAGE_INCOMPLETE_RESPONSE)) {
      throw new Error(ERROR_MESSAGE_INCOMPLETE_RESPONSE);
    } else {
      logError(error);
      throw new Error(`Error during compaction: ${error}`);
    }
  }
};
async function compactViaReactive(messages, context, customInstructions, reactive) {
  context.onCompactProgress?.({
    type: "hooks_start",
    hookType: "pre_compact"
  });
  context.setSDKStatus?.("compacting");
  try {
    const [hookResult, cacheSafeParams] = await Promise.all([
      executePreCompactHooks(
        { trigger: "manual", customInstructions: customInstructions || null },
        context.abortController.signal
      ),
      getCacheSharingParams(context, messages)
    ]);
    const mergedInstructions = mergeHookInstructions(
      customInstructions,
      hookResult.newCustomInstructions
    );
    context.setStreamMode?.("requesting");
    context.setResponseLength?.(() => 0);
    context.onCompactProgress?.({ type: "compact_start" });
    const outcome = await reactive.reactiveCompactOnPromptTooLong(
      messages,
      cacheSafeParams,
      { customInstructions: mergedInstructions, trigger: "manual" }
    );
    if (!outcome.ok) {
      switch (outcome.reason) {
        case "too_few_groups":
          throw new Error(ERROR_MESSAGE_NOT_ENOUGH_MESSAGES);
        case "aborted":
          throw new Error(ERROR_MESSAGE_USER_ABORT);
        case "exhausted":
        case "error":
        case "media_unstrippable":
          throw new Error(ERROR_MESSAGE_INCOMPLETE_RESPONSE);
      }
    }
    setLastSummarizedMessageId(void 0);
    runPostCompactCleanup();
    suppressCompactWarning();
    getUserContext.cache.clear?.();
    const combinedMessage = [hookResult.userDisplayMessage, outcome.result.userDisplayMessage].filter(Boolean).join("\n") || void 0;
    return {
      type: "compact",
      compactionResult: {
        ...outcome.result,
        userDisplayMessage: combinedMessage
      },
      displayText: buildDisplayText(context, combinedMessage)
    };
  } finally {
    context.setStreamMode?.("requesting");
    context.setResponseLength?.(() => 0);
    context.onCompactProgress?.({ type: "compact_end" });
    context.setSDKStatus?.(null);
  }
}
function buildDisplayText(context, userDisplayMessage) {
  const upgradeMessage = getUpgradeMessage("tip");
  const expandShortcut = getShortcutDisplay(
    "app:toggleTranscript",
    "Global",
    "ctrl+o"
  );
  const dimmed = [
    ...context.options.verbose ? [] : [`(${expandShortcut} to see full summary)`],
    ...userDisplayMessage ? [userDisplayMessage] : [],
    ...upgradeMessage ? [upgradeMessage] : []
  ];
  return chalk.dim("Compacted " + dimmed.join("\n"));
}
async function getCacheSharingParams(context, forkContextMessages) {
  const appState = context.getAppState();
  const defaultSysPrompt = await getSystemPrompt(
    context.options.tools,
    context.options.mainLoopModel,
    Array.from(
      appState.toolPermissionContext.additionalWorkingDirectories.keys()
    ),
    context.options.mcpClients
  );
  const systemPrompt = buildEffectiveSystemPrompt({
    mainThreadAgentDefinition: void 0,
    toolUseContext: context,
    customSystemPrompt: context.options.customSystemPrompt,
    defaultSystemPrompt: defaultSysPrompt,
    appendSystemPrompt: context.options.appendSystemPrompt
  });
  const [userContext, systemContext] = await Promise.all([
    getUserContext(),
    getSystemContext()
  ]);
  return {
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext: context,
    forkContextMessages
  };
}
export {
  call
};
