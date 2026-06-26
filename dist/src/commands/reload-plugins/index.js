const reloadPlugins = {
  type: "local",
  name: "reload-plugins",
  description: "Activate pending plugin changes in the current session",
  // SDK callers use query.reloadPlugins() (control request) instead of
  // sending this as a text prompt — that returns structured data
  // (commands, agents, plugins, mcpServers) for UI updates.
  supportsNonInteractive: false,
  load: () => import("./reload-plugins.js")
};
var reload_plugins_default = reloadPlugins;
export {
  reload_plugins_default as default
};
