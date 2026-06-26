import memoize from "lodash-es/memoize.js";
import { which } from "../which.js";
async function isCommandAvailable(command) {
  try {
    return !!await which(command);
  } catch {
    return false;
  }
}
const checkGitAvailable = memoize(async () => {
  return isCommandAvailable("git");
});
function markGitUnavailable() {
  checkGitAvailable.cache?.set?.(void 0, Promise.resolve(false));
}
function clearGitAvailabilityCache() {
  checkGitAvailable.cache?.clear?.();
}
export {
  checkGitAvailable,
  clearGitAvailabilityCache,
  markGitUnavailable
};
