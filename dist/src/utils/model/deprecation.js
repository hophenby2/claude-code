import { getAPIProvider } from "./providers.js";
const DEPRECATED_MODELS = {
  "claude-3-opus": {
    modelName: "Claude 3 Opus",
    retirementDates: {
      firstParty: "January 5, 2026",
      bedrock: "January 15, 2026",
      vertex: "January 5, 2026",
      foundry: "January 5, 2026"
    }
  },
  "claude-3-7-sonnet": {
    modelName: "Claude 3.7 Sonnet",
    retirementDates: {
      firstParty: "February 19, 2026",
      bedrock: "April 28, 2026",
      vertex: "May 11, 2026",
      foundry: "February 19, 2026"
    }
  },
  "claude-3-5-haiku": {
    modelName: "Claude 3.5 Haiku",
    retirementDates: {
      firstParty: "February 19, 2026",
      bedrock: null,
      vertex: null,
      foundry: null
    }
  }
};
function getDeprecatedModelInfo(modelId) {
  const lowercaseModelId = modelId.toLowerCase();
  const provider = getAPIProvider();
  for (const [key, value] of Object.entries(DEPRECATED_MODELS)) {
    const retirementDate = value.retirementDates[provider];
    if (!lowercaseModelId.includes(key) || !retirementDate) {
      continue;
    }
    return {
      isDeprecated: true,
      modelName: value.modelName,
      retirementDate
    };
  }
  return { isDeprecated: false };
}
function getModelDeprecationWarning(modelId) {
  if (!modelId) {
    return null;
  }
  const info = getDeprecatedModelInfo(modelId);
  if (!info.isDeprecated) {
    return null;
  }
  return `\u26A0 ${info.modelName} will be retired on ${info.retirementDate}. Consider switching to a newer model.`;
}
export {
  getModelDeprecationWarning
};
