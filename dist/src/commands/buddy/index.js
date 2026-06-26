const command = {
  type: "local-jsx",
  name: "buddy",
  description: "Buddy commands are not available in this reconstructed build.",
  isEnabled: () => false,
  load: async () => ({
    async call() {
      return null;
    }
  })
};
var buddy_default = command;
export {
  buddy_default as default
};
