import { logForDebugging } from "./debug.js";
import { which } from "./which.js";
const binaryCache = /* @__PURE__ */ new Map();
async function isBinaryInstalled(command) {
  if (!command || !command.trim()) {
    logForDebugging("[binaryCheck] Empty command provided, returning false");
    return false;
  }
  const trimmedCommand = command.trim();
  const cached = binaryCache.get(trimmedCommand);
  if (cached !== void 0) {
    logForDebugging(
      `[binaryCheck] Cache hit for '${trimmedCommand}': ${cached}`
    );
    return cached;
  }
  let exists = false;
  if (await which(trimmedCommand).catch(() => null)) {
    exists = true;
  }
  binaryCache.set(trimmedCommand, exists);
  logForDebugging(
    `[binaryCheck] Binary '${trimmedCommand}' ${exists ? "found" : "not found"}`
  );
  return exists;
}
function clearBinaryCache() {
  binaryCache.clear();
}
export {
  clearBinaryCache,
  isBinaryInstalled
};
