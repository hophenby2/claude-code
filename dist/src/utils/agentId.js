function formatAgentId(agentName, teamName) {
  return `${agentName}@${teamName}`;
}
function parseAgentId(agentId) {
  const atIndex = agentId.indexOf("@");
  if (atIndex === -1) {
    return null;
  }
  return {
    agentName: agentId.slice(0, atIndex),
    teamName: agentId.slice(atIndex + 1)
  };
}
function generateRequestId(requestType, agentId) {
  const timestamp = Date.now();
  return `${requestType}-${timestamp}@${agentId}`;
}
function parseRequestId(requestId) {
  const atIndex = requestId.indexOf("@");
  if (atIndex === -1) {
    return null;
  }
  const prefix = requestId.slice(0, atIndex);
  const agentId = requestId.slice(atIndex + 1);
  const lastDashIndex = prefix.lastIndexOf("-");
  if (lastDashIndex === -1) {
    return null;
  }
  const requestType = prefix.slice(0, lastDashIndex);
  const timestampStr = prefix.slice(lastDashIndex + 1);
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return null;
  }
  return { requestType, timestamp, agentId };
}
export {
  formatAgentId,
  generateRequestId,
  parseAgentId,
  parseRequestId
};
