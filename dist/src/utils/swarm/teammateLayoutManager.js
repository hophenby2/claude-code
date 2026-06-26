import { AGENT_COLORS } from "../../tools/AgentTool/agentColorManager.js";
import { detectAndGetBackend } from "./backends/registry.js";
const teammateColorAssignments = /* @__PURE__ */ new Map();
let colorIndex = 0;
async function getBackend() {
  return (await detectAndGetBackend()).backend;
}
function assignTeammateColor(teammateId) {
  const existing = teammateColorAssignments.get(teammateId);
  if (existing) {
    return existing;
  }
  const color = AGENT_COLORS[colorIndex % AGENT_COLORS.length];
  teammateColorAssignments.set(teammateId, color);
  colorIndex++;
  return color;
}
function getTeammateColor(teammateId) {
  return teammateColorAssignments.get(teammateId);
}
function clearTeammateColors() {
  teammateColorAssignments.clear();
  colorIndex = 0;
}
async function isInsideTmux() {
  const { isInsideTmux: checkTmux } = await import("./backends/detection.js");
  return checkTmux();
}
async function createTeammatePaneInSwarmView(teammateName, teammateColor) {
  const backend = await getBackend();
  return backend.createTeammatePaneInSwarmView(teammateName, teammateColor);
}
async function enablePaneBorderStatus(windowTarget, useSwarmSocket = false) {
  const backend = await getBackend();
  return backend.enablePaneBorderStatus(windowTarget, useSwarmSocket);
}
async function sendCommandToPane(paneId, command, useSwarmSocket = false) {
  const backend = await getBackend();
  return backend.sendCommandToPane(paneId, command, useSwarmSocket);
}
export {
  assignTeammateColor,
  clearTeammateColors,
  createTeammatePaneInSwarmView,
  enablePaneBorderStatus,
  getTeammateColor,
  isInsideTmux,
  sendCommandToPane
};
