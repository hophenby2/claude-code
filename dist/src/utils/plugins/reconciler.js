import isEqual from "lodash-es/isEqual.js";
import { isAbsolute, resolve } from "path";
import { getOriginalCwd } from "../../bootstrap/state.js";
import { logForDebugging } from "../debug.js";
import { errorMessage } from "../errors.js";
import { pathExists } from "../file.js";
import { findCanonicalGitRoot } from "../git.js";
import { logError } from "../log.js";
import {
  addMarketplaceSource,
  getDeclaredMarketplaces,
  loadKnownMarketplacesConfig
} from "./marketplaceManager.js";
import {
  isLocalMarketplaceSource
} from "./schemas.js";
function diffMarketplaces(declared, materialized, opts) {
  const missing = [];
  const sourceChanged = [];
  const upToDate = [];
  for (const [name, intent] of Object.entries(declared)) {
    const state = materialized[name];
    const normalizedIntent = normalizeSource(intent.source, opts?.projectRoot);
    if (!state) {
      missing.push(name);
    } else if (intent.sourceIsFallback) {
      upToDate.push(name);
    } else if (!isEqual(normalizedIntent, state.source)) {
      sourceChanged.push({
        name,
        declaredSource: normalizedIntent,
        materializedSource: state.source
      });
    } else {
      upToDate.push(name);
    }
  }
  return { missing, sourceChanged, upToDate };
}
async function reconcileMarketplaces(opts) {
  const declared = getDeclaredMarketplaces();
  if (Object.keys(declared).length === 0) {
    return { installed: [], updated: [], failed: [], upToDate: [], skipped: [] };
  }
  let materialized;
  try {
    materialized = await loadKnownMarketplacesConfig();
  } catch (e) {
    logError(e);
    materialized = {};
  }
  const diff = diffMarketplaces(declared, materialized, {
    projectRoot: getOriginalCwd()
  });
  const work = [
    ...diff.missing.map(
      (name) => ({
        name,
        source: normalizeSource(declared[name].source),
        action: "install"
      })
    ),
    ...diff.sourceChanged.map(
      ({ name, declaredSource }) => ({
        name,
        source: declaredSource,
        action: "update"
      })
    )
  ];
  const skipped = [];
  const toProcess = [];
  for (const item of work) {
    if (opts?.skip?.(item.name, item.source)) {
      skipped.push(item.name);
      continue;
    }
    if (item.action === "update" && isLocalMarketplaceSource(item.source) && !await pathExists(item.source.path)) {
      logForDebugging(
        `[reconcile] '${item.name}' declared path does not exist; keeping materialized entry`
      );
      skipped.push(item.name);
      continue;
    }
    toProcess.push(item);
  }
  if (toProcess.length === 0) {
    return {
      installed: [],
      updated: [],
      failed: [],
      upToDate: diff.upToDate,
      skipped
    };
  }
  logForDebugging(
    `[reconcile] ${toProcess.length} marketplace(s): ${toProcess.map((w) => `${w.name}(${w.action})`).join(", ")}`
  );
  const installed = [];
  const updated = [];
  const failed = [];
  for (let i = 0; i < toProcess.length; i++) {
    const { name, source, action } = toProcess[i];
    opts?.onProgress?.({
      type: "installing",
      name,
      action,
      index: i + 1,
      total: toProcess.length
    });
    try {
      const result = await addMarketplaceSource(source);
      if (action === "install") installed.push(name);
      else updated.push(name);
      opts?.onProgress?.({
        type: "installed",
        name,
        alreadyMaterialized: result.alreadyMaterialized
      });
    } catch (e) {
      const error = errorMessage(e);
      failed.push({ name, error });
      opts?.onProgress?.({ type: "failed", name, error });
      logError(e);
    }
  }
  return { installed, updated, failed, upToDate: diff.upToDate, skipped };
}
function normalizeSource(source, projectRoot) {
  if ((source.source === "directory" || source.source === "file") && !isAbsolute(source.path)) {
    const base = projectRoot ?? getOriginalCwd();
    const canonicalRoot = findCanonicalGitRoot(base);
    return {
      ...source,
      path: resolve(canonicalRoot ?? base, source.path)
    };
  }
  return source;
}
export {
  diffMarketplaces,
  reconcileMarketplaces
};
