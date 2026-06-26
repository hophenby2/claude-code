import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import { getIsNonInteractiveSession } from "../../bootstrap/state.js";
import "../../services/analytics/growthbook.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { CLAUDE_CODE_GUIDE_AGENT } from "./built-in/claudeCodeGuideAgent.js";
import { EXPLORE_AGENT } from "./built-in/exploreAgent.js";
import { GENERAL_PURPOSE_AGENT } from "./built-in/generalPurposeAgent.js";
import { PLAN_AGENT } from "./built-in/planAgent.js";
import { STATUSLINE_SETUP_AGENT } from "./built-in/statuslineSetup.js";
import "./built-in/verificationAgent.js";
function areExplorePlanAgentsEnabled() {
  if (false) {
    return getFeatureValue_CACHED_MAY_BE_STALE("tengu_amber_stoat", true);
  }
  return false;
}
function getBuiltInAgents() {
  if (isEnvTruthy(process.env.CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS) && getIsNonInteractiveSession()) {
    return [];
  }
  if (false) {
    if (isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)) {
      const { getCoordinatorAgents } = require2("../../coordinator/workerAgent.js");
      return getCoordinatorAgents();
    }
  }
  const agents = [
    GENERAL_PURPOSE_AGENT,
    STATUSLINE_SETUP_AGENT
  ];
  if (areExplorePlanAgentsEnabled()) {
    agents.push(EXPLORE_AGENT, PLAN_AGENT);
  }
  const isNonSdkEntrypoint = process.env.CLAUDE_CODE_ENTRYPOINT !== "sdk-ts" && process.env.CLAUDE_CODE_ENTRYPOINT !== "sdk-py" && process.env.CLAUDE_CODE_ENTRYPOINT !== "sdk-cli";
  if (isNonSdkEntrypoint) {
    agents.push(CLAUDE_CODE_GUIDE_AGENT);
  }
  if (false) {
    agents.push(VERIFICATION_AGENT);
  }
  return agents;
}
export {
  areExplorePlanAgentsEnabled,
  getBuiltInAgents
};
