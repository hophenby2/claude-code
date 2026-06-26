import { logForDebugging } from "../debug.js";
import { withResolvers } from "../withResolvers.js";
import { requireComputerUseSwift } from "./swiftLoader.js";
let pump;
let pending = 0;
function drainTick(cu) {
  cu._drainMainRunLoop();
}
function retain() {
  pending++;
  if (pump === void 0) {
    pump = setInterval(drainTick, 1, requireComputerUseSwift());
    logForDebugging("[drainRunLoop] pump started", { level: "verbose" });
  }
}
function release() {
  pending--;
  if (pending <= 0 && pump !== void 0) {
    clearInterval(pump);
    pump = void 0;
    logForDebugging("[drainRunLoop] pump stopped", { level: "verbose" });
    pending = 0;
  }
}
const TIMEOUT_MS = 3e4;
function timeoutReject(reject) {
  reject(new Error(`computer-use native call exceeded ${TIMEOUT_MS}ms`));
}
const retainPump = retain;
const releasePump = release;
async function drainRunLoop(fn) {
  retain();
  let timer;
  try {
    const work = fn();
    work.catch(() => {
    });
    const timeout = withResolvers();
    timer = setTimeout(timeoutReject, TIMEOUT_MS, timeout.reject);
    return await Promise.race([work, timeout.promise]);
  } finally {
    clearTimeout(timer);
    release();
  }
}
export {
  drainRunLoop,
  releasePump,
  retainPump
};
