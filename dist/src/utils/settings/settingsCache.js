let sessionSettingsCache = null;
function getSessionSettingsCache() {
  return sessionSettingsCache;
}
function setSessionSettingsCache(value) {
  sessionSettingsCache = value;
}
const perSourceCache = /* @__PURE__ */ new Map();
function getCachedSettingsForSource(source) {
  return perSourceCache.has(source) ? perSourceCache.get(source) : void 0;
}
function setCachedSettingsForSource(source, value) {
  perSourceCache.set(source, value);
}
const parseFileCache = /* @__PURE__ */ new Map();
function getCachedParsedFile(path) {
  return parseFileCache.get(path);
}
function setCachedParsedFile(path, value) {
  parseFileCache.set(path, value);
}
function resetSettingsCache() {
  sessionSettingsCache = null;
  perSourceCache.clear();
  parseFileCache.clear();
}
let pluginSettingsBase;
function getPluginSettingsBase() {
  return pluginSettingsBase;
}
function setPluginSettingsBase(settings) {
  pluginSettingsBase = settings;
}
function clearPluginSettingsBase() {
  pluginSettingsBase = void 0;
}
export {
  clearPluginSettingsBase,
  getCachedParsedFile,
  getCachedSettingsForSource,
  getPluginSettingsBase,
  getSessionSettingsCache,
  resetSettingsCache,
  setCachedParsedFile,
  setCachedSettingsForSource,
  setPluginSettingsBase,
  setSessionSettingsCache
};
