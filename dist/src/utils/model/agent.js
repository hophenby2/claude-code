import { capitalize } from "../stringUtils.js";
import { MODEL_ALIASES } from "./aliases.js";
import { applyBedrockRegionPrefix, getBedrockRegionPrefix } from "./bedrock.js";
import {
  getCanonicalName,
  getRuntimeMainLoopModel,
  parseUserSpecifiedModel
} from "./model.js";
import { getAPIProvider } from "./providers.js";
const AGENT_MODEL_OPTIONS = [...MODEL_ALIASES, "inherit"];
function getDefaultSubagentModel() {
  return "inherit";
}
function getAgentModel(agentModel, parentModel, toolSpecifiedModel, permissionMode) {
  if (process.env.CLAUDE_CODE_SUBAGENT_MODEL) {
    return parseUserSpecifiedModel(process.env.CLAUDE_CODE_SUBAGENT_MODEL);
  }
  const parentRegionPrefix = getBedrockRegionPrefix(parentModel);
  const applyParentRegionPrefix = (resolvedModel, originalSpec) => {
    if (parentRegionPrefix && getAPIProvider() === "bedrock") {
      if (getBedrockRegionPrefix(originalSpec)) return resolvedModel;
      return applyBedrockRegionPrefix(resolvedModel, parentRegionPrefix);
    }
    return resolvedModel;
  };
  if (toolSpecifiedModel) {
    if (aliasMatchesParentTier(toolSpecifiedModel, parentModel)) {
      return parentModel;
    }
    const model2 = parseUserSpecifiedModel(toolSpecifiedModel);
    return applyParentRegionPrefix(model2, toolSpecifiedModel);
  }
  const agentModelWithExp = agentModel ?? getDefaultSubagentModel();
  if (agentModelWithExp === "inherit") {
    return getRuntimeMainLoopModel({
      permissionMode: permissionMode ?? "default",
      mainLoopModel: parentModel,
      exceeds200kTokens: false
    });
  }
  if (aliasMatchesParentTier(agentModelWithExp, parentModel)) {
    return parentModel;
  }
  const model = parseUserSpecifiedModel(agentModelWithExp);
  return applyParentRegionPrefix(model, agentModelWithExp);
}
function aliasMatchesParentTier(alias, parentModel) {
  const canonical = getCanonicalName(parentModel);
  switch (alias.toLowerCase()) {
    case "opus":
      return canonical.includes("opus");
    case "sonnet":
      return canonical.includes("sonnet");
    case "haiku":
      return canonical.includes("haiku");
    default:
      return false;
  }
}
function getAgentModelDisplay(model) {
  if (!model) return "Inherit from parent (default)";
  if (model === "inherit") return "Inherit from parent";
  return capitalize(model);
}
function getAgentModelOptions() {
  return [
    {
      value: "sonnet",
      label: "Sonnet",
      description: "Balanced performance - best for most agents"
    },
    {
      value: "opus",
      label: "Opus",
      description: "Most capable for complex reasoning tasks"
    },
    {
      value: "haiku",
      label: "Haiku",
      description: "Fast and efficient for simple tasks"
    },
    {
      value: "inherit",
      label: "Inherit from parent",
      description: "Use the same model as the main conversation"
    }
  ];
}
export {
  AGENT_MODEL_OPTIONS,
  getAgentModel,
  getAgentModelDisplay,
  getAgentModelOptions,
  getDefaultSubagentModel
};
