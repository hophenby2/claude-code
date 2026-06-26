const command = {
  type: "local-jsx",
  name: "fork",
  description: "Fork commands are not available in this reconstructed build.",
  isEnabled: () => false,
  load: async () => ({
    async call() {
      return null;
    }
  })
};
var fork_default = command;
export {
  fork_default as default
};
