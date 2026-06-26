const agents = {
  type: "local-jsx",
  name: "agents",
  description: "Manage agent configurations",
  load: () => import("./agents.js")
};
var agents_default = agents;
export {
  agents_default as default
};
