import { createPatch } from "diff";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { logForDebugging } from "../../utils/debug.js";
import { djb2Hash } from "../../utils/hash.js";
import { logError } from "../../utils/log.js";
import { getClaudeTempDir } from "../../utils/permissions/filesystem.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import {
  logEvent
} from "../analytics/index.js";
function getCacheBreakDiffPath() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return join(getClaudeTempDir(), `cache-break-${suffix}.diff`);
}
const previousStateBySource = /* @__PURE__ */ new Map();
const MAX_TRACKED_SOURCES = 10;
const TRACKED_SOURCE_PREFIXES = [
  "repl_main_thread",
  "sdk",
  "agent:custom",
  "agent:default",
  "agent:builtin"
];
const MIN_CACHE_MISS_TOKENS = 2e3;
const CACHE_TTL_5MIN_MS = 5 * 60 * 1e3;
const CACHE_TTL_1HOUR_MS = 60 * 60 * 1e3;
function isExcludedModel(model) {
  return model.includes("haiku");
}
function getTrackingKey(querySource, agentId) {
  if (querySource === "compact") return "repl_main_thread";
  for (const prefix of TRACKED_SOURCE_PREFIXES) {
    if (querySource.startsWith(prefix)) return agentId || querySource;
  }
  return null;
}
function stripCacheControl(items) {
  return items.map((item) => {
    if (!("cache_control" in item)) return item;
    const { cache_control: _, ...rest } = item;
    return rest;
  });
}
function computeHash(data) {
  const str = jsonStringify(data);
  if (typeof Bun !== "undefined") {
    const hash = Bun.hash(str);
    return typeof hash === "bigint" ? Number(hash & 0xffffffffn) : hash;
  }
  return djb2Hash(str);
}
function sanitizeToolName(name) {
  return name.startsWith("mcp__") ? "mcp" : name;
}
function computePerToolHashes(strippedTools, names) {
  const hashes = {};
  for (let i = 0; i < strippedTools.length; i++) {
    hashes[names[i] ?? `__idx_${i}`] = computeHash(strippedTools[i]);
  }
  return hashes;
}
function getSystemCharCount(system) {
  let total = 0;
  for (const block of system) {
    total += block.text.length;
  }
  return total;
}
function buildDiffableContent(system, tools, model) {
  const systemText = system.map((b) => b.text).join("\n\n");
  const toolDetails = tools.map((t) => {
    if (!("name" in t)) return "unknown";
    const desc = "description" in t ? t.description : "";
    const schema = "input_schema" in t ? jsonStringify(t.input_schema) : "";
    return `${t.name}
  description: ${desc}
  input_schema: ${schema}`;
  }).sort().join("\n\n");
  return `Model: ${model}

=== System Prompt ===

${systemText}

=== Tools (${tools.length}) ===

${toolDetails}
`;
}
function recordPromptState(snapshot) {
  try {
    const {
      system,
      toolSchemas,
      querySource,
      model,
      agentId,
      fastMode,
      globalCacheStrategy = "",
      betas = [],
      autoModeActive = false,
      isUsingOverage = false,
      cachedMCEnabled = false,
      effortValue,
      extraBodyParams
    } = snapshot;
    const key = getTrackingKey(querySource, agentId);
    if (!key) return;
    const strippedSystem = stripCacheControl(
      system
    );
    const strippedTools = stripCacheControl(
      toolSchemas
    );
    const systemHash = computeHash(strippedSystem);
    const toolsHash = computeHash(strippedTools);
    const cacheControlHash = computeHash(
      system.map((b) => "cache_control" in b ? b.cache_control : null)
    );
    const toolNames = toolSchemas.map((t) => "name" in t ? t.name : "unknown");
    const computeToolHashes = () => computePerToolHashes(strippedTools, toolNames);
    const systemCharCount = getSystemCharCount(system);
    const lazyDiffableContent = () => buildDiffableContent(system, toolSchemas, model);
    const isFastMode = fastMode ?? false;
    const sortedBetas = [...betas].sort();
    const effortStr = effortValue === void 0 ? "" : String(effortValue);
    const extraBodyHash = extraBodyParams === void 0 ? 0 : computeHash(extraBodyParams);
    const prev = previousStateBySource.get(key);
    if (!prev) {
      while (previousStateBySource.size >= MAX_TRACKED_SOURCES) {
        const oldest = previousStateBySource.keys().next().value;
        if (oldest !== void 0) previousStateBySource.delete(oldest);
      }
      previousStateBySource.set(key, {
        systemHash,
        toolsHash,
        cacheControlHash,
        toolNames,
        systemCharCount,
        model,
        fastMode: isFastMode,
        globalCacheStrategy,
        betas: sortedBetas,
        autoModeActive,
        isUsingOverage,
        cachedMCEnabled,
        effortValue: effortStr,
        extraBodyHash,
        callCount: 1,
        pendingChanges: null,
        prevCacheReadTokens: null,
        cacheDeletionsPending: false,
        buildDiffableContent: lazyDiffableContent,
        perToolHashes: computeToolHashes()
      });
      return;
    }
    prev.callCount++;
    const systemPromptChanged = systemHash !== prev.systemHash;
    const toolSchemasChanged = toolsHash !== prev.toolsHash;
    const modelChanged = model !== prev.model;
    const fastModeChanged = isFastMode !== prev.fastMode;
    const cacheControlChanged = cacheControlHash !== prev.cacheControlHash;
    const globalCacheStrategyChanged = globalCacheStrategy !== prev.globalCacheStrategy;
    const betasChanged = sortedBetas.length !== prev.betas.length || sortedBetas.some((b, i) => b !== prev.betas[i]);
    const autoModeChanged = autoModeActive !== prev.autoModeActive;
    const overageChanged = isUsingOverage !== prev.isUsingOverage;
    const cachedMCChanged = cachedMCEnabled !== prev.cachedMCEnabled;
    const effortChanged = effortStr !== prev.effortValue;
    const extraBodyChanged = extraBodyHash !== prev.extraBodyHash;
    if (systemPromptChanged || toolSchemasChanged || modelChanged || fastModeChanged || cacheControlChanged || globalCacheStrategyChanged || betasChanged || autoModeChanged || overageChanged || cachedMCChanged || effortChanged || extraBodyChanged) {
      const prevToolSet = new Set(prev.toolNames);
      const newToolSet = new Set(toolNames);
      const prevBetaSet = new Set(prev.betas);
      const newBetaSet = new Set(sortedBetas);
      const addedTools = toolNames.filter((n) => !prevToolSet.has(n));
      const removedTools = prev.toolNames.filter((n) => !newToolSet.has(n));
      const changedToolSchemas = [];
      if (toolSchemasChanged) {
        const newHashes = computeToolHashes();
        for (const name of toolNames) {
          if (!prevToolSet.has(name)) continue;
          if (newHashes[name] !== prev.perToolHashes[name]) {
            changedToolSchemas.push(name);
          }
        }
        prev.perToolHashes = newHashes;
      }
      prev.pendingChanges = {
        systemPromptChanged,
        toolSchemasChanged,
        modelChanged,
        fastModeChanged,
        cacheControlChanged,
        globalCacheStrategyChanged,
        betasChanged,
        autoModeChanged,
        overageChanged,
        cachedMCChanged,
        effortChanged,
        extraBodyChanged,
        addedToolCount: addedTools.length,
        removedToolCount: removedTools.length,
        addedTools,
        removedTools,
        changedToolSchemas,
        systemCharDelta: systemCharCount - prev.systemCharCount,
        previousModel: prev.model,
        newModel: model,
        prevGlobalCacheStrategy: prev.globalCacheStrategy,
        newGlobalCacheStrategy: globalCacheStrategy,
        addedBetas: sortedBetas.filter((b) => !prevBetaSet.has(b)),
        removedBetas: prev.betas.filter((b) => !newBetaSet.has(b)),
        prevEffortValue: prev.effortValue,
        newEffortValue: effortStr,
        buildPrevDiffableContent: prev.buildDiffableContent
      };
    } else {
      prev.pendingChanges = null;
    }
    prev.systemHash = systemHash;
    prev.toolsHash = toolsHash;
    prev.cacheControlHash = cacheControlHash;
    prev.toolNames = toolNames;
    prev.systemCharCount = systemCharCount;
    prev.model = model;
    prev.fastMode = isFastMode;
    prev.globalCacheStrategy = globalCacheStrategy;
    prev.betas = sortedBetas;
    prev.autoModeActive = autoModeActive;
    prev.isUsingOverage = isUsingOverage;
    prev.cachedMCEnabled = cachedMCEnabled;
    prev.effortValue = effortStr;
    prev.extraBodyHash = extraBodyHash;
    prev.buildDiffableContent = lazyDiffableContent;
  } catch (e) {
    logError(e);
  }
}
async function checkResponseForCacheBreak(querySource, cacheReadTokens, cacheCreationTokens, messages, agentId, requestId) {
  try {
    const key = getTrackingKey(querySource, agentId);
    if (!key) return;
    const state = previousStateBySource.get(key);
    if (!state) return;
    if (isExcludedModel(state.model)) return;
    const prevCacheRead = state.prevCacheReadTokens;
    state.prevCacheReadTokens = cacheReadTokens;
    const lastAssistantMessage = messages.findLast((m) => m.type === "assistant");
    const timeSinceLastAssistantMsg = lastAssistantMessage ? Date.now() - new Date(lastAssistantMessage.timestamp).getTime() : null;
    if (prevCacheRead === null) return;
    const changes = state.pendingChanges;
    if (state.cacheDeletionsPending) {
      state.cacheDeletionsPending = false;
      logForDebugging(
        `[PROMPT CACHE] cache deletion applied, cache read: ${prevCacheRead} \u2192 ${cacheReadTokens} (expected drop)`
      );
      state.pendingChanges = null;
      return;
    }
    const tokenDrop = prevCacheRead - cacheReadTokens;
    if (cacheReadTokens >= prevCacheRead * 0.95 || tokenDrop < MIN_CACHE_MISS_TOKENS) {
      state.pendingChanges = null;
      return;
    }
    const parts = [];
    if (changes) {
      if (changes.modelChanged) {
        parts.push(
          `model changed (${changes.previousModel} \u2192 ${changes.newModel})`
        );
      }
      if (changes.systemPromptChanged) {
        const charDelta = changes.systemCharDelta;
        const charInfo = charDelta === 0 ? "" : charDelta > 0 ? ` (+${charDelta} chars)` : ` (${charDelta} chars)`;
        parts.push(`system prompt changed${charInfo}`);
      }
      if (changes.toolSchemasChanged) {
        const toolDiff = changes.addedToolCount > 0 || changes.removedToolCount > 0 ? ` (+${changes.addedToolCount}/-${changes.removedToolCount} tools)` : " (tool prompt/schema changed, same tool set)";
        parts.push(`tools changed${toolDiff}`);
      }
      if (changes.fastModeChanged) {
        parts.push("fast mode toggled");
      }
      if (changes.globalCacheStrategyChanged) {
        parts.push(
          `global cache strategy changed (${changes.prevGlobalCacheStrategy || "none"} \u2192 ${changes.newGlobalCacheStrategy || "none"})`
        );
      }
      if (changes.cacheControlChanged && !changes.globalCacheStrategyChanged && !changes.systemPromptChanged) {
        parts.push("cache_control changed (scope or TTL)");
      }
      if (changes.betasChanged) {
        const added = changes.addedBetas.length ? `+${changes.addedBetas.join(",")}` : "";
        const removed = changes.removedBetas.length ? `-${changes.removedBetas.join(",")}` : "";
        const diff = [added, removed].filter(Boolean).join(" ");
        parts.push(`betas changed${diff ? ` (${diff})` : ""}`);
      }
      if (changes.autoModeChanged) {
        parts.push("auto mode toggled");
      }
      if (changes.overageChanged) {
        parts.push("overage state changed (TTL latched, no flip)");
      }
      if (changes.cachedMCChanged) {
        parts.push("cached microcompact toggled");
      }
      if (changes.effortChanged) {
        parts.push(
          `effort changed (${changes.prevEffortValue || "default"} \u2192 ${changes.newEffortValue || "default"})`
        );
      }
      if (changes.extraBodyChanged) {
        parts.push("extra body params changed");
      }
    }
    const lastAssistantMsgOver5minAgo = timeSinceLastAssistantMsg !== null && timeSinceLastAssistantMsg > CACHE_TTL_5MIN_MS;
    const lastAssistantMsgOver1hAgo = timeSinceLastAssistantMsg !== null && timeSinceLastAssistantMsg > CACHE_TTL_1HOUR_MS;
    let reason;
    if (parts.length > 0) {
      reason = parts.join(", ");
    } else if (lastAssistantMsgOver1hAgo) {
      reason = "possible 1h TTL expiry (prompt unchanged)";
    } else if (lastAssistantMsgOver5minAgo) {
      reason = "possible 5min TTL expiry (prompt unchanged)";
    } else if (timeSinceLastAssistantMsg !== null) {
      reason = "likely server-side (prompt unchanged, <5min gap)";
    } else {
      reason = "unknown cause";
    }
    logEvent("tengu_prompt_cache_break", {
      systemPromptChanged: changes?.systemPromptChanged ?? false,
      toolSchemasChanged: changes?.toolSchemasChanged ?? false,
      modelChanged: changes?.modelChanged ?? false,
      fastModeChanged: changes?.fastModeChanged ?? false,
      cacheControlChanged: changes?.cacheControlChanged ?? false,
      globalCacheStrategyChanged: changes?.globalCacheStrategyChanged ?? false,
      betasChanged: changes?.betasChanged ?? false,
      autoModeChanged: changes?.autoModeChanged ?? false,
      overageChanged: changes?.overageChanged ?? false,
      cachedMCChanged: changes?.cachedMCChanged ?? false,
      effortChanged: changes?.effortChanged ?? false,
      extraBodyChanged: changes?.extraBodyChanged ?? false,
      addedToolCount: changes?.addedToolCount ?? 0,
      removedToolCount: changes?.removedToolCount ?? 0,
      systemCharDelta: changes?.systemCharDelta ?? 0,
      // Tool names are sanitized: built-in names are a fixed vocabulary,
      // MCP tools collapse to 'mcp' (user-configured, could leak paths).
      addedTools: (changes?.addedTools ?? []).map(sanitizeToolName).join(
        ","
      ),
      removedTools: (changes?.removedTools ?? []).map(sanitizeToolName).join(
        ","
      ),
      changedToolSchemas: (changes?.changedToolSchemas ?? []).map(sanitizeToolName).join(
        ","
      ),
      // Beta header names and cache strategy are fixed enum-like values,
      // not code or filepaths. requestId is an opaque server-generated ID.
      addedBetas: (changes?.addedBetas ?? []).join(
        ","
      ),
      removedBetas: (changes?.removedBetas ?? []).join(
        ","
      ),
      prevGlobalCacheStrategy: changes?.prevGlobalCacheStrategy ?? "",
      newGlobalCacheStrategy: changes?.newGlobalCacheStrategy ?? "",
      callNumber: state.callCount,
      prevCacheReadTokens: prevCacheRead,
      cacheReadTokens,
      cacheCreationTokens,
      timeSinceLastAssistantMsg: timeSinceLastAssistantMsg ?? -1,
      lastAssistantMsgOver5minAgo,
      lastAssistantMsgOver1hAgo,
      requestId: requestId ?? ""
    });
    let diffPath;
    if (changes?.buildPrevDiffableContent) {
      diffPath = await writeCacheBreakDiff(
        changes.buildPrevDiffableContent(),
        state.buildDiffableContent()
      );
    }
    const diffSuffix = diffPath ? `, diff: ${diffPath}` : "";
    const summary = `[PROMPT CACHE BREAK] ${reason} [source=${querySource}, call #${state.callCount}, cache read: ${prevCacheRead} \u2192 ${cacheReadTokens}, creation: ${cacheCreationTokens}${diffSuffix}]`;
    logForDebugging(summary, { level: "warn" });
    state.pendingChanges = null;
  } catch (e) {
    logError(e);
  }
}
function notifyCacheDeletion(querySource, agentId) {
  const key = getTrackingKey(querySource, agentId);
  const state = key ? previousStateBySource.get(key) : void 0;
  if (state) {
    state.cacheDeletionsPending = true;
  }
}
function notifyCompaction(querySource, agentId) {
  const key = getTrackingKey(querySource, agentId);
  const state = key ? previousStateBySource.get(key) : void 0;
  if (state) {
    state.prevCacheReadTokens = null;
  }
}
function cleanupAgentTracking(agentId) {
  previousStateBySource.delete(agentId);
}
function resetPromptCacheBreakDetection() {
  previousStateBySource.clear();
}
async function writeCacheBreakDiff(prevContent, newContent) {
  try {
    const diffPath = getCacheBreakDiffPath();
    await mkdir(getClaudeTempDir(), { recursive: true });
    const patch = createPatch(
      "prompt-state",
      prevContent,
      newContent,
      "before",
      "after"
    );
    await writeFile(diffPath, patch);
    return diffPath;
  } catch {
    return void 0;
  }
}
export {
  CACHE_TTL_1HOUR_MS,
  checkResponseForCacheBreak,
  cleanupAgentTracking,
  notifyCacheDeletion,
  notifyCompaction,
  recordPromptState,
  resetPromptCacheBreakDetection
};
