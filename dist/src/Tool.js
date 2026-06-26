const getEmptyToolPermissionContext = () => ({
  mode: "default",
  additionalWorkingDirectories: /* @__PURE__ */ new Map(),
  alwaysAllowRules: {},
  alwaysDenyRules: {},
  alwaysAskRules: {},
  isBypassPermissionsModeAvailable: false
});
function filterToolProgressMessages(progressMessagesForMessage) {
  return progressMessagesForMessage.filter(
    (msg) => msg.data?.type !== "hook_progress"
  );
}
function toolMatchesName(tool, name) {
  return tool.name === name || (tool.aliases?.includes(name) ?? false);
}
function findToolByName(tools, name) {
  return tools.find((t) => toolMatchesName(t, name));
}
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: (_input) => false,
  isReadOnly: (_input) => false,
  isDestructive: (_input) => false,
  checkPermissions: (input, _ctx) => Promise.resolve({ behavior: "allow", updatedInput: input }),
  toAutoClassifierInput: (_input) => "",
  userFacingName: (_input) => ""
};
function buildTool(def) {
  return {
    ...TOOL_DEFAULTS,
    userFacingName: () => def.name,
    ...def
  };
}
export {
  buildTool,
  filterToolProgressMessages,
  findToolByName,
  getEmptyToolPermissionContext,
  toolMatchesName
};
