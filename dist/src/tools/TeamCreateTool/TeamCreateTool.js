import { z } from "zod/v4";
import { getSessionId } from "../../bootstrap/state.js";
import { logEvent } from "../../services/analytics/index.js";
import { buildTool } from "../../Tool.js";
import { formatAgentId } from "../../utils/agentId.js";
import { isAgentSwarmsEnabled } from "../../utils/agentSwarmsEnabled.js";
import { getCwd } from "../../utils/cwd.js";
import { lazySchema } from "../../utils/lazySchema.js";
import {
  getDefaultMainLoopModel,
  parseUserSpecifiedModel
} from "../../utils/model/model.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { getResolvedTeammateMode } from "../../utils/swarm/backends/registry.js";
import { TEAM_LEAD_NAME } from "../../utils/swarm/constants.js";
import {
  getTeamFilePath,
  readTeamFile,
  registerTeamForSessionCleanup,
  sanitizeName,
  writeTeamFileAsync
} from "../../utils/swarm/teamHelpers.js";
import { assignTeammateColor } from "../../utils/swarm/teammateLayoutManager.js";
import {
  ensureTasksDir,
  resetTaskList,
  setLeaderTeamName
} from "../../utils/tasks.js";
import { generateWordSlug } from "../../utils/words.js";
import { TEAM_CREATE_TOOL_NAME } from "./constants.js";
import { getPrompt } from "./prompt.js";
import { renderToolUseMessage } from "./UI.js";
const inputSchema = lazySchema(
  () => z.strictObject({
    team_name: z.string().describe("Name for the new team to create."),
    description: z.string().optional().describe("Team description/purpose."),
    agent_type: z.string().optional().describe(
      'Type/role of the team lead (e.g., "researcher", "test-runner"). Used for team file and inter-agent coordination.'
    )
  })
);
function generateUniqueTeamName(providedName) {
  if (!readTeamFile(providedName)) {
    return providedName;
  }
  return generateWordSlug();
}
const TeamCreateTool = buildTool({
  name: TEAM_CREATE_TOOL_NAME,
  searchHint: "create a multi-agent swarm team",
  maxResultSizeChars: 1e5,
  shouldDefer: true,
  userFacingName() {
    return "";
  },
  get inputSchema() {
    return inputSchema();
  },
  isEnabled() {
    return isAgentSwarmsEnabled();
  },
  toAutoClassifierInput(input) {
    return input.team_name;
  },
  async validateInput(input, _context) {
    if (!input.team_name || input.team_name.trim().length === 0) {
      return {
        result: false,
        message: "team_name is required for TeamCreate",
        errorCode: 9
      };
    }
    return { result: true };
  },
  async description() {
    return "Create a new team for coordinating multiple agents";
  },
  async prompt() {
    return getPrompt();
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: "tool_result",
      content: [
        {
          type: "text",
          text: jsonStringify(data)
        }
      ]
    };
  },
  async call(input, context) {
    const { setAppState, getAppState } = context;
    const { team_name, description: _description, agent_type } = input;
    const appState = getAppState();
    const existingTeam = appState.teamContext?.teamName;
    if (existingTeam) {
      throw new Error(
        `Already leading team "${existingTeam}". A leader can only manage one team at a time. Use TeamDelete to end the current team before creating a new one.`
      );
    }
    const finalTeamName = generateUniqueTeamName(team_name);
    const leadAgentId = formatAgentId(TEAM_LEAD_NAME, finalTeamName);
    const leadAgentType = agent_type || TEAM_LEAD_NAME;
    const leadModel = parseUserSpecifiedModel(
      appState.mainLoopModelForSession ?? appState.mainLoopModel ?? getDefaultMainLoopModel()
    );
    const teamFilePath = getTeamFilePath(finalTeamName);
    const teamFile = {
      name: finalTeamName,
      description: _description,
      createdAt: Date.now(),
      leadAgentId,
      leadSessionId: getSessionId(),
      // Store actual session ID for team discovery
      members: [
        {
          agentId: leadAgentId,
          name: TEAM_LEAD_NAME,
          agentType: leadAgentType,
          model: leadModel,
          joinedAt: Date.now(),
          tmuxPaneId: "",
          cwd: getCwd(),
          subscriptions: []
        }
      ]
    };
    await writeTeamFileAsync(finalTeamName, teamFile);
    registerTeamForSessionCleanup(finalTeamName);
    const taskListId = sanitizeName(finalTeamName);
    await resetTaskList(taskListId);
    await ensureTasksDir(taskListId);
    setLeaderTeamName(sanitizeName(finalTeamName));
    setAppState((prev) => ({
      ...prev,
      teamContext: {
        teamName: finalTeamName,
        teamFilePath,
        leadAgentId,
        teammates: {
          [leadAgentId]: {
            name: TEAM_LEAD_NAME,
            agentType: leadAgentType,
            color: assignTeammateColor(leadAgentId),
            tmuxSessionName: "",
            tmuxPaneId: "",
            cwd: getCwd(),
            spawnedAt: Date.now()
          }
        }
      }
    }));
    logEvent("tengu_team_created", {
      team_name: finalTeamName,
      teammate_count: 1,
      lead_agent_type: leadAgentType,
      teammate_mode: getResolvedTeammateMode()
    });
    return {
      data: {
        team_name: finalTeamName,
        team_file_path: teamFilePath,
        lead_agent_id: leadAgentId
      }
    };
  },
  renderToolUseMessage
});
export {
  TeamCreateTool
};
