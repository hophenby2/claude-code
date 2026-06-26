import { dirname } from "path";
import { getFsImplementation } from "./fsOperations.js";
import { jsonStringify } from "./slowOperations.js";
function logForDiagnosticsNoPII(level, event, data) {
  const logFile = getDiagnosticLogFile();
  if (!logFile) {
    return;
  }
  const entry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    event,
    data: data ?? {}
  };
  const fs = getFsImplementation();
  const line = jsonStringify(entry) + "\n";
  try {
    fs.appendFileSync(logFile, line);
  } catch {
    try {
      fs.mkdirSync(dirname(logFile));
      fs.appendFileSync(logFile, line);
    } catch {
    }
  }
}
function getDiagnosticLogFile() {
  return process.env.CLAUDE_CODE_DIAGNOSTICS_FILE;
}
async function withDiagnosticsTiming(event, fn, getData) {
  const startTime = Date.now();
  logForDiagnosticsNoPII("info", `${event}_started`);
  try {
    const result = await fn();
    const additionalData = getData ? getData(result) : {};
    logForDiagnosticsNoPII("info", `${event}_completed`, {
      duration_ms: Date.now() - startTime,
      ...additionalData
    });
    return result;
  } catch (error) {
    logForDiagnosticsNoPII("error", `${event}_failed`, {
      duration_ms: Date.now() - startTime
    });
    throw error;
  }
}
export {
  logForDiagnosticsNoPII,
  withDiagnosticsTiming
};
