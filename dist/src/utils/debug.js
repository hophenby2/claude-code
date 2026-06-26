import { appendFile, mkdir, symlink, unlink } from "fs/promises";
import memoize from "lodash-es/memoize.js";
import { dirname, join } from "path";
import { getSessionId } from "../bootstrap/state.js";
import { createBufferedWriter } from "./bufferedWriter.js";
import { registerCleanup } from "./cleanupRegistry.js";
import {
  parseDebugFilter,
  shouldShowDebugMessage
} from "./debugFilter.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "./envUtils.js";
import { getFsImplementation } from "./fsOperations.js";
import { writeToStderr } from "./process.js";
import { jsonStringify } from "./slowOperations.js";
const LEVEL_ORDER = {
  verbose: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4
};
const getMinDebugLogLevel = memoize(() => {
  const raw = process.env.CLAUDE_CODE_DEBUG_LOG_LEVEL?.toLowerCase().trim();
  if (raw && Object.hasOwn(LEVEL_ORDER, raw)) {
    return raw;
  }
  return "debug";
});
let runtimeDebugEnabled = false;
const isDebugMode = memoize(() => {
  return runtimeDebugEnabled || isEnvTruthy(process.env.DEBUG) || isEnvTruthy(process.env.DEBUG_SDK) || process.argv.includes("--debug") || process.argv.includes("-d") || isDebugToStdErr() || // Also check for --debug=pattern syntax
  process.argv.some((arg) => arg.startsWith("--debug=")) || // --debug-file implicitly enables debug mode
  getDebugFilePath() !== null;
});
function enableDebugLogging() {
  const wasActive = isDebugMode() || process.env.USER_TYPE === "ant";
  runtimeDebugEnabled = true;
  isDebugMode.cache.clear?.();
  return wasActive;
}
const getDebugFilter = memoize(() => {
  const debugArg = process.argv.find((arg) => arg.startsWith("--debug="));
  if (!debugArg) {
    return null;
  }
  const filterPattern = debugArg.substring("--debug=".length);
  return parseDebugFilter(filterPattern);
});
const isDebugToStdErr = memoize(() => {
  return process.argv.includes("--debug-to-stderr") || process.argv.includes("-d2e");
});
const getDebugFilePath = memoize(() => {
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith("--debug-file=")) {
      return arg.substring("--debug-file=".length);
    }
    if (arg === "--debug-file" && i + 1 < process.argv.length) {
      return process.argv[i + 1];
    }
  }
  return null;
});
function shouldLogDebugMessage(message) {
  if (process.env.NODE_ENV === "test" && !isDebugToStdErr()) {
    return false;
  }
  if (process.env.USER_TYPE !== "ant" && !isDebugMode()) {
    return false;
  }
  if (typeof process === "undefined" || typeof process.versions === "undefined" || typeof process.versions.node === "undefined") {
    return false;
  }
  const filter = getDebugFilter();
  return shouldShowDebugMessage(message, filter);
}
let hasFormattedOutput = false;
function setHasFormattedOutput(value) {
  hasFormattedOutput = value;
}
function getHasFormattedOutput() {
  return hasFormattedOutput;
}
let debugWriter = null;
let pendingWrite = Promise.resolve();
async function appendAsync(needMkdir, dir, path, content) {
  if (needMkdir) {
    await mkdir(dir, { recursive: true }).catch(() => {
    });
  }
  await appendFile(path, content);
  void updateLatestDebugLogSymlink();
}
function noop() {
}
function getDebugWriter() {
  if (!debugWriter) {
    let ensuredDir = null;
    debugWriter = createBufferedWriter({
      writeFn: (content) => {
        const path = getDebugLogPath();
        const dir = dirname(path);
        const needMkdir = ensuredDir !== dir;
        ensuredDir = dir;
        if (isDebugMode()) {
          if (needMkdir) {
            try {
              getFsImplementation().mkdirSync(dir);
            } catch {
            }
          }
          getFsImplementation().appendFileSync(path, content);
          void updateLatestDebugLogSymlink();
          return;
        }
        pendingWrite = pendingWrite.then(appendAsync.bind(null, needMkdir, dir, path, content)).catch(noop);
      },
      flushIntervalMs: 1e3,
      maxBufferSize: 100,
      immediateMode: isDebugMode()
    });
    registerCleanup(async () => {
      debugWriter?.dispose();
      await pendingWrite;
    });
  }
  return debugWriter;
}
async function flushDebugLogs() {
  debugWriter?.flush();
  await pendingWrite;
}
function logForDebugging(message, { level } = {
  level: "debug"
}) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[getMinDebugLogLevel()]) {
    return;
  }
  if (!shouldLogDebugMessage(message)) {
    return;
  }
  if (hasFormattedOutput && message.includes("\n")) {
    message = jsonStringify(message);
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const output = `${timestamp} [${level.toUpperCase()}] ${message.trim()}
`;
  if (isDebugToStdErr()) {
    writeToStderr(output);
    return;
  }
  getDebugWriter().write(output);
}
function getDebugLogPath() {
  return getDebugFilePath() ?? process.env.CLAUDE_CODE_DEBUG_LOGS_DIR ?? join(getClaudeConfigHomeDir(), "debug", `${getSessionId()}.txt`);
}
const updateLatestDebugLogSymlink = memoize(async () => {
  try {
    const debugLogPath = getDebugLogPath();
    const debugLogsDir = dirname(debugLogPath);
    const latestSymlinkPath = join(debugLogsDir, "latest");
    await unlink(latestSymlinkPath).catch(() => {
    });
    await symlink(debugLogPath, latestSymlinkPath);
  } catch {
  }
});
function logAntError(context, error) {
  if (process.env.USER_TYPE !== "ant") {
    return;
  }
  if (error instanceof Error && error.stack) {
    logForDebugging(`[ANT-ONLY] ${context} stack trace:
${error.stack}`, {
      level: "error"
    });
  }
}
export {
  enableDebugLogging,
  flushDebugLogs,
  getDebugFilePath,
  getDebugFilter,
  getDebugLogPath,
  getHasFormattedOutput,
  getMinDebugLogLevel,
  isDebugMode,
  isDebugToStdErr,
  logAntError,
  logForDebugging,
  setHasFormattedOutput
};
