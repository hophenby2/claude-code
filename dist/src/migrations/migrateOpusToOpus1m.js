import { logEvent } from "../services/analytics/index.js";
import {
  getDefaultMainLoopModelSetting,
  isOpus1mMergeEnabled,
  parseUserSpecifiedModel
} from "../utils/model/model.js";
import {
  getSettingsForSource,
  updateSettingsForSource
} from "../utils/settings/settings.js";
function migrateOpusToOpus1m() {
  if (!isOpus1mMergeEnabled()) {
    return;
  }
  const model = getSettingsForSource("userSettings")?.model;
  if (model !== "opus") {
    return;
  }
  const migrated = "opus[1m]";
  const modelToSet = parseUserSpecifiedModel(migrated) === parseUserSpecifiedModel(getDefaultMainLoopModelSetting()) ? void 0 : migrated;
  updateSettingsForSource("userSettings", { model: modelToSet });
  logEvent("tengu_opus_to_opus1m_migration", {});
}
export {
  migrateOpusToOpus1m
};
