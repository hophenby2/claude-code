import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import { isEnvTruthy } from "./envUtils.js";
function isAgentTeamsFlagSet() {
  return process.argv.includes("--agent-teams");
}
function isAgentSwarmsEnabled() {
  if (process.env.USER_TYPE === "ant") {
    return true;
  }
  if (!isEnvTruthy(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) && !isAgentTeamsFlagSet()) {
    return false;
  }
  if (!getFeatureValue_CACHED_MAY_BE_STALE("tengu_amber_flint", true)) {
    return false;
  }
  return true;
}
export {
  isAgentSwarmsEnabled
};
