const stats = {
  type: "local-jsx",
  name: "stats",
  description: "Show your Claude Code usage statistics and activity",
  load: () => import("./stats.js")
};
var stats_default = stats;
export {
  stats_default as default
};
