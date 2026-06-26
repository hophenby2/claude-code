import memoize from "lodash-es/memoize.js";
import { getAPIProvider } from "./providers.js";
const TIERS = [
  {
    modelEnvVar: "ANTHROPIC_DEFAULT_OPUS_MODEL",
    capabilitiesEnvVar: "ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES"
  },
  {
    modelEnvVar: "ANTHROPIC_DEFAULT_SONNET_MODEL",
    capabilitiesEnvVar: "ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES"
  },
  {
    modelEnvVar: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    capabilitiesEnvVar: "ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES"
  }
];
const get3PModelCapabilityOverride = memoize(
  (model, capability) => {
    if (getAPIProvider() === "firstParty") {
      return void 0;
    }
    const m = model.toLowerCase();
    for (const tier of TIERS) {
      const pinned = process.env[tier.modelEnvVar];
      const capabilities = process.env[tier.capabilitiesEnvVar];
      if (!pinned || capabilities === void 0) continue;
      if (m !== pinned.toLowerCase()) continue;
      return capabilities.toLowerCase().split(",").map((s) => s.trim()).includes(capability);
    }
    return void 0;
  },
  (model, capability) => `${model.toLowerCase()}:${capability}`
);
export {
  get3PModelCapabilityOverride
};
