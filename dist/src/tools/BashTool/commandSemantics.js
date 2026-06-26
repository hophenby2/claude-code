import { splitCommand_DEPRECATED } from "../../utils/bash/commands.js";
const DEFAULT_SEMANTIC = (exitCode, _stdout, _stderr) => ({
  isError: exitCode !== 0,
  message: exitCode !== 0 ? `Command failed with exit code ${exitCode}` : void 0
});
const COMMAND_SEMANTICS = /* @__PURE__ */ new Map([
  // grep: 0=matches found, 1=no matches, 2+=error
  [
    "grep",
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? "No matches found" : void 0
    })
  ],
  // ripgrep has same semantics as grep
  [
    "rg",
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? "No matches found" : void 0
    })
  ],
  // find: 0=success, 1=partial success (some dirs inaccessible), 2+=error
  [
    "find",
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? "Some directories were inaccessible" : void 0
    })
  ],
  // diff: 0=no differences, 1=differences found, 2+=error
  [
    "diff",
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? "Files differ" : void 0
    })
  ],
  // test/[: 0=condition true, 1=condition false, 2+=error
  [
    "test",
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? "Condition is false" : void 0
    })
  ],
  // [ is an alias for test
  [
    "[",
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? "Condition is false" : void 0
    })
  ]
  // wc, head, tail, cat, etc.: these typically only fail on real errors
  // so we use default semantics
]);
function getCommandSemantic(command) {
  const baseCommand = heuristicallyExtractBaseCommand(command);
  const semantic = COMMAND_SEMANTICS.get(baseCommand);
  return semantic !== void 0 ? semantic : DEFAULT_SEMANTIC;
}
function extractBaseCommand(command) {
  return command.trim().split(/\s+/)[0] || "";
}
function heuristicallyExtractBaseCommand(command) {
  const segments = splitCommand_DEPRECATED(command);
  const lastCommand = segments[segments.length - 1] || command;
  return extractBaseCommand(lastCommand);
}
function interpretCommandResult(command, exitCode, stdout, stderr) {
  const semantic = getCommandSemantic(command);
  const result = semantic(exitCode, stdout, stderr);
  return {
    isError: result.isError,
    message: result.message
  };
}
export {
  interpretCommandResult
};
