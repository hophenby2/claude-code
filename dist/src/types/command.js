function getCommandName(cmd) {
  return cmd.userFacingName?.() ?? cmd.name;
}
function isCommandEnabled(cmd) {
  return cmd.isEnabled?.() ?? true;
}
export {
  getCommandName,
  isCommandEnabled
};
