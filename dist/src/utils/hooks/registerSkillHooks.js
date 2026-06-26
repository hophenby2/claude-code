import { HOOK_EVENTS } from "../../entrypoints/agentSdkTypes.js";
import { logForDebugging } from "../debug.js";
import { addSessionHook, removeSessionHook } from "./sessionHooks.js";
function registerSkillHooks(setAppState, sessionId, hooks, skillName, skillRoot) {
  let registeredCount = 0;
  for (const eventName of HOOK_EVENTS) {
    const matchers = hooks[eventName];
    if (!matchers) continue;
    for (const matcher of matchers) {
      for (const hook of matcher.hooks) {
        const onHookSuccess = hook.once ? () => {
          logForDebugging(
            `Removing one-shot hook for event ${eventName} in skill '${skillName}'`
          );
          removeSessionHook(setAppState, sessionId, eventName, hook);
        } : void 0;
        addSessionHook(
          setAppState,
          sessionId,
          eventName,
          matcher.matcher || "",
          hook,
          onHookSuccess,
          skillRoot
        );
        registeredCount++;
      }
    }
  }
  if (registeredCount > 0) {
    logForDebugging(
      `Registered ${registeredCount} hooks from skill '${skillName}'`
    );
  }
}
export {
  registerSkillHooks
};
