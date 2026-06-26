const CLAUDEAI_SERVER_PREFIX = "claude.ai ";
function normalizeNameForMCP(name) {
  let normalized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (name.startsWith(CLAUDEAI_SERVER_PREFIX)) {
    normalized = normalized.replace(/_+/g, "_").replace(/^_|_$/g, "");
  }
  return normalized;
}
export {
  normalizeNameForMCP
};
