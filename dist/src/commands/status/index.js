const status = {
  type: "local-jsx",
  name: "status",
  description: "Show Claude Code status including version, model, account, API connectivity, and tool statuses",
  immediate: true,
  load: () => import("./status.js")
};
var status_default = status;
export {
  status_default as default
};
