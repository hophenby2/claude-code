import { createHash } from "crypto";
import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from "../constants/prompts.js";
import { getSystemContext, getUserContext } from "../context.js";
import { isAnalyticsDisabled } from "../services/analytics/config.js";
import {
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_MAY_BE_STALE
} from "../services/analytics/growthbook.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { prefetchAllMcpResources } from "../services/mcp/client.js";
import { BashTool } from "../tools/BashTool/BashTool.js";
import { FileEditTool } from "../tools/FileEditTool/FileEditTool.js";
import {
  normalizeFileEditInput,
  stripTrailingWhitespace
} from "../tools/FileEditTool/utils.js";
import { FileWriteTool } from "../tools/FileWriteTool/FileWriteTool.js";
import { getTools } from "../tools.js";
import { CLI_SYSPROMPT_PREFIXES } from "../constants/system.js";
import { roughTokenCountEstimation } from "../services/tokenEstimation.js";
import { AGENT_TOOL_NAME } from "../tools/AgentTool/constants.js";
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from "../tools/ExitPlanModeTool/constants.js";
import { TASK_OUTPUT_TOOL_NAME } from "../tools/TaskOutputTool/constants.js";
import { isAgentSwarmsEnabled } from "./agentSwarmsEnabled.js";
import {
  modelSupportsStructuredOutputs,
  shouldUseGlobalCacheScope
} from "./betas.js";
import { getCwd } from "./cwd.js";
import { logForDebugging } from "./debug.js";
import { isEnvTruthy } from "./envUtils.js";
import { createUserMessage } from "./messages.js";
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl
} from "./model/providers.js";
import {
  getFileReadIgnorePatterns,
  normalizePatternsToPath
} from "./permissions/filesystem.js";
import {
  getPlan,
  getPlanFilePath,
  persistFileSnapshotIfRemote
} from "./plans.js";
import { getPlatform } from "./platform.js";
import { countFilesRoundedRg } from "./ripgrep.js";
import { jsonStringify } from "./slowOperations.js";
import { getToolSchemaCache } from "./toolSchemaCache.js";
import { windowsPathToPosixPath } from "./windowsPaths.js";
import { zodToJsonSchema } from "./zodToJsonSchema.js";
const SWARM_FIELDS_BY_TOOL = {
  [EXIT_PLAN_MODE_V2_TOOL_NAME]: ["launchSwarm", "teammateCount"],
  [AGENT_TOOL_NAME]: ["name", "team_name", "mode"]
};
function filterSwarmFieldsFromSchema(toolName, schema) {
  const fieldsToRemove = SWARM_FIELDS_BY_TOOL[toolName];
  if (!fieldsToRemove || fieldsToRemove.length === 0) {
    return schema;
  }
  const filtered = { ...schema };
  const props = filtered.properties;
  if (props && typeof props === "object") {
    const filteredProps = { ...props };
    for (const field of fieldsToRemove) {
      delete filteredProps[field];
    }
    filtered.properties = filteredProps;
  }
  return filtered;
}
async function toolToAPISchema(tool, options) {
  const cacheKey = "inputJSONSchema" in tool && tool.inputJSONSchema ? `${tool.name}:${jsonStringify(tool.inputJSONSchema)}` : tool.name;
  const cache = getToolSchemaCache();
  let base = cache.get(cacheKey);
  if (!base) {
    const strictToolsEnabled = checkStatsigFeatureGate_CACHED_MAY_BE_STALE("tengu_tool_pear");
    let input_schema = "inputJSONSchema" in tool && tool.inputJSONSchema ? tool.inputJSONSchema : zodToJsonSchema(tool.inputSchema);
    if (!isAgentSwarmsEnabled()) {
      input_schema = filterSwarmFieldsFromSchema(tool.name, input_schema);
    }
    base = {
      name: tool.name,
      description: await tool.prompt({
        getToolPermissionContext: options.getToolPermissionContext,
        tools: options.tools,
        agents: options.agents,
        allowedAgentTypes: options.allowedAgentTypes
      }),
      input_schema
    };
    if (strictToolsEnabled && tool.strict === true && options.model && modelSupportsStructuredOutputs(options.model)) {
      base.strict = true;
    }
    if (getAPIProvider() === "firstParty" && isFirstPartyAnthropicBaseUrl() && (getFeatureValue_CACHED_MAY_BE_STALE("tengu_fgts", false) || isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING))) {
      base.eager_input_streaming = true;
    }
    cache.set(cacheKey, base);
  }
  const schema = {
    name: base.name,
    description: base.description,
    input_schema: base.input_schema,
    ...base.strict && { strict: true },
    ...base.eager_input_streaming && { eager_input_streaming: true }
  };
  if (options.deferLoading) {
    schema.defer_loading = true;
  }
  if (options.cacheControl) {
    schema.cache_control = options.cacheControl;
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)) {
    const allowed = /* @__PURE__ */ new Set([
      "name",
      "description",
      "input_schema",
      "cache_control"
    ]);
    const stripped = Object.keys(schema).filter((k) => !allowed.has(k));
    if (stripped.length > 0) {
      logStripOnce(stripped);
      return {
        name: schema.name,
        description: schema.description,
        input_schema: schema.input_schema,
        ...schema.cache_control && { cache_control: schema.cache_control }
      };
    }
  }
  return schema;
}
let loggedStrip = false;
function logStripOnce(stripped) {
  if (loggedStrip) return;
  loggedStrip = true;
  logForDebugging(
    `[betas] Stripped from tool schemas: [${stripped.join(", ")}] (CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1)`
  );
}
function logAPIPrefix(systemPrompt) {
  const [firstSyspromptBlock] = splitSysPromptPrefix(systemPrompt);
  const firstSystemPrompt = firstSyspromptBlock?.text;
  logEvent("tengu_sysprompt_block", {
    snippet: firstSystemPrompt?.slice(
      0,
      20
    ),
    length: firstSystemPrompt?.length ?? 0,
    hash: firstSystemPrompt ? createHash("sha256").update(firstSystemPrompt).digest("hex") : ""
  });
}
function splitSysPromptPrefix(systemPrompt, options) {
  const useGlobalCacheFeature = shouldUseGlobalCacheScope();
  if (useGlobalCacheFeature && options?.skipGlobalCacheForSystemPrompt) {
    logEvent("tengu_sysprompt_using_tool_based_cache", {
      promptBlockCount: systemPrompt.length
    });
    let attributionHeader2;
    let systemPromptPrefix2;
    const rest2 = [];
    for (const prompt of systemPrompt) {
      if (!prompt) continue;
      if (prompt === SYSTEM_PROMPT_DYNAMIC_BOUNDARY) continue;
      if (prompt.startsWith("x-anthropic-billing-header")) {
        attributionHeader2 = prompt;
      } else if (CLI_SYSPROMPT_PREFIXES.has(prompt)) {
        systemPromptPrefix2 = prompt;
      } else {
        rest2.push(prompt);
      }
    }
    const result2 = [];
    if (attributionHeader2) {
      result2.push({ text: attributionHeader2, cacheScope: null });
    }
    if (systemPromptPrefix2) {
      result2.push({ text: systemPromptPrefix2, cacheScope: "org" });
    }
    const restJoined2 = rest2.join("\n\n");
    if (restJoined2) {
      result2.push({ text: restJoined2, cacheScope: "org" });
    }
    return result2;
  }
  if (useGlobalCacheFeature) {
    const boundaryIndex = systemPrompt.findIndex(
      (s) => s === SYSTEM_PROMPT_DYNAMIC_BOUNDARY
    );
    if (boundaryIndex !== -1) {
      let attributionHeader2;
      let systemPromptPrefix2;
      const staticBlocks = [];
      const dynamicBlocks = [];
      for (let i = 0; i < systemPrompt.length; i++) {
        const block = systemPrompt[i];
        if (!block || block === SYSTEM_PROMPT_DYNAMIC_BOUNDARY) continue;
        if (block.startsWith("x-anthropic-billing-header")) {
          attributionHeader2 = block;
        } else if (CLI_SYSPROMPT_PREFIXES.has(block)) {
          systemPromptPrefix2 = block;
        } else if (i < boundaryIndex) {
          staticBlocks.push(block);
        } else {
          dynamicBlocks.push(block);
        }
      }
      const result2 = [];
      if (attributionHeader2)
        result2.push({ text: attributionHeader2, cacheScope: null });
      if (systemPromptPrefix2)
        result2.push({ text: systemPromptPrefix2, cacheScope: null });
      const staticJoined = staticBlocks.join("\n\n");
      if (staticJoined)
        result2.push({ text: staticJoined, cacheScope: "global" });
      const dynamicJoined = dynamicBlocks.join("\n\n");
      if (dynamicJoined) result2.push({ text: dynamicJoined, cacheScope: null });
      logEvent("tengu_sysprompt_boundary_found", {
        blockCount: result2.length,
        staticBlockLength: staticJoined.length,
        dynamicBlockLength: dynamicJoined.length
      });
      return result2;
    } else {
      logEvent("tengu_sysprompt_missing_boundary_marker", {
        promptBlockCount: systemPrompt.length
      });
    }
  }
  let attributionHeader;
  let systemPromptPrefix;
  const rest = [];
  for (const block of systemPrompt) {
    if (!block) continue;
    if (block.startsWith("x-anthropic-billing-header")) {
      attributionHeader = block;
    } else if (CLI_SYSPROMPT_PREFIXES.has(block)) {
      systemPromptPrefix = block;
    } else {
      rest.push(block);
    }
  }
  const result = [];
  if (attributionHeader)
    result.push({ text: attributionHeader, cacheScope: null });
  if (systemPromptPrefix)
    result.push({ text: systemPromptPrefix, cacheScope: "org" });
  const restJoined = rest.join("\n\n");
  if (restJoined) result.push({ text: restJoined, cacheScope: "org" });
  return result;
}
function appendSystemContext(systemPrompt, context) {
  return [
    ...systemPrompt,
    Object.entries(context).map(([key, value]) => `${key}: ${value}`).join("\n")
  ].filter(Boolean);
}
function prependUserContext(messages, context) {
  if (process.env.NODE_ENV === "test") {
    return messages;
  }
  if (Object.entries(context).length === 0) {
    return messages;
  }
  return [
    createUserMessage({
      content: `<system-reminder>
As you answer the user's questions, you can use the following context:
${Object.entries(
        context
      ).map(([key, value]) => `# ${key}
${value}`).join("\n")}

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
</system-reminder>
`,
      isMeta: true
    }),
    ...messages
  ];
}
async function logContextMetrics(mcpConfigs, toolPermissionContext) {
  if (isAnalyticsDisabled()) {
    return;
  }
  const [{ tools: mcpTools }, tools, userContext, systemContext] = await Promise.all([
    prefetchAllMcpResources(mcpConfigs),
    getTools(toolPermissionContext),
    getUserContext(),
    getSystemContext()
  ]);
  const gitStatusSize = systemContext.gitStatus?.length ?? 0;
  const claudeMdSize = userContext.claudeMd?.length ?? 0;
  const totalContextSize = gitStatusSize + claudeMdSize;
  const currentDir = getCwd();
  const ignorePatternsByRoot = getFileReadIgnorePatterns(toolPermissionContext);
  const normalizedIgnorePatterns = normalizePatternsToPath(
    ignorePatternsByRoot,
    currentDir
  );
  const fileCount = await countFilesRoundedRg(
    currentDir,
    AbortSignal.timeout(1e3),
    normalizedIgnorePatterns
  );
  let mcpToolsCount = 0;
  let mcpServersCount = 0;
  let mcpToolsTokens = 0;
  let nonMcpToolsCount = 0;
  let nonMcpToolsTokens = 0;
  const nonMcpTools = tools.filter((tool) => !tool.isMcp);
  mcpToolsCount = mcpTools.length;
  nonMcpToolsCount = nonMcpTools.length;
  const serverNames = /* @__PURE__ */ new Set();
  for (const tool of mcpTools) {
    const parts = tool.name.split("__");
    if (parts.length >= 3 && parts[1]) {
      serverNames.add(parts[1]);
    }
  }
  mcpServersCount = serverNames.size;
  for (const tool of mcpTools) {
    const schema = "inputJSONSchema" in tool && tool.inputJSONSchema ? tool.inputJSONSchema : zodToJsonSchema(tool.inputSchema);
    mcpToolsTokens += roughTokenCountEstimation(jsonStringify(schema));
  }
  for (const tool of nonMcpTools) {
    const schema = "inputJSONSchema" in tool && tool.inputJSONSchema ? tool.inputJSONSchema : zodToJsonSchema(tool.inputSchema);
    nonMcpToolsTokens += roughTokenCountEstimation(jsonStringify(schema));
  }
  logEvent("tengu_context_size", {
    git_status_size: gitStatusSize,
    claude_md_size: claudeMdSize,
    total_context_size: totalContextSize,
    project_file_count_rounded: fileCount,
    mcp_tools_count: mcpToolsCount,
    mcp_servers_count: mcpServersCount,
    mcp_tools_tokens: mcpToolsTokens,
    non_mcp_tools_count: nonMcpToolsCount,
    non_mcp_tools_tokens: nonMcpToolsTokens
  });
}
function normalizeToolInput(tool, input, agentId) {
  switch (tool.name) {
    case EXIT_PLAN_MODE_V2_TOOL_NAME: {
      const plan = getPlan(agentId);
      const planFilePath = getPlanFilePath(agentId);
      void persistFileSnapshotIfRemote();
      return plan !== null ? { ...input, plan, planFilePath } : input;
    }
    case BashTool.name: {
      const parsed = BashTool.inputSchema.parse(input);
      const { command, timeout, description } = parsed;
      const cwd = getCwd();
      let normalizedCommand = command.replace(`cd ${cwd} && `, "");
      if (getPlatform() === "windows") {
        normalizedCommand = normalizedCommand.replace(
          `cd ${windowsPathToPosixPath(cwd)} && `,
          ""
        );
      }
      normalizedCommand = normalizedCommand.replace(/\\\\;/g, "\\;");
      if (/^echo\s+["']?[^|&;><]*["']?$/i.test(normalizedCommand.trim())) {
        logEvent("tengu_bash_tool_simple_echo", {});
      }
      const run_in_background = "run_in_background" in parsed ? parsed.run_in_background : void 0;
      return {
        command: normalizedCommand,
        description,
        ...timeout !== void 0 && { timeout },
        ...description !== void 0 && { description },
        ...run_in_background !== void 0 && { run_in_background },
        ..."dangerouslyDisableSandbox" in parsed && parsed.dangerouslyDisableSandbox !== void 0 && {
          dangerouslyDisableSandbox: parsed.dangerouslyDisableSandbox
        }
      };
    }
    case FileEditTool.name: {
      const parsedInput = FileEditTool.inputSchema.parse(input);
      const { file_path, edits } = normalizeFileEditInput({
        file_path: parsedInput.file_path,
        edits: [
          {
            old_string: parsedInput.old_string,
            new_string: parsedInput.new_string,
            replace_all: parsedInput.replace_all
          }
        ]
      });
      return {
        replace_all: edits[0].replace_all,
        file_path,
        old_string: edits[0].old_string,
        new_string: edits[0].new_string
      };
    }
    case FileWriteTool.name: {
      const parsedInput = FileWriteTool.inputSchema.parse(input);
      const isMarkdown = /\.(md|mdx)$/i.test(parsedInput.file_path);
      return {
        file_path: parsedInput.file_path,
        content: isMarkdown ? parsedInput.content : stripTrailingWhitespace(parsedInput.content)
      };
    }
    case TASK_OUTPUT_TOOL_NAME: {
      const legacyInput = input;
      const taskId = legacyInput.task_id ?? legacyInput.agentId ?? legacyInput.bash_id;
      const timeout = legacyInput.timeout ?? (typeof legacyInput.wait_up_to === "number" ? legacyInput.wait_up_to * 1e3 : void 0);
      return {
        task_id: taskId ?? "",
        block: legacyInput.block ?? true,
        timeout: timeout ?? 3e4
      };
    }
    default:
      return input;
  }
}
function normalizeToolInputForAPI(tool, input) {
  switch (tool.name) {
    case EXIT_PLAN_MODE_V2_TOOL_NAME: {
      if (input && typeof input === "object" && ("plan" in input || "planFilePath" in input)) {
        const { plan, planFilePath, ...rest } = input;
        return rest;
      }
      return input;
    }
    case FileEditTool.name: {
      if (input && typeof input === "object" && "edits" in input) {
        const { old_string, new_string, replace_all, ...rest } = input;
        return rest;
      }
      return input;
    }
    default:
      return input;
  }
}
export {
  appendSystemContext,
  logAPIPrefix,
  logContextMetrics,
  normalizeToolInput,
  normalizeToolInputForAPI,
  prependUserContext,
  splitSysPromptPrefix,
  toolToAPISchema
};
