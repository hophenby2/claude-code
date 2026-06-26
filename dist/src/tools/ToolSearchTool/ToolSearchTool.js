import memoize from "lodash-es/memoize.js";
import { z } from "zod/v4";
import {
  logEvent
} from "../../services/analytics/index.js";
import {
  buildTool,
  findToolByName
} from "../../Tool.js";
import { logForDebugging } from "../../utils/debug.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { escapeRegExp } from "../../utils/stringUtils.js";
import { isToolSearchEnabledOptimistic } from "../../utils/toolSearch.js";
import { getPrompt, isDeferredTool, TOOL_SEARCH_TOOL_NAME } from "./prompt.js";
const inputSchema = lazySchema(
  () => z.object({
    query: z.string().describe(
      'Query to find deferred tools. Use "select:<tool_name>" for direct selection, or keywords to search.'
    ),
    max_results: z.number().optional().default(5).describe("Maximum number of results to return (default: 5)")
  })
);
const outputSchema = lazySchema(
  () => z.object({
    matches: z.array(z.string()),
    query: z.string(),
    total_deferred_tools: z.number(),
    pending_mcp_servers: z.array(z.string()).optional()
  })
);
let cachedDeferredToolNames = null;
function getDeferredToolsCacheKey(deferredTools) {
  return deferredTools.map((t) => t.name).sort().join(",");
}
const getToolDescriptionMemoized = memoize(
  async (toolName, tools) => {
    const tool = findToolByName(tools, toolName);
    if (!tool) {
      return "";
    }
    return tool.prompt({
      getToolPermissionContext: async () => ({
        mode: "default",
        additionalWorkingDirectories: /* @__PURE__ */ new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
        isBypassPermissionsModeAvailable: false
      }),
      tools,
      agents: []
    });
  },
  (toolName) => toolName
);
function maybeInvalidateCache(deferredTools) {
  const currentKey = getDeferredToolsCacheKey(deferredTools);
  if (cachedDeferredToolNames !== currentKey) {
    logForDebugging(
      `ToolSearchTool: cache invalidated - deferred tools changed`
    );
    getToolDescriptionMemoized.cache.clear?.();
    cachedDeferredToolNames = currentKey;
  }
}
function clearToolSearchDescriptionCache() {
  getToolDescriptionMemoized.cache.clear?.();
  cachedDeferredToolNames = null;
}
function buildSearchResult(matches, query, totalDeferredTools, pendingMcpServers) {
  return {
    data: {
      matches,
      query,
      total_deferred_tools: totalDeferredTools,
      ...pendingMcpServers && pendingMcpServers.length > 0 ? { pending_mcp_servers: pendingMcpServers } : {}
    }
  };
}
function parseToolName(name) {
  if (name.startsWith("mcp__")) {
    const withoutPrefix = name.replace(/^mcp__/, "").toLowerCase();
    const parts2 = withoutPrefix.split("__").flatMap((p) => p.split("_"));
    return {
      parts: parts2.filter(Boolean),
      full: withoutPrefix.replace(/__/g, " ").replace(/_/g, " "),
      isMcp: true
    };
  }
  const parts = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase().split(/\s+/).filter(Boolean);
  return {
    parts,
    full: parts.join(" "),
    isMcp: false
  };
}
function compileTermPatterns(terms) {
  const patterns = /* @__PURE__ */ new Map();
  for (const term of terms) {
    if (!patterns.has(term)) {
      patterns.set(term, new RegExp(`\\b${escapeRegExp(term)}\\b`));
    }
  }
  return patterns;
}
async function searchToolsWithKeywords(query, deferredTools, tools, maxResults) {
  const queryLower = query.toLowerCase().trim();
  const exactMatch = deferredTools.find((t) => t.name.toLowerCase() === queryLower) ?? tools.find((t) => t.name.toLowerCase() === queryLower);
  if (exactMatch) {
    return [exactMatch.name];
  }
  if (queryLower.startsWith("mcp__") && queryLower.length > 5) {
    const prefixMatches = deferredTools.filter((t) => t.name.toLowerCase().startsWith(queryLower)).slice(0, maxResults).map((t) => t.name);
    if (prefixMatches.length > 0) {
      return prefixMatches;
    }
  }
  const queryTerms = queryLower.split(/\s+/).filter((term) => term.length > 0);
  const requiredTerms = [];
  const optionalTerms = [];
  for (const term of queryTerms) {
    if (term.startsWith("+") && term.length > 1) {
      requiredTerms.push(term.slice(1));
    } else {
      optionalTerms.push(term);
    }
  }
  const allScoringTerms = requiredTerms.length > 0 ? [...requiredTerms, ...optionalTerms] : queryTerms;
  const termPatterns = compileTermPatterns(allScoringTerms);
  let candidateTools = deferredTools;
  if (requiredTerms.length > 0) {
    const matches = await Promise.all(
      deferredTools.map(async (tool) => {
        const parsed = parseToolName(tool.name);
        const description = await getToolDescriptionMemoized(tool.name, tools);
        const descNormalized = description.toLowerCase();
        const hintNormalized = tool.searchHint?.toLowerCase() ?? "";
        const matchesAll = requiredTerms.every((term) => {
          const pattern = termPatterns.get(term);
          return parsed.parts.includes(term) || parsed.parts.some((part) => part.includes(term)) || pattern.test(descNormalized) || hintNormalized && pattern.test(hintNormalized);
        });
        return matchesAll ? tool : null;
      })
    );
    candidateTools = matches.filter((t) => t !== null);
  }
  const scored = await Promise.all(
    candidateTools.map(async (tool) => {
      const parsed = parseToolName(tool.name);
      const description = await getToolDescriptionMemoized(tool.name, tools);
      const descNormalized = description.toLowerCase();
      const hintNormalized = tool.searchHint?.toLowerCase() ?? "";
      let score = 0;
      for (const term of allScoringTerms) {
        const pattern = termPatterns.get(term);
        if (parsed.parts.includes(term)) {
          score += parsed.isMcp ? 12 : 10;
        } else if (parsed.parts.some((part) => part.includes(term))) {
          score += parsed.isMcp ? 6 : 5;
        }
        if (parsed.full.includes(term) && score === 0) {
          score += 3;
        }
        if (hintNormalized && pattern.test(hintNormalized)) {
          score += 4;
        }
        if (pattern.test(descNormalized)) {
          score += 2;
        }
      }
      return { name: tool.name, score };
    })
  );
  return scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults).map((item) => item.name);
}
const ToolSearchTool = buildTool({
  isEnabled() {
    return isToolSearchEnabledOptimistic();
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: TOOL_SEARCH_TOOL_NAME,
  maxResultSizeChars: 1e5,
  async description() {
    return getPrompt();
  },
  async prompt() {
    return getPrompt();
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  async call(input, { options: { tools }, getAppState }) {
    const { query, max_results = 5 } = input;
    const deferredTools = tools.filter(isDeferredTool);
    maybeInvalidateCache(deferredTools);
    function getPendingServerNames() {
      const appState = getAppState();
      const pending = appState.mcp.clients.filter((c) => c.type === "pending");
      return pending.length > 0 ? pending.map((s) => s.name) : void 0;
    }
    function logSearchOutcome(matches2, queryType) {
      logEvent("tengu_tool_search_outcome", {
        query,
        queryType,
        matchCount: matches2.length,
        totalDeferredTools: deferredTools.length,
        maxResults: max_results,
        hasMatches: matches2.length > 0
      });
    }
    const selectMatch = query.match(/^select:(.+)$/i);
    if (selectMatch) {
      const requested = selectMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      const found = [];
      const missing = [];
      for (const toolName of requested) {
        const tool = findToolByName(deferredTools, toolName) ?? findToolByName(tools, toolName);
        if (tool) {
          if (!found.includes(tool.name)) found.push(tool.name);
        } else {
          missing.push(toolName);
        }
      }
      if (found.length === 0) {
        logForDebugging(
          `ToolSearchTool: select failed \u2014 none found: ${missing.join(", ")}`
        );
        logSearchOutcome([], "select");
        const pendingServers = getPendingServerNames();
        return buildSearchResult(
          [],
          query,
          deferredTools.length,
          pendingServers
        );
      }
      if (missing.length > 0) {
        logForDebugging(
          `ToolSearchTool: partial select \u2014 found: ${found.join(", ")}, missing: ${missing.join(", ")}`
        );
      } else {
        logForDebugging(`ToolSearchTool: selected ${found.join(", ")}`);
      }
      logSearchOutcome(found, "select");
      return buildSearchResult(found, query, deferredTools.length);
    }
    const matches = await searchToolsWithKeywords(
      query,
      deferredTools,
      tools,
      max_results
    );
    logForDebugging(
      `ToolSearchTool: keyword search for "${query}", found ${matches.length} matches`
    );
    logSearchOutcome(matches, "keyword");
    if (matches.length === 0) {
      const pendingServers = getPendingServerNames();
      return buildSearchResult(
        matches,
        query,
        deferredTools.length,
        pendingServers
      );
    }
    return buildSearchResult(matches, query, deferredTools.length);
  },
  renderToolUseMessage() {
    return null;
  },
  userFacingName: () => "",
  /**
   * Returns a tool_result with tool_reference blocks.
   * This format works on 1P/Foundry. Bedrock/Vertex may not support
   * client-side tool_reference expansion yet.
   */
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    if (content.matches.length === 0) {
      let text = "No matching deferred tools found";
      if (content.pending_mcp_servers && content.pending_mcp_servers.length > 0) {
        text += `. Some MCP servers are still connecting: ${content.pending_mcp_servers.join(", ")}. Their tools will become available shortly \u2014 try searching again.`;
      }
      return {
        type: "tool_result",
        tool_use_id: toolUseID,
        content: text
      };
    }
    return {
      type: "tool_result",
      tool_use_id: toolUseID,
      content: content.matches.map((name) => ({
        type: "tool_reference",
        tool_name: name
      }))
    };
  }
});
export {
  ToolSearchTool,
  clearToolSearchDescriptionCache,
  inputSchema,
  outputSchema
};
