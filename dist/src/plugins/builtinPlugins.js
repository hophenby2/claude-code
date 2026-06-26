import { getSettings_DEPRECATED } from "../utils/settings/settings.js";
const BUILTIN_PLUGINS = /* @__PURE__ */ new Map();
const BUILTIN_MARKETPLACE_NAME = "builtin";
function registerBuiltinPlugin(definition) {
  BUILTIN_PLUGINS.set(definition.name, definition);
}
function isBuiltinPluginId(pluginId) {
  return pluginId.endsWith(`@${BUILTIN_MARKETPLACE_NAME}`);
}
function getBuiltinPluginDefinition(name) {
  return BUILTIN_PLUGINS.get(name);
}
function getBuiltinPlugins() {
  const settings = getSettings_DEPRECATED();
  const enabled = [];
  const disabled = [];
  for (const [name, definition] of BUILTIN_PLUGINS) {
    if (definition.isAvailable && !definition.isAvailable()) {
      continue;
    }
    const pluginId = `${name}@${BUILTIN_MARKETPLACE_NAME}`;
    const userSetting = settings?.enabledPlugins?.[pluginId];
    const isEnabled = userSetting !== void 0 ? userSetting === true : definition.defaultEnabled ?? true;
    const plugin = {
      name,
      manifest: {
        name,
        description: definition.description,
        version: definition.version
      },
      path: BUILTIN_MARKETPLACE_NAME,
      // sentinel — no filesystem path
      source: pluginId,
      repository: pluginId,
      enabled: isEnabled,
      isBuiltin: true,
      hooksConfig: definition.hooks,
      mcpServers: definition.mcpServers
    };
    if (isEnabled) {
      enabled.push(plugin);
    } else {
      disabled.push(plugin);
    }
  }
  return { enabled, disabled };
}
function getBuiltinPluginSkillCommands() {
  const { enabled } = getBuiltinPlugins();
  const commands = [];
  for (const plugin of enabled) {
    const definition = BUILTIN_PLUGINS.get(plugin.name);
    if (!definition?.skills) continue;
    for (const skill of definition.skills) {
      commands.push(skillDefinitionToCommand(skill));
    }
  }
  return commands;
}
function clearBuiltinPlugins() {
  BUILTIN_PLUGINS.clear();
}
function skillDefinitionToCommand(definition) {
  return {
    type: "prompt",
    name: definition.name,
    description: definition.description,
    hasUserSpecifiedDescription: true,
    allowedTools: definition.allowedTools ?? [],
    argumentHint: definition.argumentHint,
    whenToUse: definition.whenToUse,
    model: definition.model,
    disableModelInvocation: definition.disableModelInvocation ?? false,
    userInvocable: definition.userInvocable ?? true,
    contentLength: 0,
    // 'bundled' not 'builtin' — 'builtin' in Command.source means hardcoded
    // slash commands (/help, /clear). Using 'bundled' keeps these skills in
    // the Skill tool's listing, analytics name logging, and prompt-truncation
    // exemption. The user-toggleable aspect is tracked on LoadedPlugin.isBuiltin.
    source: "bundled",
    loadedFrom: "bundled",
    hooks: definition.hooks,
    context: definition.context,
    agent: definition.agent,
    isEnabled: definition.isEnabled ?? (() => true),
    isHidden: !(definition.userInvocable ?? true),
    progressMessage: "running",
    getPromptForCommand: definition.getPromptForCommand
  };
}
export {
  BUILTIN_MARKETPLACE_NAME,
  clearBuiltinPlugins,
  getBuiltinPluginDefinition,
  getBuiltinPluginSkillCommands,
  getBuiltinPlugins,
  isBuiltinPluginId,
  registerBuiltinPlugin
};
