import { getSettings_DEPRECATED } from "../../utils/settings/settings.js";
import {
  logEvent
} from "../analytics/index.js";
import { getSessionsSinceLastShown, recordTipShown } from "./tipHistory.js";
import { getRelevantTips } from "./tipRegistry.js";
function selectTipWithLongestTimeSinceShown(availableTips) {
  if (availableTips.length === 0) {
    return void 0;
  }
  if (availableTips.length === 1) {
    return availableTips[0];
  }
  const tipsWithSessions = availableTips.map((tip) => ({
    tip,
    sessions: getSessionsSinceLastShown(tip.id)
  }));
  tipsWithSessions.sort((a, b) => b.sessions - a.sessions);
  return tipsWithSessions[0]?.tip;
}
async function getTipToShowOnSpinner(context) {
  if (getSettings_DEPRECATED().spinnerTipsEnabled === false) {
    return void 0;
  }
  const tips = await getRelevantTips(context);
  if (tips.length === 0) {
    return void 0;
  }
  return selectTipWithLongestTimeSinceShown(tips);
}
function recordShownTip(tip) {
  recordTipShown(tip.id);
  logEvent("tengu_tip_shown", {
    tipIdLength: tip.id,
    cooldownSessions: tip.cooldownSessions
  });
}
export {
  getTipToShowOnSpinner,
  recordShownTip,
  selectTipWithLongestTimeSinceShown
};
