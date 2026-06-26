import { jsx } from "react/jsx-runtime";
import { Passes } from "../../components/Passes/Passes.js";
import { logEvent } from "../../services/analytics/index.js";
import { getCachedRemainingPasses } from "../../services/api/referral.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
async function call(onDone) {
  const config = getGlobalConfig();
  const isFirstVisit = !config.hasVisitedPasses;
  if (isFirstVisit) {
    const remaining = getCachedRemainingPasses();
    saveGlobalConfig((current) => ({
      ...current,
      hasVisitedPasses: true,
      passesLastSeenRemaining: remaining ?? current.passesLastSeenRemaining
    }));
  }
  logEvent("tengu_guest_passes_visited", {
    is_first_visit: isFirstVisit
  });
  return /* @__PURE__ */ jsx(Passes, { onDone });
}
export {
  call
};
