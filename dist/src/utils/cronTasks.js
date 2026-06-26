import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  addSessionCronTask,
  getProjectRoot,
  getSessionCronTasks,
  removeSessionCronTasks
} from "../bootstrap/state.js";
import { computeNextCronRun, parseCronExpression } from "./cron.js";
import { logForDebugging } from "./debug.js";
import { isFsInaccessible } from "./errors.js";
import { getFsImplementation } from "./fsOperations.js";
import { safeParseJSON } from "./json.js";
import { logError } from "./log.js";
import { jsonStringify } from "./slowOperations.js";
const CRON_FILE_REL = join(".claude", "scheduled_tasks.json");
function getCronFilePath(dir) {
  return join(dir ?? getProjectRoot(), CRON_FILE_REL);
}
async function readCronTasks(dir) {
  const fs = getFsImplementation();
  let raw;
  try {
    raw = await fs.readFile(getCronFilePath(dir), { encoding: "utf-8" });
  } catch (e) {
    if (isFsInaccessible(e)) return [];
    logError(e);
    return [];
  }
  const parsed = safeParseJSON(raw, false);
  if (!parsed || typeof parsed !== "object") return [];
  const file = parsed;
  if (!Array.isArray(file.tasks)) return [];
  const out = [];
  for (const t of file.tasks) {
    if (!t || typeof t.id !== "string" || typeof t.cron !== "string" || typeof t.prompt !== "string" || typeof t.createdAt !== "number") {
      logForDebugging(
        `[ScheduledTasks] skipping malformed task: ${jsonStringify(t)}`
      );
      continue;
    }
    if (!parseCronExpression(t.cron)) {
      logForDebugging(
        `[ScheduledTasks] skipping task ${t.id} with invalid cron '${t.cron}'`
      );
      continue;
    }
    out.push({
      id: t.id,
      cron: t.cron,
      prompt: t.prompt,
      createdAt: t.createdAt,
      ...typeof t.lastFiredAt === "number" ? { lastFiredAt: t.lastFiredAt } : {},
      ...t.recurring ? { recurring: true } : {},
      ...t.permanent ? { permanent: true } : {}
    });
  }
  return out;
}
function hasCronTasksSync(dir) {
  let raw;
  try {
    raw = readFileSync(getCronFilePath(dir), "utf-8");
  } catch {
    return false;
  }
  const parsed = safeParseJSON(raw, false);
  if (!parsed || typeof parsed !== "object") return false;
  const tasks = parsed.tasks;
  return Array.isArray(tasks) && tasks.length > 0;
}
async function writeCronTasks(tasks, dir) {
  const root = dir ?? getProjectRoot();
  await mkdir(join(root, ".claude"), { recursive: true });
  const body = {
    tasks: tasks.map(({ durable: _durable, ...rest }) => rest)
  };
  await writeFile(
    getCronFilePath(root),
    jsonStringify(body, null, 2) + "\n",
    "utf-8"
  );
}
async function addCronTask(cron, prompt, recurring, durable, agentId) {
  const id = randomUUID().slice(0, 8);
  const task = {
    id,
    cron,
    prompt,
    createdAt: Date.now(),
    ...recurring ? { recurring: true } : {}
  };
  if (!durable) {
    addSessionCronTask({ ...task, ...agentId ? { agentId } : {} });
    return id;
  }
  const tasks = await readCronTasks();
  tasks.push(task);
  await writeCronTasks(tasks);
  return id;
}
async function removeCronTasks(ids, dir) {
  if (ids.length === 0) return;
  if (dir === void 0 && removeSessionCronTasks(ids) === ids.length) {
    return;
  }
  const idSet = new Set(ids);
  const tasks = await readCronTasks(dir);
  const remaining = tasks.filter((t) => !idSet.has(t.id));
  if (remaining.length === tasks.length) return;
  await writeCronTasks(remaining, dir);
}
async function markCronTasksFired(ids, firedAt, dir) {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const tasks = await readCronTasks(dir);
  let changed = false;
  for (const t of tasks) {
    if (idSet.has(t.id)) {
      t.lastFiredAt = firedAt;
      changed = true;
    }
  }
  if (!changed) return;
  await writeCronTasks(tasks, dir);
}
async function listAllCronTasks(dir) {
  const fileTasks = await readCronTasks(dir);
  if (dir !== void 0) return fileTasks;
  const sessionTasks = getSessionCronTasks().map((t) => ({
    ...t,
    durable: false
  }));
  return [...fileTasks, ...sessionTasks];
}
function nextCronRunMs(cron, fromMs) {
  const fields = parseCronExpression(cron);
  if (!fields) return null;
  const next = computeNextCronRun(fields, new Date(fromMs));
  return next ? next.getTime() : null;
}
const DEFAULT_CRON_JITTER_CONFIG = {
  recurringFrac: 0.1,
  recurringCapMs: 15 * 60 * 1e3,
  oneShotMaxMs: 90 * 1e3,
  oneShotFloorMs: 0,
  oneShotMinuteMod: 30,
  recurringMaxAgeMs: 7 * 24 * 60 * 60 * 1e3
};
function jitterFrac(taskId) {
  const frac = parseInt(taskId.slice(0, 8), 16) / 4294967296;
  return Number.isFinite(frac) ? frac : 0;
}
function jitteredNextCronRunMs(cron, fromMs, taskId, cfg = DEFAULT_CRON_JITTER_CONFIG) {
  const t1 = nextCronRunMs(cron, fromMs);
  if (t1 === null) return null;
  const t2 = nextCronRunMs(cron, t1);
  if (t2 === null) return t1;
  const jitter = Math.min(
    jitterFrac(taskId) * cfg.recurringFrac * (t2 - t1),
    cfg.recurringCapMs
  );
  return t1 + jitter;
}
function oneShotJitteredNextCronRunMs(cron, fromMs, taskId, cfg = DEFAULT_CRON_JITTER_CONFIG) {
  const t1 = nextCronRunMs(cron, fromMs);
  if (t1 === null) return null;
  if (new Date(t1).getMinutes() % cfg.oneShotMinuteMod !== 0) return t1;
  const lead = cfg.oneShotFloorMs + jitterFrac(taskId) * (cfg.oneShotMaxMs - cfg.oneShotFloorMs);
  return Math.max(t1 - lead, fromMs);
}
function findMissedTasks(tasks, nowMs) {
  return tasks.filter((t) => {
    const next = nextCronRunMs(t.cron, t.createdAt);
    return next !== null && next < nowMs;
  });
}
export {
  DEFAULT_CRON_JITTER_CONFIG,
  addCronTask,
  findMissedTasks,
  getCronFilePath,
  hasCronTasksSync,
  jitteredNextCronRunMs,
  listAllCronTasks,
  markCronTasksFired,
  nextCronRunMs,
  oneShotJitteredNextCronRunMs,
  readCronTasks,
  removeCronTasks,
  writeCronTasks
};
