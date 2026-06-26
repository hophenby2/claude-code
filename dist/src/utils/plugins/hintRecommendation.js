import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import {
  logEvent
} from "../../services/analytics/index.js";
import {
  hasShownHintThisSession,
  setPendingHint
} from "../claudeCodeHints.js";
import { getGlobalConfig, saveGlobalConfig } from "../config.js";
import { logForDebugging } from "../debug.js";
import { isPluginInstalled } from "./installedPluginsManager.js";
import { getPluginById } from "./marketplaceManager.js";
import {
  isOfficialMarketplaceName,
  parsePluginIdentifier
} from "./pluginIdentifier.js";
import { isPluginBlockedByPolicy } from "./pluginPolicy.js";
const MAX_SHOWN_PLUGINS = 100;
function maybeRecordPluginHint(hint) {
  if (!getFeatureValue_CACHED_MAY_BE_STALE("tengu_lapis_finch", false)) return;
  if (hasShownHintThisSession()) return;
  const state = getGlobalConfig().claudeCodeHints;
  if (state?.disabled) return;
  const shown = state?.plugin ?? [];
  if (shown.length >= MAX_SHOWN_PLUGINS) return;
  const pluginId = hint.value;
  const { name, marketplace } = parsePluginIdentifier(pluginId);
  if (!name || !marketplace) return;
  if (!isOfficialMarketplaceName(marketplace)) return;
  if (shown.includes(pluginId)) return;
  if (isPluginInstalled(pluginId)) return;
  if (isPluginBlockedByPolicy(pluginId)) return;
  if (triedThisSession.has(pluginId)) return;
  triedThisSession.add(pluginId);
  setPendingHint(hint);
}
const triedThisSession = /* @__PURE__ */ new Set();
function _resetHintRecommendationForTesting() {
  triedThisSession.clear();
}
async function resolvePluginHint(hint) {
  const pluginId = hint.value;
  const { name, marketplace } = parsePluginIdentifier(pluginId);
  const pluginData = await getPluginById(pluginId);
  logEvent("tengu_plugin_hint_detected", {
    _PROTO_plugin_name: name ?? "",
    _PROTO_marketplace_name: marketplace ?? "",
    result: pluginData ? "passed" : "not_in_cache"
  });
  if (!pluginData) {
    logForDebugging(
      `[hintRecommendation] ${pluginId} not found in marketplace cache`
    );
    return null;
  }
  return {
    pluginId,
    pluginName: pluginData.entry.name,
    marketplaceName: marketplace ?? "",
    pluginDescription: pluginData.entry.description,
    sourceCommand: hint.sourceCommand
  };
}
function markHintPluginShown(pluginId) {
  saveGlobalConfig((current) => {
    const existing = current.claudeCodeHints?.plugin ?? [];
    if (existing.includes(pluginId)) return current;
    return {
      ...current,
      claudeCodeHints: {
        ...current.claudeCodeHints,
        plugin: [...existing, pluginId]
      }
    };
  });
}
function disableHintRecommendations() {
  saveGlobalConfig((current) => {
    if (current.claudeCodeHints?.disabled) return current;
    return {
      ...current,
      claudeCodeHints: { ...current.claudeCodeHints, disabled: true }
    };
  });
}
export {
  _resetHintRecommendationForTesting,
  disableHintRecommendations,
  markHintPluginShown,
  maybeRecordPluginHint,
  resolvePluginHint
};
