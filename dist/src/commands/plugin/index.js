const plugin = {
  type: "local-jsx",
  name: "plugin",
  aliases: ["plugins", "marketplace"],
  description: "Manage Claude Code plugins",
  immediate: true,
  load: () => import("./plugin.js")
};
var plugin_default = plugin;
export {
  plugin_default as default
};
