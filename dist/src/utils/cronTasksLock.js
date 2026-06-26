import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { z } from "zod/v4";
import { getProjectRoot, getSessionId } from "../bootstrap/state.js";
import { registerCleanup } from "./cleanupRegistry.js";
import { logForDebugging } from "./debug.js";
import { getErrnoCode } from "./errors.js";
import { isProcessRunning } from "./genericProcessUtils.js";
import { safeParseJSON } from "./json.js";
import { lazySchema } from "./lazySchema.js";
import { jsonStringify } from "./slowOperations.js";
const LOCK_FILE_REL = join(".claude", "scheduled_tasks.lock");
const schedulerLockSchema = lazySchema(
  () => z.object({
    sessionId: z.string(),
    pid: z.number(),
    acquiredAt: z.number()
  })
);
let unregisterCleanup;
let lastBlockedBy;
function getLockPath(dir) {
  return join(dir ?? getProjectRoot(), LOCK_FILE_REL);
}
async function readLock(dir) {
  let raw;
  try {
    raw = await readFile(getLockPath(dir), "utf8");
  } catch {
    return void 0;
  }
  const result = schedulerLockSchema().safeParse(safeParseJSON(raw, false));
  return result.success ? result.data : void 0;
}
async function tryCreateExclusive(lock, dir) {
  const path = getLockPath(dir);
  const body = jsonStringify(lock);
  try {
    await writeFile(path, body, { flag: "wx" });
    return true;
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "EEXIST") return false;
    if (code === "ENOENT") {
      await mkdir(dirname(path), { recursive: true });
      try {
        await writeFile(path, body, { flag: "wx" });
        return true;
      } catch (retryErr) {
        if (getErrnoCode(retryErr) === "EEXIST") return false;
        throw retryErr;
      }
    }
    throw e;
  }
}
function registerLockCleanup(opts) {
  unregisterCleanup?.();
  unregisterCleanup = registerCleanup(async () => {
    await releaseSchedulerLock(opts);
  });
}
async function tryAcquireSchedulerLock(opts) {
  const dir = opts?.dir;
  const sessionId = opts?.lockIdentity ?? getSessionId();
  const lock = {
    sessionId,
    pid: process.pid,
    acquiredAt: Date.now()
  };
  if (await tryCreateExclusive(lock, dir)) {
    lastBlockedBy = void 0;
    registerLockCleanup(opts);
    logForDebugging(
      `[ScheduledTasks] acquired scheduler lock (PID ${process.pid})`
    );
    return true;
  }
  const existing = await readLock(dir);
  if (existing?.sessionId === sessionId) {
    if (existing.pid !== process.pid) {
      await writeFile(getLockPath(dir), jsonStringify(lock));
      registerLockCleanup(opts);
    }
    return true;
  }
  if (existing && isProcessRunning(existing.pid)) {
    if (lastBlockedBy !== existing.sessionId) {
      lastBlockedBy = existing.sessionId;
      logForDebugging(
        `[ScheduledTasks] scheduler lock held by session ${existing.sessionId} (PID ${existing.pid})`
      );
    }
    return false;
  }
  if (existing) {
    logForDebugging(
      `[ScheduledTasks] recovering stale scheduler lock from PID ${existing.pid}`
    );
  }
  await unlink(getLockPath(dir)).catch(() => {
  });
  if (await tryCreateExclusive(lock, dir)) {
    lastBlockedBy = void 0;
    registerLockCleanup(opts);
    return true;
  }
  return false;
}
async function releaseSchedulerLock(opts) {
  unregisterCleanup?.();
  unregisterCleanup = void 0;
  lastBlockedBy = void 0;
  const dir = opts?.dir;
  const sessionId = opts?.lockIdentity ?? getSessionId();
  const existing = await readLock(dir);
  if (!existing || existing.sessionId !== sessionId) return;
  try {
    await unlink(getLockPath(dir));
    logForDebugging("[ScheduledTasks] released scheduler lock");
  } catch {
  }
}
export {
  releaseSchedulerLock,
  tryAcquireSchedulerLock
};
