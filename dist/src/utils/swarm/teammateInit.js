import { logForDebugging } from "../debug.js";
import { addFunctionHook } from "../hooks/sessionHooks.js";
import { applyPermissionUpdate } from "../permissions/PermissionUpdate.js";
import { jsonStringify } from "../slowOperations.js";
import { getTeammateColor } from "../teammate.js";
import {
  createIdleNotification,
  getLastPeerDmSummary,
  writeToMailbox
} from "../teammateMailbox.js";
import { readTeamFile, setMemberActive } from "./teamHelpers.js";
function initializeTeammateHooks(setAppState, sessionId, teamInfo) {
  const { teamName, agentId, agentName } = teamInfo;
  const teamFile = readTeamFile(teamName);
  if (!teamFile) {
    logForDebugging(`[TeammateInit] Team file not found for team: ${teamName}`);
    return;
  }
  const leadAgentId = teamFile.leadAgentId;
  if (teamFile.teamAllowedPaths && teamFile.teamAllowedPaths.length > 0) {
    logForDebugging(
      `[TeammateInit] Found ${teamFile.teamAllowedPaths.length} team-wide allowed path(s)`
    );
    for (const allowedPath of teamFile.teamAllowedPaths) {
      const ruleContent = allowedPath.path.startsWith("/") ? `/${allowedPath.path}/**` : `${allowedPath.path}/**`;
      logForDebugging(
        `[TeammateInit] Applying team permission: ${allowedPath.toolName} allowed in ${allowedPath.path} (rule: ${ruleContent})`
      );
      setAppState((prev) => ({
        ...prev,
        toolPermissionContext: applyPermissionUpdate(
          prev.toolPermissionContext,
          {
            type: "addRules",
            rules: [
              {
                toolName: allowedPath.toolName,
                ruleContent
              }
            ],
            behavior: "allow",
            destination: "session"
          }
        )
      }));
    }
  }
  const leadMember = teamFile.members.find((m) => m.agentId === leadAgentId);
  const leadAgentName = leadMember?.name || "team-lead";
  if (agentId === leadAgentId) {
    logForDebugging(
      "[TeammateInit] This agent is the team leader - skipping idle notification hook"
    );
    return;
  }
  logForDebugging(
    `[TeammateInit] Registering Stop hook for teammate ${agentName} to notify leader ${leadAgentName}`
  );
  addFunctionHook(
    setAppState,
    sessionId,
    "Stop",
    "",
    // No matcher - applies to all Stop events
    async (messages, _signal) => {
      void setMemberActive(teamName, agentName, false);
      const notification = createIdleNotification(agentName, {
        idleReason: "available",
        summary: getLastPeerDmSummary(messages)
      });
      await writeToMailbox(leadAgentName, {
        from: agentName,
        text: jsonStringify(notification),
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        color: getTeammateColor()
      });
      logForDebugging(
        `[TeammateInit] Sent idle notification to leader ${leadAgentName}`
      );
      return true;
    },
    "Failed to send idle notification to team leader",
    {
      timeout: 1e4
    }
  );
}
export {
  initializeTeammateHooks
};
