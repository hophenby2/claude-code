const feature = (_name) => false;
import { useEffect, useRef } from "react";
import {
  useAppState,
  useAppStateStore,
  useSetAppState
} from "../../state/AppState.js";
import { getIsRemoteMode } from "../../bootstrap/state.js";
import {
  createDisabledBypassPermissionsContext,
  shouldDisableBypassPermissions
} from "./permissionSetup.js";
let bypassPermissionsCheckRan = false;
async function checkAndDisableBypassPermissionsIfNeeded(toolPermissionContext, setAppState) {
  if (bypassPermissionsCheckRan) {
    return;
  }
  bypassPermissionsCheckRan = true;
  if (!toolPermissionContext.isBypassPermissionsModeAvailable) {
    return;
  }
  const shouldDisable = await shouldDisableBypassPermissions();
  if (!shouldDisable) {
    return;
  }
  setAppState((prev) => {
    return {
      ...prev,
      toolPermissionContext: createDisabledBypassPermissionsContext(
        prev.toolPermissionContext
      )
    };
  });
}
function resetBypassPermissionsCheck() {
  bypassPermissionsCheckRan = false;
}
function useKickOffCheckAndDisableBypassPermissionsIfNeeded() {
  const toolPermissionContext = useAppState((s) => s.toolPermissionContext);
  const setAppState = useSetAppState();
  useEffect(() => {
    if (getIsRemoteMode()) return;
    void checkAndDisableBypassPermissionsIfNeeded(
      toolPermissionContext,
      setAppState
    );
  }, []);
}
let autoModeCheckRan = false;
async function checkAndDisableAutoModeIfNeeded(toolPermissionContext, setAppState, fastMode) {
  if (false) {
    if (autoModeCheckRan) {
      return;
    }
    autoModeCheckRan = true;
    const { updateContext, notification } = await verifyAutoModeGateAccess(
      toolPermissionContext,
      fastMode
    );
    setAppState((prev) => {
      const nextCtx = updateContext(prev.toolPermissionContext);
      const newState = nextCtx === prev.toolPermissionContext ? prev : { ...prev, toolPermissionContext: nextCtx };
      if (!notification) return newState;
      return {
        ...newState,
        notifications: {
          ...newState.notifications,
          queue: [
            ...newState.notifications.queue,
            {
              key: "auto-mode-gate-notification",
              text: notification,
              color: "warning",
              priority: "high"
            }
          ]
        }
      };
    });
  }
}
function resetAutoModeGateCheck() {
  autoModeCheckRan = false;
}
function useKickOffCheckAndDisableAutoModeIfNeeded() {
  const mainLoopModel = useAppState((s) => s.mainLoopModel);
  const mainLoopModelForSession = useAppState((s) => s.mainLoopModelForSession);
  const fastMode = useAppState((s) => s.fastMode);
  const setAppState = useSetAppState();
  const store = useAppStateStore();
  const isFirstRunRef = useRef(true);
  useEffect(() => {
    if (getIsRemoteMode()) return;
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
    } else {
      resetAutoModeGateCheck();
    }
    void checkAndDisableAutoModeIfNeeded(
      store.getState().toolPermissionContext,
      setAppState,
      fastMode
    );
  }, [mainLoopModel, mainLoopModelForSession, fastMode]);
}
export {
  checkAndDisableAutoModeIfNeeded,
  checkAndDisableBypassPermissionsIfNeeded,
  resetAutoModeGateCheck,
  resetBypassPermissionsCheck,
  useKickOffCheckAndDisableAutoModeIfNeeded,
  useKickOffCheckAndDisableBypassPermissionsIfNeeded
};
