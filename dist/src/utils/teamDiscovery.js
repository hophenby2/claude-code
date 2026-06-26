import { isPaneBackend } from "./swarm/backends/types.js";
import { readTeamFile } from "./swarm/teamHelpers.js";
function getTeammateStatuses(teamName) {
  const teamFile = readTeamFile(teamName);
  if (!teamFile) {
    return [];
  }
  const hiddenPaneIds = new Set(teamFile.hiddenPaneIds ?? []);
  const statuses = [];
  for (const member of teamFile.members) {
    if (member.name === "team-lead") {
      continue;
    }
    const isActive = member.isActive !== false;
    const status = isActive ? "running" : "idle";
    statuses.push({
      name: member.name,
      agentId: member.agentId,
      agentType: member.agentType,
      model: member.model,
      prompt: member.prompt,
      status,
      color: member.color,
      tmuxPaneId: member.tmuxPaneId,
      cwd: member.cwd,
      worktreePath: member.worktreePath,
      isHidden: hiddenPaneIds.has(member.tmuxPaneId),
      backendType: member.backendType && isPaneBackend(member.backendType) ? member.backendType : void 0,
      mode: member.mode
    });
  }
  return statuses;
}
export {
  getTeammateStatuses
};
