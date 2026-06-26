const command = {
  name: "vim",
  description: "Toggle between Vim and Normal editing modes",
  supportsNonInteractive: false,
  type: "local",
  load: () => import("./vim.js")
};
var vim_default = command;
export {
  vim_default as default
};
