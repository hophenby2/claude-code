import { registerCleanup } from "./cleanupRegistry.js";
import { logForDebugging } from "./debug.js";
const STDOUT_GUARD_MARKER = "[stdout-guard]";
let installed = false;
let buffer = "";
let originalWrite = null;
function isJsonLine(line) {
  if (line.length === 0) {
    return true;
  }
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}
function installStreamJsonStdoutGuard() {
  if (installed) {
    return;
  }
  installed = true;
  originalWrite = process.stdout.write.bind(
    process.stdout
  );
  process.stdout.write = function(chunk, encodingOrCb, cb) {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
    buffer += text;
    let newlineIdx;
    let wrote = true;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (isJsonLine(line)) {
        wrote = originalWrite(line + "\n");
      } else {
        process.stderr.write(`${STDOUT_GUARD_MARKER} ${line}
`);
        logForDebugging(
          `streamJsonStdoutGuard diverted non-JSON stdout line: ${line.slice(0, 200)}`
        );
      }
    }
    const callback = typeof encodingOrCb === "function" ? encodingOrCb : cb;
    if (callback) {
      queueMicrotask(() => callback());
    }
    return wrote;
  };
  registerCleanup(async () => {
    if (buffer.length > 0) {
      if (originalWrite && isJsonLine(buffer)) {
        originalWrite(buffer + "\n");
      } else {
        process.stderr.write(`${STDOUT_GUARD_MARKER} ${buffer}
`);
      }
      buffer = "";
    }
    if (originalWrite) {
      process.stdout.write = originalWrite;
      originalWrite = null;
    }
    installed = false;
  });
}
function _resetStreamJsonStdoutGuardForTesting() {
  if (originalWrite) {
    process.stdout.write = originalWrite;
    originalWrite = null;
  }
  buffer = "";
  installed = false;
}
export {
  STDOUT_GUARD_MARKER,
  _resetStreamJsonStdoutGuardForTesting,
  installStreamJsonStdoutGuard
};
