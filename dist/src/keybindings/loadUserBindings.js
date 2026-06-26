import chokidar from "chokidar";
import { readFileSync } from "fs";
import { readFile, stat } from "fs/promises";
import { dirname, join } from "path";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import { logEvent } from "../services/analytics/index.js";
import { registerCleanup } from "../utils/cleanupRegistry.js";
import { logForDebugging } from "../utils/debug.js";
import { getClaudeConfigHomeDir } from "../utils/envUtils.js";
import { errorMessage, isENOENT } from "../utils/errors.js";
import { createSignal } from "../utils/signal.js";
import { jsonParse } from "../utils/slowOperations.js";
import { DEFAULT_BINDINGS } from "./defaultBindings.js";
import { parseBindings } from "./parser.js";
import {
  checkDuplicateKeysInJson,
  validateBindings
} from "./validate.js";
function isKeybindingCustomizationEnabled() {
  return getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_keybinding_customization_release",
    false
  );
}
const FILE_STABILITY_THRESHOLD_MS = 500;
const FILE_STABILITY_POLL_INTERVAL_MS = 200;
let watcher = null;
let initialized = false;
let disposed = false;
let cachedBindings = null;
let cachedWarnings = [];
const keybindingsChanged = createSignal();
let lastCustomBindingsLogDate = null;
function logCustomBindingsLoadedOncePerDay(userBindingCount) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (lastCustomBindingsLogDate === today) return;
  lastCustomBindingsLogDate = today;
  logEvent("tengu_custom_keybindings_loaded", {
    user_binding_count: userBindingCount
  });
}
function isKeybindingBlock(obj) {
  if (typeof obj !== "object" || obj === null) return false;
  const b = obj;
  return typeof b.context === "string" && typeof b.bindings === "object" && b.bindings !== null;
}
function isKeybindingBlockArray(arr) {
  return Array.isArray(arr) && arr.every(isKeybindingBlock);
}
function getKeybindingsPath() {
  return join(getClaudeConfigHomeDir(), "keybindings.json");
}
function getDefaultParsedBindings() {
  return parseBindings(DEFAULT_BINDINGS);
}
async function loadKeybindings() {
  const defaultBindings = getDefaultParsedBindings();
  if (!isKeybindingCustomizationEnabled()) {
    return { bindings: defaultBindings, warnings: [] };
  }
  const userPath = getKeybindingsPath();
  try {
    const content = await readFile(userPath, "utf-8");
    const parsed = jsonParse(content);
    let userBlocks;
    if (typeof parsed === "object" && parsed !== null && "bindings" in parsed) {
      userBlocks = parsed.bindings;
    } else {
      const errorMessage2 = 'keybindings.json must have a "bindings" array';
      const suggestion = 'Use format: { "bindings": [ ... ] }';
      logForDebugging(`[keybindings] Invalid keybindings.json: ${errorMessage2}`);
      return {
        bindings: defaultBindings,
        warnings: [
          {
            type: "parse_error",
            severity: "error",
            message: errorMessage2,
            suggestion
          }
        ]
      };
    }
    if (!isKeybindingBlockArray(userBlocks)) {
      const errorMessage2 = !Array.isArray(userBlocks) ? '"bindings" must be an array' : "keybindings.json contains invalid block structure";
      const suggestion = !Array.isArray(userBlocks) ? 'Set "bindings" to an array of keybinding blocks' : 'Each block must have "context" (string) and "bindings" (object)';
      logForDebugging(`[keybindings] Invalid keybindings.json: ${errorMessage2}`);
      return {
        bindings: defaultBindings,
        warnings: [
          {
            type: "parse_error",
            severity: "error",
            message: errorMessage2,
            suggestion
          }
        ]
      };
    }
    const userParsed = parseBindings(userBlocks);
    logForDebugging(
      `[keybindings] Loaded ${userParsed.length} user bindings from ${userPath}`
    );
    const mergedBindings = [...defaultBindings, ...userParsed];
    logCustomBindingsLoadedOncePerDay(userParsed.length);
    const duplicateKeyWarnings = checkDuplicateKeysInJson(content);
    const warnings = [
      ...duplicateKeyWarnings,
      ...validateBindings(userBlocks, mergedBindings)
    ];
    if (warnings.length > 0) {
      logForDebugging(
        `[keybindings] Found ${warnings.length} validation issue(s)`
      );
    }
    return { bindings: mergedBindings, warnings };
  } catch (error) {
    if (isENOENT(error)) {
      return { bindings: defaultBindings, warnings: [] };
    }
    logForDebugging(
      `[keybindings] Error loading ${userPath}: ${errorMessage(error)}`
    );
    return {
      bindings: defaultBindings,
      warnings: [
        {
          type: "parse_error",
          severity: "error",
          message: `Failed to parse keybindings.json: ${errorMessage(error)}`
        }
      ]
    };
  }
}
function loadKeybindingsSync() {
  if (cachedBindings) {
    return cachedBindings;
  }
  const result = loadKeybindingsSyncWithWarnings();
  return result.bindings;
}
function loadKeybindingsSyncWithWarnings() {
  if (cachedBindings) {
    return { bindings: cachedBindings, warnings: cachedWarnings };
  }
  const defaultBindings = getDefaultParsedBindings();
  if (!isKeybindingCustomizationEnabled()) {
    cachedBindings = defaultBindings;
    cachedWarnings = [];
    return { bindings: cachedBindings, warnings: cachedWarnings };
  }
  const userPath = getKeybindingsPath();
  try {
    const content = readFileSync(userPath, "utf-8");
    const parsed = jsonParse(content);
    let userBlocks;
    if (typeof parsed === "object" && parsed !== null && "bindings" in parsed) {
      userBlocks = parsed.bindings;
    } else {
      cachedBindings = defaultBindings;
      cachedWarnings = [
        {
          type: "parse_error",
          severity: "error",
          message: 'keybindings.json must have a "bindings" array',
          suggestion: 'Use format: { "bindings": [ ... ] }'
        }
      ];
      return { bindings: cachedBindings, warnings: cachedWarnings };
    }
    if (!isKeybindingBlockArray(userBlocks)) {
      const errorMessage2 = !Array.isArray(userBlocks) ? '"bindings" must be an array' : "keybindings.json contains invalid block structure";
      const suggestion = !Array.isArray(userBlocks) ? 'Set "bindings" to an array of keybinding blocks' : 'Each block must have "context" (string) and "bindings" (object)';
      cachedBindings = defaultBindings;
      cachedWarnings = [
        {
          type: "parse_error",
          severity: "error",
          message: errorMessage2,
          suggestion
        }
      ];
      return { bindings: cachedBindings, warnings: cachedWarnings };
    }
    const userParsed = parseBindings(userBlocks);
    logForDebugging(
      `[keybindings] Loaded ${userParsed.length} user bindings from ${userPath}`
    );
    cachedBindings = [...defaultBindings, ...userParsed];
    logCustomBindingsLoadedOncePerDay(userParsed.length);
    const duplicateKeyWarnings = checkDuplicateKeysInJson(content);
    cachedWarnings = [
      ...duplicateKeyWarnings,
      ...validateBindings(userBlocks, cachedBindings)
    ];
    if (cachedWarnings.length > 0) {
      logForDebugging(
        `[keybindings] Found ${cachedWarnings.length} validation issue(s)`
      );
    }
    return { bindings: cachedBindings, warnings: cachedWarnings };
  } catch {
    cachedBindings = defaultBindings;
    cachedWarnings = [];
    return { bindings: cachedBindings, warnings: cachedWarnings };
  }
}
async function initializeKeybindingWatcher() {
  if (initialized || disposed) return;
  if (!isKeybindingCustomizationEnabled()) {
    logForDebugging(
      "[keybindings] Skipping file watcher - user customization disabled"
    );
    return;
  }
  const userPath = getKeybindingsPath();
  const watchDir = dirname(userPath);
  try {
    const stats = await stat(watchDir);
    if (!stats.isDirectory()) {
      logForDebugging(
        `[keybindings] Not watching: ${watchDir} is not a directory`
      );
      return;
    }
  } catch {
    logForDebugging(`[keybindings] Not watching: ${watchDir} does not exist`);
    return;
  }
  initialized = true;
  logForDebugging(`[keybindings] Watching for changes to ${userPath}`);
  watcher = chokidar.watch(userPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: FILE_STABILITY_THRESHOLD_MS,
      pollInterval: FILE_STABILITY_POLL_INTERVAL_MS
    },
    ignorePermissionErrors: true,
    usePolling: false,
    atomic: true
  });
  watcher.on("add", handleChange);
  watcher.on("change", handleChange);
  watcher.on("unlink", handleDelete);
  registerCleanup(async () => disposeKeybindingWatcher());
}
function disposeKeybindingWatcher() {
  disposed = true;
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
  keybindingsChanged.clear();
}
const subscribeToKeybindingChanges = keybindingsChanged.subscribe;
async function handleChange(path) {
  logForDebugging(`[keybindings] Detected change to ${path}`);
  try {
    const result = await loadKeybindings();
    cachedBindings = result.bindings;
    cachedWarnings = result.warnings;
    keybindingsChanged.emit(result);
  } catch (error) {
    logForDebugging(`[keybindings] Error reloading: ${errorMessage(error)}`);
  }
}
function handleDelete(path) {
  logForDebugging(`[keybindings] Detected deletion of ${path}`);
  const defaultBindings = getDefaultParsedBindings();
  cachedBindings = defaultBindings;
  cachedWarnings = [];
  keybindingsChanged.emit({ bindings: defaultBindings, warnings: [] });
}
function getCachedKeybindingWarnings() {
  return cachedWarnings;
}
function resetKeybindingLoaderForTesting() {
  initialized = false;
  disposed = false;
  cachedBindings = null;
  cachedWarnings = [];
  lastCustomBindingsLogDate = null;
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
  keybindingsChanged.clear();
}
export {
  disposeKeybindingWatcher,
  getCachedKeybindingWarnings,
  getKeybindingsPath,
  initializeKeybindingWatcher,
  isKeybindingCustomizationEnabled,
  loadKeybindings,
  loadKeybindingsSync,
  loadKeybindingsSyncWithWarnings,
  resetKeybindingLoaderForTesting,
  subscribeToKeybindingChanges
};
