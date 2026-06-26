const feature = (_name) => false;
import { chmod, mkdir, readdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import {
  getOriginalCwd,
  getSessionId,
  onSessionSwitch
} from "../bootstrap/state.js";
import { registerCleanup } from "./cleanupRegistry.js";
import { logForDebugging } from "./debug.js";
import { getClaudeConfigHomeDir } from "./envUtils.js";
import { errorMessage, isFsInaccessible } from "./errors.js";
import { isProcessRunning } from "./genericProcessUtils.js";
import { getPlatform } from "./platform.js";
import { jsonParse, jsonStringify } from "./slowOperations.js";
import { getAgentId } from "./teammate.js";
function getSessionsDir() {
  return join(getClaudeConfigHomeDir(), "sessions");
}
function envSessionKind() {
  if (false) {
    const k = process.env.CLAUDE_CODE_SESSION_KIND;
    if (k === "bg" || k === "daemon" || k === "daemon-worker") return k;
  }
  return void 0;
}
function isBgSession() {
  return envSessionKind() === "bg";
}
async function registerSession() {
  if (getAgentId() != null) return false;
  const kind = envSessionKind() ?? "interactive";
  const dir = getSessionsDir();
  const pidFile = join(dir, `${process.pid}.json`);
  registerCleanup(async () => {
    try {
      await unlink(pidFile);
    } catch {
    }
  });
  try {
    await mkdir(dir, { recursive: true, mode: 448 });
    await chmod(dir, 448);
    await writeFile(
      pidFile,
      jsonStringify({
        pid: process.pid,
        sessionId: getSessionId(),
        cwd: getOriginalCwd(),
        startedAt: Date.now(),
        kind,
        entrypoint: process.env.CLAUDE_CODE_ENTRYPOINT,
        ...false ? { messagingSocketPath: process.env.CLAUDE_CODE_MESSAGING_SOCKET } : {},
        ...false ? {
          name: process.env.CLAUDE_CODE_SESSION_NAME,
          logPath: process.env.CLAUDE_CODE_SESSION_LOG,
          agent: process.env.CLAUDE_CODE_AGENT
        } : {}
      })
    );
    onSessionSwitch((id) => {
      void updatePidFile({ sessionId: id });
    });
    return true;
  } catch (e) {
    logForDebugging(`[concurrentSessions] register failed: ${errorMessage(e)}`);
    return false;
  }
}
async function updatePidFile(patch) {
  const pidFile = join(getSessionsDir(), `${process.pid}.json`);
  try {
    const data = jsonParse(await readFile(pidFile, "utf8"));
    await writeFile(pidFile, jsonStringify({ ...data, ...patch }));
  } catch (e) {
    logForDebugging(
      `[concurrentSessions] updatePidFile failed: ${errorMessage(e)}`
    );
  }
}
async function updateSessionName(name) {
  if (!name) return;
  await updatePidFile({ name });
}
async function updateSessionBridgeId(bridgeSessionId) {
  await updatePidFile({ bridgeSessionId });
}
async function updateSessionActivity(patch) {
  if (true) return;
  await updatePidFile({ ...patch, updatedAt: Date.now() });
}
async function countConcurrentSessions() {
  const dir = getSessionsDir();
  let files;
  try {
    files = await readdir(dir);
  } catch (e) {
    if (!isFsInaccessible(e)) {
      logForDebugging(`[concurrentSessions] readdir failed: ${errorMessage(e)}`);
    }
    return 0;
  }
  let count = 0;
  for (const file of files) {
    if (!/^\d+\.json$/.test(file)) continue;
    const pid = parseInt(file.slice(0, -5), 10);
    if (pid === process.pid) {
      count++;
      continue;
    }
    if (isProcessRunning(pid)) {
      count++;
    } else if (getPlatform() !== "wsl") {
      void unlink(join(dir, file)).catch(() => {
      });
    }
  }
  return count;
}
export {
  countConcurrentSessions,
  isBgSession,
  registerSession,
  updateSessionActivity,
  updateSessionBridgeId,
  updateSessionName
};
