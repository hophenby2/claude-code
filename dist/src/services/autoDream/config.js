import { getInitialSettings } from "../../utils/settings/settings.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../analytics/growthbook.js";
function isAutoDreamEnabled() {
  const setting = getInitialSettings().autoDreamEnabled;
  if (setting !== void 0) return setting;
  const gb = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_onyx_plover",
    null
  );
  return gb?.enabled === true;
}
export {
  isAutoDreamEnabled
};
