import { splitCommand_DEPRECATED } from "../../utils/bash/commands.js";
const ACCEPT_EDITS_ALLOWED_COMMANDS = [
  "mkdir",
  "touch",
  "rm",
  "rmdir",
  "mv",
  "cp",
  "sed"
];
function isFilesystemCommand(command) {
  return ACCEPT_EDITS_ALLOWED_COMMANDS.includes(command);
}
function validateCommandForMode(cmd, toolPermissionContext) {
  const trimmedCmd = cmd.trim();
  const [baseCmd] = trimmedCmd.split(/\s+/);
  if (!baseCmd) {
    return {
      behavior: "passthrough",
      message: "Base command not found"
    };
  }
  if (toolPermissionContext.mode === "acceptEdits" && isFilesystemCommand(baseCmd)) {
    return {
      behavior: "allow",
      updatedInput: { command: cmd },
      decisionReason: {
        type: "mode",
        mode: "acceptEdits"
      }
    };
  }
  return {
    behavior: "passthrough",
    message: `No mode-specific handling for '${baseCmd}' in ${toolPermissionContext.mode} mode`
  };
}
function checkPermissionMode(input, toolPermissionContext) {
  if (toolPermissionContext.mode === "bypassPermissions") {
    return {
      behavior: "passthrough",
      message: "Bypass mode is handled in main permission flow"
    };
  }
  if (toolPermissionContext.mode === "dontAsk") {
    return {
      behavior: "passthrough",
      message: "DontAsk mode is handled in main permission flow"
    };
  }
  const commands = splitCommand_DEPRECATED(input.command);
  for (const cmd of commands) {
    const result = validateCommandForMode(cmd, toolPermissionContext);
    if (result.behavior !== "passthrough") {
      return result;
    }
  }
  return {
    behavior: "passthrough",
    message: "No mode-specific validation required"
  };
}
function getAutoAllowedCommands(mode) {
  return mode === "acceptEdits" ? ACCEPT_EDITS_ALLOWED_COMMANDS : [];
}
export {
  checkPermissionMode,
  getAutoAllowedCommands
};
