import memoize from "lodash-es/memoize.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import { MAX_OUTPUT_SIZE } from "../../utils/file.js";
const DEFAULT_MAX_OUTPUT_TOKENS = 25e3;
function getEnvMaxTokens() {
  const override = process.env.CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS;
  if (override) {
    const parsed = parseInt(override, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return void 0;
}
const getDefaultFileReadingLimits = memoize(() => {
  const override = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_amber_wren",
    {}
  );
  const maxSizeBytes = typeof override?.maxSizeBytes === "number" && Number.isFinite(override.maxSizeBytes) && override.maxSizeBytes > 0 ? override.maxSizeBytes : MAX_OUTPUT_SIZE;
  const envMaxTokens = getEnvMaxTokens();
  const maxTokens = envMaxTokens ?? (typeof override?.maxTokens === "number" && Number.isFinite(override.maxTokens) && override.maxTokens > 0 ? override.maxTokens : DEFAULT_MAX_OUTPUT_TOKENS);
  const includeMaxSizeInPrompt = typeof override?.includeMaxSizeInPrompt === "boolean" ? override.includeMaxSizeInPrompt : void 0;
  const targetedRangeNudge = typeof override?.targetedRangeNudge === "boolean" ? override.targetedRangeNudge : void 0;
  return {
    maxSizeBytes,
    maxTokens,
    includeMaxSizeInPrompt,
    targetedRangeNudge
  };
});
export {
  DEFAULT_MAX_OUTPUT_TOKENS,
  getDefaultFileReadingLimits
};
