import { mkdir, readdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "zod/v4";
import { getIsNonInteractiveSession, getSessionId } from "../bootstrap/state.js";
import { uniq } from "./array.js";
import { logForDebugging } from "./debug.js";
import { getClaudeConfigHomeDir, getTeamsDir, isEnvTruthy } from "./envUtils.js";
import { errorMessage, getErrnoCode } from "./errors.js";
import { lazySchema } from "./lazySchema.js";
import * as lockfile from "./lockfile.js";
import { logError } from "./log.js";
import { createSignal } from "./signal.js";
import { jsonParse, jsonStringify } from "./slowOperations.js";
import { getTeamName } from "./teammate.js";
import { getTeammateContext } from "./teammateContext.js";
const tasksUpdated = createSignal();
let leaderTeamName;
function setLeaderTeamName(teamName) {
  if (leaderTeamName === teamName) return;
  leaderTeamName = teamName;
  notifyTasksUpdated();
}
function clearLeaderTeamName() {
  if (leaderTeamName === void 0) return;
  leaderTeamName = void 0;
  notifyTasksUpdated();
}
const onTasksUpdated = tasksUpdated.subscribe;
function notifyTasksUpdated() {
  try {
    tasksUpdated.emit();
  } catch {
  }
}
const TASK_STATUSES = ["pending", "in_progress", "completed"];
const TaskStatusSchema = lazySchema(
  () => z.enum(["pending", "in_progress", "completed"])
);
const TaskSchema = lazySchema(
  () => z.object({
    id: z.string(),
    subject: z.string(),
    description: z.string(),
    activeForm: z.string().optional(),
    // present continuous form for spinner (e.g., "Running tests")
    owner: z.string().optional(),
    // agent ID
    status: TaskStatusSchema(),
    blocks: z.array(z.string()),
    // task IDs this task blocks
    blockedBy: z.array(z.string()),
    // task IDs that block this task
    metadata: z.record(z.string(), z.unknown()).optional()
    // arbitrary metadata
  })
);
const HIGH_WATER_MARK_FILE = ".highwatermark";
const LOCK_OPTIONS = {
  retries: {
    retries: 30,
    minTimeout: 5,
    maxTimeout: 100
  }
};
function getHighWaterMarkPath(taskListId) {
  return join(getTasksDir(taskListId), HIGH_WATER_MARK_FILE);
}
async function readHighWaterMark(taskListId) {
  const path = getHighWaterMarkPath(taskListId);
  try {
    const content = (await readFile(path, "utf-8")).trim();
    const value = parseInt(content, 10);
    return isNaN(value) ? 0 : value;
  } catch {
    return 0;
  }
}
async function writeHighWaterMark(taskListId, value) {
  const path = getHighWaterMarkPath(taskListId);
  await writeFile(path, String(value));
}
function isTodoV2Enabled() {
  if (isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_TASKS)) {
    return true;
  }
  return !getIsNonInteractiveSession();
}
async function resetTaskList(taskListId) {
  const dir = getTasksDir(taskListId);
  const lockPath = await ensureTaskListLockFile(taskListId);
  let release;
  try {
    release = await lockfile.lock(lockPath, LOCK_OPTIONS);
    const currentHighest = await findHighestTaskIdFromFiles(taskListId);
    if (currentHighest > 0) {
      const existingMark = await readHighWaterMark(taskListId);
      if (currentHighest > existingMark) {
        await writeHighWaterMark(taskListId, currentHighest);
      }
    }
    let files;
    try {
      files = await readdir(dir);
    } catch {
      files = [];
    }
    for (const file of files) {
      if (file.endsWith(".json") && !file.startsWith(".")) {
        const filePath = join(dir, file);
        try {
          await unlink(filePath);
        } catch {
        }
      }
    }
    notifyTasksUpdated();
  } finally {
    if (release) {
      await release();
    }
  }
}
function getTaskListId() {
  if (process.env.CLAUDE_CODE_TASK_LIST_ID) {
    return process.env.CLAUDE_CODE_TASK_LIST_ID;
  }
  const teammateCtx = getTeammateContext();
  if (teammateCtx) {
    return teammateCtx.teamName;
  }
  return getTeamName() || leaderTeamName || getSessionId();
}
function sanitizePathComponent(input) {
  return input.replace(/[^a-zA-Z0-9_-]/g, "-");
}
function getTasksDir(taskListId) {
  return join(
    getClaudeConfigHomeDir(),
    "tasks",
    sanitizePathComponent(taskListId)
  );
}
function getTaskPath(taskListId, taskId) {
  return join(getTasksDir(taskListId), `${sanitizePathComponent(taskId)}.json`);
}
async function ensureTasksDir(taskListId) {
  const dir = getTasksDir(taskListId);
  try {
    await mkdir(dir, { recursive: true });
  } catch {
  }
}
async function findHighestTaskIdFromFiles(taskListId) {
  const dir = getTasksDir(taskListId);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return 0;
  }
  let highest = 0;
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const taskId = parseInt(file.replace(".json", ""), 10);
    if (!isNaN(taskId) && taskId > highest) {
      highest = taskId;
    }
  }
  return highest;
}
async function findHighestTaskId(taskListId) {
  const [fromFiles, fromMark] = await Promise.all([
    findHighestTaskIdFromFiles(taskListId),
    readHighWaterMark(taskListId)
  ]);
  return Math.max(fromFiles, fromMark);
}
async function createTask(taskListId, taskData) {
  const lockPath = await ensureTaskListLockFile(taskListId);
  let release;
  try {
    release = await lockfile.lock(lockPath, LOCK_OPTIONS);
    const highestId = await findHighestTaskId(taskListId);
    const id = String(highestId + 1);
    const task = { id, ...taskData };
    const path = getTaskPath(taskListId, id);
    await writeFile(path, jsonStringify(task, null, 2));
    notifyTasksUpdated();
    return id;
  } finally {
    if (release) {
      await release();
    }
  }
}
async function getTask(taskListId, taskId) {
  const path = getTaskPath(taskListId, taskId);
  try {
    const content = await readFile(path, "utf-8");
    const data = jsonParse(content);
    if (process.env.USER_TYPE === "ant") {
      if (data.status === "open") data.status = "pending";
      else if (data.status === "resolved") data.status = "completed";
      else if (data.status && ["planning", "implementing", "reviewing", "verifying"].includes(
        data.status
      )) {
        data.status = "in_progress";
      }
    }
    const parsed = TaskSchema().safeParse(data);
    if (!parsed.success) {
      logForDebugging(
        `[Tasks] Task ${taskId} failed schema validation: ${parsed.error.message}`
      );
      return null;
    }
    return parsed.data;
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT") {
      return null;
    }
    logForDebugging(`[Tasks] Failed to read task ${taskId}: ${errorMessage(e)}`);
    logError(e);
    return null;
  }
}
async function updateTaskUnsafe(taskListId, taskId, updates) {
  const existing = await getTask(taskListId, taskId);
  if (!existing) {
    return null;
  }
  const updated = { ...existing, ...updates, id: taskId };
  const path = getTaskPath(taskListId, taskId);
  await writeFile(path, jsonStringify(updated, null, 2));
  notifyTasksUpdated();
  return updated;
}
async function updateTask(taskListId, taskId, updates) {
  const path = getTaskPath(taskListId, taskId);
  const taskBeforeLock = await getTask(taskListId, taskId);
  if (!taskBeforeLock) {
    return null;
  }
  let release;
  try {
    release = await lockfile.lock(path, LOCK_OPTIONS);
    return await updateTaskUnsafe(taskListId, taskId, updates);
  } finally {
    await release?.();
  }
}
async function deleteTask(taskListId, taskId) {
  const path = getTaskPath(taskListId, taskId);
  try {
    const numericId = parseInt(taskId, 10);
    if (!isNaN(numericId)) {
      const currentMark = await readHighWaterMark(taskListId);
      if (numericId > currentMark) {
        await writeHighWaterMark(taskListId, numericId);
      }
    }
    try {
      await unlink(path);
    } catch (e) {
      const code = getErrnoCode(e);
      if (code === "ENOENT") {
        return false;
      }
      throw e;
    }
    const allTasks = await listTasks(taskListId);
    for (const task of allTasks) {
      const newBlocks = task.blocks.filter((id) => id !== taskId);
      const newBlockedBy = task.blockedBy.filter((id) => id !== taskId);
      if (newBlocks.length !== task.blocks.length || newBlockedBy.length !== task.blockedBy.length) {
        await updateTask(taskListId, task.id, {
          blocks: newBlocks,
          blockedBy: newBlockedBy
        });
      }
    }
    notifyTasksUpdated();
    return true;
  } catch {
    return false;
  }
}
async function listTasks(taskListId) {
  const dir = getTasksDir(taskListId);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const taskIds = files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  const results = await Promise.all(taskIds.map((id) => getTask(taskListId, id)));
  return results.filter((t) => t !== null);
}
async function blockTask(taskListId, fromTaskId, toTaskId) {
  const [fromTask, toTask] = await Promise.all([
    getTask(taskListId, fromTaskId),
    getTask(taskListId, toTaskId)
  ]);
  if (!fromTask || !toTask) {
    return false;
  }
  if (!fromTask.blocks.includes(toTaskId)) {
    await updateTask(taskListId, fromTaskId, {
      blocks: [...fromTask.blocks, toTaskId]
    });
  }
  if (!toTask.blockedBy.includes(fromTaskId)) {
    await updateTask(taskListId, toTaskId, {
      blockedBy: [...toTask.blockedBy, fromTaskId]
    });
  }
  return true;
}
function getTaskListLockPath(taskListId) {
  return join(getTasksDir(taskListId), ".lock");
}
async function ensureTaskListLockFile(taskListId) {
  await ensureTasksDir(taskListId);
  const lockPath = getTaskListLockPath(taskListId);
  try {
    await writeFile(lockPath, "", { flag: "wx" });
  } catch {
  }
  return lockPath;
}
async function claimTask(taskListId, taskId, claimantAgentId, options = {}) {
  const taskPath = getTaskPath(taskListId, taskId);
  const taskBeforeLock = await getTask(taskListId, taskId);
  if (!taskBeforeLock) {
    return { success: false, reason: "task_not_found" };
  }
  if (options.checkAgentBusy) {
    return claimTaskWithBusyCheck(taskListId, taskId, claimantAgentId);
  }
  let release;
  try {
    release = await lockfile.lock(taskPath, LOCK_OPTIONS);
    const task = await getTask(taskListId, taskId);
    if (!task) {
      return { success: false, reason: "task_not_found" };
    }
    if (task.owner && task.owner !== claimantAgentId) {
      return { success: false, reason: "already_claimed", task };
    }
    if (task.status === "completed") {
      return { success: false, reason: "already_resolved", task };
    }
    const allTasks = await listTasks(taskListId);
    const unresolvedTaskIds = new Set(
      allTasks.filter((t) => t.status !== "completed").map((t) => t.id)
    );
    const blockedByTasks = task.blockedBy.filter(
      (id) => unresolvedTaskIds.has(id)
    );
    if (blockedByTasks.length > 0) {
      return { success: false, reason: "blocked", task, blockedByTasks };
    }
    const updated = await updateTaskUnsafe(taskListId, taskId, {
      owner: claimantAgentId
    });
    return { success: true, task: updated };
  } catch (error) {
    logForDebugging(
      `[Tasks] Failed to claim task ${taskId}: ${errorMessage(error)}`
    );
    logError(error);
    return { success: false, reason: "task_not_found" };
  } finally {
    if (release) {
      await release();
    }
  }
}
async function claimTaskWithBusyCheck(taskListId, taskId, claimantAgentId) {
  const lockPath = await ensureTaskListLockFile(taskListId);
  let release;
  try {
    release = await lockfile.lock(lockPath, LOCK_OPTIONS);
    const allTasks = await listTasks(taskListId);
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) {
      return { success: false, reason: "task_not_found" };
    }
    if (task.owner && task.owner !== claimantAgentId) {
      return { success: false, reason: "already_claimed", task };
    }
    if (task.status === "completed") {
      return { success: false, reason: "already_resolved", task };
    }
    const unresolvedTaskIds = new Set(
      allTasks.filter((t) => t.status !== "completed").map((t) => t.id)
    );
    const blockedByTasks = task.blockedBy.filter(
      (id) => unresolvedTaskIds.has(id)
    );
    if (blockedByTasks.length > 0) {
      return { success: false, reason: "blocked", task, blockedByTasks };
    }
    const agentOpenTasks = allTasks.filter(
      (t) => t.status !== "completed" && t.owner === claimantAgentId && t.id !== taskId
    );
    if (agentOpenTasks.length > 0) {
      return {
        success: false,
        reason: "agent_busy",
        task,
        busyWithTasks: agentOpenTasks.map((t) => t.id)
      };
    }
    const updated = await updateTask(taskListId, taskId, {
      owner: claimantAgentId
    });
    return { success: true, task: updated };
  } catch (error) {
    logForDebugging(
      `[Tasks] Failed to claim task ${taskId} with busy check: ${errorMessage(error)}`
    );
    logError(error);
    return { success: false, reason: "task_not_found" };
  } finally {
    if (release) {
      await release();
    }
  }
}
function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
}
async function readTeamMembers(teamName) {
  const teamsDir = getTeamsDir();
  const teamFilePath = join(teamsDir, sanitizeName(teamName), "config.json");
  try {
    const content = await readFile(teamFilePath, "utf-8");
    const teamFile = jsonParse(content);
    return {
      leadAgentId: teamFile.leadAgentId,
      members: teamFile.members.map((m) => ({
        agentId: m.agentId,
        name: m.name,
        agentType: m.agentType
      }))
    };
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT") {
      return null;
    }
    logForDebugging(
      `[Tasks] Failed to read team file for ${teamName}: ${errorMessage(e)}`
    );
    return null;
  }
}
async function getAgentStatuses(teamName) {
  const teamData = await readTeamMembers(teamName);
  if (!teamData) {
    return null;
  }
  const taskListId = sanitizeName(teamName);
  const allTasks = await listTasks(taskListId);
  const unresolvedTasksByOwner = /* @__PURE__ */ new Map();
  for (const task of allTasks) {
    if (task.status !== "completed" && task.owner) {
      const existing = unresolvedTasksByOwner.get(task.owner) || [];
      existing.push(task.id);
      unresolvedTasksByOwner.set(task.owner, existing);
    }
  }
  return teamData.members.map((member) => {
    const tasksByName = unresolvedTasksByOwner.get(member.name) || [];
    const tasksById = unresolvedTasksByOwner.get(member.agentId) || [];
    const currentTasks = uniq([...tasksByName, ...tasksById]);
    return {
      agentId: member.agentId,
      name: member.name,
      agentType: member.agentType,
      status: currentTasks.length === 0 ? "idle" : "busy",
      currentTasks
    };
  });
}
async function unassignTeammateTasks(teamName, teammateId, teammateName, reason) {
  const tasks = await listTasks(teamName);
  const unresolvedAssignedTasks = tasks.filter(
    (t) => t.status !== "completed" && (t.owner === teammateId || t.owner === teammateName)
  );
  for (const task of unresolvedAssignedTasks) {
    await updateTask(teamName, task.id, { owner: void 0, status: "pending" });
  }
  if (unresolvedAssignedTasks.length > 0) {
    logForDebugging(
      `[Tasks] Unassigned ${unresolvedAssignedTasks.length} task(s) from ${teammateName}`
    );
  }
  const actionVerb = reason === "terminated" ? "was terminated" : "has shut down";
  let notificationMessage = `${teammateName} ${actionVerb}.`;
  if (unresolvedAssignedTasks.length > 0) {
    const taskList = unresolvedAssignedTasks.map((t) => `#${t.id} "${t.subject}"`).join(", ");
    notificationMessage += ` ${unresolvedAssignedTasks.length} task(s) were unassigned: ${taskList}. Use TaskList to check availability and TaskUpdate with owner to reassign them to idle teammates.`;
  }
  return {
    unassignedTasks: unresolvedAssignedTasks.map((t) => ({
      id: t.id,
      subject: t.subject
    })),
    notificationMessage
  };
}
const DEFAULT_TASKS_MODE_TASK_LIST_ID = "tasklist";
export {
  DEFAULT_TASKS_MODE_TASK_LIST_ID,
  TASK_STATUSES,
  TaskSchema,
  TaskStatusSchema,
  blockTask,
  claimTask,
  clearLeaderTeamName,
  createTask,
  deleteTask,
  ensureTasksDir,
  getAgentStatuses,
  getTask,
  getTaskListId,
  getTaskPath,
  getTasksDir,
  isTodoV2Enabled,
  listTasks,
  notifyTasksUpdated,
  onTasksUpdated,
  resetTaskList,
  sanitizePathComponent,
  setLeaderTeamName,
  unassignTeammateTasks,
  updateTask
};
