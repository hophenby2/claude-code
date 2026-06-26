import {
  getModelStrings as getModelStringsState,
  setModelStrings as setModelStringsState
} from "../../bootstrap/state.js";
import { logError } from "../log.js";
import { sequential } from "../sequential.js";
import { getInitialSettings } from "../settings/settings.js";
import { findFirstMatch, getBedrockInferenceProfiles } from "./bedrock.js";
import {
  ALL_MODEL_CONFIGS,
  CANONICAL_ID_TO_KEY
} from "./configs.js";
import { getAPIProvider } from "./providers.js";
const MODEL_KEYS = Object.keys(ALL_MODEL_CONFIGS);
function getBuiltinModelStrings(provider) {
  const out = {};
  for (const key of MODEL_KEYS) {
    out[key] = ALL_MODEL_CONFIGS[key][provider];
  }
  return out;
}
async function getBedrockModelStrings() {
  const fallback = getBuiltinModelStrings("bedrock");
  let profiles;
  try {
    profiles = await getBedrockInferenceProfiles();
  } catch (error) {
    logError(error);
    return fallback;
  }
  if (!profiles?.length) {
    return fallback;
  }
  const out = {};
  for (const key of MODEL_KEYS) {
    const needle = ALL_MODEL_CONFIGS[key].firstParty;
    out[key] = findFirstMatch(profiles, needle) || fallback[key];
  }
  return out;
}
function applyModelOverrides(ms) {
  const overrides = getInitialSettings().modelOverrides;
  if (!overrides) {
    return ms;
  }
  const out = { ...ms };
  for (const [canonicalId, override] of Object.entries(overrides)) {
    const key = CANONICAL_ID_TO_KEY[canonicalId];
    if (key && override) {
      out[key] = override;
    }
  }
  return out;
}
function resolveOverriddenModel(modelId) {
  let overrides;
  try {
    overrides = getInitialSettings().modelOverrides;
  } catch {
    return modelId;
  }
  if (!overrides) {
    return modelId;
  }
  for (const [canonicalId, override] of Object.entries(overrides)) {
    if (override === modelId) {
      return canonicalId;
    }
  }
  return modelId;
}
const updateBedrockModelStrings = sequential(async () => {
  if (getModelStringsState() !== null) {
    return;
  }
  try {
    const ms = await getBedrockModelStrings();
    setModelStringsState(ms);
  } catch (error) {
    logError(error);
  }
});
function initModelStrings() {
  const ms = getModelStringsState();
  if (ms !== null) {
    return;
  }
  if (getAPIProvider() !== "bedrock") {
    setModelStringsState(getBuiltinModelStrings(getAPIProvider()));
    return;
  }
  void updateBedrockModelStrings();
}
function getModelStrings() {
  const ms = getModelStringsState();
  if (ms === null) {
    initModelStrings();
    return applyModelOverrides(getBuiltinModelStrings(getAPIProvider()));
  }
  return applyModelOverrides(ms);
}
async function ensureModelStringsInitialized() {
  const ms = getModelStringsState();
  if (ms !== null) {
    return;
  }
  if (getAPIProvider() !== "bedrock") {
    setModelStringsState(getBuiltinModelStrings(getAPIProvider()));
    return;
  }
  await updateBedrockModelStrings();
}
export {
  ensureModelStringsInitialized,
  getModelStrings,
  resolveOverriddenModel
};
