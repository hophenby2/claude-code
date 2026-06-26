import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import addDir from "./commands/add-dir/index.js";
import autofixPr from "./commands/autofix-pr/index.js";
import backfillSessions from "./commands/backfill-sessions/index.js";
import btw from "./commands/btw/index.js";
import goodClaude from "./commands/good-claude/index.js";
import issue from "./commands/issue/index.js";
import feedback from "./commands/feedback/index.js";
import clear from "./commands/clear/index.js";
import color from "./commands/color/index.js";
import commit from "./commands/commit.js";
import copy from "./commands/copy/index.js";
import desktop from "./commands/desktop/index.js";
import commitPushPr from "./commands/commit-push-pr.js";
import compact from "./commands/compact/index.js";
import config from "./commands/config/index.js";
import { context, contextNonInteractive } from "./commands/context/index.js";
import cost from "./commands/cost/index.js";
import diff from "./commands/diff/index.js";
import ctx_viz from "./commands/ctx_viz/index.js";
import doctor from "./commands/doctor/index.js";
import memory from "./commands/memory/index.js";
import help from "./commands/help/index.js";
import ide from "./commands/ide/index.js";
import init from "./commands/init.js";
import initVerifiers from "./commands/init-verifiers.js";
import keybindings from "./commands/keybindings/index.js";
import login from "./commands/login/index.js";
import logout from "./commands/logout/index.js";
import installGitHubApp from "./commands/install-github-app/index.js";
import installSlackApp from "./commands/install-slack-app/index.js";
import breakCache from "./commands/break-cache/index.js";
import mcp from "./commands/mcp/index.js";
import mobile from "./commands/mobile/index.js";
import onboarding from "./commands/onboarding/index.js";
import pr_comments from "./commands/pr_comments/index.js";
import releaseNotes from "./commands/release-notes/index.js";
import rename from "./commands/rename/index.js";
import resume from "./commands/resume/index.js";
import review, { ultrareview } from "./commands/review.js";
import session from "./commands/session/index.js";
import share from "./commands/share/index.js";
import skills from "./commands/skills/index.js";
import status from "./commands/status/index.js";
import tasks from "./commands/tasks/index.js";
import teleport from "./commands/teleport/index.js";
const agentsPlatform = process.env.USER_TYPE === "ant" ? require2("./commands/agents-platform/index.js").default : null;
import securityReview from "./commands/security-review.js";
import bughunter from "./commands/bughunter/index.js";
import terminalSetup from "./commands/terminalSetup/index.js";
import usage from "./commands/usage/index.js";
import theme from "./commands/theme/index.js";
import vim from "./commands/vim/index.js";
const feature = (_name) => false;
const proactive = false ? require2("./commands/proactive.js").default : null;
const briefCommand = false ? require2("./commands/brief.js").default : null;
const assistantCommand = false ? require2("./commands/assistant/index.js").default : null;
const bridge = false ? require2("./commands/bridge/index.js").default : null;
const remoteControlServerCommand = false ? require2("./commands/remoteControlServer/index.js").default : null;
const voiceCommand = false ? require2("./commands/voice/index.js").default : null;
const forceSnip = false ? require2("./commands/force-snip.js").default : null;
const workflowsCmd = false ? require2("./commands/workflows/index.js").default : null;
const webCmd = false ? require2("./commands/remote-setup/index.js").default : null;
const clearSkillIndexCache = false ? require2("./services/skillSearch/localSearch.js").clearSkillIndexCache : null;
const subscribePr = false ? require2("./commands/subscribe-pr.js").default : null;
const ultraplan = false ? require2("./commands/ultraplan.js").default : null;
const torch = false ? require2("./commands/torch.js").default : null;
const peersCmd = false ? require2("./commands/peers/index.js").default : null;
const forkCmd = false ? require2("./commands/fork/index.js").default : null;
const buddy = false ? require2("./commands/buddy/index.js").default : null;
import thinkback from "./commands/thinkback/index.js";
import thinkbackPlay from "./commands/thinkback-play/index.js";
import permissions from "./commands/permissions/index.js";
import plan from "./commands/plan/index.js";
import fast from "./commands/fast/index.js";
import passes from "./commands/passes/index.js";
import privacySettings from "./commands/privacy-settings/index.js";
import hooks from "./commands/hooks/index.js";
import files from "./commands/files/index.js";
import branch from "./commands/branch/index.js";
import agents from "./commands/agents/index.js";
import plugin from "./commands/plugin/index.js";
import reloadPlugins from "./commands/reload-plugins/index.js";
import rewind from "./commands/rewind/index.js";
import heapDump from "./commands/heapdump/index.js";
import mockLimits from "./commands/mock-limits/index.js";
import bridgeKick from "./commands/bridge-kick.js";
import version from "./commands/version.js";
import summary from "./commands/summary/index.js";
import {
  resetLimits,
  resetLimitsNonInteractive
} from "./commands/reset-limits/index.js";
import antTrace from "./commands/ant-trace/index.js";
import perfIssue from "./commands/perf-issue/index.js";
import sandboxToggle from "./commands/sandbox-toggle/index.js";
import chrome from "./commands/chrome/index.js";
import stickers from "./commands/stickers/index.js";
import advisor from "./commands/advisor.js";
import { logError } from "./utils/log.js";
import { toError } from "./utils/errors.js";
import { logForDebugging } from "./utils/debug.js";
import {
  getSkillDirCommands,
  clearSkillCaches,
  getDynamicSkills
} from "./skills/loadSkillsDir.js";
import { getBundledSkills } from "./skills/bundledSkills.js";
import { getBuiltinPluginSkillCommands } from "./plugins/builtinPlugins.js";
import {
  getPluginCommands,
  clearPluginCommandCache,
  getPluginSkills,
  clearPluginSkillsCache
} from "./utils/plugins/loadPluginCommands.js";
import memoize from "lodash-es/memoize.js";
import { isUsing3PServices, isClaudeAISubscriber } from "./utils/auth.js";
import { isFirstPartyAnthropicBaseUrl } from "./utils/model/providers.js";
import env from "./commands/env/index.js";
import exit from "./commands/exit/index.js";
import exportCommand from "./commands/export/index.js";
import model from "./commands/model/index.js";
import tag from "./commands/tag/index.js";
import outputStyle from "./commands/output-style/index.js";
import remoteEnv from "./commands/remote-env/index.js";
import upgrade from "./commands/upgrade/index.js";
import {
  extraUsage,
  extraUsageNonInteractive
} from "./commands/extra-usage/index.js";
import rateLimitOptions from "./commands/rate-limit-options/index.js";
import statusline from "./commands/statusline.js";
import effort from "./commands/effort/index.js";
import stats from "./commands/stats/index.js";
const usageReport = {
  type: "prompt",
  name: "insights",
  description: "Generate a report analyzing your Claude Code sessions",
  contentLength: 0,
  progressMessage: "analyzing your sessions",
  source: "builtin",
  async getPromptForCommand(args, context2) {
    const real = (await import("./commands/insights.js")).default;
    if (real.type !== "prompt") throw new Error("unreachable");
    return real.getPromptForCommand(args, context2);
  }
};
import oauthRefresh from "./commands/oauth-refresh/index.js";
import debugToolCall from "./commands/debug-tool-call/index.js";
import { getSettingSourceName } from "./utils/settings/constants.js";
import {
  getCommandName,
  isCommandEnabled
} from "./types/command.js";
import { getCommandName as getCommandName2, isCommandEnabled as isCommandEnabled2 } from "./types/command.js";
const INTERNAL_ONLY_COMMANDS = [
  backfillSessions,
  breakCache,
  bughunter,
  commit,
  commitPushPr,
  ctx_viz,
  goodClaude,
  issue,
  initVerifiers,
  ...forceSnip ? [forceSnip] : [],
  mockLimits,
  bridgeKick,
  version,
  ...ultraplan ? [ultraplan] : [],
  ...subscribePr ? [subscribePr] : [],
  resetLimits,
  resetLimitsNonInteractive,
  onboarding,
  share,
  summary,
  teleport,
  antTrace,
  perfIssue,
  env,
  oauthRefresh,
  debugToolCall,
  agentsPlatform,
  autofixPr
].filter(Boolean);
const COMMANDS = memoize(() => [
  addDir,
  advisor,
  agents,
  branch,
  btw,
  chrome,
  clear,
  color,
  compact,
  config,
  copy,
  desktop,
  context,
  contextNonInteractive,
  cost,
  diff,
  doctor,
  effort,
  exit,
  fast,
  files,
  heapDump,
  help,
  ide,
  init,
  keybindings,
  installGitHubApp,
  installSlackApp,
  mcp,
  memory,
  mobile,
  model,
  outputStyle,
  remoteEnv,
  plugin,
  pr_comments,
  releaseNotes,
  reloadPlugins,
  rename,
  resume,
  session,
  skills,
  stats,
  status,
  statusline,
  stickers,
  tag,
  theme,
  feedback,
  review,
  ultrareview,
  rewind,
  securityReview,
  terminalSetup,
  upgrade,
  extraUsage,
  extraUsageNonInteractive,
  rateLimitOptions,
  usage,
  usageReport,
  vim,
  ...webCmd ? [webCmd] : [],
  ...forkCmd ? [forkCmd] : [],
  ...buddy ? [buddy] : [],
  ...proactive ? [proactive] : [],
  ...briefCommand ? [briefCommand] : [],
  ...assistantCommand ? [assistantCommand] : [],
  ...bridge ? [bridge] : [],
  ...remoteControlServerCommand ? [remoteControlServerCommand] : [],
  ...voiceCommand ? [voiceCommand] : [],
  thinkback,
  thinkbackPlay,
  permissions,
  plan,
  privacySettings,
  hooks,
  exportCommand,
  sandboxToggle,
  ...!isUsing3PServices() ? [logout, login()] : [],
  passes,
  ...peersCmd ? [peersCmd] : [],
  tasks,
  ...workflowsCmd ? [workflowsCmd] : [],
  ...torch ? [torch] : [],
  ...process.env.USER_TYPE === "ant" && !process.env.IS_DEMO ? INTERNAL_ONLY_COMMANDS : []
]);
const builtInCommandNames = memoize(
  () => new Set(COMMANDS().flatMap((_) => [_.name, ..._.aliases ?? []]))
);
async function getSkills(cwd) {
  try {
    const [skillDirCommands, pluginSkills] = await Promise.all([
      getSkillDirCommands(cwd).catch((err) => {
        logError(toError(err));
        logForDebugging(
          "Skill directory commands failed to load, continuing without them"
        );
        return [];
      }),
      getPluginSkills().catch((err) => {
        logError(toError(err));
        logForDebugging("Plugin skills failed to load, continuing without them");
        return [];
      })
    ]);
    const bundledSkills = getBundledSkills();
    const builtinPluginSkills = getBuiltinPluginSkillCommands();
    logForDebugging(
      `getSkills returning: ${skillDirCommands.length} skill dir commands, ${pluginSkills.length} plugin skills, ${bundledSkills.length} bundled skills, ${builtinPluginSkills.length} builtin plugin skills`
    );
    return {
      skillDirCommands,
      pluginSkills,
      bundledSkills,
      builtinPluginSkills
    };
  } catch (err) {
    logError(toError(err));
    logForDebugging("Unexpected error in getSkills, returning empty");
    return {
      skillDirCommands: [],
      pluginSkills: [],
      bundledSkills: [],
      builtinPluginSkills: []
    };
  }
}
const getWorkflowCommands = false ? require2("./tools/WorkflowTool/createWorkflowCommand.js").getWorkflowCommands : null;
function meetsAvailabilityRequirement(cmd) {
  if (!cmd.availability) return true;
  for (const a of cmd.availability) {
    switch (a) {
      case "claude-ai":
        if (isClaudeAISubscriber()) return true;
        break;
      case "console":
        if (!isClaudeAISubscriber() && !isUsing3PServices() && isFirstPartyAnthropicBaseUrl())
          return true;
        break;
      default: {
        const _exhaustive = a;
        void _exhaustive;
        break;
      }
    }
  }
  return false;
}
const loadAllCommands = memoize(async (cwd) => {
  const [
    { skillDirCommands, pluginSkills, bundledSkills, builtinPluginSkills },
    pluginCommands,
    workflowCommands
  ] = await Promise.all([
    getSkills(cwd),
    getPluginCommands(),
    getWorkflowCommands ? getWorkflowCommands(cwd) : Promise.resolve([])
  ]);
  return [
    ...bundledSkills,
    ...builtinPluginSkills,
    ...skillDirCommands,
    ...workflowCommands,
    ...pluginCommands,
    ...pluginSkills,
    ...COMMANDS()
  ];
});
async function getCommands(cwd) {
  const allCommands = await loadAllCommands(cwd);
  const dynamicSkills = getDynamicSkills();
  const baseCommands = allCommands.filter(
    (_) => meetsAvailabilityRequirement(_) && isCommandEnabled(_)
  );
  if (dynamicSkills.length === 0) {
    return baseCommands;
  }
  const baseCommandNames = new Set(baseCommands.map((c) => c.name));
  const uniqueDynamicSkills = dynamicSkills.filter(
    (s) => !baseCommandNames.has(s.name) && meetsAvailabilityRequirement(s) && isCommandEnabled(s)
  );
  if (uniqueDynamicSkills.length === 0) {
    return baseCommands;
  }
  const builtInNames = new Set(COMMANDS().map((c) => c.name));
  const insertIndex = baseCommands.findIndex((c) => builtInNames.has(c.name));
  if (insertIndex === -1) {
    return [...baseCommands, ...uniqueDynamicSkills];
  }
  return [
    ...baseCommands.slice(0, insertIndex),
    ...uniqueDynamicSkills,
    ...baseCommands.slice(insertIndex)
  ];
}
function clearCommandMemoizationCaches() {
  loadAllCommands.cache?.clear?.();
  getSkillToolCommands.cache?.clear?.();
  getSlashCommandToolSkills.cache?.clear?.();
  clearSkillIndexCache?.();
}
function clearCommandsCache() {
  clearCommandMemoizationCaches();
  clearPluginCommandCache();
  clearPluginSkillsCache();
  clearSkillCaches();
}
function getMcpSkillCommands(mcpCommands) {
  if (false) {
    return mcpCommands.filter(
      (cmd) => cmd.type === "prompt" && cmd.loadedFrom === "mcp" && !cmd.disableModelInvocation
    );
  }
  return [];
}
const getSkillToolCommands = memoize(
  async (cwd) => {
    const allCommands = await getCommands(cwd);
    return allCommands.filter(
      (cmd) => cmd.type === "prompt" && !cmd.disableModelInvocation && cmd.source !== "builtin" && // Always include skills from /skills/ dirs, bundled skills, and legacy /commands/ entries
      // (they all get an auto-derived description from the first line if frontmatter is missing).
      // Plugin/MCP commands still require an explicit description to appear in the listing.
      (cmd.loadedFrom === "bundled" || cmd.loadedFrom === "skills" || cmd.loadedFrom === "commands_DEPRECATED" || cmd.hasUserSpecifiedDescription || cmd.whenToUse)
    );
  }
);
const getSlashCommandToolSkills = memoize(
  async (cwd) => {
    try {
      const allCommands = await getCommands(cwd);
      return allCommands.filter(
        (cmd) => cmd.type === "prompt" && cmd.source !== "builtin" && (cmd.hasUserSpecifiedDescription || cmd.whenToUse) && (cmd.loadedFrom === "skills" || cmd.loadedFrom === "plugin" || cmd.loadedFrom === "bundled" || cmd.disableModelInvocation)
      );
    } catch (error) {
      logError(toError(error));
      logForDebugging("Returning empty skills array due to load failure");
      return [];
    }
  }
);
const REMOTE_SAFE_COMMANDS = /* @__PURE__ */ new Set([
  session,
  // Shows QR code / URL for remote session
  exit,
  // Exit the TUI
  clear,
  // Clear screen
  help,
  // Show help
  theme,
  // Change terminal theme
  color,
  // Change agent color
  vim,
  // Toggle vim mode
  cost,
  // Show session cost (local cost tracking)
  usage,
  // Show usage info
  copy,
  // Copy last message
  btw,
  // Quick note
  feedback,
  // Send feedback
  plan,
  // Plan mode toggle
  keybindings,
  // Keybinding management
  statusline,
  // Status line toggle
  stickers,
  // Stickers
  mobile
  // Mobile QR code
]);
const BRIDGE_SAFE_COMMANDS = new Set(
  [
    compact,
    // Shrink context — useful mid-session from a phone
    clear,
    // Wipe transcript
    cost,
    // Show session cost
    summary,
    // Summarize conversation
    releaseNotes,
    // Show changelog
    files
    // List tracked files
  ].filter((c) => c !== null)
);
function isBridgeSafeCommand(cmd) {
  if (cmd.type === "local-jsx") return false;
  if (cmd.type === "prompt") return true;
  return BRIDGE_SAFE_COMMANDS.has(cmd);
}
function filterCommandsForRemoteMode(commands) {
  return commands.filter((cmd) => REMOTE_SAFE_COMMANDS.has(cmd));
}
function findCommand(commandName, commands) {
  return commands.find(
    (_) => _.name === commandName || getCommandName(_) === commandName || _.aliases?.includes(commandName)
  );
}
function hasCommand(commandName, commands) {
  return findCommand(commandName, commands) !== void 0;
}
function getCommand(commandName, commands) {
  const command = findCommand(commandName, commands);
  if (!command) {
    throw ReferenceError(
      `Command ${commandName} not found. Available commands: ${commands.map((_) => {
        const name = getCommandName(_);
        return _.aliases ? `${name} (aliases: ${_.aliases.join(", ")})` : name;
      }).sort((a, b) => a.localeCompare(b)).join(", ")}`
    );
  }
  return command;
}
function formatDescriptionWithSource(cmd) {
  if (cmd.type !== "prompt") {
    return cmd.description;
  }
  if (cmd.kind === "workflow") {
    return `${cmd.description} (workflow)`;
  }
  if (cmd.source === "plugin") {
    const pluginName = cmd.pluginInfo?.pluginManifest.name;
    if (pluginName) {
      return `(${pluginName}) ${cmd.description}`;
    }
    return `${cmd.description} (plugin)`;
  }
  if (cmd.source === "builtin" || cmd.source === "mcp") {
    return cmd.description;
  }
  if (cmd.source === "bundled") {
    return `${cmd.description} (bundled)`;
  }
  return `${cmd.description} (${getSettingSourceName(cmd.source)})`;
}
export {
  BRIDGE_SAFE_COMMANDS,
  INTERNAL_ONLY_COMMANDS,
  REMOTE_SAFE_COMMANDS,
  builtInCommandNames,
  clearCommandMemoizationCaches,
  clearCommandsCache,
  filterCommandsForRemoteMode,
  findCommand,
  formatDescriptionWithSource,
  getCommand,
  getCommandName2 as getCommandName,
  getCommands,
  getMcpSkillCommands,
  getSkillToolCommands,
  getSlashCommandToolSkills,
  hasCommand,
  isBridgeSafeCommand,
  isCommandEnabled2 as isCommandEnabled,
  meetsAvailabilityRequirement
};
