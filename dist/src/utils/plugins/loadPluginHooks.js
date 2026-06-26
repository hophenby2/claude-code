import memoize from "lodash-es/memoize.js";
import {
  clearRegisteredPluginHooks,
  getRegisteredHooks,
  registerHookCallbacks
} from "../../bootstrap/state.js";
import { logForDebugging } from "../debug.js";
import { settingsChangeDetector } from "../settings/changeDetector.js";
import {
  getSettings_DEPRECATED,
  getSettingsForSource
} from "../settings/settings.js";
import { jsonStringify } from "../slowOperations.js";
import { clearPluginCache, loadAllPluginsCacheOnly } from "./pluginLoader.js";
let hotReloadSubscribed = false;
let lastPluginSettingsSnapshot;
function convertPluginHooksToMatchers(plugin) {
  const pluginMatchers = {
    PreToolUse: [],
    PostToolUse: [],
    PostToolUseFailure: [],
    PermissionDenied: [],
    Notification: [],
    UserPromptSubmit: [],
    SessionStart: [],
    SessionEnd: [],
    Stop: [],
    StopFailure: [],
    SubagentStart: [],
    SubagentStop: [],
    PreCompact: [],
    PostCompact: [],
    PermissionRequest: [],
    Setup: [],
    TeammateIdle: [],
    TaskCreated: [],
    TaskCompleted: [],
    Elicitation: [],
    ElicitationResult: [],
    ConfigChange: [],
    WorktreeCreate: [],
    WorktreeRemove: [],
    InstructionsLoaded: [],
    CwdChanged: [],
    FileChanged: []
  };
  if (!plugin.hooksConfig) {
    return pluginMatchers;
  }
  for (const [event, matchers] of Object.entries(plugin.hooksConfig)) {
    const hookEvent = event;
    if (!pluginMatchers[hookEvent]) {
      continue;
    }
    for (const matcher of matchers) {
      if (matcher.hooks.length > 0) {
        pluginMatchers[hookEvent].push({
          matcher: matcher.matcher,
          hooks: matcher.hooks,
          pluginRoot: plugin.path,
          pluginName: plugin.name,
          pluginId: plugin.source
        });
      }
    }
  }
  return pluginMatchers;
}
const loadPluginHooks = memoize(async () => {
  const { enabled } = await loadAllPluginsCacheOnly();
  const allPluginHooks = {
    PreToolUse: [],
    PostToolUse: [],
    PostToolUseFailure: [],
    PermissionDenied: [],
    Notification: [],
    UserPromptSubmit: [],
    SessionStart: [],
    SessionEnd: [],
    Stop: [],
    StopFailure: [],
    SubagentStart: [],
    SubagentStop: [],
    PreCompact: [],
    PostCompact: [],
    PermissionRequest: [],
    Setup: [],
    TeammateIdle: [],
    TaskCreated: [],
    TaskCompleted: [],
    Elicitation: [],
    ElicitationResult: [],
    ConfigChange: [],
    WorktreeCreate: [],
    WorktreeRemove: [],
    InstructionsLoaded: [],
    CwdChanged: [],
    FileChanged: []
  };
  for (const plugin of enabled) {
    if (!plugin.hooksConfig) {
      continue;
    }
    logForDebugging(`Loading hooks from plugin: ${plugin.name}`);
    const pluginMatchers = convertPluginHooksToMatchers(plugin);
    for (const event of Object.keys(pluginMatchers)) {
      allPluginHooks[event].push(...pluginMatchers[event]);
    }
  }
  clearRegisteredPluginHooks();
  registerHookCallbacks(allPluginHooks);
  const totalHooks = Object.values(allPluginHooks).reduce(
    (sum, matchers) => sum + matchers.reduce((s, m) => s + m.hooks.length, 0),
    0
  );
  logForDebugging(
    `Registered ${totalHooks} hooks from ${enabled.length} plugins`
  );
});
function clearPluginHookCache() {
  loadPluginHooks.cache?.clear?.();
}
async function pruneRemovedPluginHooks() {
  if (!getRegisteredHooks()) return;
  const { enabled } = await loadAllPluginsCacheOnly();
  const enabledRoots = new Set(enabled.map((p) => p.path));
  const current = getRegisteredHooks();
  if (!current) return;
  const survivors = {};
  for (const [event, matchers] of Object.entries(current)) {
    const kept = matchers.filter(
      (m) => "pluginRoot" in m && enabledRoots.has(m.pluginRoot)
    );
    if (kept.length > 0) survivors[event] = kept;
  }
  clearRegisteredPluginHooks();
  registerHookCallbacks(survivors);
}
function resetHotReloadState() {
  hotReloadSubscribed = false;
  lastPluginSettingsSnapshot = void 0;
}
function getPluginAffectingSettingsSnapshot() {
  const merged = getSettings_DEPRECATED();
  const policy = getSettingsForSource("policySettings");
  const sortKeys = (o) => o ? Object.fromEntries(Object.entries(o).sort()) : {};
  return jsonStringify({
    enabledPlugins: sortKeys(merged.enabledPlugins),
    extraKnownMarketplaces: sortKeys(merged.extraKnownMarketplaces),
    strictKnownMarketplaces: policy?.strictKnownMarketplaces ?? [],
    blockedMarketplaces: policy?.blockedMarketplaces ?? []
  });
}
function setupPluginHookHotReload() {
  if (hotReloadSubscribed) {
    return;
  }
  hotReloadSubscribed = true;
  lastPluginSettingsSnapshot = getPluginAffectingSettingsSnapshot();
  settingsChangeDetector.subscribe((source) => {
    if (source === "policySettings") {
      const newSnapshot = getPluginAffectingSettingsSnapshot();
      if (newSnapshot === lastPluginSettingsSnapshot) {
        logForDebugging(
          "Plugin hooks: skipping reload, plugin-affecting settings unchanged"
        );
        return;
      }
      lastPluginSettingsSnapshot = newSnapshot;
      logForDebugging(
        "Plugin hooks: reloading due to plugin-affecting settings change"
      );
      clearPluginCache("loadPluginHooks: plugin-affecting settings changed");
      clearPluginHookCache();
      void loadPluginHooks();
    }
  });
}
export {
  clearPluginHookCache,
  getPluginAffectingSettingsSnapshot,
  loadPluginHooks,
  pruneRemovedPluginHooks,
  resetHotReloadState,
  setupPluginHookHotReload
};
