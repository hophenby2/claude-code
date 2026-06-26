let builders = null;
function registerMCPSkillBuilders(b) {
  builders = b;
}
function getMCPSkillBuilders() {
  if (!builders) {
    throw new Error(
      "MCP skill builders not registered \u2014 loadSkillsDir.ts has not been evaluated yet"
    );
  }
  return builders;
}
export {
  getMCPSkillBuilders,
  registerMCPSkillBuilders
};
