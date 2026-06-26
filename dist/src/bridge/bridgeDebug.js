import { logForDebugging } from "../utils/debug.js";
import { BridgeFatalError } from "./bridgeApi.js";
let debugHandle = null;
const faultQueue = [];
function registerBridgeDebugHandle(h) {
  debugHandle = h;
}
function clearBridgeDebugHandle() {
  debugHandle = null;
  faultQueue.length = 0;
}
function getBridgeDebugHandle() {
  return debugHandle;
}
function injectBridgeFault(fault) {
  faultQueue.push(fault);
  logForDebugging(
    `[bridge:debug] Queued fault: ${fault.method} ${fault.kind}/${fault.status}${fault.errorType ? `/${fault.errorType}` : ""} \xD7${fault.count}`
  );
}
function wrapApiForFaultInjection(api) {
  function consume(method) {
    const idx = faultQueue.findIndex((f) => f.method === method);
    if (idx === -1) return null;
    const fault = faultQueue[idx];
    fault.count--;
    if (fault.count <= 0) faultQueue.splice(idx, 1);
    return fault;
  }
  function throwFault(fault, context) {
    logForDebugging(
      `[bridge:debug] Injecting ${fault.kind} fault into ${context}: status=${fault.status} errorType=${fault.errorType ?? "none"}`
    );
    if (fault.kind === "fatal") {
      throw new BridgeFatalError(
        `[injected] ${context} ${fault.status}`,
        fault.status,
        fault.errorType
      );
    }
    throw new Error(`[injected transient] ${context} ${fault.status}`);
  }
  return {
    ...api,
    async pollForWork(envId, secret, signal, reclaimMs) {
      const f = consume("pollForWork");
      if (f) throwFault(f, "Poll");
      return api.pollForWork(envId, secret, signal, reclaimMs);
    },
    async registerBridgeEnvironment(config) {
      const f = consume("registerBridgeEnvironment");
      if (f) throwFault(f, "Registration");
      return api.registerBridgeEnvironment(config);
    },
    async reconnectSession(envId, sessionId) {
      const f = consume("reconnectSession");
      if (f) throwFault(f, "ReconnectSession");
      return api.reconnectSession(envId, sessionId);
    },
    async heartbeatWork(envId, workId, token) {
      const f = consume("heartbeatWork");
      if (f) throwFault(f, "Heartbeat");
      return api.heartbeatWork(envId, workId, token);
    }
  };
}
export {
  clearBridgeDebugHandle,
  getBridgeDebugHandle,
  injectBridgeFault,
  registerBridgeDebugHandle,
  wrapApiForFaultInjection
};
