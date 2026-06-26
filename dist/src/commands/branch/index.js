const feature = (_name) => false;
const branch = {
  type: "local-jsx",
  name: "branch",
  // 'fork' alias only when /fork doesn't exist as its own command
  aliases: false ? [] : ["fork"],
  description: "Create a branch of the current conversation at this point",
  argumentHint: "[name]",
  load: () => import("./branch.js")
};
var branch_default = branch;
export {
  branch_default as default
};
