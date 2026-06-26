import chokidar from "chokidar";
import { isAbsolute, join } from "path";
import { registerCleanup } from "../cleanupRegistry.js";
import { logForDebugging } from "../debug.js";
import { errorMessage } from "../errors.js";
import {
  executeCwdChangedHooks,
  executeFileChangedHooks
} from "../hooks.js";
import { clearCwdEnvFiles } from "../sessionEnvironment.js";
import { getHooksConfigFromSnapshot } from "./hooksConfigSnapshot.js";
let watcher = null;
let currentCwd;
let dynamicWatchPaths = [];
let dynamicWatchPathsSorted = [];
let initialized = false;
let hasEnvHooks = false;
let notifyCallback = null;
function setEnvHookNotifier(cb) {
  notifyCallback = cb;
}
function initializeFileChangedWatcher(cwd) {
  if (initialized) return;
  initialized = true;
  currentCwd = cwd;
  const config = getHooksConfigFromSnapshot();
  hasEnvHooks = (config?.CwdChanged?.length ?? 0) > 0 || (config?.FileChanged?.length ?? 0) > 0;
  if (hasEnvHooks) {
    registerCleanup(async () => dispose());
  }
  const paths = resolveWatchPaths(config);
  if (paths.length === 0) return;
  startWatching(paths);
}
function resolveWatchPaths(config) {
  const matchers = (config ?? getHooksConfigFromSnapshot())?.FileChanged ?? [];
  const staticPaths = [];
  for (const m of matchers) {
    if (!m.matcher) continue;
    for (const name of m.matcher.split("|").map((s) => s.trim())) {
      if (!name) continue;
      staticPaths.push(isAbsolute(name) ? name : join(currentCwd, name));
    }
  }
  return [.../* @__PURE__ */ new Set([...staticPaths, ...dynamicWatchPaths])];
}
function startWatching(paths) {
  logForDebugging(`FileChanged: watching ${paths.length} paths`);
  watcher = chokidar.watch(paths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 },
    ignorePermissionErrors: true
  });
  watcher.on("change", (p) => handleFileEvent(p, "change"));
  watcher.on("add", (p) => handleFileEvent(p, "add"));
  watcher.on("unlink", (p) => handleFileEvent(p, "unlink"));
}
function handleFileEvent(path, event) {
  logForDebugging(`FileChanged: ${event} ${path}`);
  void executeFileChangedHooks(path, event).then(({ results, watchPaths, systemMessages }) => {
    if (watchPaths.length > 0) {
      updateWatchPaths(watchPaths);
    }
    for (const msg of systemMessages) {
      notifyCallback?.(msg, false);
    }
    for (const r of results) {
      if (!r.succeeded && r.output) {
        notifyCallback?.(r.output, true);
      }
    }
  }).catch((e) => {
    const msg = errorMessage(e);
    logForDebugging(`FileChanged hook failed: ${msg}`, {
      level: "error"
    });
    notifyCallback?.(msg, true);
  });
}
function updateWatchPaths(paths) {
  if (!initialized) return;
  const sorted = paths.slice().sort();
  if (sorted.length === dynamicWatchPathsSorted.length && sorted.every((p, i) => p === dynamicWatchPathsSorted[i])) {
    return;
  }
  dynamicWatchPaths = paths;
  dynamicWatchPathsSorted = sorted;
  restartWatching();
}
function restartWatching() {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
  const paths = resolveWatchPaths();
  if (paths.length > 0) {
    startWatching(paths);
  }
}
async function onCwdChangedForHooks(oldCwd, newCwd) {
  if (oldCwd === newCwd) return;
  const config = getHooksConfigFromSnapshot();
  const currentHasEnvHooks = (config?.CwdChanged?.length ?? 0) > 0 || (config?.FileChanged?.length ?? 0) > 0;
  if (!currentHasEnvHooks) return;
  currentCwd = newCwd;
  await clearCwdEnvFiles();
  const hookResult = await executeCwdChangedHooks(oldCwd, newCwd).catch((e) => {
    const msg = errorMessage(e);
    logForDebugging(`CwdChanged hook failed: ${msg}`, {
      level: "error"
    });
    notifyCallback?.(msg, true);
    return {
      results: [],
      watchPaths: [],
      systemMessages: []
    };
  });
  dynamicWatchPaths = hookResult.watchPaths;
  dynamicWatchPathsSorted = hookResult.watchPaths.slice().sort();
  for (const msg of hookResult.systemMessages) {
    notifyCallback?.(msg, false);
  }
  for (const r of hookResult.results) {
    if (!r.succeeded && r.output) {
      notifyCallback?.(r.output, true);
    }
  }
  if (initialized) {
    restartWatching();
  }
}
function dispose() {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
  dynamicWatchPaths = [];
  dynamicWatchPathsSorted = [];
  initialized = false;
  hasEnvHooks = false;
  notifyCallback = null;
}
function resetFileChangedWatcherForTesting() {
  dispose();
}
export {
  initializeFileChangedWatcher,
  onCwdChangedForHooks,
  resetFileChangedWatcherForTesting,
  setEnvHookNotifier,
  updateWatchPaths
};
