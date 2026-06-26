import { isEnvTruthy } from "./envUtils.js";
import { enqueueSdkEvent } from "./sdkEventQueue.js";
let stateListener = null;
let metadataListener = null;
let permissionModeListener = null;
function setSessionStateChangedListener(cb) {
  stateListener = cb;
}
function setSessionMetadataChangedListener(cb) {
  metadataListener = cb;
}
function setPermissionModeChangedListener(cb) {
  permissionModeListener = cb;
}
let hasPendingAction = false;
let currentState = "idle";
function getSessionState() {
  return currentState;
}
function notifySessionStateChanged(state, details) {
  currentState = state;
  stateListener?.(state, details);
  if (state === "requires_action" && details) {
    hasPendingAction = true;
    metadataListener?.({
      pending_action: details
    });
  } else if (hasPendingAction) {
    hasPendingAction = false;
    metadataListener?.({ pending_action: null });
  }
  if (state === "idle") {
    metadataListener?.({ task_summary: null });
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS)) {
    enqueueSdkEvent({
      type: "system",
      subtype: "session_state_changed",
      state
    });
  }
}
function notifySessionMetadataChanged(metadata) {
  metadataListener?.(metadata);
}
function notifyPermissionModeChanged(mode) {
  permissionModeListener?.(mode);
}
export {
  getSessionState,
  notifyPermissionModeChanged,
  notifySessionMetadataChanged,
  notifySessionStateChanged,
  setPermissionModeChangedListener,
  setSessionMetadataChangedListener,
  setSessionStateChangedListener
};
