import { toolMatchesName } from "./Tool.js";
import { AgentTool } from "./tools/AgentTool/AgentTool.js";
import { SkillTool } from "./tools/SkillTool/SkillTool.js";
import { BashTool } from "./tools/BashTool/BashTool.js";
import { FileEditTool } from "./tools/FileEditTool/FileEditTool.js";
import { FileReadTool } from "./tools/FileReadTool/FileReadTool.js";
import { FileWriteTool } from "./tools/FileWriteTool/FileWriteTool.js";
import { GlobTool } from "./tools/GlobTool/GlobTool.js";
import { NotebookEditTool } from "./tools/NotebookEditTool/NotebookEditTool.js";
import { WebFetchTool } from "./tools/WebFetchTool/WebFetchTool.js";
import { TaskStopTool } from "./tools/TaskStopTool/TaskStopTool.js";
import { BriefTool } from "./tools/BriefTool/BriefTool.js";
const REPLTool = process.env.USER_TYPE === "ant" ? require("./tools/REPLTool/REPLTool.js").REPLTool : null;
const SuggestBackgroundPRTool = process.env.USER_TYPE === "ant" ? require("./tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.js").SuggestBackgroundPRTool : null;
const SleepTool = false ? null.SleepTool : null;
const cronTools = false ? [
  null.CronCreateTool,
  null.CronDeleteTool,
  null.CronListTool
] : [];
const RemoteTriggerTool = false ? null.RemoteTriggerTool : null;
const MonitorTool = false ? null.MonitorTool : null;
const SendUserFileTool = false ? null.SendUserFileTool : null;
const PushNotificationTool = false ? null.PushNotificationTool : null;
const SubscribePRTool = false ? null.SubscribePRTool : null;
import { TaskOutputTool } from "./tools/TaskOutputTool/TaskOutputTool.js";
import { WebSearchTool } from "./tools/WebSearchTool/WebSearchTool.js";
import { TodoWriteTool } from "./tools/TodoWriteTool/TodoWriteTool.js";
import { ExitPlanModeV2Tool } from "./tools/ExitPlanModeTool/ExitPlanModeV2Tool.js";
import { TestingPermissionTool } from "./tools/testing/TestingPermissionTool.js";
import { GrepTool } from "./tools/GrepTool/GrepTool.js";
import { TungstenTool } from "./tools/TungstenTool/TungstenTool.js";
const getTeamCreateTool = () => require("./tools/TeamCreateTool/TeamCreateTool.js").TeamCreateTool;
const getTeamDeleteTool = () => require("./tools/TeamDeleteTool/TeamDeleteTool.js").TeamDeleteTool;
const getSendMessageTool = () => require("./tools/SendMessageTool/SendMessageTool.js").SendMessageTool;
import { AskUserQuestionTool } from "./tools/AskUserQuestionTool/AskUserQuestionTool.js";
import { LSPTool } from "./tools/LSPTool/LSPTool.js";
import { ListMcpResourcesTool } from "./tools/ListMcpResourcesTool/ListMcpResourcesTool.js";
import { ReadMcpResourceTool } from "./tools/ReadMcpResourceTool/ReadMcpResourceTool.js";
import { ToolSearchTool } from "./tools/ToolSearchTool/ToolSearchTool.js";
import { EnterPlanModeTool } from "./tools/EnterPlanModeTool/EnterPlanModeTool.js";
import { EnterWorktreeTool } from "./tools/EnterWorktreeTool/EnterWorktreeTool.js";
import { ExitWorktreeTool } from "./tools/ExitWorktreeTool/ExitWorktreeTool.js";
import { ConfigTool } from "./tools/ConfigTool/ConfigTool.js";
import { TaskCreateTool } from "./tools/TaskCreateTool/TaskCreateTool.js";
import { TaskGetTool } from "./tools/TaskGetTool/TaskGetTool.js";
import { TaskUpdateTool } from "./tools/TaskUpdateTool/TaskUpdateTool.js";
import { TaskListTool } from "./tools/TaskListTool/TaskListTool.js";
import uniqBy from "lodash-es/uniqBy.js";
import { isToolSearchEnabledOptimistic } from "./utils/toolSearch.js";
import { isTodoV2Enabled } from "./utils/tasks.js";
const VerifyPlanExecutionTool = process.env.CLAUDE_CODE_VERIFY_PLAN === "true" ? require("./tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js").VerifyPlanExecutionTool : null;
import { SYNTHETIC_OUTPUT_TOOL_NAME } from "./tools/SyntheticOutputTool/SyntheticOutputTool.js";
import {
  ALL_AGENT_DISALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  COORDINATOR_MODE_ALLOWED_TOOLS
} from "./constants/tools.js";
const feature = (_name) => false;
const OverflowTestTool = false ? null.OverflowTestTool : null;
const CtxInspectTool = false ? null.CtxInspectTool : null;
const TerminalCaptureTool = false ? null.TerminalCaptureTool : null;
const WebBrowserTool = false ? null.WebBrowserTool : null;
const coordinatorModeModule = false ? null : null;
const SnipTool = false ? null.SnipTool : null;
const ListPeersTool = false ? null.ListPeersTool : null;
const WorkflowTool = false ? (() => {
  null.initBundledWorkflows();
  return null.WorkflowTool;
})() : null;
import { getDenyRuleForTool } from "./utils/permissions/permissions.js";
import { hasEmbeddedSearchTools } from "./utils/embeddedTools.js";
import { isEnvTruthy } from "./utils/envUtils.js";
import { isPowerShellToolEnabled } from "./utils/shell/shellToolUtils.js";
import { isAgentSwarmsEnabled } from "./utils/agentSwarmsEnabled.js";
import { isWorktreeModeEnabled } from "./utils/worktreeModeEnabled.js";
import {
  REPL_TOOL_NAME,
  REPL_ONLY_TOOLS,
  isReplModeEnabled
} from "./tools/REPLTool/constants.js";
const getPowerShellTool = () => {
  if (!isPowerShellToolEnabled()) return null;
  return require("./tools/PowerShellTool/PowerShellTool.js").PowerShellTool;
};
const TOOL_PRESETS = ["default"];
function parseToolPreset(preset) {
  const presetString = preset.toLowerCase();
  if (!TOOL_PRESETS.includes(presetString)) {
    return null;
  }
  return presetString;
}
function getToolsForDefaultPreset() {
  const tools = getAllBaseTools();
  const isEnabled = tools.map((tool) => tool.isEnabled());
  return tools.filter((_, i) => isEnabled[i]).map((tool) => tool.name);
}
function getAllBaseTools() {
  return [
    AgentTool,
    TaskOutputTool,
    BashTool,
    // Ant-native builds have bfs/ugrep embedded in the bun binary (same ARGV0
    // trick as ripgrep). When available, find/grep in Claude's shell are aliased
    // to these fast tools, so the dedicated Glob/Grep tools are unnecessary.
    ...hasEmbeddedSearchTools() ? [] : [GlobTool, GrepTool],
    ExitPlanModeV2Tool,
    FileReadTool,
    FileEditTool,
    FileWriteTool,
    NotebookEditTool,
    WebFetchTool,
    TodoWriteTool,
    WebSearchTool,
    TaskStopTool,
    AskUserQuestionTool,
    SkillTool,
    EnterPlanModeTool,
    ...process.env.USER_TYPE === "ant" ? [ConfigTool] : [],
    ...process.env.USER_TYPE === "ant" ? [TungstenTool] : [],
    ...SuggestBackgroundPRTool ? [SuggestBackgroundPRTool] : [],
    ...WebBrowserTool ? [WebBrowserTool] : [],
    ...isTodoV2Enabled() ? [TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool] : [],
    ...OverflowTestTool ? [OverflowTestTool] : [],
    ...CtxInspectTool ? [CtxInspectTool] : [],
    ...TerminalCaptureTool ? [TerminalCaptureTool] : [],
    ...isEnvTruthy(process.env.ENABLE_LSP_TOOL) ? [LSPTool] : [],
    ...isWorktreeModeEnabled() ? [EnterWorktreeTool, ExitWorktreeTool] : [],
    getSendMessageTool(),
    ...ListPeersTool ? [ListPeersTool] : [],
    ...isAgentSwarmsEnabled() ? [getTeamCreateTool(), getTeamDeleteTool()] : [],
    ...VerifyPlanExecutionTool ? [VerifyPlanExecutionTool] : [],
    ...process.env.USER_TYPE === "ant" && REPLTool ? [REPLTool] : [],
    ...WorkflowTool ? [WorkflowTool] : [],
    ...SleepTool ? [SleepTool] : [],
    ...cronTools,
    ...RemoteTriggerTool ? [RemoteTriggerTool] : [],
    ...MonitorTool ? [MonitorTool] : [],
    BriefTool,
    ...SendUserFileTool ? [SendUserFileTool] : [],
    ...PushNotificationTool ? [PushNotificationTool] : [],
    ...SubscribePRTool ? [SubscribePRTool] : [],
    ...getPowerShellTool() ? [getPowerShellTool()] : [],
    ...SnipTool ? [SnipTool] : [],
    ...process.env.NODE_ENV === "test" ? [TestingPermissionTool] : [],
    ListMcpResourcesTool,
    ReadMcpResourceTool,
    // Include ToolSearchTool when tool search might be enabled (optimistic check)
    // The actual decision to defer tools happens at request time in claude.ts
    ...isToolSearchEnabledOptimistic() ? [ToolSearchTool] : []
  ];
}
function filterToolsByDenyRules(tools, permissionContext) {
  return tools.filter((tool) => !getDenyRuleForTool(permissionContext, tool));
}
const getTools = (permissionContext) => {
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    if (isReplModeEnabled() && REPLTool) {
      const replSimple = [REPLTool];
      if (false) {
        replSimple.push(TaskStopTool, getSendMessageTool());
      }
      return filterToolsByDenyRules(replSimple, permissionContext);
    }
    const simpleTools = [BashTool, FileReadTool, FileEditTool];
    if (false) {
      simpleTools.push(AgentTool, TaskStopTool, getSendMessageTool());
    }
    return filterToolsByDenyRules(simpleTools, permissionContext);
  }
  const specialTools = /* @__PURE__ */ new Set([
    ListMcpResourcesTool.name,
    ReadMcpResourceTool.name,
    SYNTHETIC_OUTPUT_TOOL_NAME
  ]);
  const tools = getAllBaseTools().filter((tool) => !specialTools.has(tool.name));
  let allowedTools = filterToolsByDenyRules(tools, permissionContext);
  if (isReplModeEnabled()) {
    const replEnabled = allowedTools.some(
      (tool) => toolMatchesName(tool, REPL_TOOL_NAME)
    );
    if (replEnabled) {
      allowedTools = allowedTools.filter(
        (tool) => !REPL_ONLY_TOOLS.has(tool.name)
      );
    }
  }
  const isEnabled = allowedTools.map((_) => _.isEnabled());
  return allowedTools.filter((_, i) => isEnabled[i]);
};
function assembleToolPool(permissionContext, mcpTools) {
  const builtInTools = getTools(permissionContext);
  const allowedMcpTools = filterToolsByDenyRules(mcpTools, permissionContext);
  const byName = (a, b) => a.name.localeCompare(b.name);
  return uniqBy(
    [...builtInTools].sort(byName).concat(allowedMcpTools.sort(byName)),
    "name"
  );
}
function getMergedTools(permissionContext, mcpTools) {
  const builtInTools = getTools(permissionContext);
  return [...builtInTools, ...mcpTools];
}
export {
  ALL_AGENT_DISALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  COORDINATOR_MODE_ALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  REPL_ONLY_TOOLS,
  TOOL_PRESETS,
  assembleToolPool,
  filterToolsByDenyRules,
  getAllBaseTools,
  getMergedTools,
  getTools,
  getToolsForDefaultPreset,
  parseToolPreset
};
