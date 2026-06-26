const nohup = {
  name: "nohup",
  description: "Run a command immune to hangups",
  args: {
    name: "command",
    description: "Command to run with nohup",
    isCommand: true
  }
};
var nohup_default = nohup;
export {
  nohup_default as default
};
