import { resolve } from "path";
import { getSessionId } from "../../bootstrap/state.js";
import { SOURCES } from "../settings/constants.js";
import {
  getSettingsFilePathForSource,
  getSettingsForSource
} from "../settings/settings.js";
import { DEFAULT_HOOK_SHELL } from "../shell/shellProvider.js";
import { getSessionHooks } from "./sessionHooks.js";
function isHookEqual(a, b) {
  if (a.type !== b.type) return false;
  const sameIf = (x, y) => (x.if ?? "") === (y.if ?? "");
  switch (a.type) {
    case "command":
      return b.type === "command" && a.command === b.command && (a.shell ?? DEFAULT_HOOK_SHELL) === (b.shell ?? DEFAULT_HOOK_SHELL) && sameIf(a, b);
    case "prompt":
      return b.type === "prompt" && a.prompt === b.prompt && sameIf(a, b);
    case "agent":
      return b.type === "agent" && a.prompt === b.prompt && sameIf(a, b);
    case "http":
      return b.type === "http" && a.url === b.url && sameIf(a, b);
    case "function":
      return false;
  }
}
function getHookDisplayText(hook) {
  if ("statusMessage" in hook && hook.statusMessage) {
    return hook.statusMessage;
  }
  switch (hook.type) {
    case "command":
      return hook.command;
    case "prompt":
      return hook.prompt;
    case "agent":
      return hook.prompt;
    case "http":
      return hook.url;
    case "callback":
      return "callback";
    case "function":
      return "function";
  }
}
function getAllHooks(appState) {
  const hooks = [];
  const policySettings = getSettingsForSource("policySettings");
  const restrictedToManagedOnly = policySettings?.allowManagedHooksOnly === true;
  if (!restrictedToManagedOnly) {
    const sources = [
      "userSettings",
      "projectSettings",
      "localSettings"
    ];
    const seenFiles = /* @__PURE__ */ new Set();
    for (const source of sources) {
      const filePath = getSettingsFilePathForSource(source);
      if (filePath) {
        const resolvedPath = resolve(filePath);
        if (seenFiles.has(resolvedPath)) {
          continue;
        }
        seenFiles.add(resolvedPath);
      }
      const sourceSettings = getSettingsForSource(source);
      if (!sourceSettings?.hooks) {
        continue;
      }
      for (const [event, matchers] of Object.entries(sourceSettings.hooks)) {
        for (const matcher of matchers) {
          for (const hookCommand of matcher.hooks) {
            hooks.push({
              event,
              config: hookCommand,
              matcher: matcher.matcher,
              source
            });
          }
        }
      }
    }
  }
  const sessionId = getSessionId();
  const sessionHooks = getSessionHooks(appState, sessionId);
  for (const [event, matchers] of sessionHooks.entries()) {
    for (const matcher of matchers) {
      for (const hookCommand of matcher.hooks) {
        hooks.push({
          event,
          config: hookCommand,
          matcher: matcher.matcher,
          source: "sessionHook"
        });
      }
    }
  }
  return hooks;
}
function getHooksForEvent(appState, event) {
  return getAllHooks(appState).filter((hook) => hook.event === event);
}
function hookSourceDescriptionDisplayString(source) {
  switch (source) {
    case "userSettings":
      return "User settings (~/.claude/settings.json)";
    case "projectSettings":
      return "Project settings (.claude/settings.json)";
    case "localSettings":
      return "Local settings (.claude/settings.local.json)";
    case "pluginHook":
      return "Plugin hooks (~/.claude/plugins/*/hooks/hooks.json)";
    case "sessionHook":
      return "Session hooks (in-memory, temporary)";
    case "builtinHook":
      return "Built-in hooks (registered internally by Claude Code)";
    default:
      return source;
  }
}
function hookSourceHeaderDisplayString(source) {
  switch (source) {
    case "userSettings":
      return "User Settings";
    case "projectSettings":
      return "Project Settings";
    case "localSettings":
      return "Local Settings";
    case "pluginHook":
      return "Plugin Hooks";
    case "sessionHook":
      return "Session Hooks";
    case "builtinHook":
      return "Built-in Hooks";
    default:
      return source;
  }
}
function hookSourceInlineDisplayString(source) {
  switch (source) {
    case "userSettings":
      return "User";
    case "projectSettings":
      return "Project";
    case "localSettings":
      return "Local";
    case "pluginHook":
      return "Plugin";
    case "sessionHook":
      return "Session";
    case "builtinHook":
      return "Built-in";
    default:
      return source;
  }
}
function sortMatchersByPriority(matchers, hooksByEventAndMatcher, selectedEvent) {
  const sourcePriority = SOURCES.reduce(
    (acc, source, index) => {
      acc[source] = index;
      return acc;
    },
    {}
  );
  return [...matchers].sort((a, b) => {
    const aHooks = hooksByEventAndMatcher[selectedEvent]?.[a] || [];
    const bHooks = hooksByEventAndMatcher[selectedEvent]?.[b] || [];
    const aSources = Array.from(new Set(aHooks.map((h) => h.source)));
    const bSources = Array.from(new Set(bHooks.map((h) => h.source)));
    const getSourcePriority = (source) => source === "pluginHook" || source === "builtinHook" ? 999 : sourcePriority[source];
    const aHighestPriority = Math.min(...aSources.map(getSourcePriority));
    const bHighestPriority = Math.min(...bSources.map(getSourcePriority));
    if (aHighestPriority !== bHighestPriority) {
      return aHighestPriority - bHighestPriority;
    }
    return a.localeCompare(b);
  });
}
export {
  getAllHooks,
  getHookDisplayText,
  getHooksForEvent,
  hookSourceDescriptionDisplayString,
  hookSourceHeaderDisplayString,
  hookSourceInlineDisplayString,
  isHookEqual,
  sortMatchersByPriority
};
