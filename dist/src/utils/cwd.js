import { AsyncLocalStorage } from "async_hooks";
import { getCwdState, getOriginalCwd } from "../bootstrap/state.js";
const cwdOverrideStorage = new AsyncLocalStorage();
function runWithCwdOverride(cwd, fn) {
  return cwdOverrideStorage.run(cwd, fn);
}
function pwd() {
  return cwdOverrideStorage.getStore() ?? getCwdState();
}
function getCwd() {
  try {
    return pwd();
  } catch {
    return getOriginalCwd();
  }
}
export {
  getCwd,
  pwd,
  runWithCwdOverride
};
