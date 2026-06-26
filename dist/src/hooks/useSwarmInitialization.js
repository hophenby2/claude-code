import { useEffect } from "react";
import { getSessionId } from "../bootstrap/state.js";
import { isAgentSwarmsEnabled } from "../utils/agentSwarmsEnabled.js";
import { initializeTeammateContextFromSession } from "../utils/swarm/reconnection.js";
import { readTeamFile } from "../utils/swarm/teamHelpers.js";
import { initializeTeammateHooks } from "../utils/swarm/teammateInit.js";
import { getDynamicTeamContext } from "../utils/teammate.js";
function useSwarmInitialization(setAppState, initialMessages, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return;
    if (isAgentSwarmsEnabled()) {
      const firstMessage = initialMessages?.[0];
      const teamName = firstMessage && "teamName" in firstMessage ? firstMessage.teamName : void 0;
      const agentName = firstMessage && "agentName" in firstMessage ? firstMessage.agentName : void 0;
      if (teamName && agentName) {
        initializeTeammateContextFromSession(setAppState, teamName, agentName);
        const teamFile = readTeamFile(teamName);
        const member = teamFile?.members.find(
          (m) => m.name === agentName
        );
        if (member) {
          initializeTeammateHooks(setAppState, getSessionId(), {
            teamName,
            agentId: member.agentId,
            agentName
          });
        }
      } else {
        const context = getDynamicTeamContext?.();
        if (context?.teamName && context?.agentId && context?.agentName) {
          initializeTeammateHooks(setAppState, getSessionId(), {
            teamName: context.teamName,
            agentId: context.agentId,
            agentName: context.agentName
          });
        }
      }
    }
  }, [setAppState, initialMessages, enabled]);
}
export {
  useSwarmInitialization
};
