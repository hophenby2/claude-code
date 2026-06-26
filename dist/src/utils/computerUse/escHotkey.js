import { logForDebugging } from "../debug.js";
import { releasePump, retainPump } from "./drainRunLoop.js";
import { requireComputerUseSwift } from "./swiftLoader.js";
let registered = false;
function registerEscHotkey(onEscape) {
  if (registered) return true;
  const cu = requireComputerUseSwift();
  if (!cu.hotkey.registerEscape(onEscape)) {
    logForDebugging("[cu-esc] registerEscape returned false", { level: "warn" });
    return false;
  }
  retainPump();
  registered = true;
  logForDebugging("[cu-esc] registered");
  return true;
}
function unregisterEscHotkey() {
  if (!registered) return;
  try {
    requireComputerUseSwift().hotkey.unregister();
  } finally {
    releasePump();
    registered = false;
    logForDebugging("[cu-esc] unregistered");
  }
}
function notifyExpectedEscape() {
  if (!registered) return;
  requireComputerUseSwift().hotkey.notifyExpectedEscape();
}
export {
  notifyExpectedEscape,
  registerEscHotkey,
  unregisterEscHotkey
};
