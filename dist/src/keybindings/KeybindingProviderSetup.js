import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNotifications } from "../context/notifications.js";
import { useInput } from "../ink.js";
import { count } from "../utils/array.js";
import { logForDebugging } from "../utils/debug.js";
import { plural } from "../utils/stringUtils.js";
import { KeybindingProvider } from "./KeybindingContext.js";
import { initializeKeybindingWatcher, loadKeybindingsSyncWithWarnings, subscribeToKeybindingChanges } from "./loadUserBindings.js";
import { resolveKeyWithChordState } from "./resolver.js";
const CHORD_TIMEOUT_MS = 1e3;
function useKeybindingWarnings(warnings, isReload) {
  const $ = _c(9);
  const {
    addNotification,
    removeNotification
  } = useNotifications();
  let t0;
  if ($[0] !== addNotification || $[1] !== removeNotification || $[2] !== warnings) {
    t0 = () => {
      if (warnings.length === 0) {
        removeNotification("keybinding-config-warning");
        return;
      }
      const errorCount = count(warnings, _temp);
      const warnCount = count(warnings, _temp2);
      let message;
      if (errorCount > 0 && warnCount > 0) {
        message = `Found ${errorCount} keybinding ${plural(errorCount, "error")} and ${warnCount} ${plural(warnCount, "warning")}`;
      } else {
        if (errorCount > 0) {
          message = `Found ${errorCount} keybinding ${plural(errorCount, "error")}`;
        } else {
          message = `Found ${warnCount} keybinding ${plural(warnCount, "warning")}`;
        }
      }
      message = message + " \xB7 /doctor for details";
      addNotification({
        key: "keybinding-config-warning",
        text: message,
        color: errorCount > 0 ? "error" : "warning",
        priority: errorCount > 0 ? "immediate" : "high",
        timeoutMs: 6e4
      });
    };
    $[0] = addNotification;
    $[1] = removeNotification;
    $[2] = warnings;
    $[3] = t0;
  } else {
    t0 = $[3];
  }
  let t1;
  if ($[4] !== addNotification || $[5] !== isReload || $[6] !== removeNotification || $[7] !== warnings) {
    t1 = [warnings, isReload, addNotification, removeNotification];
    $[4] = addNotification;
    $[5] = isReload;
    $[6] = removeNotification;
    $[7] = warnings;
    $[8] = t1;
  } else {
    t1 = $[8];
  }
  useEffect(t0, t1);
}
function _temp2(w_0) {
  return w_0.severity === "warning";
}
function _temp(w) {
  return w.severity === "error";
}
function KeybindingSetup({
  children
}) {
  const [{
    bindings,
    warnings
  }, setLoadResult] = useState(() => {
    const result = loadKeybindingsSyncWithWarnings();
    logForDebugging(`[keybindings] KeybindingSetup initialized with ${result.bindings.length} bindings, ${result.warnings.length} warnings`);
    return result;
  });
  const [isReload, setIsReload] = useState(false);
  useKeybindingWarnings(warnings, isReload);
  const pendingChordRef = useRef(null);
  const [pendingChord, setPendingChordState] = useState(null);
  const chordTimeoutRef = useRef(null);
  const handlerRegistryRef = useRef(/* @__PURE__ */ new Map());
  const activeContextsRef = useRef(/* @__PURE__ */ new Set());
  const registerActiveContext = useCallback((context) => {
    activeContextsRef.current.add(context);
  }, []);
  const unregisterActiveContext = useCallback((context_0) => {
    activeContextsRef.current.delete(context_0);
  }, []);
  const clearChordTimeout = useCallback(() => {
    if (chordTimeoutRef.current) {
      clearTimeout(chordTimeoutRef.current);
      chordTimeoutRef.current = null;
    }
  }, []);
  const setPendingChord = useCallback((pending) => {
    clearChordTimeout();
    if (pending !== null) {
      chordTimeoutRef.current = setTimeout((pendingChordRef_0, setPendingChordState_0) => {
        logForDebugging("[keybindings] Chord timeout - cancelling");
        pendingChordRef_0.current = null;
        setPendingChordState_0(null);
      }, CHORD_TIMEOUT_MS, pendingChordRef, setPendingChordState);
    }
    pendingChordRef.current = pending;
    setPendingChordState(pending);
  }, [clearChordTimeout]);
  useEffect(() => {
    void initializeKeybindingWatcher();
    const unsubscribe = subscribeToKeybindingChanges((result_0) => {
      setIsReload(true);
      setLoadResult(result_0);
      logForDebugging(`[keybindings] Reloaded: ${result_0.bindings.length} bindings, ${result_0.warnings.length} warnings`);
    });
    return () => {
      unsubscribe();
      clearChordTimeout();
    };
  }, [clearChordTimeout]);
  return /* @__PURE__ */ jsxs(KeybindingProvider, { bindings, pendingChordRef, pendingChord, setPendingChord, activeContexts: activeContextsRef.current, registerActiveContext, unregisterActiveContext, handlerRegistryRef, children: [
    /* @__PURE__ */ jsx(ChordInterceptor, { bindings, pendingChordRef, setPendingChord, activeContexts: activeContextsRef.current, handlerRegistryRef }),
    children
  ] });
}
function ChordInterceptor(t0) {
  const $ = _c(6);
  const {
    bindings,
    pendingChordRef,
    setPendingChord,
    activeContexts,
    handlerRegistryRef
  } = t0;
  let t1;
  if ($[0] !== activeContexts || $[1] !== bindings || $[2] !== handlerRegistryRef || $[3] !== pendingChordRef || $[4] !== setPendingChord) {
    t1 = (input, key, event) => {
      if ((key.wheelUp || key.wheelDown) && pendingChordRef.current === null) {
        return;
      }
      const registry = handlerRegistryRef.current;
      const handlerContexts = /* @__PURE__ */ new Set();
      if (registry) {
        for (const handlers of registry.values()) {
          for (const registration of handlers) {
            handlerContexts.add(registration.context);
          }
        }
      }
      const contexts = [...handlerContexts, ...activeContexts, "Global"];
      const wasInChord = pendingChordRef.current !== null;
      const result = resolveKeyWithChordState(input, key, contexts, bindings, pendingChordRef.current);
      bb23: switch (result.type) {
        case "chord_started": {
          setPendingChord(result.pending);
          event.stopImmediatePropagation();
          break bb23;
        }
        case "match": {
          setPendingChord(null);
          if (wasInChord) {
            const contextsSet = new Set(contexts);
            if (registry) {
              const handlers_0 = registry.get(result.action);
              if (handlers_0 && handlers_0.size > 0) {
                for (const registration_0 of handlers_0) {
                  if (contextsSet.has(registration_0.context)) {
                    registration_0.handler();
                    event.stopImmediatePropagation();
                    break;
                  }
                }
              }
            }
          }
          break bb23;
        }
        case "chord_cancelled": {
          setPendingChord(null);
          event.stopImmediatePropagation();
          break bb23;
        }
        case "unbound": {
          setPendingChord(null);
          event.stopImmediatePropagation();
          break bb23;
        }
        case "none":
      }
    };
    $[0] = activeContexts;
    $[1] = bindings;
    $[2] = handlerRegistryRef;
    $[3] = pendingChordRef;
    $[4] = setPendingChord;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  const handleInput = t1;
  useInput(handleInput);
  return null;
}
export {
  KeybindingSetup
};
