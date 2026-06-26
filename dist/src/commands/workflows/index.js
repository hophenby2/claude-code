const command = {
  type: "local-jsx",
  name: "workflows",
  description: "Workflow commands are not available in this reconstructed build.",
  isEnabled: () => false,
  load: async () => ({
    async call() {
      return null;
    }
  })
};
var workflows_default = command;
export {
  workflows_default as default
};
