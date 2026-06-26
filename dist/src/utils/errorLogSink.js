import axios from "axios";
import { dirname, join } from "path";
import { getSessionId } from "../bootstrap/state.js";
import { createBufferedWriter } from "./bufferedWriter.js";
import { CACHE_PATHS } from "./cachePaths.js";
import { registerCleanup } from "./cleanupRegistry.js";
import { logForDebugging } from "./debug.js";
import { getFsImplementation } from "./fsOperations.js";
import { attachErrorLogSink, dateToFilename } from "./log.js";
import { jsonStringify } from "./slowOperations.js";
const DATE = dateToFilename(/* @__PURE__ */ new Date());
function getErrorsPath() {
  return join(CACHE_PATHS.errors(), DATE + ".jsonl");
}
function getMCPLogsPath(serverName) {
  return join(CACHE_PATHS.mcpLogs(serverName), DATE + ".jsonl");
}
function createJsonlWriter(options) {
  const writer = createBufferedWriter(options);
  return {
    write(obj) {
      writer.write(jsonStringify(obj) + "\n");
    },
    flush: writer.flush,
    dispose: writer.dispose
  };
}
const logWriters = /* @__PURE__ */ new Map();
function _flushLogWritersForTesting() {
  for (const writer of logWriters.values()) {
    writer.flush();
  }
}
function _clearLogWritersForTesting() {
  for (const writer of logWriters.values()) {
    writer.dispose();
  }
  logWriters.clear();
}
function getLogWriter(path) {
  let writer = logWriters.get(path);
  if (!writer) {
    const dir = dirname(path);
    writer = createJsonlWriter({
      // sync IO: called from sync context
      writeFn: (content) => {
        try {
          getFsImplementation().appendFileSync(path, content);
        } catch {
          getFsImplementation().mkdirSync(dir);
          getFsImplementation().appendFileSync(path, content);
        }
      },
      flushIntervalMs: 1e3,
      maxBufferSize: 50
    });
    logWriters.set(path, writer);
    registerCleanup(async () => writer?.dispose());
  }
  return writer;
}
function appendToLog(path, message) {
  if (process.env.USER_TYPE !== "ant") {
    return;
  }
  const messageWithTimestamp = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...message,
    cwd: getFsImplementation().cwd(),
    userType: process.env.USER_TYPE,
    sessionId: getSessionId(),
    version: "0.0.0-dev"
  };
  getLogWriter(path).write(messageWithTimestamp);
}
function extractServerMessage(data) {
  if (typeof data === "string") {
    return data;
  }
  if (data && typeof data === "object") {
    const obj = data;
    if (typeof obj.message === "string") {
      return obj.message;
    }
    if (typeof obj.error === "object" && obj.error && "message" in obj.error && typeof obj.error.message === "string") {
      return obj.error.message;
    }
  }
  return void 0;
}
function logErrorImpl(error) {
  const errorStr = error.stack || error.message;
  let context = "";
  if (axios.isAxiosError(error) && error.config?.url) {
    const parts = [`url=${error.config.url}`];
    if (error.response?.status !== void 0) {
      parts.push(`status=${error.response.status}`);
    }
    const serverMessage = extractServerMessage(error.response?.data);
    if (serverMessage) {
      parts.push(`body=${serverMessage}`);
    }
    context = `[${parts.join(",")}] `;
  }
  logForDebugging(`${error.name}: ${context}${errorStr}`, { level: "error" });
  appendToLog(getErrorsPath(), {
    error: `${context}${errorStr}`
  });
}
function logMCPErrorImpl(serverName, error) {
  logForDebugging(`MCP server "${serverName}" ${error}`, { level: "error" });
  const logFile = getMCPLogsPath(serverName);
  const errorStr = error instanceof Error ? error.stack || error.message : String(error);
  const errorInfo = {
    error: errorStr,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    sessionId: getSessionId(),
    cwd: getFsImplementation().cwd()
  };
  getLogWriter(logFile).write(errorInfo);
}
function logMCPDebugImpl(serverName, message) {
  logForDebugging(`MCP server "${serverName}": ${message}`);
  const logFile = getMCPLogsPath(serverName);
  const debugInfo = {
    debug: message,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    sessionId: getSessionId(),
    cwd: getFsImplementation().cwd()
  };
  getLogWriter(logFile).write(debugInfo);
}
function initializeErrorLogSink() {
  attachErrorLogSink({
    logError: logErrorImpl,
    logMCPError: logMCPErrorImpl,
    logMCPDebug: logMCPDebugImpl,
    getErrorsPath,
    getMCPLogsPath
  });
  logForDebugging("Error log sink initialized");
}
export {
  _clearLogWritersForTesting,
  _flushLogWritersForTesting,
  getErrorsPath,
  getMCPLogsPath,
  initializeErrorLogSink
};
