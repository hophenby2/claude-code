import { registerCleanup } from "./cleanupRegistry.js";
import { logForDiagnosticsNoPII } from "./diagLogs.js";
import { isEnvTruthy } from "./envUtils.js";
const SESSION_ACTIVITY_INTERVAL_MS = 3e4;
let activityCallback = null;
let refcount = 0;
const activeReasons = /* @__PURE__ */ new Map();
let oldestActivityStartedAt = null;
let heartbeatTimer = null;
let idleTimer = null;
let cleanupRegistered = false;
function startHeartbeatTimer() {
  clearIdleTimer();
  heartbeatTimer = setInterval(() => {
    logForDiagnosticsNoPII("debug", "session_keepalive_heartbeat", {
      refcount
    });
    if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE_SEND_KEEPALIVES)) {
      activityCallback?.();
    }
  }, SESSION_ACTIVITY_INTERVAL_MS);
}
function startIdleTimer() {
  clearIdleTimer();
  if (activityCallback === null) {
    return;
  }
  idleTimer = setTimeout(() => {
    logForDiagnosticsNoPII("info", "session_idle_30s");
    idleTimer = null;
  }, SESSION_ACTIVITY_INTERVAL_MS);
}
function clearIdleTimer() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}
function registerSessionActivityCallback(cb) {
  activityCallback = cb;
  if (refcount > 0 && heartbeatTimer === null) {
    startHeartbeatTimer();
  }
}
function unregisterSessionActivityCallback() {
  activityCallback = null;
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  clearIdleTimer();
}
function sendSessionActivitySignal() {
  if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE_SEND_KEEPALIVES)) {
    activityCallback?.();
  }
}
function isSessionActivityTrackingActive() {
  return activityCallback !== null;
}
function startSessionActivity(reason) {
  refcount++;
  activeReasons.set(reason, (activeReasons.get(reason) ?? 0) + 1);
  if (refcount === 1) {
    oldestActivityStartedAt = Date.now();
    if (activityCallback !== null && heartbeatTimer === null) {
      startHeartbeatTimer();
    }
  }
  if (!cleanupRegistered) {
    cleanupRegistered = true;
    registerCleanup(async () => {
      logForDiagnosticsNoPII("info", "session_activity_at_shutdown", {
        refcount,
        active: Object.fromEntries(activeReasons),
        // Only meaningful while work is in-flight; stale otherwise.
        oldest_activity_ms: refcount > 0 && oldestActivityStartedAt !== null ? Date.now() - oldestActivityStartedAt : null
      });
    });
  }
}
function stopSessionActivity(reason) {
  if (refcount > 0) {
    refcount--;
  }
  const n = (activeReasons.get(reason) ?? 0) - 1;
  if (n > 0) activeReasons.set(reason, n);
  else activeReasons.delete(reason);
  if (refcount === 0 && heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    startIdleTimer();
  }
}
export {
  isSessionActivityTrackingActive,
  registerSessionActivityCallback,
  sendSessionActivitySignal,
  startSessionActivity,
  stopSessionActivity,
  unregisterSessionActivityCallback
};
