import { HOOK_EVENTS } from "../../entrypoints/agentSdkTypes.js";
import { logForDebugging } from "../debug.js";
import { addSessionHook } from "./sessionHooks.js";
function registerFrontmatterHooks(setAppState, sessionId, hooks, sourceName, isAgent = false) {
  if (!hooks || Object.keys(hooks).length === 0) {
    return;
  }
  let hookCount = 0;
  for (const event of HOOK_EVENTS) {
    const matchers = hooks[event];
    if (!matchers || matchers.length === 0) {
      continue;
    }
    let targetEvent = event;
    if (isAgent && event === "Stop") {
      targetEvent = "SubagentStop";
      logForDebugging(
        `Converting Stop hook to SubagentStop for ${sourceName} (subagents trigger SubagentStop)`
      );
    }
    for (const matcherConfig of matchers) {
      const matcher = matcherConfig.matcher ?? "";
      const hooksArray = matcherConfig.hooks;
      if (!hooksArray || hooksArray.length === 0) {
        continue;
      }
      for (const hook of hooksArray) {
        addSessionHook(setAppState, sessionId, targetEvent, matcher, hook);
        hookCount++;
      }
    }
  }
  if (hookCount > 0) {
    logForDebugging(
      `Registered ${hookCount} frontmatter hook(s) from ${sourceName} for session ${sessionId}`
    );
  }
}
export {
  registerFrontmatterHooks
};
