import { isEnvDefinedFalsy, isEnvTruthy } from "./envUtils.js";
import { getInitialSettings } from "./settings/settings.js";
function shouldIncludeGitInstructions() {
  const envVal = process.env.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS;
  if (isEnvTruthy(envVal)) return false;
  if (isEnvDefinedFalsy(envVal)) return true;
  return getInitialSettings().includeGitInstructions ?? true;
}
export {
  shouldIncludeGitInstructions
};
