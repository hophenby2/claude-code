import { getSettingsForSource } from "../settings/settings.js";
import { parsePluginIdentifier } from "./pluginIdentifier.js";
const INLINE_MARKETPLACE = "inline";
function qualifyDependency(dep, declaringPluginId) {
  if (parsePluginIdentifier(dep).marketplace) return dep;
  const mkt = parsePluginIdentifier(declaringPluginId).marketplace;
  if (!mkt || mkt === INLINE_MARKETPLACE) return dep;
  return `${dep}@${mkt}`;
}
async function resolveDependencyClosure(rootId, lookup, alreadyEnabled, allowedCrossMarketplaces = /* @__PURE__ */ new Set()) {
  const rootMarketplace = parsePluginIdentifier(rootId).marketplace;
  const closure = [];
  const visited = /* @__PURE__ */ new Set();
  const stack = [];
  async function walk(id, requiredBy) {
    if (id !== rootId && alreadyEnabled.has(id)) return null;
    const idMarketplace = parsePluginIdentifier(id).marketplace;
    if (idMarketplace !== rootMarketplace && !(idMarketplace && allowedCrossMarketplaces.has(idMarketplace))) {
      return {
        ok: false,
        reason: "cross-marketplace",
        dependency: id,
        requiredBy
      };
    }
    if (stack.includes(id)) {
      return { ok: false, reason: "cycle", chain: [...stack, id] };
    }
    if (visited.has(id)) return null;
    visited.add(id);
    const entry = await lookup(id);
    if (!entry) {
      return { ok: false, reason: "not-found", missing: id, requiredBy };
    }
    stack.push(id);
    for (const rawDep of entry.dependencies ?? []) {
      const dep = qualifyDependency(rawDep, id);
      const err2 = await walk(dep, id);
      if (err2) return err2;
    }
    stack.pop();
    closure.push(id);
    return null;
  }
  const err = await walk(rootId, rootId);
  if (err) return err;
  return { ok: true, closure };
}
function verifyAndDemote(plugins) {
  const known = new Set(plugins.map((p) => p.source));
  const enabled = new Set(plugins.filter((p) => p.enabled).map((p) => p.source));
  const knownByName = new Set(
    plugins.map((p) => parsePluginIdentifier(p.source).name)
  );
  const enabledByName = /* @__PURE__ */ new Map();
  for (const id of enabled) {
    const n = parsePluginIdentifier(id).name;
    enabledByName.set(n, (enabledByName.get(n) ?? 0) + 1);
  }
  const errors = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of plugins) {
      if (!enabled.has(p.source)) continue;
      for (const rawDep of p.manifest.dependencies ?? []) {
        const dep = qualifyDependency(rawDep, p.source);
        const isBare = !parsePluginIdentifier(dep).marketplace;
        const satisfied = isBare ? (enabledByName.get(dep) ?? 0) > 0 : enabled.has(dep);
        if (!satisfied) {
          enabled.delete(p.source);
          const count = enabledByName.get(p.name) ?? 0;
          if (count <= 1) enabledByName.delete(p.name);
          else enabledByName.set(p.name, count - 1);
          errors.push({
            type: "dependency-unsatisfied",
            source: p.source,
            plugin: p.name,
            dependency: dep,
            reason: (isBare ? knownByName.has(dep) : known.has(dep)) ? "not-enabled" : "not-found"
          });
          changed = true;
          break;
        }
      }
    }
  }
  const demoted = new Set(
    plugins.filter((p) => p.enabled && !enabled.has(p.source)).map((p) => p.source)
  );
  return { demoted, errors };
}
function findReverseDependents(pluginId, plugins) {
  const { name: targetName } = parsePluginIdentifier(pluginId);
  return plugins.filter(
    (p) => p.enabled && p.source !== pluginId && (p.manifest.dependencies ?? []).some((d) => {
      const qualified = qualifyDependency(d, p.source);
      return parsePluginIdentifier(qualified).marketplace ? qualified === pluginId : qualified === targetName;
    })
  ).map((p) => p.name);
}
function getEnabledPluginIdsForScope(settingSource) {
  return new Set(
    Object.entries(getSettingsForSource(settingSource)?.enabledPlugins ?? {}).filter(([, v]) => v === true || Array.isArray(v)).map(([k]) => k)
  );
}
function formatDependencyCountSuffix(installedDeps) {
  if (installedDeps.length === 0) return "";
  const n = installedDeps.length;
  return ` (+ ${n} ${n === 1 ? "dependency" : "dependencies"})`;
}
function formatReverseDependentsSuffix(rdeps) {
  if (!rdeps || rdeps.length === 0) return "";
  return ` \u2014 warning: required by ${rdeps.join(", ")}`;
}
export {
  findReverseDependents,
  formatDependencyCountSuffix,
  formatReverseDependentsSuffix,
  getEnabledPluginIdsForScope,
  qualifyDependency,
  resolveDependencyClosure,
  verifyAndDemote
};
