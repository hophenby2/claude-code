const feature = (_name) => false;
import {
  logEvent
} from "../services/analytics/index.js";
import { isBuiltInAgent } from "../tools/AgentTool/loadAgentsDir.js";
import "./envUtils.js";
import { asSystemPrompt } from "./systemPromptType.js";
import { asSystemPrompt as asSystemPrompt2 } from "./systemPromptType.js";
const proactiveModule = false ? null : null;
function isProactiveActive_SAFE_TO_CALL_ANYWHERE() {
  return proactiveModule?.isProactiveActive() ?? false;
}
function buildEffectiveSystemPrompt({
  mainThreadAgentDefinition,
  toolUseContext,
  customSystemPrompt,
  defaultSystemPrompt,
  appendSystemPrompt,
  overrideSystemPrompt
}) {
  if (overrideSystemPrompt) {
    return asSystemPrompt([overrideSystemPrompt]);
  }
  if (false) {
    const { getCoordinatorSystemPrompt } = (
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      null
    );
    return asSystemPrompt([
      getCoordinatorSystemPrompt(),
      ...appendSystemPrompt ? [appendSystemPrompt] : []
    ]);
  }
  const agentSystemPrompt = mainThreadAgentDefinition ? isBuiltInAgent(mainThreadAgentDefinition) ? mainThreadAgentDefinition.getSystemPrompt({
    toolUseContext: { options: toolUseContext.options }
  }) : mainThreadAgentDefinition.getSystemPrompt() : void 0;
  if (mainThreadAgentDefinition?.memory) {
    logEvent("tengu_agent_memory_loaded", {
      ...process.env.USER_TYPE === "ant" && {
        agent_type: mainThreadAgentDefinition.agentType
      },
      scope: mainThreadAgentDefinition.memory,
      source: "main-thread"
    });
  }
  if (agentSystemPrompt && false) {
    return asSystemPrompt([
      ...defaultSystemPrompt,
      `
# Custom Agent Instructions
${agentSystemPrompt}`,
      ...appendSystemPrompt ? [appendSystemPrompt] : []
    ]);
  }
  return asSystemPrompt([
    ...agentSystemPrompt ? [agentSystemPrompt] : customSystemPrompt ? [customSystemPrompt] : defaultSystemPrompt,
    ...appendSystemPrompt ? [appendSystemPrompt] : []
  ]);
}
export {
  asSystemPrompt2 as asSystemPrompt,
  buildEffectiveSystemPrompt
};
