const ide = {
  type: "local-jsx",
  name: "ide",
  description: "Manage IDE integrations and show status",
  argumentHint: "[open]",
  load: () => import("./ide.js")
};
var ide_default = ide;
export {
  ide_default as default
};
