import { saveGlobalConfig } from "../utils/config.js";
function migrateReplBridgeEnabledToRemoteControlAtStartup() {
  saveGlobalConfig((prev) => {
    const oldValue = prev["replBridgeEnabled"];
    if (oldValue === void 0) return prev;
    if (prev.remoteControlAtStartup !== void 0) return prev;
    const next = { ...prev, remoteControlAtStartup: Boolean(oldValue) };
    delete next["replBridgeEnabled"];
    return next;
  });
}
export {
  migrateReplBridgeEnabledToRemoteControlAtStartup
};
