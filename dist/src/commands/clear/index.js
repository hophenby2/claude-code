const clear = {
  type: "local",
  name: "clear",
  description: "Clear conversation history and free up context",
  aliases: ["reset", "new"],
  supportsNonInteractive: false,
  // Should just create a new session
  load: () => import("./clear.js")
};
var clear_default = clear;
export {
  clear_default as default
};
