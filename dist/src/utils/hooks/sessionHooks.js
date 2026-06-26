import { HOOK_EVENTS } from "../../entrypoints/agentSdkTypes.js";
import { logForDebugging } from "../debug.js";
import { isHookEqual } from "./hooksSettings.js";
function addSessionHook(setAppState, sessionId, event, matcher, hook, onHookSuccess, skillRoot) {
  addHookToSession(
    setAppState,
    sessionId,
    event,
    matcher,
    hook,
    onHookSuccess,
    skillRoot
  );
}
function addFunctionHook(setAppState, sessionId, event, matcher, callback, errorMessage, options) {
  const id = options?.id || `function-hook-${Date.now()}-${Math.random()}`;
  const hook = {
    type: "function",
    id,
    timeout: options?.timeout || 5e3,
    callback,
    errorMessage
  };
  addHookToSession(setAppState, sessionId, event, matcher, hook);
  return id;
}
function removeFunctionHook(setAppState, sessionId, event, hookId) {
  setAppState((prev) => {
    const store = prev.sessionHooks.get(sessionId);
    if (!store) {
      return prev;
    }
    const eventMatchers = store.hooks[event] || [];
    const updatedMatchers = eventMatchers.map((matcher) => {
      const updatedHooks = matcher.hooks.filter((h) => {
        if (h.hook.type !== "function") return true;
        return h.hook.id !== hookId;
      });
      return updatedHooks.length > 0 ? { ...matcher, hooks: updatedHooks } : null;
    }).filter((m) => m !== null);
    const newHooks = updatedMatchers.length > 0 ? { ...store.hooks, [event]: updatedMatchers } : Object.fromEntries(
      Object.entries(store.hooks).filter(([e]) => e !== event)
    );
    prev.sessionHooks.set(sessionId, { hooks: newHooks });
    return prev;
  });
  logForDebugging(
    `Removed function hook ${hookId} for event ${event} in session ${sessionId}`
  );
}
function addHookToSession(setAppState, sessionId, event, matcher, hook, onHookSuccess, skillRoot) {
  setAppState((prev) => {
    const store = prev.sessionHooks.get(sessionId) ?? { hooks: {} };
    const eventMatchers = store.hooks[event] || [];
    const existingMatcherIndex = eventMatchers.findIndex(
      (m) => m.matcher === matcher && m.skillRoot === skillRoot
    );
    let updatedMatchers;
    if (existingMatcherIndex >= 0) {
      updatedMatchers = [...eventMatchers];
      const existingMatcher = updatedMatchers[existingMatcherIndex];
      updatedMatchers[existingMatcherIndex] = {
        matcher: existingMatcher.matcher,
        skillRoot: existingMatcher.skillRoot,
        hooks: [...existingMatcher.hooks, { hook, onHookSuccess }]
      };
    } else {
      updatedMatchers = [
        ...eventMatchers,
        {
          matcher,
          skillRoot,
          hooks: [{ hook, onHookSuccess }]
        }
      ];
    }
    const newHooks = { ...store.hooks, [event]: updatedMatchers };
    prev.sessionHooks.set(sessionId, { hooks: newHooks });
    return prev;
  });
  logForDebugging(
    `Added session hook for event ${event} in session ${sessionId}`
  );
}
function removeSessionHook(setAppState, sessionId, event, hook) {
  setAppState((prev) => {
    const store = prev.sessionHooks.get(sessionId);
    if (!store) {
      return prev;
    }
    const eventMatchers = store.hooks[event] || [];
    const updatedMatchers = eventMatchers.map((matcher) => {
      const updatedHooks = matcher.hooks.filter(
        (h) => !isHookEqual(h.hook, hook)
      );
      return updatedHooks.length > 0 ? { ...matcher, hooks: updatedHooks } : null;
    }).filter((m) => m !== null);
    const newHooks = updatedMatchers.length > 0 ? { ...store.hooks, [event]: updatedMatchers } : { ...store.hooks };
    if (updatedMatchers.length === 0) {
      delete newHooks[event];
    }
    prev.sessionHooks.set(sessionId, { ...store, hooks: newHooks });
    return prev;
  });
  logForDebugging(
    `Removed session hook for event ${event} in session ${sessionId}`
  );
}
function convertToHookMatchers(sessionMatchers) {
  return sessionMatchers.map((sm) => ({
    matcher: sm.matcher,
    skillRoot: sm.skillRoot,
    // Filter out function hooks - they can't be persisted to HookMatcher format
    hooks: sm.hooks.map((h) => h.hook).filter((h) => h.type !== "function")
  }));
}
function getSessionHooks(appState, sessionId, event) {
  const store = appState.sessionHooks.get(sessionId);
  if (!store) {
    return /* @__PURE__ */ new Map();
  }
  const result = /* @__PURE__ */ new Map();
  if (event) {
    const sessionMatchers = store.hooks[event];
    if (sessionMatchers) {
      result.set(event, convertToHookMatchers(sessionMatchers));
    }
    return result;
  }
  for (const evt of HOOK_EVENTS) {
    const sessionMatchers = store.hooks[evt];
    if (sessionMatchers) {
      result.set(evt, convertToHookMatchers(sessionMatchers));
    }
  }
  return result;
}
function getSessionFunctionHooks(appState, sessionId, event) {
  const store = appState.sessionHooks.get(sessionId);
  if (!store) {
    return /* @__PURE__ */ new Map();
  }
  const result = /* @__PURE__ */ new Map();
  const extractFunctionHooks = (sessionMatchers) => {
    return sessionMatchers.map((sm) => ({
      matcher: sm.matcher,
      hooks: sm.hooks.map((h) => h.hook).filter((h) => h.type === "function")
    })).filter((m) => m.hooks.length > 0);
  };
  if (event) {
    const sessionMatchers = store.hooks[event];
    if (sessionMatchers) {
      const functionMatchers = extractFunctionHooks(sessionMatchers);
      if (functionMatchers.length > 0) {
        result.set(event, functionMatchers);
      }
    }
    return result;
  }
  for (const evt of HOOK_EVENTS) {
    const sessionMatchers = store.hooks[evt];
    if (sessionMatchers) {
      const functionMatchers = extractFunctionHooks(sessionMatchers);
      if (functionMatchers.length > 0) {
        result.set(evt, functionMatchers);
      }
    }
  }
  return result;
}
function getSessionHookCallback(appState, sessionId, event, matcher, hook) {
  const store = appState.sessionHooks.get(sessionId);
  if (!store) {
    return void 0;
  }
  const eventMatchers = store.hooks[event];
  if (!eventMatchers) {
    return void 0;
  }
  for (const matcherEntry of eventMatchers) {
    if (matcherEntry.matcher === matcher || matcher === "") {
      const hookEntry = matcherEntry.hooks.find((h) => isHookEqual(h.hook, hook));
      if (hookEntry) {
        return hookEntry;
      }
    }
  }
  return void 0;
}
function clearSessionHooks(setAppState, sessionId) {
  setAppState((prev) => {
    prev.sessionHooks.delete(sessionId);
    return prev;
  });
  logForDebugging(`Cleared all session hooks for session ${sessionId}`);
}
export {
  addFunctionHook,
  addSessionHook,
  clearSessionHooks,
  getSessionFunctionHooks,
  getSessionHookCallback,
  getSessionHooks,
  removeFunctionHook,
  removeSessionHook
};
