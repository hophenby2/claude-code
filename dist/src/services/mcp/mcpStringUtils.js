import { normalizeNameForMCP } from "./normalization.js";
function mcpInfoFromString(toolString) {
  const parts = toolString.split("__");
  const [mcpPart, serverName, ...toolNameParts] = parts;
  if (mcpPart !== "mcp" || !serverName) {
    return null;
  }
  const toolName = toolNameParts.length > 0 ? toolNameParts.join("__") : void 0;
  return { serverName, toolName };
}
function getMcpPrefix(serverName) {
  return `mcp__${normalizeNameForMCP(serverName)}__`;
}
function buildMcpToolName(serverName, toolName) {
  return `${getMcpPrefix(serverName)}${normalizeNameForMCP(toolName)}`;
}
function getToolNameForPermissionCheck(tool) {
  return tool.mcpInfo ? buildMcpToolName(tool.mcpInfo.serverName, tool.mcpInfo.toolName) : tool.name;
}
function getMcpDisplayName(fullName, serverName) {
  const prefix = `mcp__${normalizeNameForMCP(serverName)}__`;
  return fullName.replace(prefix, "");
}
function extractMcpToolDisplayName(userFacingName) {
  let withoutSuffix = userFacingName.replace(/\s*\(MCP\)\s*$/, "");
  withoutSuffix = withoutSuffix.trim();
  const dashIndex = withoutSuffix.indexOf(" - ");
  if (dashIndex !== -1) {
    const displayName = withoutSuffix.substring(dashIndex + 3).trim();
    return displayName;
  }
  return withoutSuffix;
}
export {
  buildMcpToolName,
  extractMcpToolDisplayName,
  getMcpDisplayName,
  getMcpPrefix,
  getToolNameForPermissionCheck,
  mcpInfoFromString
};
