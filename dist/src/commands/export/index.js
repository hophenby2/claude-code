const exportCommand = {
  type: "local-jsx",
  name: "export",
  description: "Export the current conversation to a file or clipboard",
  argumentHint: "[filename]",
  load: () => import("./export.js")
};
var export_default = exportCommand;
export {
  export_default as default
};
