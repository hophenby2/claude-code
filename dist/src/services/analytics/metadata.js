import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import { extname } from "path";
import memoize from "lodash-es/memoize.js";
import { env, getHostPlatformForAnalytics } from "../../utils/env.js";
import { envDynamic } from "../../utils/envDynamic.js";
import { getModelBetas } from "../../utils/betas.js";
import { getMainLoopModel } from "../../utils/model/model.js";
import {
  getSessionId,
  getIsInteractive,
  getClientType,
  getParentSessionId as getParentSessionIdFromState
} from "../../bootstrap/state.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { isOfficialMcpUrl } from "../mcp/officialRegistry.js";
import { isClaudeAISubscriber, getSubscriptionType } from "../../utils/auth.js";
import { getRepoRemoteHash } from "../../utils/git.js";
import {
  getWslVersion,
  getLinuxDistroInfo,
  detectVcs
} from "../../utils/platform.js";
import { getAgentContext } from "../../utils/agentContext.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import {
  getAgentId,
  getParentSessionId as getTeammateParentSessionId,
  getTeamName,
  isTeammate
} from "../../utils/teammate.js";
const feature = (_name) => false;
function sanitizeToolNameForAnalytics(toolName) {
  if (toolName.startsWith("mcp__")) {
    return "mcp_tool";
  }
  return toolName;
}
function isToolDetailsLoggingEnabled() {
  return isEnvTruthy(process.env.OTEL_LOG_TOOL_DETAILS);
}
function isAnalyticsToolDetailsLoggingEnabled(mcpServerType, mcpServerBaseUrl) {
  if (process.env.CLAUDE_CODE_ENTRYPOINT === "local-agent") {
    return true;
  }
  if (mcpServerType === "claudeai-proxy") {
    return true;
  }
  if (mcpServerBaseUrl && isOfficialMcpUrl(mcpServerBaseUrl)) {
    return true;
  }
  return false;
}
const BUILTIN_MCP_SERVER_NAMES = new Set(
  false ? [
    require2("../../utils/computerUse/common.js").COMPUTER_USE_MCP_SERVER_NAME
  ] : []
);
function mcpToolDetailsForAnalytics(toolName, mcpServerType, mcpServerBaseUrl) {
  const details = extractMcpToolDetails(toolName);
  if (!details) {
    return {};
  }
  if (!BUILTIN_MCP_SERVER_NAMES.has(details.serverName) && !isAnalyticsToolDetailsLoggingEnabled(mcpServerType, mcpServerBaseUrl)) {
    return {};
  }
  return {
    mcpServerName: details.serverName,
    mcpToolName: details.mcpToolName
  };
}
function extractMcpToolDetails(toolName) {
  if (!toolName.startsWith("mcp__")) {
    return void 0;
  }
  const parts = toolName.split("__");
  if (parts.length < 3) {
    return void 0;
  }
  const serverName = parts[1];
  const mcpToolName = parts.slice(2).join("__");
  if (!serverName || !mcpToolName) {
    return void 0;
  }
  return {
    serverName,
    mcpToolName
  };
}
function extractSkillName(toolName, input) {
  if (toolName !== "Skill") {
    return void 0;
  }
  if (typeof input === "object" && input !== null && "skill" in input && typeof input.skill === "string") {
    return input.skill;
  }
  return void 0;
}
const TOOL_INPUT_STRING_TRUNCATE_AT = 512;
const TOOL_INPUT_STRING_TRUNCATE_TO = 128;
const TOOL_INPUT_MAX_JSON_CHARS = 4 * 1024;
const TOOL_INPUT_MAX_COLLECTION_ITEMS = 20;
const TOOL_INPUT_MAX_DEPTH = 2;
function truncateToolInputValue(value, depth = 0) {
  if (typeof value === "string") {
    if (value.length > TOOL_INPUT_STRING_TRUNCATE_AT) {
      return `${value.slice(0, TOOL_INPUT_STRING_TRUNCATE_TO)}\u2026[${value.length} chars]`;
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === void 0) {
    return value;
  }
  if (depth >= TOOL_INPUT_MAX_DEPTH) {
    return "<nested>";
  }
  if (Array.isArray(value)) {
    const mapped = value.slice(0, TOOL_INPUT_MAX_COLLECTION_ITEMS).map((v) => truncateToolInputValue(v, depth + 1));
    if (value.length > TOOL_INPUT_MAX_COLLECTION_ITEMS) {
      mapped.push(`\u2026[${value.length} items]`);
    }
    return mapped;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([k]) => !k.startsWith("_"));
    const mapped = entries.slice(0, TOOL_INPUT_MAX_COLLECTION_ITEMS).map(([k, v]) => [k, truncateToolInputValue(v, depth + 1)]);
    if (entries.length > TOOL_INPUT_MAX_COLLECTION_ITEMS) {
      mapped.push(["\u2026", `${entries.length} keys`]);
    }
    return Object.fromEntries(mapped);
  }
  return String(value);
}
function extractToolInputForTelemetry(input) {
  if (!isToolDetailsLoggingEnabled()) {
    return void 0;
  }
  const truncated = truncateToolInputValue(input);
  let json = jsonStringify(truncated);
  if (json.length > TOOL_INPUT_MAX_JSON_CHARS) {
    json = json.slice(0, TOOL_INPUT_MAX_JSON_CHARS) + "\u2026[truncated]";
  }
  return json;
}
const MAX_FILE_EXTENSION_LENGTH = 10;
function getFileExtensionForAnalytics(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (!ext || ext === ".") {
    return void 0;
  }
  const extension = ext.slice(1);
  if (extension.length > MAX_FILE_EXTENSION_LENGTH) {
    return "other";
  }
  return extension;
}
const FILE_COMMANDS = /* @__PURE__ */ new Set([
  "rm",
  "mv",
  "cp",
  "touch",
  "mkdir",
  "chmod",
  "chown",
  "cat",
  "head",
  "tail",
  "sort",
  "stat",
  "diff",
  "wc",
  "grep",
  "rg",
  "sed"
]);
const COMPOUND_OPERATOR_REGEX = /\s*(?:&&|\|\||[;|])\s*/;
const WHITESPACE_REGEX = /\s+/;
function getFileExtensionsFromBashCommand(command, simulatedSedEditFilePath) {
  if (!command.includes(".") && !simulatedSedEditFilePath) return void 0;
  let result;
  const seen = /* @__PURE__ */ new Set();
  if (simulatedSedEditFilePath) {
    const ext = getFileExtensionForAnalytics(simulatedSedEditFilePath);
    if (ext) {
      seen.add(ext);
      result = ext;
    }
  }
  for (const subcmd of command.split(COMPOUND_OPERATOR_REGEX)) {
    if (!subcmd) continue;
    const tokens = subcmd.split(WHITESPACE_REGEX);
    if (tokens.length < 2) continue;
    const firstToken = tokens[0];
    const slashIdx = firstToken.lastIndexOf("/");
    const baseCmd = slashIdx >= 0 ? firstToken.slice(slashIdx + 1) : firstToken;
    if (!FILE_COMMANDS.has(baseCmd)) continue;
    for (let i = 1; i < tokens.length; i++) {
      const arg = tokens[i];
      if (arg.charCodeAt(0) === 45) continue;
      const ext = getFileExtensionForAnalytics(arg);
      if (ext && !seen.has(ext)) {
        seen.add(ext);
        result = result ? result + "," + ext : ext;
      }
    }
  }
  if (!result) return void 0;
  return result;
}
function getAgentIdentification() {
  const agentContext = getAgentContext();
  if (agentContext) {
    const result = {
      agentId: agentContext.agentId,
      parentSessionId: agentContext.parentSessionId,
      agentType: agentContext.agentType
    };
    if (agentContext.agentType === "teammate") {
      result.teamName = agentContext.teamName;
    }
    return result;
  }
  const agentId = getAgentId();
  const parentSessionId = getTeammateParentSessionId();
  const teamName = getTeamName();
  const isSwarmAgent = isTeammate();
  const agentType = isSwarmAgent ? "teammate" : agentId ? "standalone" : void 0;
  if (agentId || agentType || parentSessionId || teamName) {
    return {
      ...agentId ? { agentId } : {},
      ...agentType ? { agentType } : {},
      ...parentSessionId ? { parentSessionId } : {},
      ...teamName ? { teamName } : {}
    };
  }
  const stateParentSessionId = getParentSessionIdFromState();
  if (stateParentSessionId) {
    return { parentSessionId: stateParentSessionId };
  }
  return {};
}
const getVersionBase = memoize(() => {
  const match = "0.0.0".match(/^\d+\.\d+\.\d+(?:-[a-z]+)?/);
  return match ? match[0] : void 0;
});
const buildEnvContext = memoize(async () => {
  const [packageManagers, runtimes, linuxDistroInfo, vcs] = await Promise.all([
    env.getPackageManagers(),
    env.getRuntimes(),
    getLinuxDistroInfo(),
    detectVcs()
  ]);
  return {
    platform: getHostPlatformForAnalytics(),
    // Raw process.platform so freebsd/openbsd/aix/sunos are visible in BQ.
    // getHostPlatformForAnalytics() buckets those into 'linux'; here we want
    // the truth. CLAUDE_CODE_HOST_PLATFORM still overrides for container/remote.
    platformRaw: process.env.CLAUDE_CODE_HOST_PLATFORM || process.platform,
    arch: env.arch,
    nodeVersion: env.nodeVersion,
    terminal: envDynamic.terminal,
    packageManagers: packageManagers.join(","),
    runtimes: runtimes.join(","),
    isRunningWithBun: env.isRunningWithBun(),
    isCi: isEnvTruthy(process.env.CI),
    isClaubbit: isEnvTruthy(process.env.CLAUBBIT),
    isClaudeCodeRemote: isEnvTruthy(process.env.CLAUDE_CODE_REMOTE),
    isLocalAgentMode: process.env.CLAUDE_CODE_ENTRYPOINT === "local-agent",
    isConductor: env.isConductor(),
    ...process.env.CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE && {
      remoteEnvironmentType: process.env.CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE
    },
    // Gated by feature flag to prevent leaking "coworkerType" string in external builds
    ...false ? process.env.CLAUDE_CODE_COWORKER_TYPE ? { coworkerType: process.env.CLAUDE_CODE_COWORKER_TYPE } : {} : {},
    ...process.env.CLAUDE_CODE_CONTAINER_ID && {
      claudeCodeContainerId: process.env.CLAUDE_CODE_CONTAINER_ID
    },
    ...process.env.CLAUDE_CODE_REMOTE_SESSION_ID && {
      claudeCodeRemoteSessionId: process.env.CLAUDE_CODE_REMOTE_SESSION_ID
    },
    ...process.env.CLAUDE_CODE_TAGS && {
      tags: process.env.CLAUDE_CODE_TAGS
    },
    isGithubAction: isEnvTruthy(process.env.GITHUB_ACTIONS),
    isClaudeCodeAction: isEnvTruthy(process.env.CLAUDE_CODE_ACTION),
    isClaudeAiAuth: isClaudeAISubscriber(),
    version: "0.0.0",
    versionBase: getVersionBase(),
    buildTime: "dev",
    deploymentEnvironment: env.detectDeploymentEnvironment(),
    ...isEnvTruthy(process.env.GITHUB_ACTIONS) && {
      githubEventName: process.env.GITHUB_EVENT_NAME,
      githubActionsRunnerEnvironment: process.env.RUNNER_ENVIRONMENT,
      githubActionsRunnerOs: process.env.RUNNER_OS,
      githubActionRef: process.env.GITHUB_ACTION_PATH?.includes(
        "claude-code-action/"
      ) ? process.env.GITHUB_ACTION_PATH.split("claude-code-action/")[1] : void 0
    },
    ...getWslVersion() && { wslVersion: getWslVersion() },
    ...linuxDistroInfo ?? {},
    ...vcs.length > 0 ? { vcs: vcs.join(",") } : {}
  };
});
let prevCpuUsage = null;
let prevWallTimeMs = null;
function buildProcessMetrics() {
  try {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const now = Date.now();
    let cpuPercent;
    if (prevCpuUsage && prevWallTimeMs) {
      const wallDeltaMs = now - prevWallTimeMs;
      if (wallDeltaMs > 0) {
        const userDeltaUs = cpu.user - prevCpuUsage.user;
        const systemDeltaUs = cpu.system - prevCpuUsage.system;
        cpuPercent = (userDeltaUs + systemDeltaUs) / (wallDeltaMs * 1e3) * 100;
      }
    }
    prevCpuUsage = cpu;
    prevWallTimeMs = now;
    return {
      uptime: process.uptime(),
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      constrainedMemory: process.constrainedMemory(),
      cpuUsage: cpu,
      cpuPercent
    };
  } catch {
    return void 0;
  }
}
async function getEventMetadata(options = {}) {
  const model = options.model ? String(options.model) : getMainLoopModel();
  const betas = typeof options.betas === "string" ? options.betas : getModelBetas(model).join(",");
  const [envContext, repoRemoteHash] = await Promise.all([
    buildEnvContext(),
    getRepoRemoteHash()
  ]);
  const processMetrics = buildProcessMetrics();
  const metadata = {
    model,
    sessionId: getSessionId(),
    userType: process.env.USER_TYPE || "",
    ...betas.length > 0 ? { betas } : {},
    envContext,
    ...process.env.CLAUDE_CODE_ENTRYPOINT && {
      entrypoint: process.env.CLAUDE_CODE_ENTRYPOINT
    },
    ...process.env.CLAUDE_AGENT_SDK_VERSION && {
      agentSdkVersion: process.env.CLAUDE_AGENT_SDK_VERSION
    },
    isInteractive: String(getIsInteractive()),
    clientType: getClientType(),
    ...processMetrics && { processMetrics },
    sweBenchRunId: process.env.SWE_BENCH_RUN_ID || "",
    sweBenchInstanceId: process.env.SWE_BENCH_INSTANCE_ID || "",
    sweBenchTaskId: process.env.SWE_BENCH_TASK_ID || "",
    // Swarm/team agent identification
    // Priority: AsyncLocalStorage context (subagents) > env vars (swarm teammates)
    ...getAgentIdentification(),
    // Subscription tier for DAU-by-tier analytics
    ...getSubscriptionType() && {
      subscriptionType: getSubscriptionType()
    },
    // Assistant mode tag — lives outside memoized buildEnvContext() because
    // setKairosActive() runs at main.tsx:~1648, after the first event may
    // have already fired and memoized the env. Read fresh per-event instead.
    ...false ? { kairosActive: true } : {},
    // Repo remote hash for joining with server-side repo bundle data
    ...repoRemoteHash && { rh: repoRemoteHash }
  };
  return metadata;
}
function to1PEventFormat(metadata, userMetadata, additionalMetadata = {}) {
  const {
    envContext,
    processMetrics,
    rh,
    kairosActive,
    skillMode,
    observerMode,
    ...coreFields
  } = metadata;
  const env2 = {
    platform: envContext.platform,
    platform_raw: envContext.platformRaw,
    arch: envContext.arch,
    node_version: envContext.nodeVersion,
    terminal: envContext.terminal || "unknown",
    package_managers: envContext.packageManagers,
    runtimes: envContext.runtimes,
    is_running_with_bun: envContext.isRunningWithBun,
    is_ci: envContext.isCi,
    is_claubbit: envContext.isClaubbit,
    is_claude_code_remote: envContext.isClaudeCodeRemote,
    is_local_agent_mode: envContext.isLocalAgentMode,
    is_conductor: envContext.isConductor,
    is_github_action: envContext.isGithubAction,
    is_claude_code_action: envContext.isClaudeCodeAction,
    is_claude_ai_auth: envContext.isClaudeAiAuth,
    version: envContext.version,
    build_time: envContext.buildTime,
    deployment_environment: envContext.deploymentEnvironment
  };
  if (envContext.remoteEnvironmentType) {
    env2.remote_environment_type = envContext.remoteEnvironmentType;
  }
  if (false) {
    env2.coworker_type = envContext.coworkerType;
  }
  if (envContext.claudeCodeContainerId) {
    env2.claude_code_container_id = envContext.claudeCodeContainerId;
  }
  if (envContext.claudeCodeRemoteSessionId) {
    env2.claude_code_remote_session_id = envContext.claudeCodeRemoteSessionId;
  }
  if (envContext.tags) {
    env2.tags = envContext.tags.split(",").map((t) => t.trim()).filter(Boolean);
  }
  if (envContext.githubEventName) {
    env2.github_event_name = envContext.githubEventName;
  }
  if (envContext.githubActionsRunnerEnvironment) {
    env2.github_actions_runner_environment = envContext.githubActionsRunnerEnvironment;
  }
  if (envContext.githubActionsRunnerOs) {
    env2.github_actions_runner_os = envContext.githubActionsRunnerOs;
  }
  if (envContext.githubActionRef) {
    env2.github_action_ref = envContext.githubActionRef;
  }
  if (envContext.wslVersion) {
    env2.wsl_version = envContext.wslVersion;
  }
  if (envContext.linuxDistroId) {
    env2.linux_distro_id = envContext.linuxDistroId;
  }
  if (envContext.linuxDistroVersion) {
    env2.linux_distro_version = envContext.linuxDistroVersion;
  }
  if (envContext.linuxKernel) {
    env2.linux_kernel = envContext.linuxKernel;
  }
  if (envContext.vcs) {
    env2.vcs = envContext.vcs;
  }
  if (envContext.versionBase) {
    env2.version_base = envContext.versionBase;
  }
  const core = {
    session_id: coreFields.sessionId,
    model: coreFields.model,
    user_type: coreFields.userType,
    is_interactive: coreFields.isInteractive === "true",
    client_type: coreFields.clientType
  };
  if (coreFields.betas) {
    core.betas = coreFields.betas;
  }
  if (coreFields.entrypoint) {
    core.entrypoint = coreFields.entrypoint;
  }
  if (coreFields.agentSdkVersion) {
    core.agent_sdk_version = coreFields.agentSdkVersion;
  }
  if (coreFields.sweBenchRunId) {
    core.swe_bench_run_id = coreFields.sweBenchRunId;
  }
  if (coreFields.sweBenchInstanceId) {
    core.swe_bench_instance_id = coreFields.sweBenchInstanceId;
  }
  if (coreFields.sweBenchTaskId) {
    core.swe_bench_task_id = coreFields.sweBenchTaskId;
  }
  if (coreFields.agentId) {
    core.agent_id = coreFields.agentId;
  }
  if (coreFields.parentSessionId) {
    core.parent_session_id = coreFields.parentSessionId;
  }
  if (coreFields.agentType) {
    core.agent_type = coreFields.agentType;
  }
  if (coreFields.teamName) {
    core.team_name = coreFields.teamName;
  }
  if (userMetadata.githubActionsMetadata) {
    const ghMeta = userMetadata.githubActionsMetadata;
    env2.github_actions_metadata = {
      actor_id: ghMeta.actorId,
      repository_id: ghMeta.repositoryId,
      repository_owner_id: ghMeta.repositoryOwnerId
    };
  }
  let auth;
  if (userMetadata.accountUuid || userMetadata.organizationUuid) {
    auth = {
      account_uuid: userMetadata.accountUuid,
      organization_uuid: userMetadata.organizationUuid
    };
  }
  return {
    env: env2,
    ...processMetrics && {
      process: Buffer.from(jsonStringify(processMetrics)).toString("base64")
    },
    ...auth && { auth },
    core,
    additional: {
      ...rh && { rh },
      ...kairosActive && { is_assistant_mode: true },
      ...skillMode && { skill_mode: skillMode },
      ...observerMode && { observer_mode: observerMode },
      ...additionalMetadata
    }
  };
}
export {
  extractMcpToolDetails,
  extractSkillName,
  extractToolInputForTelemetry,
  getEventMetadata,
  getFileExtensionForAnalytics,
  getFileExtensionsFromBashCommand,
  isAnalyticsToolDetailsLoggingEnabled,
  isToolDetailsLoggingEnabled,
  mcpToolDetailsForAnalytics,
  sanitizeToolNameForAnalytics,
  to1PEventFormat
};
