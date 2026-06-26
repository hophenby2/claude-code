const DEFAULT_SEMANTIC = (exitCode, _stdout, _stderr) => ({
  isError: exitCode !== 0,
  message: exitCode !== 0 ? `Command failed with exit code ${exitCode}` : void 0
});
const GREP_SEMANTIC = (exitCode, _stdout, _stderr) => ({
  isError: exitCode >= 2,
  message: exitCode === 1 ? "No matches found" : void 0
});
const COMMAND_SEMANTICS = /* @__PURE__ */ new Map([
  // External grep/ripgrep (Git for Windows, scoop, choco)
  ["grep", GREP_SEMANTIC],
  ["rg", GREP_SEMANTIC],
  // findstr.exe: Windows native text search
  // 0 = match found, 1 = no match, 2 = error
  ["findstr", GREP_SEMANTIC],
  // robocopy.exe: Windows native robust file copy
  // Exit codes are a BITFIELD — 0-7 are success, 8+ indicates at least one failure:
  //   0 = no files copied, no mismatch, no failures (already in sync)
  //   1 = files copied successfully
  //   2 = extra files/dirs detected (no copy)
  //   4 = mismatched files/dirs detected
  //   8 = some files/dirs could not be copied (copy errors)
  //  16 = serious error (robocopy did not copy any files)
  // This is the single most common "CI failed but nothing's wrong" Windows gotcha.
  [
    "robocopy",
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 8,
      message: exitCode === 0 ? "No files copied (already in sync)" : exitCode >= 1 && exitCode < 8 ? exitCode & 1 ? "Files copied successfully" : "Robocopy completed (no errors)" : void 0
    })
  ]
]);
function extractBaseCommand(segment) {
  const stripped = segment.trim().replace(/^[&.]\s+/, "");
  const firstToken = stripped.split(/\s+/)[0] || "";
  const unquoted = firstToken.replace(/^["']|["']$/g, "");
  const basename = unquoted.split(/[\\/]/).pop() || unquoted;
  return basename.toLowerCase().replace(/\.exe$/, "");
}
function heuristicallyExtractBaseCommand(command) {
  const segments = command.split(/[;|]/).filter((s) => s.trim());
  const last = segments[segments.length - 1] || command;
  return extractBaseCommand(last);
}
function interpretCommandResult(command, exitCode, stdout, stderr) {
  const baseCommand = heuristicallyExtractBaseCommand(command);
  const semantic = COMMAND_SEMANTICS.get(baseCommand) ?? DEFAULT_SEMANTIC;
  return semantic(exitCode, stdout, stderr);
}
export {
  interpretCommandResult
};
