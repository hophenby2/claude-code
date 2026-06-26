import { getDefaultSubagentModel } from "../../utils/model/agent.js";
import {
  getSourceDisplayName
} from "../../utils/settings/constants.js";
const AGENT_SOURCE_GROUPS = [
  { label: "User agents", source: "userSettings" },
  { label: "Project agents", source: "projectSettings" },
  { label: "Local agents", source: "localSettings" },
  { label: "Managed agents", source: "policySettings" },
  { label: "Plugin agents", source: "plugin" },
  { label: "CLI arg agents", source: "flagSettings" },
  { label: "Built-in agents", source: "built-in" }
];
function resolveAgentOverrides(allAgents, activeAgents) {
  const activeMap = /* @__PURE__ */ new Map();
  for (const agent of activeAgents) {
    activeMap.set(agent.agentType, agent);
  }
  const seen = /* @__PURE__ */ new Set();
  const resolved = [];
  for (const agent of allAgents) {
    const key = `${agent.agentType}:${agent.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const active = activeMap.get(agent.agentType);
    const overriddenBy = active && active.source !== agent.source ? active.source : void 0;
    resolved.push({ ...agent, overriddenBy });
  }
  return resolved;
}
function resolveAgentModelDisplay(agent) {
  const model = agent.model || getDefaultSubagentModel();
  if (!model) return void 0;
  return model === "inherit" ? "inherit" : model;
}
function getOverrideSourceLabel(source) {
  return getSourceDisplayName(source).toLowerCase();
}
function compareAgentsByName(a, b) {
  return a.agentType.localeCompare(b.agentType, void 0, {
    sensitivity: "base"
  });
}
export {
  AGENT_SOURCE_GROUPS,
  compareAgentsByName,
  getOverrideSourceLabel,
  resolveAgentModelDisplay,
  resolveAgentOverrides
};
