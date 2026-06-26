import { watch } from "fs";
import { useEffect, useSyncExternalStore } from "react";
import { useAppState, useSetAppState } from "../state/AppState.js";
import { createSignal } from "../utils/signal.js";
import {
  getTaskListId,
  getTasksDir,
  isTodoV2Enabled,
  listTasks,
  onTasksUpdated,
  resetTaskList
} from "../utils/tasks.js";
import { isTeamLead } from "../utils/teammate.js";
const HIDE_DELAY_MS = 5e3;
const DEBOUNCE_MS = 50;
const FALLBACK_POLL_MS = 5e3;
class TasksV2Store {
  /** Stable array reference; replaced only on fetch. undefined until started. */
  #tasks = void 0;
  /**
   * Set when the hide timer has elapsed (all tasks completed for >5s), or
   * when the task list is empty. Starts false so the first fetch runs the
   * "all completed → schedule 5s hide" path (matches original behavior:
   * resuming a session with completed tasks shows them briefly).
   */
  #hidden = false;
  #watcher = null;
  #watchedDir = null;
  #hideTimer = null;
  #debounceTimer = null;
  #pollTimer = null;
  #unsubscribeTasksUpdated = null;
  #changed = createSignal();
  #subscriberCount = 0;
  #started = false;
  /**
   * useSyncExternalStore snapshot. Returns the same Task[] reference between
   * updates (required for Object.is stability). Returns undefined when hidden.
   */
  getSnapshot = () => {
    return this.#hidden ? void 0 : this.#tasks;
  };
  subscribe = (fn) => {
    const unsubscribe = this.#changed.subscribe(fn);
    this.#subscriberCount++;
    if (!this.#started) {
      this.#started = true;
      this.#unsubscribeTasksUpdated = onTasksUpdated(this.#debouncedFetch);
      void this.#fetch();
    }
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      unsubscribe();
      this.#subscriberCount--;
      if (this.#subscriberCount === 0) this.#stop();
    };
  };
  #notify() {
    this.#changed.emit();
  }
  /**
   * Point the file watcher at the current tasks directory. Called on start
   * and whenever #fetch detects the task list ID has changed (e.g. when
   * TeamCreateTool sets leaderTeamName mid-session).
   */
  #rewatch(dir) {
    if (dir === this.#watchedDir && this.#watcher !== null) return;
    this.#watcher?.close();
    this.#watcher = null;
    this.#watchedDir = dir;
    try {
      this.#watcher = watch(dir, this.#debouncedFetch);
      this.#watcher.unref();
    } catch {
    }
  }
  #debouncedFetch = () => {
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => void this.#fetch(), DEBOUNCE_MS);
    this.#debounceTimer.unref();
  };
  #fetch = async () => {
    const taskListId = getTaskListId();
    this.#rewatch(getTasksDir(taskListId));
    const current = (await listTasks(taskListId)).filter(
      (t) => !t.metadata?._internal
    );
    this.#tasks = current;
    const hasIncomplete = current.some((t) => t.status !== "completed");
    if (hasIncomplete || current.length === 0) {
      this.#hidden = current.length === 0;
      this.#clearHideTimer();
    } else if (this.#hideTimer === null && !this.#hidden) {
      this.#hideTimer = setTimeout(
        this.#onHideTimerFired.bind(this, taskListId),
        HIDE_DELAY_MS
      );
      this.#hideTimer.unref();
    }
    this.#notify();
    if (this.#pollTimer) {
      clearTimeout(this.#pollTimer);
      this.#pollTimer = null;
    }
    if (hasIncomplete) {
      this.#pollTimer = setTimeout(this.#debouncedFetch, FALLBACK_POLL_MS);
      this.#pollTimer.unref();
    }
  };
  #onHideTimerFired(scheduledForTaskListId) {
    this.#hideTimer = null;
    const currentId = getTaskListId();
    if (currentId !== scheduledForTaskListId) return;
    void listTasks(currentId).then(async (tasksToCheck) => {
      const allStillCompleted = tasksToCheck.length > 0 && tasksToCheck.every((t) => t.status === "completed");
      if (allStillCompleted) {
        await resetTaskList(currentId);
        this.#tasks = [];
        this.#hidden = true;
      }
      this.#notify();
    });
  }
  #clearHideTimer() {
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer);
      this.#hideTimer = null;
    }
  }
  /**
   * Tear down the watcher, timers, and in-process subscription. Called when
   * the last subscriber unsubscribes. Preserves #tasks/#hidden cache so a
   * subsequent re-subscribe renders the last known state immediately.
   */
  #stop() {
    this.#watcher?.close();
    this.#watcher = null;
    this.#watchedDir = null;
    this.#unsubscribeTasksUpdated?.();
    this.#unsubscribeTasksUpdated = null;
    this.#clearHideTimer();
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    if (this.#pollTimer) clearTimeout(this.#pollTimer);
    this.#debounceTimer = null;
    this.#pollTimer = null;
    this.#started = false;
  }
}
let _store = null;
function getStore() {
  return _store ??= new TasksV2Store();
}
const NOOP = () => {
};
const NOOP_SUBSCRIBE = () => NOOP;
const NOOP_SNAPSHOT = () => void 0;
function useTasksV2() {
  const teamContext = useAppState((s) => s.teamContext);
  const enabled = isTodoV2Enabled() && (!teamContext || isTeamLead(teamContext));
  const store = enabled ? getStore() : null;
  return useSyncExternalStore(
    store ? store.subscribe : NOOP_SUBSCRIBE,
    store ? store.getSnapshot : NOOP_SNAPSHOT
  );
}
function useTasksV2WithCollapseEffect() {
  const tasks = useTasksV2();
  const setAppState = useSetAppState();
  const hidden = tasks === void 0;
  useEffect(() => {
    if (!hidden) return;
    setAppState((prev) => {
      if (prev.expandedView !== "tasks") return prev;
      return { ...prev, expandedView: "none" };
    });
  }, [hidden, setAppState]);
  return tasks;
}
export {
  useTasksV2,
  useTasksV2WithCollapseEffect
};
