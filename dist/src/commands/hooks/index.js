const hooks = {
  type: "local-jsx",
  name: "hooks",
  description: "View hook configurations for tool events",
  immediate: true,
  load: () => import("./hooks.js")
};
var hooks_default = hooks;
export {
  hooks_default as default
};
