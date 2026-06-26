import { getSystemPrompt } from "../constants/prompts.js";
import { getSystemContext, getUserContext } from "../context.js";
import { createAbortController } from "./abortController.js";
import { getMainLoopModel } from "./model/model.js";
import { asSystemPrompt } from "./systemPromptType.js";
import {
  shouldEnableThinkingByDefault
} from "./thinking.js";
async function fetchSystemPromptParts({
  tools,
  mainLoopModel,
  additionalWorkingDirectories,
  mcpClients,
  customSystemPrompt
}) {
  const [defaultSystemPrompt, userContext, systemContext] = await Promise.all([
    customSystemPrompt !== void 0 ? Promise.resolve([]) : getSystemPrompt(
      tools,
      mainLoopModel,
      additionalWorkingDirectories,
      mcpClients
    ),
    getUserContext(),
    customSystemPrompt !== void 0 ? Promise.resolve({}) : getSystemContext()
  ]);
  return { defaultSystemPrompt, userContext, systemContext };
}
async function buildSideQuestionFallbackParams({
  tools,
  commands,
  mcpClients,
  messages,
  readFileState,
  getAppState,
  setAppState,
  customSystemPrompt,
  appendSystemPrompt,
  thinkingConfig,
  agents
}) {
  const mainLoopModel = getMainLoopModel();
  const appState = getAppState();
  const { defaultSystemPrompt, userContext, systemContext } = await fetchSystemPromptParts({
    tools,
    mainLoopModel,
    additionalWorkingDirectories: Array.from(
      appState.toolPermissionContext.additionalWorkingDirectories.keys()
    ),
    mcpClients,
    customSystemPrompt
  });
  const systemPrompt = asSystemPrompt([
    ...customSystemPrompt !== void 0 ? [customSystemPrompt] : defaultSystemPrompt,
    ...appendSystemPrompt ? [appendSystemPrompt] : []
  ]);
  const last = messages.at(-1);
  const forkContextMessages = last?.type === "assistant" && last.message.stop_reason === null ? messages.slice(0, -1) : messages;
  const toolUseContext = {
    options: {
      commands,
      debug: false,
      mainLoopModel,
      tools,
      verbose: false,
      thinkingConfig: thinkingConfig ?? (shouldEnableThinkingByDefault() !== false ? { type: "adaptive" } : { type: "disabled" }),
      mcpClients,
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: agents, allAgents: [] },
      customSystemPrompt,
      appendSystemPrompt
    },
    abortController: createAbortController(),
    readFileState,
    getAppState,
    setAppState,
    messages: forkContextMessages,
    setInProgressToolUseIDs: () => {
    },
    setResponseLength: () => {
    },
    updateFileHistoryState: () => {
    },
    updateAttributionState: () => {
    }
  };
  return {
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext,
    forkContextMessages
  };
}
export {
  buildSideQuestionFallbackParams,
  fetchSystemPromptParts
};
