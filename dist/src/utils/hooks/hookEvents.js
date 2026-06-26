import { HOOK_EVENTS } from "../../entrypoints/sdk/coreTypes.js";
import { logForDebugging } from "../debug.js";
const ALWAYS_EMITTED_HOOK_EVENTS = ["SessionStart", "Setup"];
const MAX_PENDING_EVENTS = 100;
const pendingEvents = [];
let eventHandler = null;
let allHookEventsEnabled = false;
function registerHookEventHandler(handler) {
  eventHandler = handler;
  if (handler && pendingEvents.length > 0) {
    for (const event of pendingEvents.splice(0)) {
      handler(event);
    }
  }
}
function emit(event) {
  if (eventHandler) {
    eventHandler(event);
  } else {
    pendingEvents.push(event);
    if (pendingEvents.length > MAX_PENDING_EVENTS) {
      pendingEvents.shift();
    }
  }
}
function shouldEmit(hookEvent) {
  if (ALWAYS_EMITTED_HOOK_EVENTS.includes(hookEvent)) {
    return true;
  }
  return allHookEventsEnabled && HOOK_EVENTS.includes(hookEvent);
}
function emitHookStarted(hookId, hookName, hookEvent) {
  if (!shouldEmit(hookEvent)) return;
  emit({
    type: "started",
    hookId,
    hookName,
    hookEvent
  });
}
function emitHookProgress(data) {
  if (!shouldEmit(data.hookEvent)) return;
  emit({
    type: "progress",
    ...data
  });
}
function startHookProgressInterval(params) {
  if (!shouldEmit(params.hookEvent)) return () => {
  };
  let lastEmittedOutput = "";
  const interval = setInterval(() => {
    void params.getOutput().then(({ stdout, stderr, output }) => {
      if (output === lastEmittedOutput) return;
      lastEmittedOutput = output;
      emitHookProgress({
        hookId: params.hookId,
        hookName: params.hookName,
        hookEvent: params.hookEvent,
        stdout,
        stderr,
        output
      });
    });
  }, params.intervalMs ?? 1e3);
  interval.unref();
  return () => clearInterval(interval);
}
function emitHookResponse(data) {
  const outputToLog = data.stdout || data.stderr || data.output;
  if (outputToLog) {
    logForDebugging(
      `Hook ${data.hookName} (${data.hookEvent}) ${data.outcome}:
${outputToLog}`
    );
  }
  if (!shouldEmit(data.hookEvent)) return;
  emit({
    type: "response",
    ...data
  });
}
function setAllHookEventsEnabled(enabled) {
  allHookEventsEnabled = enabled;
}
function clearHookEventState() {
  eventHandler = null;
  pendingEvents.length = 0;
  allHookEventsEnabled = false;
}
export {
  clearHookEventState,
  emitHookProgress,
  emitHookResponse,
  emitHookStarted,
  registerHookEventHandler,
  setAllHookEventsEnabled,
  startHookProgressInterval
};
