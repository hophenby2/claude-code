import {
  getScheduledTasksEnabled,
  getSessionCronTasks,
  removeSessionCronTasks,
  setScheduledTasksEnabled
} from "../bootstrap/state.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { cronToHuman } from "./cron.js";
import {
  DEFAULT_CRON_JITTER_CONFIG,
  findMissedTasks,
  getCronFilePath,
  hasCronTasksSync,
  jitteredNextCronRunMs,
  markCronTasksFired,
  oneShotJitteredNextCronRunMs,
  readCronTasks,
  removeCronTasks
} from "./cronTasks.js";
import {
  releaseSchedulerLock,
  tryAcquireSchedulerLock
} from "./cronTasksLock.js";
import { logForDebugging } from "./debug.js";
const CHECK_INTERVAL_MS = 1e3;
const FILE_STABILITY_MS = 300;
const LOCK_PROBE_INTERVAL_MS = 5e3;
function isRecurringTaskAged(t, nowMs, maxAgeMs) {
  if (maxAgeMs === 0) return false;
  return Boolean(t.recurring && !t.permanent && nowMs - t.createdAt >= maxAgeMs);
}
function createCronScheduler(options) {
  const {
    onFire,
    isLoading,
    assistantMode = false,
    onFireTask,
    onMissed,
    dir,
    lockIdentity,
    getJitterConfig,
    isKilled,
    filter
  } = options;
  const lockOpts = dir || lockIdentity ? { dir, lockIdentity } : void 0;
  let tasks = [];
  const nextFireAt = /* @__PURE__ */ new Map();
  const missedAsked = /* @__PURE__ */ new Set();
  const inFlight = /* @__PURE__ */ new Set();
  let enablePoll = null;
  let checkTimer = null;
  let lockProbeTimer = null;
  let watcher = null;
  let stopped = false;
  let isOwner = false;
  async function load(initial) {
    const next = await readCronTasks(dir);
    if (stopped) return;
    tasks = next;
    if (!initial) return;
    const now = Date.now();
    const missed = findMissedTasks(next, now).filter(
      (t) => !t.recurring && !missedAsked.has(t.id) && (!filter || filter(t))
    );
    if (missed.length > 0) {
      for (const t of missed) {
        missedAsked.add(t.id);
        nextFireAt.set(t.id, Infinity);
      }
      logEvent("tengu_scheduled_task_missed", {
        count: missed.length,
        taskIds: missed.map((t) => t.id).join(
          ","
        )
      });
      if (onMissed) {
        onMissed(missed);
      } else {
        onFire(buildMissedTaskNotification(missed));
      }
      void removeCronTasks(
        missed.map((t) => t.id),
        dir
      ).catch(
        (e) => logForDebugging(`[ScheduledTasks] failed to remove missed tasks: ${e}`)
      );
      logForDebugging(
        `[ScheduledTasks] surfaced ${missed.length} missed one-shot task(s)`
      );
    }
  }
  function check() {
    if (isKilled?.()) return;
    if (isLoading() && !assistantMode) return;
    const now = Date.now();
    const seen = /* @__PURE__ */ new Set();
    const firedFileRecurring = [];
    const jitterCfg = getJitterConfig?.() ?? DEFAULT_CRON_JITTER_CONFIG;
    function process(t, isSession) {
      if (filter && !filter(t)) return;
      seen.add(t.id);
      if (inFlight.has(t.id)) return;
      let next = nextFireAt.get(t.id);
      if (next === void 0) {
        next = t.recurring ? jitteredNextCronRunMs(
          t.cron,
          t.lastFiredAt ?? t.createdAt,
          t.id,
          jitterCfg
        ) ?? Infinity : oneShotJitteredNextCronRunMs(
          t.cron,
          t.createdAt,
          t.id,
          jitterCfg
        ) ?? Infinity;
        nextFireAt.set(t.id, next);
        logForDebugging(
          `[ScheduledTasks] scheduled ${t.id} for ${next === Infinity ? "never" : new Date(next).toISOString()}`
        );
      }
      if (now < next) return;
      logForDebugging(
        `[ScheduledTasks] firing ${t.id}${t.recurring ? " (recurring)" : ""}`
      );
      logEvent("tengu_scheduled_task_fire", {
        recurring: t.recurring ?? false,
        taskId: t.id
      });
      if (onFireTask) {
        onFireTask(t);
      } else {
        onFire(t.prompt);
      }
      const aged = isRecurringTaskAged(t, now, jitterCfg.recurringMaxAgeMs);
      if (aged) {
        const ageHours = Math.floor((now - t.createdAt) / 1e3 / 60 / 60);
        logForDebugging(
          `[ScheduledTasks] recurring task ${t.id} aged out (${ageHours}h since creation), deleting after final fire`
        );
        logEvent("tengu_scheduled_task_expired", {
          taskId: t.id,
          ageHours
        });
      }
      if (t.recurring && !aged) {
        const newNext = jitteredNextCronRunMs(t.cron, now, t.id, jitterCfg) ?? Infinity;
        nextFireAt.set(t.id, newNext);
        if (!isSession) firedFileRecurring.push(t.id);
      } else if (isSession) {
        removeSessionCronTasks([t.id]);
        nextFireAt.delete(t.id);
      } else {
        inFlight.add(t.id);
        void removeCronTasks([t.id], dir).catch(
          (e) => logForDebugging(
            `[ScheduledTasks] failed to remove task ${t.id}: ${e}`
          )
        ).finally(() => inFlight.delete(t.id));
        nextFireAt.delete(t.id);
      }
    }
    if (isOwner) {
      for (const t of tasks) process(t, false);
      if (firedFileRecurring.length > 0) {
        for (const id of firedFileRecurring) inFlight.add(id);
        void markCronTasksFired(firedFileRecurring, now, dir).catch(
          (e) => logForDebugging(
            `[ScheduledTasks] failed to persist lastFiredAt: ${e}`
          )
        ).finally(() => {
          for (const id of firedFileRecurring) inFlight.delete(id);
        });
      }
    }
    if (dir === void 0) {
      for (const t of getSessionCronTasks()) process(t, true);
    }
    if (seen.size === 0) {
      nextFireAt.clear();
      return;
    }
    for (const id of nextFireAt.keys()) {
      if (!seen.has(id)) nextFireAt.delete(id);
    }
  }
  async function enable() {
    if (stopped) return;
    if (enablePoll) {
      clearInterval(enablePoll);
      enablePoll = null;
    }
    const { default: chokidar } = await import("chokidar");
    if (stopped) return;
    isOwner = await tryAcquireSchedulerLock(lockOpts).catch(() => false);
    if (stopped) {
      if (isOwner) {
        isOwner = false;
        void releaseSchedulerLock(lockOpts);
      }
      return;
    }
    if (!isOwner) {
      lockProbeTimer = setInterval(() => {
        void tryAcquireSchedulerLock(lockOpts).then((owned) => {
          if (stopped) {
            if (owned) void releaseSchedulerLock(lockOpts);
            return;
          }
          if (owned) {
            isOwner = true;
            if (lockProbeTimer) {
              clearInterval(lockProbeTimer);
              lockProbeTimer = null;
            }
          }
        }).catch((e) => logForDebugging(String(e), { level: "error" }));
      }, LOCK_PROBE_INTERVAL_MS);
      lockProbeTimer.unref?.();
    }
    void load(true);
    const path = getCronFilePath(dir);
    watcher = chokidar.watch(path, {
      persistent: false,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: FILE_STABILITY_MS },
      ignorePermissionErrors: true
    });
    watcher.on("add", () => void load(false));
    watcher.on("change", () => void load(false));
    watcher.on("unlink", () => {
      if (!stopped) {
        tasks = [];
        nextFireAt.clear();
      }
    });
    checkTimer = setInterval(check, CHECK_INTERVAL_MS);
    checkTimer.unref?.();
  }
  return {
    start() {
      stopped = false;
      if (dir !== void 0) {
        logForDebugging(
          `[ScheduledTasks] scheduler start() \u2014 dir=${dir}, hasTasks=${hasCronTasksSync(dir)}`
        );
        void enable();
        return;
      }
      logForDebugging(
        `[ScheduledTasks] scheduler start() \u2014 enabled=${getScheduledTasksEnabled()}, hasTasks=${hasCronTasksSync()}`
      );
      if (!getScheduledTasksEnabled() && (assistantMode || hasCronTasksSync())) {
        setScheduledTasksEnabled(true);
      }
      if (getScheduledTasksEnabled()) {
        void enable();
        return;
      }
      enablePoll = setInterval(
        (en) => {
          if (getScheduledTasksEnabled()) void en();
        },
        CHECK_INTERVAL_MS,
        enable
      );
      enablePoll.unref?.();
    },
    stop() {
      stopped = true;
      if (enablePoll) {
        clearInterval(enablePoll);
        enablePoll = null;
      }
      if (checkTimer) {
        clearInterval(checkTimer);
        checkTimer = null;
      }
      if (lockProbeTimer) {
        clearInterval(lockProbeTimer);
        lockProbeTimer = null;
      }
      void watcher?.close();
      watcher = null;
      if (isOwner) {
        isOwner = false;
        void releaseSchedulerLock(lockOpts);
      }
    },
    getNextFireTime() {
      let min = Infinity;
      for (const t of nextFireAt.values()) {
        if (t < min) min = t;
      }
      return min === Infinity ? null : min;
    }
  };
}
function buildMissedTaskNotification(missed) {
  const plural = missed.length > 1;
  const header = `The following one-shot scheduled task${plural ? "s were" : " was"} missed while Claude was not running. ${plural ? "They have" : "It has"} already been removed from .claude/scheduled_tasks.json.

Do NOT execute ${plural ? "these prompts" : "this prompt"} yet. First use the AskUserQuestion tool to ask whether to run ${plural ? "each one" : "it"} now. Only execute if the user confirms.`;
  const blocks = missed.map((t) => {
    const meta = `[${cronToHuman(t.cron)}, created ${new Date(t.createdAt).toLocaleString()}]`;
    const longestRun = (t.prompt.match(/`+/g) ?? []).reduce(
      (max, run) => Math.max(max, run.length),
      0
    );
    const fence = "`".repeat(Math.max(3, longestRun + 1));
    return `${meta}
${fence}
${t.prompt}
${fence}`;
  });
  return `${header}

${blocks.join("\n\n")}`;
}
export {
  buildMissedTaskNotification,
  createCronScheduler,
  isRecurringTaskAged
};
