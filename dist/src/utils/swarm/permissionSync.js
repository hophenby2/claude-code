import { mkdir, readdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "zod/v4";
import { logForDebugging } from "../debug.js";
import { getErrnoCode } from "../errors.js";
import { lazySchema } from "../lazySchema.js";
import * as lockfile from "../lockfile.js";
import { logError } from "../log.js";
import { jsonParse, jsonStringify } from "../slowOperations.js";
import {
  getAgentId,
  getAgentName,
  getTeammateColor,
  getTeamName
} from "../teammate.js";
import {
  createPermissionRequestMessage,
  createPermissionResponseMessage,
  createSandboxPermissionRequestMessage,
  createSandboxPermissionResponseMessage,
  writeToMailbox
} from "../teammateMailbox.js";
import { getTeamDir, readTeamFileAsync } from "./teamHelpers.js";
const SwarmPermissionRequestSchema = lazySchema(
  () => z.object({
    /** Unique identifier for this request */
    id: z.string(),
    /** Worker's CLAUDE_CODE_AGENT_ID */
    workerId: z.string(),
    /** Worker's CLAUDE_CODE_AGENT_NAME */
    workerName: z.string(),
    /** Worker's CLAUDE_CODE_AGENT_COLOR */
    workerColor: z.string().optional(),
    /** Team name for routing */
    teamName: z.string(),
    /** Tool name requiring permission (e.g., "Bash", "Edit") */
    toolName: z.string(),
    /** Original toolUseID from worker's context */
    toolUseId: z.string(),
    /** Human-readable description of the tool use */
    description: z.string(),
    /** Serialized tool input */
    input: z.record(z.string(), z.unknown()),
    /** Suggested permission rules from the permission result */
    permissionSuggestions: z.array(z.unknown()),
    /** Status of the request */
    status: z.enum(["pending", "approved", "rejected"]),
    /** Who resolved the request */
    resolvedBy: z.enum(["worker", "leader"]).optional(),
    /** Timestamp when resolved */
    resolvedAt: z.number().optional(),
    /** Rejection feedback message */
    feedback: z.string().optional(),
    /** Modified input if changed by resolver */
    updatedInput: z.record(z.string(), z.unknown()).optional(),
    /** "Always allow" rules applied during resolution */
    permissionUpdates: z.array(z.unknown()).optional(),
    /** Timestamp when request was created */
    createdAt: z.number()
  })
);
function getPermissionDir(teamName) {
  return join(getTeamDir(teamName), "permissions");
}
function getPendingDir(teamName) {
  return join(getPermissionDir(teamName), "pending");
}
function getResolvedDir(teamName) {
  return join(getPermissionDir(teamName), "resolved");
}
async function ensurePermissionDirsAsync(teamName) {
  const permDir = getPermissionDir(teamName);
  const pendingDir = getPendingDir(teamName);
  const resolvedDir = getResolvedDir(teamName);
  for (const dir of [permDir, pendingDir, resolvedDir]) {
    await mkdir(dir, { recursive: true });
  }
}
function getPendingRequestPath(teamName, requestId) {
  return join(getPendingDir(teamName), `${requestId}.json`);
}
function getResolvedRequestPath(teamName, requestId) {
  return join(getResolvedDir(teamName), `${requestId}.json`);
}
function generateRequestId() {
  return `perm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
function createPermissionRequest(params) {
  const teamName = params.teamName || getTeamName();
  const workerId = params.workerId || getAgentId();
  const workerName = params.workerName || getAgentName();
  const workerColor = params.workerColor || getTeammateColor();
  if (!teamName) {
    throw new Error("Team name is required for permission requests");
  }
  if (!workerId) {
    throw new Error("Worker ID is required for permission requests");
  }
  if (!workerName) {
    throw new Error("Worker name is required for permission requests");
  }
  return {
    id: generateRequestId(),
    workerId,
    workerName,
    workerColor,
    teamName,
    toolName: params.toolName,
    toolUseId: params.toolUseId,
    description: params.description,
    input: params.input,
    permissionSuggestions: params.permissionSuggestions || [],
    status: "pending",
    createdAt: Date.now()
  };
}
async function writePermissionRequest(request) {
  await ensurePermissionDirsAsync(request.teamName);
  const pendingPath = getPendingRequestPath(request.teamName, request.id);
  const lockDir = getPendingDir(request.teamName);
  const lockFilePath = join(lockDir, ".lock");
  await writeFile(lockFilePath, "", "utf-8");
  let release;
  try {
    release = await lockfile.lock(lockFilePath);
    await writeFile(pendingPath, jsonStringify(request, null, 2), "utf-8");
    logForDebugging(
      `[PermissionSync] Wrote pending request ${request.id} from ${request.workerName} for ${request.toolName}`
    );
    return request;
  } catch (error) {
    logForDebugging(
      `[PermissionSync] Failed to write permission request: ${error}`
    );
    logError(error);
    throw error;
  } finally {
    if (release) {
      await release();
    }
  }
}
async function readPendingPermissions(teamName) {
  const team = teamName || getTeamName();
  if (!team) {
    logForDebugging("[PermissionSync] No team name available");
    return [];
  }
  const pendingDir = getPendingDir(team);
  let files;
  try {
    files = await readdir(pendingDir);
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT") {
      return [];
    }
    logForDebugging(`[PermissionSync] Failed to read pending requests: ${e}`);
    logError(e);
    return [];
  }
  const jsonFiles = files.filter((f) => f.endsWith(".json") && f !== ".lock");
  const results = await Promise.all(
    jsonFiles.map(async (file) => {
      const filePath = join(pendingDir, file);
      try {
        const content = await readFile(filePath, "utf-8");
        const parsed = SwarmPermissionRequestSchema().safeParse(
          jsonParse(content)
        );
        if (parsed.success) {
          return parsed.data;
        }
        logForDebugging(
          `[PermissionSync] Invalid request file ${file}: ${parsed.error.message}`
        );
        return null;
      } catch (err) {
        logForDebugging(
          `[PermissionSync] Failed to read request file ${file}: ${err}`
        );
        return null;
      }
    })
  );
  const requests = results.filter((r) => r !== null);
  requests.sort((a, b) => a.createdAt - b.createdAt);
  return requests;
}
async function readResolvedPermission(requestId, teamName) {
  const team = teamName || getTeamName();
  if (!team) {
    return null;
  }
  const resolvedPath = getResolvedRequestPath(team, requestId);
  try {
    const content = await readFile(resolvedPath, "utf-8");
    const parsed = SwarmPermissionRequestSchema().safeParse(jsonParse(content));
    if (parsed.success) {
      return parsed.data;
    }
    logForDebugging(
      `[PermissionSync] Invalid resolved request ${requestId}: ${parsed.error.message}`
    );
    return null;
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT") {
      return null;
    }
    logForDebugging(
      `[PermissionSync] Failed to read resolved request ${requestId}: ${e}`
    );
    logError(e);
    return null;
  }
}
async function resolvePermission(requestId, resolution, teamName) {
  const team = teamName || getTeamName();
  if (!team) {
    logForDebugging("[PermissionSync] No team name available");
    return false;
  }
  await ensurePermissionDirsAsync(team);
  const pendingPath = getPendingRequestPath(team, requestId);
  const resolvedPath = getResolvedRequestPath(team, requestId);
  const lockFilePath = join(getPendingDir(team), ".lock");
  await writeFile(lockFilePath, "", "utf-8");
  let release;
  try {
    release = await lockfile.lock(lockFilePath);
    let content;
    try {
      content = await readFile(pendingPath, "utf-8");
    } catch (e) {
      const code = getErrnoCode(e);
      if (code === "ENOENT") {
        logForDebugging(
          `[PermissionSync] Pending request not found: ${requestId}`
        );
        return false;
      }
      throw e;
    }
    const parsed = SwarmPermissionRequestSchema().safeParse(jsonParse(content));
    if (!parsed.success) {
      logForDebugging(
        `[PermissionSync] Invalid pending request ${requestId}: ${parsed.error.message}`
      );
      return false;
    }
    const request = parsed.data;
    const resolvedRequest = {
      ...request,
      status: resolution.decision === "approved" ? "approved" : "rejected",
      resolvedBy: resolution.resolvedBy,
      resolvedAt: Date.now(),
      feedback: resolution.feedback,
      updatedInput: resolution.updatedInput,
      permissionUpdates: resolution.permissionUpdates
    };
    await writeFile(
      resolvedPath,
      jsonStringify(resolvedRequest, null, 2),
      "utf-8"
    );
    await unlink(pendingPath);
    logForDebugging(
      `[PermissionSync] Resolved request ${requestId} with ${resolution.decision}`
    );
    return true;
  } catch (error) {
    logForDebugging(`[PermissionSync] Failed to resolve request: ${error}`);
    logError(error);
    return false;
  } finally {
    if (release) {
      await release();
    }
  }
}
async function cleanupOldResolutions(teamName, maxAgeMs = 36e5) {
  const team = teamName || getTeamName();
  if (!team) {
    return 0;
  }
  const resolvedDir = getResolvedDir(team);
  let files;
  try {
    files = await readdir(resolvedDir);
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT") {
      return 0;
    }
    logForDebugging(`[PermissionSync] Failed to cleanup resolutions: ${e}`);
    logError(e);
    return 0;
  }
  const now = Date.now();
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const cleanupResults = await Promise.all(
    jsonFiles.map(async (file) => {
      const filePath = join(resolvedDir, file);
      try {
        const content = await readFile(filePath, "utf-8");
        const request = jsonParse(content);
        const resolvedAt = request.resolvedAt || request.createdAt;
        if (now - resolvedAt >= maxAgeMs) {
          await unlink(filePath);
          logForDebugging(`[PermissionSync] Cleaned up old resolution: ${file}`);
          return 1;
        }
        return 0;
      } catch {
        try {
          await unlink(filePath);
          return 1;
        } catch {
          return 0;
        }
      }
    })
  );
  const cleanedCount = cleanupResults.reduce((sum, n) => sum + n, 0);
  if (cleanedCount > 0) {
    logForDebugging(
      `[PermissionSync] Cleaned up ${cleanedCount} old resolutions`
    );
  }
  return cleanedCount;
}
async function pollForResponse(requestId, _agentName, teamName) {
  const resolved = await readResolvedPermission(requestId, teamName);
  if (!resolved) {
    return null;
  }
  return {
    requestId: resolved.id,
    decision: resolved.status === "approved" ? "approved" : "denied",
    timestamp: resolved.resolvedAt ? new Date(resolved.resolvedAt).toISOString() : new Date(resolved.createdAt).toISOString(),
    feedback: resolved.feedback,
    updatedInput: resolved.updatedInput,
    permissionUpdates: resolved.permissionUpdates
  };
}
async function removeWorkerResponse(requestId, _agentName, teamName) {
  await deleteResolvedPermission(requestId, teamName);
}
function isTeamLeader(teamName) {
  const team = teamName || getTeamName();
  if (!team) {
    return false;
  }
  const agentId = getAgentId();
  return !agentId || agentId === "team-lead";
}
function isSwarmWorker() {
  const teamName = getTeamName();
  const agentId = getAgentId();
  return !!teamName && !!agentId && !isTeamLeader();
}
async function deleteResolvedPermission(requestId, teamName) {
  const team = teamName || getTeamName();
  if (!team) {
    return false;
  }
  const resolvedPath = getResolvedRequestPath(team, requestId);
  try {
    await unlink(resolvedPath);
    logForDebugging(
      `[PermissionSync] Deleted resolved permission: ${requestId}`
    );
    return true;
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT") {
      return false;
    }
    logForDebugging(
      `[PermissionSync] Failed to delete resolved permission: ${e}`
    );
    logError(e);
    return false;
  }
}
const submitPermissionRequest = writePermissionRequest;
async function getLeaderName(teamName) {
  const team = teamName || getTeamName();
  if (!team) {
    return null;
  }
  const teamFile = await readTeamFileAsync(team);
  if (!teamFile) {
    logForDebugging(`[PermissionSync] Team file not found for team: ${team}`);
    return null;
  }
  const leadMember = teamFile.members.find(
    (m) => m.agentId === teamFile.leadAgentId
  );
  return leadMember?.name || "team-lead";
}
async function sendPermissionRequestViaMailbox(request) {
  const leaderName = await getLeaderName(request.teamName);
  if (!leaderName) {
    logForDebugging(
      `[PermissionSync] Cannot send permission request: leader name not found`
    );
    return false;
  }
  try {
    const message = createPermissionRequestMessage({
      request_id: request.id,
      agent_id: request.workerName,
      tool_name: request.toolName,
      tool_use_id: request.toolUseId,
      description: request.description,
      input: request.input,
      permission_suggestions: request.permissionSuggestions
    });
    await writeToMailbox(
      leaderName,
      {
        from: request.workerName,
        text: jsonStringify(message),
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        color: request.workerColor
      },
      request.teamName
    );
    logForDebugging(
      `[PermissionSync] Sent permission request ${request.id} to leader ${leaderName} via mailbox`
    );
    return true;
  } catch (error) {
    logForDebugging(
      `[PermissionSync] Failed to send permission request via mailbox: ${error}`
    );
    logError(error);
    return false;
  }
}
async function sendPermissionResponseViaMailbox(workerName, resolution, requestId, teamName) {
  const team = teamName || getTeamName();
  if (!team) {
    logForDebugging(
      `[PermissionSync] Cannot send permission response: team name not found`
    );
    return false;
  }
  try {
    const message = createPermissionResponseMessage({
      request_id: requestId,
      subtype: resolution.decision === "approved" ? "success" : "error",
      error: resolution.feedback,
      updated_input: resolution.updatedInput,
      permission_updates: resolution.permissionUpdates
    });
    const senderName = getAgentName() || "team-lead";
    await writeToMailbox(
      workerName,
      {
        from: senderName,
        text: jsonStringify(message),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      team
    );
    logForDebugging(
      `[PermissionSync] Sent permission response for ${requestId} to worker ${workerName} via mailbox`
    );
    return true;
  } catch (error) {
    logForDebugging(
      `[PermissionSync] Failed to send permission response via mailbox: ${error}`
    );
    logError(error);
    return false;
  }
}
function generateSandboxRequestId() {
  return `sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
async function sendSandboxPermissionRequestViaMailbox(host, requestId, teamName) {
  const team = teamName || getTeamName();
  if (!team) {
    logForDebugging(
      `[PermissionSync] Cannot send sandbox permission request: team name not found`
    );
    return false;
  }
  const leaderName = await getLeaderName(team);
  if (!leaderName) {
    logForDebugging(
      `[PermissionSync] Cannot send sandbox permission request: leader name not found`
    );
    return false;
  }
  const workerId = getAgentId();
  const workerName = getAgentName();
  const workerColor = getTeammateColor();
  if (!workerId || !workerName) {
    logForDebugging(
      `[PermissionSync] Cannot send sandbox permission request: worker ID or name not found`
    );
    return false;
  }
  try {
    const message = createSandboxPermissionRequestMessage({
      requestId,
      workerId,
      workerName,
      workerColor,
      host
    });
    await writeToMailbox(
      leaderName,
      {
        from: workerName,
        text: jsonStringify(message),
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        color: workerColor
      },
      team
    );
    logForDebugging(
      `[PermissionSync] Sent sandbox permission request ${requestId} for host ${host} to leader ${leaderName} via mailbox`
    );
    return true;
  } catch (error) {
    logForDebugging(
      `[PermissionSync] Failed to send sandbox permission request via mailbox: ${error}`
    );
    logError(error);
    return false;
  }
}
async function sendSandboxPermissionResponseViaMailbox(workerName, requestId, host, allow, teamName) {
  const team = teamName || getTeamName();
  if (!team) {
    logForDebugging(
      `[PermissionSync] Cannot send sandbox permission response: team name not found`
    );
    return false;
  }
  try {
    const message = createSandboxPermissionResponseMessage({
      requestId,
      host,
      allow
    });
    const senderName = getAgentName() || "team-lead";
    await writeToMailbox(
      workerName,
      {
        from: senderName,
        text: jsonStringify(message),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      team
    );
    logForDebugging(
      `[PermissionSync] Sent sandbox permission response for ${requestId} (host: ${host}, allow: ${allow}) to worker ${workerName} via mailbox`
    );
    return true;
  } catch (error) {
    logForDebugging(
      `[PermissionSync] Failed to send sandbox permission response via mailbox: ${error}`
    );
    logError(error);
    return false;
  }
}
export {
  SwarmPermissionRequestSchema,
  cleanupOldResolutions,
  createPermissionRequest,
  deleteResolvedPermission,
  generateRequestId,
  generateSandboxRequestId,
  getLeaderName,
  getPermissionDir,
  isSwarmWorker,
  isTeamLeader,
  pollForResponse,
  readPendingPermissions,
  readResolvedPermission,
  removeWorkerResponse,
  resolvePermission,
  sendPermissionRequestViaMailbox,
  sendPermissionResponseViaMailbox,
  sendSandboxPermissionRequestViaMailbox,
  sendSandboxPermissionResponseViaMailbox,
  submitPermissionRequest,
  writePermissionRequest
};
