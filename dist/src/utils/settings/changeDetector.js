import chokidar from "chokidar";
import { stat } from "fs/promises";
import * as platformPath from "path";
import { getIsRemoteMode } from "../../bootstrap/state.js";
import { registerCleanup } from "../cleanupRegistry.js";
import { logForDebugging } from "../debug.js";
import { errorMessage } from "../errors.js";
import {
  executeConfigChangeHooks,
  hasBlockingResult
} from "../hooks.js";
import { createSignal } from "../signal.js";
import { jsonStringify } from "../slowOperations.js";
import { SETTING_SOURCES } from "./constants.js";
import { clearInternalWrites, consumeInternalWrite } from "./internalWrites.js";
import { getManagedSettingsDropInDir } from "./managedPath.js";
import {
  getHkcuSettings,
  getMdmSettings,
  refreshMdmSettings,
  setMdmSettingsCache
} from "./mdm/settings.js";
import { getSettingsFilePathForSource } from "./settings.js";
import { resetSettingsCache } from "./settingsCache.js";
const FILE_STABILITY_THRESHOLD_MS = 1e3;
const FILE_STABILITY_POLL_INTERVAL_MS = 500;
const INTERNAL_WRITE_WINDOW_MS = 5e3;
const MDM_POLL_INTERVAL_MS = 30 * 60 * 1e3;
const DELETION_GRACE_MS = FILE_STABILITY_THRESHOLD_MS + FILE_STABILITY_POLL_INTERVAL_MS + 200;
let watcher = null;
let mdmPollTimer = null;
let lastMdmSnapshot = null;
let initialized = false;
let disposed = false;
const pendingDeletions = /* @__PURE__ */ new Map();
const settingsChanged = createSignal();
let testOverrides = null;
async function initialize() {
  if (getIsRemoteMode()) return;
  if (initialized || disposed) return;
  initialized = true;
  startMdmPoll();
  registerCleanup(dispose);
  const { dirs, settingsFiles, dropInDir } = await getWatchTargets();
  if (disposed) return;
  if (dirs.length === 0) return;
  logForDebugging(
    `Watching for changes in setting files ${[...settingsFiles].join(", ")}...${dropInDir ? ` and drop-in directory ${dropInDir}` : ""}`
  );
  watcher = chokidar.watch(dirs, {
    persistent: true,
    ignoreInitial: true,
    depth: 0,
    // Only watch immediate children, not subdirectories
    awaitWriteFinish: {
      stabilityThreshold: testOverrides?.stabilityThreshold ?? FILE_STABILITY_THRESHOLD_MS,
      pollInterval: testOverrides?.pollInterval ?? FILE_STABILITY_POLL_INTERVAL_MS
    },
    ignored: (path, stats) => {
      if (stats && !stats.isFile() && !stats.isDirectory()) return true;
      if (path.split(platformPath.sep).some((dir) => dir === ".git")) return true;
      if (!stats || stats.isDirectory()) return false;
      const normalized = platformPath.normalize(path);
      if (settingsFiles.has(normalized)) return false;
      if (dropInDir && normalized.startsWith(dropInDir + platformPath.sep) && normalized.endsWith(".json")) {
        return false;
      }
      return true;
    },
    // Additional options for stability
    ignorePermissionErrors: true,
    usePolling: false,
    // Use native file system events
    atomic: true
    // Handle atomic writes better
  });
  watcher.on("change", handleChange);
  watcher.on("unlink", handleDelete);
  watcher.on("add", handleAdd);
}
function dispose() {
  disposed = true;
  if (mdmPollTimer) {
    clearInterval(mdmPollTimer);
    mdmPollTimer = null;
  }
  for (const timer of pendingDeletions.values()) clearTimeout(timer);
  pendingDeletions.clear();
  lastMdmSnapshot = null;
  clearInternalWrites();
  settingsChanged.clear();
  const w = watcher;
  watcher = null;
  return w ? w.close() : Promise.resolve();
}
const subscribe = settingsChanged.subscribe;
async function getWatchTargets() {
  const dirToSettingsFiles = /* @__PURE__ */ new Map();
  const dirsWithExistingFiles = /* @__PURE__ */ new Set();
  for (const source of SETTING_SOURCES) {
    if (source === "flagSettings") {
      continue;
    }
    const path = getSettingsFilePathForSource(source);
    if (!path) {
      continue;
    }
    const dir = platformPath.dirname(path);
    if (!dirToSettingsFiles.has(dir)) {
      dirToSettingsFiles.set(dir, /* @__PURE__ */ new Set());
    }
    dirToSettingsFiles.get(dir).add(path);
    try {
      const stats = await stat(path);
      if (stats.isFile()) {
        dirsWithExistingFiles.add(dir);
      }
    } catch {
    }
  }
  const settingsFiles = /* @__PURE__ */ new Set();
  for (const dir of dirsWithExistingFiles) {
    const filesInDir = dirToSettingsFiles.get(dir);
    if (filesInDir) {
      for (const file of filesInDir) {
        settingsFiles.add(file);
      }
    }
  }
  let dropInDir = null;
  const managedDropIn = getManagedSettingsDropInDir();
  try {
    const stats = await stat(managedDropIn);
    if (stats.isDirectory()) {
      dirsWithExistingFiles.add(managedDropIn);
      dropInDir = managedDropIn;
    }
  } catch {
  }
  return { dirs: [...dirsWithExistingFiles], settingsFiles, dropInDir };
}
function settingSourceToConfigChangeSource(source) {
  switch (source) {
    case "userSettings":
      return "user_settings";
    case "projectSettings":
      return "project_settings";
    case "localSettings":
      return "local_settings";
    case "flagSettings":
    case "policySettings":
      return "policy_settings";
  }
}
function handleChange(path) {
  const source = getSourceForPath(path);
  if (!source) return;
  const pendingTimer = pendingDeletions.get(path);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingDeletions.delete(path);
    logForDebugging(
      `Cancelled pending deletion of ${path} \u2014 file was recreated`
    );
  }
  if (consumeInternalWrite(path, INTERNAL_WRITE_WINDOW_MS)) {
    return;
  }
  logForDebugging(`Detected change to ${path}`);
  void executeConfigChangeHooks(
    settingSourceToConfigChangeSource(source),
    path
  ).then((results) => {
    if (hasBlockingResult(results)) {
      logForDebugging(`ConfigChange hook blocked change to ${path}`);
      return;
    }
    fanOut(source);
  });
}
function handleAdd(path) {
  const source = getSourceForPath(path);
  if (!source) return;
  const pendingTimer = pendingDeletions.get(path);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingDeletions.delete(path);
    logForDebugging(`Cancelled pending deletion of ${path} \u2014 file was re-added`);
  }
  handleChange(path);
}
function handleDelete(path) {
  const source = getSourceForPath(path);
  if (!source) return;
  logForDebugging(`Detected deletion of ${path}`);
  if (pendingDeletions.has(path)) return;
  const timer = setTimeout(
    (p, src) => {
      pendingDeletions.delete(p);
      void executeConfigChangeHooks(
        settingSourceToConfigChangeSource(src),
        p
      ).then((results) => {
        if (hasBlockingResult(results)) {
          logForDebugging(`ConfigChange hook blocked deletion of ${p}`);
          return;
        }
        fanOut(src);
      });
    },
    testOverrides?.deletionGrace ?? DELETION_GRACE_MS,
    path,
    source
  );
  pendingDeletions.set(path, timer);
}
function getSourceForPath(path) {
  const normalizedPath = platformPath.normalize(path);
  const dropInDir = getManagedSettingsDropInDir();
  if (normalizedPath.startsWith(dropInDir + platformPath.sep)) {
    return "policySettings";
  }
  return SETTING_SOURCES.find(
    (source) => getSettingsFilePathForSource(source) === normalizedPath
  );
}
function startMdmPoll() {
  const initial = getMdmSettings();
  const initialHkcu = getHkcuSettings();
  lastMdmSnapshot = jsonStringify({
    mdm: initial.settings,
    hkcu: initialHkcu.settings
  });
  mdmPollTimer = setInterval(() => {
    if (disposed) return;
    void (async () => {
      try {
        const { mdm: current, hkcu: currentHkcu } = await refreshMdmSettings();
        if (disposed) return;
        const currentSnapshot = jsonStringify({
          mdm: current.settings,
          hkcu: currentHkcu.settings
        });
        if (currentSnapshot !== lastMdmSnapshot) {
          lastMdmSnapshot = currentSnapshot;
          setMdmSettingsCache(current, currentHkcu);
          logForDebugging("Detected MDM settings change via poll");
          fanOut("policySettings");
        }
      } catch (error) {
        logForDebugging(`MDM poll error: ${errorMessage(error)}`);
      }
    })();
  }, testOverrides?.mdmPollInterval ?? MDM_POLL_INTERVAL_MS);
  mdmPollTimer.unref();
}
function fanOut(source) {
  resetSettingsCache();
  settingsChanged.emit(source);
}
function notifyChange(source) {
  logForDebugging(`Programmatic settings change notification for ${source}`);
  fanOut(source);
}
function resetForTesting(overrides) {
  if (mdmPollTimer) {
    clearInterval(mdmPollTimer);
    mdmPollTimer = null;
  }
  for (const timer of pendingDeletions.values()) clearTimeout(timer);
  pendingDeletions.clear();
  lastMdmSnapshot = null;
  initialized = false;
  disposed = false;
  testOverrides = overrides ?? null;
  const w = watcher;
  watcher = null;
  return w ? w.close() : Promise.resolve();
}
const settingsChangeDetector = {
  initialize,
  dispose,
  subscribe,
  notifyChange,
  resetForTesting
};
export {
  dispose,
  initialize,
  notifyChange,
  resetForTesting,
  settingsChangeDetector,
  subscribe
};
