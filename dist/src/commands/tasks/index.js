const tasks = {
  type: "local-jsx",
  name: "tasks",
  aliases: ["bashes"],
  description: "List and manage background tasks",
  load: () => import("./tasks.js")
};
var tasks_default = tasks;
export {
  tasks_default as default
};
