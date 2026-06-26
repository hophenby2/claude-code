const exit = {
  type: "local-jsx",
  name: "exit",
  aliases: ["quit"],
  description: "Exit the REPL",
  immediate: true,
  load: () => import("./exit.js")
};
var exit_default = exit;
export {
  exit_default as default
};
