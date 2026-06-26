import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import { logEvent } from "../services/analytics/index.js";
import { isEnvDefinedFalsy, isEnvTruthy } from "./envUtils.js";
function isMcpInstructionsDeltaEnabled() {
  if (isEnvTruthy(process.env.CLAUDE_CODE_MCP_INSTR_DELTA)) return true;
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_MCP_INSTR_DELTA)) return false;
  return process.env.USER_TYPE === "ant" || getFeatureValue_CACHED_MAY_BE_STALE("tengu_basalt_3kr", false);
}
function getMcpInstructionsDelta(mcpClients, messages, clientSideInstructions) {
  const announced = /* @__PURE__ */ new Set();
  let attachmentCount = 0;
  let midCount = 0;
  for (const msg of messages) {
    if (msg.type !== "attachment") continue;
    attachmentCount++;
    if (msg.attachment.type !== "mcp_instructions_delta") continue;
    midCount++;
    for (const n of msg.attachment.addedNames) announced.add(n);
    for (const n of msg.attachment.removedNames) announced.delete(n);
  }
  const connected = mcpClients.filter(
    (c) => c.type === "connected"
  );
  const connectedNames = new Set(connected.map((c) => c.name));
  const blocks = /* @__PURE__ */ new Map();
  for (const c of connected) {
    if (c.instructions) blocks.set(c.name, `## ${c.name}
${c.instructions}`);
  }
  for (const ci of clientSideInstructions) {
    if (!connectedNames.has(ci.serverName)) continue;
    const existing = blocks.get(ci.serverName);
    blocks.set(
      ci.serverName,
      existing ? `${existing}

${ci.block}` : `## ${ci.serverName}
${ci.block}`
    );
  }
  const added = [];
  for (const [name, block] of blocks) {
    if (!announced.has(name)) added.push({ name, block });
  }
  const removed = [];
  for (const n of announced) {
    if (!connectedNames.has(n)) removed.push(n);
  }
  if (added.length === 0 && removed.length === 0) return null;
  logEvent("tengu_mcp_instructions_pool_change", {
    addedCount: added.length,
    removedCount: removed.length,
    priorAnnouncedCount: announced.size,
    clientSideCount: clientSideInstructions.length,
    messagesLength: messages.length,
    attachmentCount,
    midCount
  });
  added.sort((a, b) => a.name.localeCompare(b.name));
  return {
    addedNames: added.map((a) => a.name),
    addedBlocks: added.map((a) => a.block),
    removedNames: removed.sort()
  };
}
export {
  getMcpInstructionsDelta,
  isMcpInstructionsDeltaEnabled
};
