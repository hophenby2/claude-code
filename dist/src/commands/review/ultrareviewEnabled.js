import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
function isUltrareviewEnabled() {
  const cfg = getFeatureValue_CACHED_MAY_BE_STALE("tengu_review_bughunter_config", null);
  return cfg?.enabled === true;
}
export {
  isUltrareviewEnabled
};
