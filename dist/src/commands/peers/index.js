const command = {
  type: "local-jsx",
  name: "peers",
  description: "Peer commands are not available in this reconstructed build.",
  isEnabled: () => false,
  load: async () => ({
    async call() {
      return null;
    }
  })
};
var peers_default = command;
export {
  peers_default as default
};
