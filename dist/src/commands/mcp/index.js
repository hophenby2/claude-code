const mcp = {
  type: "local-jsx",
  name: "mcp",
  description: "Manage MCP servers",
  immediate: true,
  argumentHint: "[enable|disable [server-name]]",
  load: () => import("./mcp.js")
};
var mcp_default = mcp;
export {
  mcp_default as default
};
