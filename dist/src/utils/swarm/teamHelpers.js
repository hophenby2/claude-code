import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "zod/v4";
import { getSessionCreatedTeams } from "../../bootstrap/state.js";
import { logForDebugging } from "../debug.js";
import { getTeamsDir } from "../envUtils.js";
import { errorMessage, getErrnoCode } from "../errors.js";
import { execFileNoThrowWithCwd } from "../execFileNoThrow.js";
import { gitExe } from "../git.js";
import { lazySchema } from "../lazySchema.js";
import { jsonParse, jsonStringify } from "../slowOperations.js";
import { getTasksDir, notifyTasksUpdated } from "../tasks.js";
import { getAgentName, getTeamName, isTeammate } from "../teammate.js";
import { isPaneBackend } from "./backends/types.js";
import { TEAM_LEAD_NAME } from "./constants.js";
const inputSchema = lazySchema(
  () => z.strictObject({
    operation: z.enum(["spawnTeam", "cleanup"]).describe(
      "Operation: spawnTeam to create a team, cleanup to remove team and task directories."
    ),
    agent_type: z.string().optional().describe(
      'Type/role of the team lead (e.g., "researcher", "test-runner"). Used for team file and inter-agent coordination.'
    ),
    team_name: z.string().optional().describe("Name for the new team to create (required for spawnTeam)."),
    description: z.string().optional().describe("Team description/purpose (only used with spawnTeam).")
  })
);
function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
}
function sanitizeAgentName(name) {
  return name.replace(/@/g, "-");
}
function getTeamDir(teamName) {
  return join(getTeamsDir(), sanitizeName(teamName));
}
function getTeamFilePath(teamName) {
  return join(getTeamDir(teamName), "config.json");
}
function readTeamFile(teamName) {
  try {
    const content = readFileSync(getTeamFilePath(teamName), "utf-8");
    return jsonParse(content);
  } catch (e) {
    if (getErrnoCode(e) === "ENOENT") return null;
    logForDebugging(
      `[TeammateTool] Failed to read team file for ${teamName}: ${errorMessage(e)}`
    );
    return null;
  }
}
async function readTeamFileAsync(teamName) {
  try {
    const content = await readFile(getTeamFilePath(teamName), "utf-8");
    return jsonParse(content);
  } catch (e) {
    if (getErrnoCode(e) === "ENOENT") return null;
    logForDebugging(
      `[TeammateTool] Failed to read team file for ${teamName}: ${errorMessage(e)}`
    );
    return null;
  }
}
function writeTeamFile(teamName, teamFile) {
  const teamDir = getTeamDir(teamName);
  mkdirSync(teamDir, { recursive: true });
  writeFileSync(getTeamFilePath(teamName), jsonStringify(teamFile, null, 2));
}
async function writeTeamFileAsync(teamName, teamFile) {
  const teamDir = getTeamDir(teamName);
  await mkdir(teamDir, { recursive: true });
  await writeFile(getTeamFilePath(teamName), jsonStringify(teamFile, null, 2));
}
function removeTeammateFromTeamFile(teamName, identifier) {
  const identifierStr = identifier.agentId || identifier.name;
  if (!identifierStr) {
    logForDebugging(
      "[TeammateTool] removeTeammateFromTeamFile called with no identifier"
    );
    return false;
  }
  const teamFile = readTeamFile(teamName);
  if (!teamFile) {
    logForDebugging(
      `[TeammateTool] Cannot remove teammate ${identifierStr}: failed to read team file for "${teamName}"`
    );
    return false;
  }
  const originalLength = teamFile.members.length;
  teamFile.members = teamFile.members.filter((m) => {
    if (identifier.agentId && m.agentId === identifier.agentId) return false;
    if (identifier.name && m.name === identifier.name) return false;
    return true;
  });
  if (teamFile.members.length === originalLength) {
    logForDebugging(
      `[TeammateTool] Teammate ${identifierStr} not found in team file for "${teamName}"`
    );
    return false;
  }
  writeTeamFile(teamName, teamFile);
  logForDebugging(
    `[TeammateTool] Removed teammate from team file: ${identifierStr}`
  );
  return true;
}
function addHiddenPaneId(teamName, paneId) {
  const teamFile = readTeamFile(teamName);
  if (!teamFile) {
    return false;
  }
  const hiddenPaneIds = teamFile.hiddenPaneIds ?? [];
  if (!hiddenPaneIds.includes(paneId)) {
    hiddenPaneIds.push(paneId);
    teamFile.hiddenPaneIds = hiddenPaneIds;
    writeTeamFile(teamName, teamFile);
    logForDebugging(
      `[TeammateTool] Added ${paneId} to hidden panes for team ${teamName}`
    );
  }
  return true;
}
function removeHiddenPaneId(teamName, paneId) {
  const teamFile = readTeamFile(teamName);
  if (!teamFile) {
    return false;
  }
  const hiddenPaneIds = teamFile.hiddenPaneIds ?? [];
  const index = hiddenPaneIds.indexOf(paneId);
  if (index !== -1) {
    hiddenPaneIds.splice(index, 1);
    teamFile.hiddenPaneIds = hiddenPaneIds;
    writeTeamFile(teamName, teamFile);
    logForDebugging(
      `[TeammateTool] Removed ${paneId} from hidden panes for team ${teamName}`
    );
  }
  return true;
}
function removeMemberFromTeam(teamName, tmuxPaneId) {
  const teamFile = readTeamFile(teamName);
  if (!teamFile) {
    return false;
  }
  const memberIndex = teamFile.members.findIndex(
    (m) => m.tmuxPaneId === tmuxPaneId
  );
  if (memberIndex === -1) {
    return false;
  }
  teamFile.members.splice(memberIndex, 1);
  if (teamFile.hiddenPaneIds) {
    const hiddenIndex = teamFile.hiddenPaneIds.indexOf(tmuxPaneId);
    if (hiddenIndex !== -1) {
      teamFile.hiddenPaneIds.splice(hiddenIndex, 1);
    }
  }
  writeTeamFile(teamName, teamFile);
  logForDebugging(
    `[TeammateTool] Removed member with pane ${tmuxPaneId} from team ${teamName}`
  );
  return true;
}
function removeMemberByAgentId(teamName, agentId) {
  const teamFile = readTeamFile(teamName);
  if (!teamFile) {
    return false;
  }
  const memberIndex = teamFile.members.findIndex((m) => m.agentId === agentId);
  if (memberIndex === -1) {
    return false;
  }
  teamFile.members.splice(memberIndex, 1);
  writeTeamFile(teamName, teamFile);
  logForDebugging(
    `[TeammateTool] Removed member ${agentId} from team ${teamName}`
  );
  return true;
}
function setMemberMode(teamName, memberName, mode) {
  const teamFile = readTeamFile(teamName);
  if (!teamFile) {
    return false;
  }
  const member = teamFile.members.find((m) => m.name === memberName);
  if (!member) {
    logForDebugging(
      `[TeammateTool] Cannot set member mode: member ${memberName} not found in team ${teamName}`
    );
    return false;
  }
  if (member.mode === mode) {
    return true;
  }
  const updatedMembers = teamFile.members.map(
    (m) => m.name === memberName ? { ...m, mode } : m
  );
  writeTeamFile(teamName, { ...teamFile, members: updatedMembers });
  logForDebugging(
    `[TeammateTool] Set member ${memberName} in team ${teamName} to mode: ${mode}`
  );
  return true;
}
function syncTeammateMode(mode, teamNameOverride) {
  if (!isTeammate()) return;
  const teamName = teamNameOverride ?? getTeamName();
  const agentName = getAgentName();
  if (teamName && agentName) {
    setMemberMode(teamName, agentName, mode);
  }
}
function setMultipleMemberModes(teamName, modeUpdates) {
  const teamFile = readTeamFile(teamName);
  if (!teamFile) {
    return false;
  }
  const updateMap = new Map(modeUpdates.map((u) => [u.memberName, u.mode]));
  let anyChanged = false;
  const updatedMembers = teamFile.members.map((member) => {
    const newMode = updateMap.get(member.name);
    if (newMode !== void 0 && member.mode !== newMode) {
      anyChanged = true;
      return { ...member, mode: newMode };
    }
    return member;
  });
  if (anyChanged) {
    writeTeamFile(teamName, { ...teamFile, members: updatedMembers });
    logForDebugging(
      `[TeammateTool] Set ${modeUpdates.length} member modes in team ${teamName}`
    );
  }
  return true;
}
async function setMemberActive(teamName, memberName, isActive) {
  const teamFile = await readTeamFileAsync(teamName);
  if (!teamFile) {
    logForDebugging(
      `[TeammateTool] Cannot set member active: team ${teamName} not found`
    );
    return;
  }
  const member = teamFile.members.find((m) => m.name === memberName);
  if (!member) {
    logForDebugging(
      `[TeammateTool] Cannot set member active: member ${memberName} not found in team ${teamName}`
    );
    return;
  }
  if (member.isActive === isActive) {
    return;
  }
  member.isActive = isActive;
  await writeTeamFileAsync(teamName, teamFile);
  logForDebugging(
    `[TeammateTool] Set member ${memberName} in team ${teamName} to ${isActive ? "active" : "idle"}`
  );
}
async function destroyWorktree(worktreePath) {
  const gitFilePath = join(worktreePath, ".git");
  let mainRepoPath = null;
  try {
    const gitFileContent = (await readFile(gitFilePath, "utf-8")).trim();
    const match = gitFileContent.match(/^gitdir:\s*(.+)$/);
    if (match && match[1]) {
      const worktreeGitDir = match[1];
      const mainGitDir = join(worktreeGitDir, "..", "..");
      mainRepoPath = join(mainGitDir, "..");
    }
  } catch {
  }
  if (mainRepoPath) {
    const result = await execFileNoThrowWithCwd(
      gitExe(),
      ["worktree", "remove", "--force", worktreePath],
      { cwd: mainRepoPath }
    );
    if (result.code === 0) {
      logForDebugging(
        `[TeammateTool] Removed worktree via git: ${worktreePath}`
      );
      return;
    }
    if (result.stderr?.includes("not a working tree")) {
      logForDebugging(
        `[TeammateTool] Worktree already removed: ${worktreePath}`
      );
      return;
    }
    logForDebugging(
      `[TeammateTool] git worktree remove failed, falling back to rm: ${result.stderr}`
    );
  }
  try {
    await rm(worktreePath, { recursive: true, force: true });
    logForDebugging(
      `[TeammateTool] Removed worktree directory manually: ${worktreePath}`
    );
  } catch (error) {
    logForDebugging(
      `[TeammateTool] Failed to remove worktree ${worktreePath}: ${errorMessage(error)}`
    );
  }
}
function registerTeamForSessionCleanup(teamName) {
  getSessionCreatedTeams().add(teamName);
}
function unregisterTeamForSessionCleanup(teamName) {
  getSessionCreatedTeams().delete(teamName);
}
async function cleanupSessionTeams() {
  const sessionCreatedTeams = getSessionCreatedTeams();
  if (sessionCreatedTeams.size === 0) return;
  const teams = Array.from(sessionCreatedTeams);
  logForDebugging(
    `cleanupSessionTeams: removing ${teams.length} orphan team dir(s): ${teams.join(", ")}`
  );
  await Promise.allSettled(teams.map((name) => killOrphanedTeammatePanes(name)));
  await Promise.allSettled(teams.map((name) => cleanupTeamDirectories(name)));
  sessionCreatedTeams.clear();
}
async function killOrphanedTeammatePanes(teamName) {
  const teamFile = readTeamFile(teamName);
  if (!teamFile) return;
  const paneMembers = teamFile.members.filter(
    (m) => m.name !== TEAM_LEAD_NAME && m.tmuxPaneId && m.backendType && isPaneBackend(m.backendType)
  );
  if (paneMembers.length === 0) return;
  const [{ ensureBackendsRegistered, getBackendByType }, { isInsideTmux }] = await Promise.all([
    import("./backends/registry.js"),
    import("./backends/detection.js")
  ]);
  await ensureBackendsRegistered();
  const useExternalSession = !await isInsideTmux();
  await Promise.allSettled(
    paneMembers.map(async (m) => {
      if (!m.tmuxPaneId || !m.backendType || !isPaneBackend(m.backendType)) {
        return;
      }
      const ok = await getBackendByType(m.backendType).killPane(
        m.tmuxPaneId,
        useExternalSession
      );
      logForDebugging(
        `cleanupSessionTeams: killPane ${m.name} (${m.backendType} ${m.tmuxPaneId}) \u2192 ${ok}`
      );
    })
  );
}
async function cleanupTeamDirectories(teamName) {
  const sanitizedName = sanitizeName(teamName);
  const teamFile = readTeamFile(teamName);
  const worktreePaths = [];
  if (teamFile) {
    for (const member of teamFile.members) {
      if (member.worktreePath) {
        worktreePaths.push(member.worktreePath);
      }
    }
  }
  for (const worktreePath of worktreePaths) {
    await destroyWorktree(worktreePath);
  }
  const teamDir = getTeamDir(teamName);
  try {
    await rm(teamDir, { recursive: true, force: true });
    logForDebugging(`[TeammateTool] Cleaned up team directory: ${teamDir}`);
  } catch (error) {
    logForDebugging(
      `[TeammateTool] Failed to clean up team directory ${teamDir}: ${errorMessage(error)}`
    );
  }
  const tasksDir = getTasksDir(sanitizedName);
  try {
    await rm(tasksDir, { recursive: true, force: true });
    logForDebugging(`[TeammateTool] Cleaned up tasks directory: ${tasksDir}`);
    notifyTasksUpdated();
  } catch (error) {
    logForDebugging(
      `[TeammateTool] Failed to clean up tasks directory ${tasksDir}: ${errorMessage(error)}`
    );
  }
}
export {
  addHiddenPaneId,
  cleanupSessionTeams,
  cleanupTeamDirectories,
  getTeamDir,
  getTeamFilePath,
  inputSchema,
  readTeamFile,
  readTeamFileAsync,
  registerTeamForSessionCleanup,
  removeHiddenPaneId,
  removeMemberByAgentId,
  removeMemberFromTeam,
  removeTeammateFromTeamFile,
  sanitizeAgentName,
  sanitizeName,
  setMemberActive,
  setMemberMode,
  setMultipleMemberModes,
  syncTeammateMode,
  unregisterTeamForSessionCleanup,
  writeTeamFileAsync
};
