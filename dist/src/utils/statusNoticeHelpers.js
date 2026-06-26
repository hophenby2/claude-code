import { roughTokenCountEstimation } from "../services/tokenEstimation.js";
const AGENT_DESCRIPTIONS_THRESHOLD = 15e3;
function getAgentDescriptionsTotalTokens(agentDefinitions) {
  if (!agentDefinitions) return 0;
  return agentDefinitions.activeAgents.filter((a) => a.source !== "built-in").reduce((total, agent) => {
    const description = `${agent.agentType}: ${agent.whenToUse}`;
    return total + roughTokenCountEstimation(description);
  }, 0);
}
export {
  AGENT_DESCRIPTIONS_THRESHOLD,
  getAgentDescriptionsTotalTokens
};
