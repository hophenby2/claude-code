const addDir = {
  type: "local-jsx",
  name: "add-dir",
  description: "Add a new working directory",
  argumentHint: "<path>",
  load: () => import("./add-dir.js")
};
var add_dir_default = addDir;
export {
  add_dir_default as default
};
