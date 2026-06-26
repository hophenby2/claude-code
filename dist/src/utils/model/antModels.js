import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
function getAntModelOverrideConfig() {
  if (process.env.USER_TYPE !== "ant") {
    return null;
  }
  return getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_ant_model_override",
    null
  );
}
function getAntModels() {
  if (process.env.USER_TYPE !== "ant") {
    return [];
  }
  return getAntModelOverrideConfig()?.antModels ?? [];
}
function resolveAntModel(model) {
  if (process.env.USER_TYPE !== "ant") {
    return void 0;
  }
  if (model === void 0) {
    return void 0;
  }
  const lower = model.toLowerCase();
  return getAntModels().find(
    (m) => m.alias === model || lower.includes(m.model.toLowerCase())
  );
}
export {
  getAntModelOverrideConfig,
  getAntModels,
  resolveAntModel
};
