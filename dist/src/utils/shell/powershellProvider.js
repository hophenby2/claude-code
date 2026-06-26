import { tmpdir } from "os";
import { join } from "path";
import { join as posixJoin } from "path/posix";
import { getSessionEnvVars } from "../sessionEnvVars.js";
function buildPowerShellArgs(cmd) {
  return ["-NoProfile", "-NonInteractive", "-Command", cmd];
}
function encodePowerShellCommand(psCommand) {
  return Buffer.from(psCommand, "utf16le").toString("base64");
}
function createPowerShellProvider(shellPath) {
  let currentSandboxTmpDir;
  return {
    type: "powershell",
    shellPath,
    detached: false,
    async buildExecCommand(command, opts) {
      currentSandboxTmpDir = opts.useSandbox ? opts.sandboxTmpDir : void 0;
      const cwdFilePath = opts.useSandbox && opts.sandboxTmpDir ? posixJoin(opts.sandboxTmpDir, `claude-pwd-ps-${opts.id}`) : join(tmpdir(), `claude-pwd-ps-${opts.id}`);
      const escapedCwdFilePath = cwdFilePath.replace(/'/g, "''");
      const cwdTracking = `
; $_ec = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }
; (Get-Location).Path | Out-File -FilePath '${escapedCwdFilePath}' -Encoding utf8 -NoNewline
; exit $_ec`;
      const psCommand = command + cwdTracking;
      const commandString = opts.useSandbox ? [
        `'${shellPath.replace(/'/g, `'\\''`)}'`,
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encodePowerShellCommand(psCommand)
      ].join(" ") : psCommand;
      return { commandString, cwdFilePath };
    },
    getSpawnArgs(commandString) {
      return buildPowerShellArgs(commandString);
    },
    async getEnvironmentOverrides() {
      const env = {};
      for (const [key, value] of getSessionEnvVars()) {
        env[key] = value;
      }
      if (currentSandboxTmpDir) {
        env.TMPDIR = currentSandboxTmpDir;
        env.CLAUDE_CODE_TMPDIR = currentSandboxTmpDir;
      }
      return env;
    }
  };
}
export {
  buildPowerShellArgs,
  createPowerShellProvider
};
