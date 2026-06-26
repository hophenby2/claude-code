import { isEnvTruthy } from "../../utils/envUtils.js";
import { isTelemetryDisabled } from "../../utils/privacyLevel.js";
function isAnalyticsDisabled() {
  return process.env.NODE_ENV === "test" || isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) || isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) || isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY) || isTelemetryDisabled();
}
function isFeedbackSurveyDisabled() {
  return process.env.NODE_ENV === "test" || isTelemetryDisabled();
}
export {
  isAnalyticsDisabled,
  isFeedbackSurveyDisabled
};
