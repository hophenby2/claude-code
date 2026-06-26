const help = {
  type: "local-jsx",
  name: "help",
  description: "Show help and available commands",
  load: () => import("./help.js")
};
var help_default = help;
export {
  help_default as default
};
