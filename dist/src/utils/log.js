const feature = (_name) => false;
import { readdir, readFile, stat } from "fs/promises";
import memoize from "lodash-es/memoize.js";
import { join } from "path";
import {
  setLastAPIRequest,
  setLastAPIRequestMessages
} from "../bootstrap/state.js";
import { TICK_TAG } from "../constants/xml.js";
import {
  sortLogs
} from "../types/logs.js";
import { CACHE_PATHS } from "./cachePaths.js";
import { stripDisplayTags, stripDisplayTagsAllowEmpty } from "./displayTags.js";
import { isEnvTruthy } from "./envUtils.js";
import { toError } from "./errors.js";
import { isEssentialTrafficOnly } from "./privacyLevel.js";
import { jsonParse } from "./slowOperations.js";
function getLogDisplayTitle(log, defaultTitle) {
  const isAutonomousPrompt = log.firstPrompt?.startsWith(`<${TICK_TAG}>`);
  const strippedFirstPrompt = log.firstPrompt ? stripDisplayTagsAllowEmpty(log.firstPrompt) : "";
  const useFirstPrompt = strippedFirstPrompt && !isAutonomousPrompt;
  const title = log.agentName || log.customTitle || log.summary || (useFirstPrompt ? strippedFirstPrompt : void 0) || defaultTitle || // For autonomous sessions without other context, show a meaningful label
  (isAutonomousPrompt ? "Autonomous session" : void 0) || // Fall back to truncated session ID for lite logs with no metadata
  (log.sessionId ? log.sessionId.slice(0, 8) : "") || "";
  return stripDisplayTags(title).trim();
}
function dateToFilename(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}
const MAX_IN_MEMORY_ERRORS = 100;
let inMemoryErrorLog = [];
function addToInMemoryErrorLog(errorInfo) {
  if (inMemoryErrorLog.length >= MAX_IN_MEMORY_ERRORS) {
    inMemoryErrorLog.shift();
  }
  inMemoryErrorLog.push(errorInfo);
}
const errorQueue = [];
let errorLogSink = null;
function attachErrorLogSink(newSink) {
  if (errorLogSink !== null) {
    return;
  }
  errorLogSink = newSink;
  if (errorQueue.length > 0) {
    const queuedEvents = [...errorQueue];
    errorQueue.length = 0;
    for (const event of queuedEvents) {
      switch (event.type) {
        case "error":
          errorLogSink.logError(event.error);
          break;
        case "mcpError":
          errorLogSink.logMCPError(event.serverName, event.error);
          break;
        case "mcpDebug":
          errorLogSink.logMCPDebug(event.serverName, event.message);
          break;
      }
    }
  }
}
const isHardFailMode = memoize(() => {
  return process.argv.includes("--hard-fail");
});
function logError(error) {
  const err = toError(error);
  if (false) {
    console.error("[HARD FAIL] logError called with:", err.stack || err.message);
    process.exit(1);
  }
  try {
    if (
      // Cloud providers (Bedrock/Vertex/Foundry) always disable features
      isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) || isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) || isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY) || process.env.DISABLE_ERROR_REPORTING || isEssentialTrafficOnly()
    ) {
      return;
    }
    const errorStr = err.stack || err.message;
    const errorInfo = {
      error: errorStr,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    addToInMemoryErrorLog(errorInfo);
    if (errorLogSink === null) {
      errorQueue.push({ type: "error", error: err });
      return;
    }
    errorLogSink.logError(err);
  } catch {
  }
}
function getInMemoryErrors() {
  return [...inMemoryErrorLog];
}
function loadErrorLogs() {
  return loadLogList(CACHE_PATHS.errors());
}
async function getErrorLogByIndex(index) {
  const logs = await loadErrorLogs();
  return logs[index] || null;
}
async function loadLogList(path) {
  let files;
  try {
    files = await readdir(path, { withFileTypes: true });
  } catch {
    logError(new Error(`No logs found at ${path}`));
    return [];
  }
  const logData = await Promise.all(
    files.map(async (file, i) => {
      const fullPath = join(path, file.name);
      const content = await readFile(fullPath, { encoding: "utf8" });
      const messages = jsonParse(content);
      const firstMessage = messages[0];
      const lastMessage = messages[messages.length - 1];
      const firstPrompt = firstMessage?.type === "user" && typeof firstMessage?.message?.content === "string" ? firstMessage?.message?.content : "No prompt";
      const fileStats = await stat(fullPath);
      const isSidechain = fullPath.includes("sidechain");
      const date = dateToFilename(fileStats.mtime);
      return {
        date,
        fullPath,
        messages,
        value: i,
        // hack: overwritten after sorting, right below this
        created: parseISOString(firstMessage?.timestamp || date),
        modified: lastMessage?.timestamp ? parseISOString(lastMessage.timestamp) : parseISOString(date),
        firstPrompt: firstPrompt.split("\n")[0]?.slice(0, 50) + (firstPrompt.length > 50 ? "\u2026" : "") || "No prompt",
        messageCount: messages.length,
        isSidechain
      };
    })
  );
  return sortLogs(logData.filter((_) => _ !== null)).map((_, i) => ({
    ..._,
    value: i
  }));
}
function parseISOString(s) {
  const b = s.split(/\D+/);
  return new Date(
    Date.UTC(
      parseInt(b[0], 10),
      parseInt(b[1], 10) - 1,
      parseInt(b[2], 10),
      parseInt(b[3], 10),
      parseInt(b[4], 10),
      parseInt(b[5], 10),
      parseInt(b[6], 10)
    )
  );
}
function logMCPError(serverName, error) {
  try {
    if (errorLogSink === null) {
      errorQueue.push({ type: "mcpError", serverName, error });
      return;
    }
    errorLogSink.logMCPError(serverName, error);
  } catch {
  }
}
function logMCPDebug(serverName, message) {
  try {
    if (errorLogSink === null) {
      errorQueue.push({ type: "mcpDebug", serverName, message });
      return;
    }
    errorLogSink.logMCPDebug(serverName, message);
  } catch {
  }
}
function captureAPIRequest(params, querySource) {
  if (!querySource || !querySource.startsWith("repl_main_thread")) {
    return;
  }
  const { messages, ...paramsWithoutMessages } = params;
  setLastAPIRequest(paramsWithoutMessages);
  setLastAPIRequestMessages(process.env.USER_TYPE === "ant" ? messages : null);
}
function _resetErrorLogForTesting() {
  errorLogSink = null;
  errorQueue.length = 0;
  inMemoryErrorLog = [];
}
export {
  _resetErrorLogForTesting,
  attachErrorLogSink,
  captureAPIRequest,
  dateToFilename,
  getErrorLogByIndex,
  getInMemoryErrors,
  getLogDisplayTitle,
  loadErrorLogs,
  logError,
  logMCPDebug,
  logMCPError
};
