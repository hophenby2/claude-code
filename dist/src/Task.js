import { randomBytes } from "crypto";
import { getTaskOutputPath } from "./utils/task/diskOutput.js";
function isTerminalTaskStatus(status) {
  return status === "completed" || status === "failed" || status === "killed";
}
const TASK_ID_PREFIXES = {
  local_bash: "b",
  // Keep as 'b' for backward compatibility
  local_agent: "a",
  remote_agent: "r",
  in_process_teammate: "t",
  local_workflow: "w",
  monitor_mcp: "m",
  dream: "d"
};
function getTaskIdPrefix(type) {
  return TASK_ID_PREFIXES[type] ?? "x";
}
const TASK_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
function generateTaskId(type) {
  const prefix = getTaskIdPrefix(type);
  const bytes = randomBytes(8);
  let id = prefix;
  for (let i = 0; i < 8; i++) {
    id += TASK_ID_ALPHABET[bytes[i] % TASK_ID_ALPHABET.length];
  }
  return id;
}
function createTaskStateBase(id, type, description, toolUseId) {
  return {
    id,
    type,
    status: "pending",
    description,
    toolUseId,
    startTime: Date.now(),
    outputFile: getTaskOutputPath(id),
    outputOffset: 0,
    notified: false
  };
}
export {
  createTaskStateBase,
  generateTaskId,
  isTerminalTaskStatus
};
