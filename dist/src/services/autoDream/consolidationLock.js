import { mkdir, readFile, stat, unlink, utimes, writeFile } from "fs/promises";
import { join } from "path";
import { getOriginalCwd } from "../../bootstrap/state.js";
import { getAutoMemPath } from "../../memdir/paths.js";
import { logForDebugging } from "../../utils/debug.js";
import { isProcessRunning } from "../../utils/genericProcessUtils.js";
import { listCandidates } from "../../utils/listSessionsImpl.js";
import { getProjectDir } from "../../utils/sessionStorage.js";
const LOCK_FILE = ".consolidate-lock";
const HOLDER_STALE_MS = 60 * 60 * 1e3;
function lockPath() {
  return join(getAutoMemPath(), LOCK_FILE);
}
async function readLastConsolidatedAt() {
  try {
    const s = await stat(lockPath());
    return s.mtimeMs;
  } catch {
    return 0;
  }
}
async function tryAcquireConsolidationLock() {
  const path = lockPath();
  let mtimeMs;
  let holderPid;
  try {
    const [s, raw] = await Promise.all([stat(path), readFile(path, "utf8")]);
    mtimeMs = s.mtimeMs;
    const parsed = parseInt(raw.trim(), 10);
    holderPid = Number.isFinite(parsed) ? parsed : void 0;
  } catch {
  }
  if (mtimeMs !== void 0 && Date.now() - mtimeMs < HOLDER_STALE_MS) {
    if (holderPid !== void 0 && isProcessRunning(holderPid)) {
      logForDebugging(
        `[autoDream] lock held by live PID ${holderPid} (mtime ${Math.round((Date.now() - mtimeMs) / 1e3)}s ago)`
      );
      return null;
    }
  }
  await mkdir(getAutoMemPath(), { recursive: true });
  await writeFile(path, String(process.pid));
  let verify;
  try {
    verify = await readFile(path, "utf8");
  } catch {
    return null;
  }
  if (parseInt(verify.trim(), 10) !== process.pid) return null;
  return mtimeMs ?? 0;
}
async function rollbackConsolidationLock(priorMtime) {
  const path = lockPath();
  try {
    if (priorMtime === 0) {
      await unlink(path);
      return;
    }
    await writeFile(path, "");
    const t = priorMtime / 1e3;
    await utimes(path, t, t);
  } catch (e) {
    logForDebugging(
      `[autoDream] rollback failed: ${e.message} \u2014 next trigger delayed to minHours`
    );
  }
}
async function listSessionsTouchedSince(sinceMs) {
  const dir = getProjectDir(getOriginalCwd());
  const candidates = await listCandidates(dir, true);
  return candidates.filter((c) => c.mtime > sinceMs).map((c) => c.sessionId);
}
async function recordConsolidation() {
  try {
    await mkdir(getAutoMemPath(), { recursive: true });
    await writeFile(lockPath(), String(process.pid));
  } catch (e) {
    logForDebugging(
      `[autoDream] recordConsolidation write failed: ${e.message}`
    );
  }
}
export {
  listSessionsTouchedSince,
  readLastConsolidatedAt,
  recordConsolidation,
  rollbackConsolidationLock,
  tryAcquireConsolidationLock
};
