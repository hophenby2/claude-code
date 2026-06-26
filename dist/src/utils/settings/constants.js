import { getAllowedSettingSources } from "../../bootstrap/state.js";
const SETTING_SOURCES = [
  // User settings (global)
  "userSettings",
  // Project settings (shared per-directory)
  "projectSettings",
  // Local settings (gitignored)
  "localSettings",
  // Flag settings (from --settings flag)
  "flagSettings",
  // Policy settings (managed-settings.json or remote settings from API)
  "policySettings"
];
function getSettingSourceName(source) {
  switch (source) {
    case "userSettings":
      return "user";
    case "projectSettings":
      return "project";
    case "localSettings":
      return "project, gitignored";
    case "flagSettings":
      return "cli flag";
    case "policySettings":
      return "managed";
  }
}
function getSourceDisplayName(source) {
  switch (source) {
    case "userSettings":
      return "User";
    case "projectSettings":
      return "Project";
    case "localSettings":
      return "Local";
    case "flagSettings":
      return "Flag";
    case "policySettings":
      return "Managed";
    case "plugin":
      return "Plugin";
    case "built-in":
      return "Built-in";
  }
}
function getSettingSourceDisplayNameLowercase(source) {
  switch (source) {
    case "userSettings":
      return "user settings";
    case "projectSettings":
      return "shared project settings";
    case "localSettings":
      return "project local settings";
    case "flagSettings":
      return "command line arguments";
    case "policySettings":
      return "enterprise managed settings";
    case "cliArg":
      return "CLI argument";
    case "command":
      return "command configuration";
    case "session":
      return "current session";
  }
}
function getSettingSourceDisplayNameCapitalized(source) {
  switch (source) {
    case "userSettings":
      return "User settings";
    case "projectSettings":
      return "Shared project settings";
    case "localSettings":
      return "Project local settings";
    case "flagSettings":
      return "Command line arguments";
    case "policySettings":
      return "Enterprise managed settings";
    case "cliArg":
      return "CLI argument";
    case "command":
      return "Command configuration";
    case "session":
      return "Current session";
  }
}
function parseSettingSourcesFlag(flag) {
  if (flag === "") return [];
  const names = flag.split(",").map((s) => s.trim());
  const result = [];
  for (const name of names) {
    switch (name) {
      case "user":
        result.push("userSettings");
        break;
      case "project":
        result.push("projectSettings");
        break;
      case "local":
        result.push("localSettings");
        break;
      default:
        throw new Error(
          `Invalid setting source: ${name}. Valid options are: user, project, local`
        );
    }
  }
  return result;
}
function getEnabledSettingSources() {
  const allowed = getAllowedSettingSources();
  const result = new Set(allowed);
  result.add("policySettings");
  result.add("flagSettings");
  return Array.from(result);
}
function isSettingSourceEnabled(source) {
  const enabled = getEnabledSettingSources();
  return enabled.includes(source);
}
const SOURCES = [
  "localSettings",
  "projectSettings",
  "userSettings"
];
const CLAUDE_CODE_SETTINGS_SCHEMA_URL = "https://json.schemastore.org/claude-code-settings.json";
export {
  CLAUDE_CODE_SETTINGS_SCHEMA_URL,
  SETTING_SOURCES,
  SOURCES,
  getEnabledSettingSources,
  getSettingSourceDisplayNameCapitalized,
  getSettingSourceDisplayNameLowercase,
  getSettingSourceName,
  getSourceDisplayName,
  isSettingSourceEnabled,
  parseSettingSourcesFlag
};
