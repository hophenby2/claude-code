import memoize from "lodash-es/memoize.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import {
  logEvent
} from "../services/analytics/index.js";
import {
  toolMatchesName
} from "../Tool.js";
import {
  formatDeferredToolLine,
  isDeferredTool,
  TOOL_SEARCH_TOOL_NAME
} from "../tools/ToolSearchTool/prompt.js";
import {
  countToolDefinitionTokens,
  TOOL_TOKEN_COUNT_OVERHEAD
} from "./analyzeContext.js";
import { count } from "./array.js";
import { getMergedBetas } from "./betas.js";
import { getContextWindowForModel } from "./context.js";
import { logForDebugging } from "./debug.js";
import { isEnvDefinedFalsy, isEnvTruthy } from "./envUtils.js";
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl
} from "./model/providers.js";
import { jsonStringify } from "./slowOperations.js";
import { zodToJsonSchema } from "./zodToJsonSchema.js";
const DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE = 10;
function parseAutoPercentage(value) {
  if (!value.startsWith("auto:")) return null;
  const percentStr = value.slice(5);
  const percent = parseInt(percentStr, 10);
  if (isNaN(percent)) {
    logForDebugging(
      `Invalid ENABLE_TOOL_SEARCH value "${value}": expected auto:N where N is a number.`
    );
    return null;
  }
  return Math.max(0, Math.min(100, percent));
}
function isAutoToolSearchMode(value) {
  if (!value) return false;
  return value === "auto" || value.startsWith("auto:");
}
function getAutoToolSearchPercentage() {
  const value = process.env.ENABLE_TOOL_SEARCH;
  if (!value) return DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE;
  if (value === "auto") return DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE;
  const parsed = parseAutoPercentage(value);
  if (parsed !== null) return parsed;
  return DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE;
}
const CHARS_PER_TOKEN = 2.5;
function getAutoToolSearchTokenThreshold(model) {
  const betas = getMergedBetas(model);
  const contextWindow = getContextWindowForModel(model, betas);
  const percentage = getAutoToolSearchPercentage() / 100;
  return Math.floor(contextWindow * percentage);
}
function getAutoToolSearchCharThreshold(model) {
  return Math.floor(getAutoToolSearchTokenThreshold(model) * CHARS_PER_TOKEN);
}
const getDeferredToolTokenCount = memoize(
  async (tools, getToolPermissionContext, agents, model) => {
    const deferredTools = tools.filter((t) => isDeferredTool(t));
    if (deferredTools.length === 0) return 0;
    try {
      const total = await countToolDefinitionTokens(
        deferredTools,
        getToolPermissionContext,
        { activeAgents: agents, allAgents: agents },
        model
      );
      if (total === 0) return null;
      return Math.max(0, total - TOOL_TOKEN_COUNT_OVERHEAD);
    } catch {
      return null;
    }
  },
  (tools) => tools.filter((t) => isDeferredTool(t)).map((t) => t.name).join(",")
);
function getToolSearchMode() {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)) {
    return "standard";
  }
  const value = process.env.ENABLE_TOOL_SEARCH;
  const autoPercent = value ? parseAutoPercentage(value) : null;
  if (autoPercent === 0) return "tst";
  if (autoPercent === 100) return "standard";
  if (isAutoToolSearchMode(value)) {
    return "tst-auto";
  }
  if (isEnvTruthy(value)) return "tst";
  if (isEnvDefinedFalsy(process.env.ENABLE_TOOL_SEARCH)) return "standard";
  return "tst";
}
const DEFAULT_UNSUPPORTED_MODEL_PATTERNS = ["haiku"];
function getUnsupportedToolReferencePatterns() {
  try {
    const patterns = getFeatureValue_CACHED_MAY_BE_STALE(
      "tengu_tool_search_unsupported_models",
      null
    );
    if (patterns && Array.isArray(patterns) && patterns.length > 0) {
      return patterns;
    }
  } catch {
  }
  return DEFAULT_UNSUPPORTED_MODEL_PATTERNS;
}
function modelSupportsToolReference(model) {
  const normalizedModel = model.toLowerCase();
  const unsupportedPatterns = getUnsupportedToolReferencePatterns();
  for (const pattern of unsupportedPatterns) {
    if (normalizedModel.includes(pattern.toLowerCase())) {
      return false;
    }
  }
  return true;
}
let loggedOptimistic = false;
function isToolSearchEnabledOptimistic() {
  const mode = getToolSearchMode();
  if (mode === "standard") {
    if (!loggedOptimistic) {
      loggedOptimistic = true;
      logForDebugging(
        `[ToolSearch:optimistic] mode=${mode}, ENABLE_TOOL_SEARCH=${process.env.ENABLE_TOOL_SEARCH}, result=false`
      );
    }
    return false;
  }
  if (!process.env.ENABLE_TOOL_SEARCH && getAPIProvider() === "firstParty" && !isFirstPartyAnthropicBaseUrl()) {
    if (!loggedOptimistic) {
      loggedOptimistic = true;
      logForDebugging(
        `[ToolSearch:optimistic] disabled: ANTHROPIC_BASE_URL=${process.env.ANTHROPIC_BASE_URL} is not a first-party Anthropic host. Set ENABLE_TOOL_SEARCH=true (or auto / auto:N) if your proxy forwards tool_reference blocks.`
      );
    }
    return false;
  }
  if (!loggedOptimistic) {
    loggedOptimistic = true;
    logForDebugging(
      `[ToolSearch:optimistic] mode=${mode}, ENABLE_TOOL_SEARCH=${process.env.ENABLE_TOOL_SEARCH}, result=true`
    );
  }
  return true;
}
function isToolSearchToolAvailable(tools) {
  return tools.some((tool) => toolMatchesName(tool, TOOL_SEARCH_TOOL_NAME));
}
async function calculateDeferredToolDescriptionChars(tools, getToolPermissionContext, agents) {
  const deferredTools = tools.filter((t) => isDeferredTool(t));
  if (deferredTools.length === 0) return 0;
  const sizes = await Promise.all(
    deferredTools.map(async (tool) => {
      const description = await tool.prompt({
        getToolPermissionContext,
        tools,
        agents
      });
      const inputSchema = tool.inputJSONSchema ? jsonStringify(tool.inputJSONSchema) : tool.inputSchema ? jsonStringify(zodToJsonSchema(tool.inputSchema)) : "";
      return tool.name.length + description.length + inputSchema.length;
    })
  );
  return sizes.reduce((total, size) => total + size, 0);
}
async function isToolSearchEnabled(model, tools, getToolPermissionContext, agents, source) {
  const mcpToolCount = count(tools, (t) => t.isMcp);
  function logModeDecision(enabled, mode2, reason, extraProps) {
    logEvent("tengu_tool_search_mode_decision", {
      enabled,
      mode: mode2,
      reason,
      // Log the actual model being checked, not the session's main model.
      // This is important for debugging subagent tool search decisions where
      // the subagent model (e.g., haiku) differs from the session model (e.g., opus).
      checkedModel: model,
      mcpToolCount,
      userType: process.env.USER_TYPE ?? "external",
      ...extraProps
    });
  }
  if (!modelSupportsToolReference(model)) {
    logForDebugging(
      `Tool search disabled for model '${model}': model does not support tool_reference blocks. This feature is only available on Claude Sonnet 4+, Opus 4+, and newer models.`
    );
    logModeDecision(false, "standard", "model_unsupported");
    return false;
  }
  if (!isToolSearchToolAvailable(tools)) {
    logForDebugging(
      `Tool search disabled: ToolSearchTool is not available (may have been disallowed via disallowedTools).`
    );
    logModeDecision(false, "standard", "mcp_search_unavailable");
    return false;
  }
  const mode = getToolSearchMode();
  switch (mode) {
    case "tst":
      logModeDecision(true, mode, "tst_enabled");
      return true;
    case "tst-auto": {
      const { enabled, debugDescription, metrics } = await checkAutoThreshold(
        tools,
        getToolPermissionContext,
        agents,
        model
      );
      if (enabled) {
        logForDebugging(
          `Auto tool search enabled: ${debugDescription}` + (source ? ` [source: ${source}]` : "")
        );
        logModeDecision(true, mode, "auto_above_threshold", metrics);
        return true;
      }
      logForDebugging(
        `Auto tool search disabled: ${debugDescription}` + (source ? ` [source: ${source}]` : "")
      );
      logModeDecision(false, mode, "auto_below_threshold", metrics);
      return false;
    }
    case "standard":
      logModeDecision(false, mode, "standard_mode");
      return false;
  }
}
function isToolReferenceBlock(obj) {
  return typeof obj === "object" && obj !== null && "type" in obj && obj.type === "tool_reference";
}
function isToolReferenceWithName(obj) {
  return isToolReferenceBlock(obj) && "tool_name" in obj && typeof obj.tool_name === "string";
}
function isToolResultBlockWithContent(obj) {
  return typeof obj === "object" && obj !== null && "type" in obj && obj.type === "tool_result" && "content" in obj && Array.isArray(obj.content);
}
function extractDiscoveredToolNames(messages) {
  const discoveredTools = /* @__PURE__ */ new Set();
  let carriedFromBoundary = 0;
  for (const msg of messages) {
    if (msg.type === "system" && msg.subtype === "compact_boundary") {
      const carried = msg.compactMetadata?.preCompactDiscoveredTools;
      if (carried) {
        for (const name of carried) discoveredTools.add(name);
        carriedFromBoundary += carried.length;
      }
      continue;
    }
    if (msg.type !== "user") continue;
    const content = msg.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (isToolResultBlockWithContent(block)) {
        for (const item of block.content) {
          if (isToolReferenceWithName(item)) {
            discoveredTools.add(item.tool_name);
          }
        }
      }
    }
  }
  if (discoveredTools.size > 0) {
    logForDebugging(
      `Dynamic tool loading: found ${discoveredTools.size} discovered tools in message history` + (carriedFromBoundary > 0 ? ` (${carriedFromBoundary} carried from compact boundary)` : "")
    );
  }
  return discoveredTools;
}
function isDeferredToolsDeltaEnabled() {
  return process.env.USER_TYPE === "ant" || getFeatureValue_CACHED_MAY_BE_STALE("tengu_glacier_2xr", false);
}
function getDeferredToolsDelta(tools, messages, scanContext) {
  const announced = /* @__PURE__ */ new Set();
  let attachmentCount = 0;
  let dtdCount = 0;
  const attachmentTypesSeen = /* @__PURE__ */ new Set();
  for (const msg of messages) {
    if (msg.type !== "attachment") continue;
    attachmentCount++;
    attachmentTypesSeen.add(msg.attachment.type);
    if (msg.attachment.type !== "deferred_tools_delta") continue;
    dtdCount++;
    for (const n of msg.attachment.addedNames) announced.add(n);
    for (const n of msg.attachment.removedNames) announced.delete(n);
  }
  const deferred = tools.filter(isDeferredTool);
  const deferredNames = new Set(deferred.map((t) => t.name));
  const poolNames = new Set(tools.map((t) => t.name));
  const added = deferred.filter((t) => !announced.has(t.name));
  const removed = [];
  for (const n of announced) {
    if (deferredNames.has(n)) continue;
    if (!poolNames.has(n)) removed.push(n);
  }
  if (added.length === 0 && removed.length === 0) return null;
  logEvent("tengu_deferred_tools_pool_change", {
    addedCount: added.length,
    removedCount: removed.length,
    priorAnnouncedCount: announced.size,
    messagesLength: messages.length,
    attachmentCount,
    dtdCount,
    callSite: scanContext?.callSite ?? "unknown",
    querySource: scanContext?.querySource ?? "unknown",
    attachmentTypesSeen: [...attachmentTypesSeen].sort().join(",")
  });
  return {
    addedNames: added.map((t) => t.name).sort(),
    addedLines: added.map(formatDeferredToolLine).sort(),
    removedNames: removed.sort()
  };
}
async function checkAutoThreshold(tools, getToolPermissionContext, agents, model) {
  const deferredToolTokens = await getDeferredToolTokenCount(
    tools,
    getToolPermissionContext,
    agents,
    model
  );
  if (deferredToolTokens !== null) {
    const threshold = getAutoToolSearchTokenThreshold(model);
    return {
      enabled: deferredToolTokens >= threshold,
      debugDescription: `${deferredToolTokens} tokens (threshold: ${threshold}, ${getAutoToolSearchPercentage()}% of context)`,
      metrics: { deferredToolTokens, threshold }
    };
  }
  const deferredToolDescriptionChars = await calculateDeferredToolDescriptionChars(
    tools,
    getToolPermissionContext,
    agents
  );
  const charThreshold = getAutoToolSearchCharThreshold(model);
  return {
    enabled: deferredToolDescriptionChars >= charThreshold,
    debugDescription: `${deferredToolDescriptionChars} chars (threshold: ${charThreshold}, ${getAutoToolSearchPercentage()}% of context) (char fallback)`,
    metrics: { deferredToolDescriptionChars, charThreshold }
  };
}
export {
  extractDiscoveredToolNames,
  getAutoToolSearchCharThreshold,
  getDeferredToolsDelta,
  getToolSearchMode,
  isDeferredToolsDeltaEnabled,
  isToolReferenceBlock,
  isToolSearchEnabled,
  isToolSearchEnabledOptimistic,
  isToolSearchToolAvailable,
  modelSupportsToolReference
};
