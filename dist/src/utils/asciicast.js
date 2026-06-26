import { appendFile, rename } from "fs/promises";
import { basename, dirname, join } from "path";
import { getOriginalCwd, getSessionId } from "../bootstrap/state.js";
import { createBufferedWriter } from "./bufferedWriter.js";
import { registerCleanup } from "./cleanupRegistry.js";
import { logForDebugging } from "./debug.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "./envUtils.js";
import { getFsImplementation } from "./fsOperations.js";
import { sanitizePath } from "./path.js";
import { jsonStringify } from "./slowOperations.js";
const recordingState = {
  filePath: null,
  timestamp: 0
};
function getRecordFilePath() {
  if (recordingState.filePath !== null) {
    return recordingState.filePath;
  }
  if (process.env.USER_TYPE !== "ant") {
    return null;
  }
  if (!isEnvTruthy(process.env.CLAUDE_CODE_TERMINAL_RECORDING)) {
    return null;
  }
  const projectsDir = join(getClaudeConfigHomeDir(), "projects");
  const projectDir = join(projectsDir, sanitizePath(getOriginalCwd()));
  recordingState.timestamp = Date.now();
  recordingState.filePath = join(
    projectDir,
    `${getSessionId()}-${recordingState.timestamp}.cast`
  );
  return recordingState.filePath;
}
function _resetRecordingStateForTesting() {
  recordingState.filePath = null;
  recordingState.timestamp = 0;
}
function getSessionRecordingPaths() {
  const sessionId = getSessionId();
  const projectsDir = join(getClaudeConfigHomeDir(), "projects");
  const projectDir = join(projectsDir, sanitizePath(getOriginalCwd()));
  try {
    const entries = getFsImplementation().readdirSync(projectDir);
    const names = typeof entries[0] === "string" ? entries : entries.map((e) => e.name);
    const files = names.filter((f) => f.startsWith(sessionId) && f.endsWith(".cast")).sort();
    return files.map((f) => join(projectDir, f));
  } catch {
    return [];
  }
}
async function renameRecordingForSession() {
  const oldPath = recordingState.filePath;
  if (!oldPath || recordingState.timestamp === 0) {
    return;
  }
  const projectsDir = join(getClaudeConfigHomeDir(), "projects");
  const projectDir = join(projectsDir, sanitizePath(getOriginalCwd()));
  const newPath = join(
    projectDir,
    `${getSessionId()}-${recordingState.timestamp}.cast`
  );
  if (oldPath === newPath) {
    return;
  }
  await recorder?.flush();
  const oldName = basename(oldPath);
  const newName = basename(newPath);
  try {
    await rename(oldPath, newPath);
    recordingState.filePath = newPath;
    logForDebugging(`[asciicast] Renamed recording: ${oldName} \u2192 ${newName}`);
  } catch {
    logForDebugging(
      `[asciicast] Failed to rename recording from ${oldName} to ${newName}`
    );
  }
}
let recorder = null;
function getTerminalSize() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  return { cols, rows };
}
async function flushAsciicastRecorder() {
  await recorder?.flush();
}
function installAsciicastRecorder() {
  const filePath = getRecordFilePath();
  if (!filePath) {
    return;
  }
  const { cols, rows } = getTerminalSize();
  const startTime = performance.now();
  const header = jsonStringify({
    version: 2,
    width: cols,
    height: rows,
    timestamp: Math.floor(Date.now() / 1e3),
    env: {
      SHELL: process.env.SHELL || "",
      TERM: process.env.TERM || ""
    }
  });
  try {
    getFsImplementation().mkdirSync(dirname(filePath));
  } catch {
  }
  getFsImplementation().appendFileSync(filePath, header + "\n", { mode: 384 });
  let pendingWrite = Promise.resolve();
  const writer = createBufferedWriter({
    writeFn(content) {
      const currentPath = recordingState.filePath;
      if (!currentPath) {
        return;
      }
      pendingWrite = pendingWrite.then(() => appendFile(currentPath, content)).catch(() => {
      });
    },
    flushIntervalMs: 500,
    maxBufferSize: 50,
    maxBufferBytes: 10 * 1024 * 1024
    // 10MB
  });
  const originalWrite = process.stdout.write.bind(
    process.stdout
  );
  process.stdout.write = function(chunk, encodingOrCb, cb) {
    const elapsed = (performance.now() - startTime) / 1e3;
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
    writer.write(jsonStringify([elapsed, "o", text]) + "\n");
    if (typeof encodingOrCb === "function") {
      return originalWrite(chunk, encodingOrCb);
    }
    return originalWrite(chunk, encodingOrCb, cb);
  };
  function onResize() {
    const elapsed = (performance.now() - startTime) / 1e3;
    const { cols: newCols, rows: newRows } = getTerminalSize();
    writer.write(jsonStringify([elapsed, "r", `${newCols}x${newRows}`]) + "\n");
  }
  process.stdout.on("resize", onResize);
  recorder = {
    async flush() {
      writer.flush();
      await pendingWrite;
    },
    async dispose() {
      writer.dispose();
      await pendingWrite;
      process.stdout.removeListener("resize", onResize);
      process.stdout.write = originalWrite;
    }
  };
  registerCleanup(async () => {
    await recorder?.dispose();
    recorder = null;
  });
  logForDebugging(`[asciicast] Recording to ${filePath}`);
}
export {
  _resetRecordingStateForTesting,
  flushAsciicastRecorder,
  getRecordFilePath,
  getSessionRecordingPaths,
  installAsciicastRecorder,
  renameRecordingForSession
};
