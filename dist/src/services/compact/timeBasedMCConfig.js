import { getFeatureValue_CACHED_MAY_BE_STALE } from "../analytics/growthbook.js";
const TIME_BASED_MC_CONFIG_DEFAULTS = {
  enabled: false,
  gapThresholdMinutes: 60,
  keepRecent: 5
};
function getTimeBasedMCConfig() {
  return getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_slate_heron",
    TIME_BASED_MC_CONFIG_DEFAULTS
  );
}
export {
  getTimeBasedMCConfig
};
