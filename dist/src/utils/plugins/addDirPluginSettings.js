import { join } from "path";
import { getAdditionalDirectoriesForClaudeMd } from "../../bootstrap/state.js";
import { parseSettingsFile } from "../settings/settings.js";
const SETTINGS_FILES = ["settings.json", "settings.local.json"];
function getAddDirEnabledPlugins() {
  const result = {};
  for (const dir of getAdditionalDirectoriesForClaudeMd()) {
    for (const file of SETTINGS_FILES) {
      const { settings } = parseSettingsFile(join(dir, ".claude", file));
      if (!settings?.enabledPlugins) {
        continue;
      }
      Object.assign(result, settings.enabledPlugins);
    }
  }
  return result;
}
function getAddDirExtraMarketplaces() {
  const result = {};
  for (const dir of getAdditionalDirectoriesForClaudeMd()) {
    for (const file of SETTINGS_FILES) {
      const { settings } = parseSettingsFile(join(dir, ".claude", file));
      if (!settings?.extraKnownMarketplaces) {
        continue;
      }
      Object.assign(result, settings.extraKnownMarketplaces);
    }
  }
  return result;
}
export {
  getAddDirEnabledPlugins,
  getAddDirExtraMarketplaces
};
