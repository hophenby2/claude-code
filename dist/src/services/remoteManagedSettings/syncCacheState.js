import { join } from "path";
import { getClaudeConfigHomeDir } from "../../utils/envUtils.js";
import { readFileSync } from "../../utils/fileRead.js";
import { stripBOM } from "../../utils/jsonRead.js";
import { resetSettingsCache } from "../../utils/settings/settingsCache.js";
import { jsonParse } from "../../utils/slowOperations.js";
const SETTINGS_FILENAME = "remote-settings.json";
let sessionCache = null;
let eligible;
function setSessionCache(value) {
  sessionCache = value;
}
function resetSyncCache() {
  sessionCache = null;
  eligible = void 0;
}
function setEligibility(v) {
  eligible = v;
  return v;
}
function getSettingsPath() {
  return join(getClaudeConfigHomeDir(), SETTINGS_FILENAME);
}
function loadSettings() {
  try {
    const content = readFileSync(getSettingsPath());
    const data = jsonParse(stripBOM(content));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
function getRemoteManagedSettingsSyncFromCache() {
  if (eligible !== true) return null;
  if (sessionCache) return sessionCache;
  const cachedSettings = loadSettings();
  if (cachedSettings) {
    sessionCache = cachedSettings;
    resetSettingsCache();
    return cachedSettings;
  }
  return null;
}
export {
  getRemoteManagedSettingsSyncFromCache,
  getSettingsPath,
  resetSyncCache,
  setEligibility,
  setSessionCache
};
