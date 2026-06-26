const rename = {
  type: "local-jsx",
  name: "rename",
  description: "Rename the current conversation",
  immediate: true,
  argumentHint: "[name]",
  load: () => import("./rename.js")
};
var rename_default = rename;
export {
  rename_default as default
};
