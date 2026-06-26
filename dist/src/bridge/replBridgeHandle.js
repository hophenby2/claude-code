import { updateSessionBridgeId } from "../utils/concurrentSessions.js";
import { toCompatSessionId } from "./sessionIdCompat.js";
let handle = null;
function setReplBridgeHandle(h) {
  handle = h;
  void updateSessionBridgeId(getSelfBridgeCompatId() ?? null).catch(() => {
  });
}
function getReplBridgeHandle() {
  return handle;
}
function getSelfBridgeCompatId() {
  const h = getReplBridgeHandle();
  return h ? toCompatSessionId(h.bridgeSessionId) : void 0;
}
export {
  getReplBridgeHandle,
  getSelfBridgeCompatId,
  setReplBridgeHandle
};
