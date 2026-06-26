import { isInBundledMode } from "../../utils/bundledMode.js";
import { getCurrentInstallationType } from "../../utils/doctorDiagnostic.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { useStartupNotification } from "./useStartupNotification.js";
const NPM_DEPRECATION_MESSAGE = "Claude Code has switched from npm to native installer. Run `claude install` or see https://docs.anthropic.com/en/docs/claude-code/getting-started for more options.";
function useNpmDeprecationNotification() {
  useStartupNotification(_temp);
}
async function _temp() {
  if (isInBundledMode() || isEnvTruthy(process.env.DISABLE_INSTALLATION_CHECKS)) {
    return null;
  }
  const installationType = await getCurrentInstallationType();
  if (installationType === "development") {
    return null;
  }
  return {
    timeoutMs: 15e3,
    key: "npm-deprecation-warning",
    text: NPM_DEPRECATION_MESSAGE,
    color: "warning",
    priority: "high"
  };
}
export {
  useNpmDeprecationNotification
};
