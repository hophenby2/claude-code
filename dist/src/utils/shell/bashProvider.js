const feature = (_name) => false;
import { access } from "fs/promises";
import { tmpdir as osTmpdir } from "os";
import { join as nativeJoin } from "path";
import { join as posixJoin } from "path/posix";
import { rearrangePipeCommand } from "../bash/bashPipeCommand.js";
import { createAndSaveSnapshot } from "../bash/ShellSnapshot.js";
import { formatShellPrefixCommand } from "../bash/shellPrefix.js";
import { quote } from "../bash/shellQuote.js";
import {
  quoteShellCommand,
  rewriteWindowsNullRedirect,
  shouldAddStdinRedirect
} from "../bash/shellQuoting.js";
import { logForDebugging } from "../debug.js";
import { getPlatform } from "../platform.js";
import { getSessionEnvironmentScript } from "../sessionEnvironment.js";
import { getSessionEnvVars } from "../sessionEnvVars.js";
import {
  ensureSocketInitialized,
  getClaudeTmuxEnv,
  hasTmuxToolBeenUsed
} from "../tmuxSocket.js";
import { windowsPathToPosixPath } from "../windowsPaths.js";
function getDisableExtglobCommand(shellPath) {
  if (process.env.CLAUDE_CODE_SHELL_PREFIX) {
    return "{ shopt -u extglob || setopt NO_EXTENDED_GLOB; } >/dev/null 2>&1 || true";
  }
  if (shellPath.includes("bash")) {
    return "shopt -u extglob 2>/dev/null || true";
  } else if (shellPath.includes("zsh")) {
    return "setopt NO_EXTENDED_GLOB 2>/dev/null || true";
  }
  return null;
}
async function createBashShellProvider(shellPath, options) {
  let currentSandboxTmpDir;
  const snapshotPromise = options?.skipSnapshot ? Promise.resolve(void 0) : createAndSaveSnapshot(shellPath).catch((error) => {
    logForDebugging(`Failed to create shell snapshot: ${error}`);
    return void 0;
  });
  let lastSnapshotFilePath;
  return {
    type: "bash",
    shellPath,
    detached: true,
    async buildExecCommand(command, opts) {
      let snapshotFilePath = await snapshotPromise;
      if (snapshotFilePath) {
        try {
          await access(snapshotFilePath);
        } catch {
          logForDebugging(
            `Snapshot file missing, falling back to login shell: ${snapshotFilePath}`
          );
          snapshotFilePath = void 0;
        }
      }
      lastSnapshotFilePath = snapshotFilePath;
      currentSandboxTmpDir = opts.sandboxTmpDir;
      const tmpdir = osTmpdir();
      const isWindows = getPlatform() === "windows";
      const shellTmpdir = isWindows ? windowsPathToPosixPath(tmpdir) : tmpdir;
      const shellCwdFilePath = opts.useSandbox ? posixJoin(opts.sandboxTmpDir, `cwd-${opts.id}`) : posixJoin(shellTmpdir, `claude-${opts.id}-cwd`);
      const cwdFilePath = opts.useSandbox ? posixJoin(opts.sandboxTmpDir, `cwd-${opts.id}`) : nativeJoin(tmpdir, `claude-${opts.id}-cwd`);
      const normalizedCommand = rewriteWindowsNullRedirect(command);
      const addStdinRedirect = shouldAddStdinRedirect(normalizedCommand);
      let quotedCommand = quoteShellCommand(normalizedCommand, addStdinRedirect);
      if (false) {
        logForDebugging(
          `Shell: Command before quoting (first 500 chars):
${command.slice(0, 500)}`
        );
        logForDebugging(
          `Shell: Quoted command (first 500 chars):
${quotedCommand.slice(0, 500)}`
        );
      }
      if (normalizedCommand.includes("|") && addStdinRedirect) {
        quotedCommand = rearrangePipeCommand(normalizedCommand);
      }
      const commandParts = [];
      if (snapshotFilePath) {
        const finalPath = getPlatform() === "windows" ? windowsPathToPosixPath(snapshotFilePath) : snapshotFilePath;
        commandParts.push(`source ${quote([finalPath])} 2>/dev/null || true`);
      }
      const sessionEnvScript = await getSessionEnvironmentScript();
      if (sessionEnvScript) {
        commandParts.push(sessionEnvScript);
      }
      const disableExtglobCmd = getDisableExtglobCommand(shellPath);
      if (disableExtglobCmd) {
        commandParts.push(disableExtglobCmd);
      }
      commandParts.push(`eval ${quotedCommand}`);
      commandParts.push(`pwd -P >| ${quote([shellCwdFilePath])}`);
      let commandString = commandParts.join(" && ");
      if (process.env.CLAUDE_CODE_SHELL_PREFIX) {
        commandString = formatShellPrefixCommand(
          process.env.CLAUDE_CODE_SHELL_PREFIX,
          commandString
        );
      }
      return { commandString, cwdFilePath };
    },
    getSpawnArgs(commandString) {
      const skipLoginShell = lastSnapshotFilePath !== void 0;
      if (skipLoginShell) {
        logForDebugging("Spawning shell without login (-l flag skipped)");
      }
      return ["-c", ...skipLoginShell ? [] : ["-l"], commandString];
    },
    async getEnvironmentOverrides(command) {
      const commandUsesTmux = command.includes("tmux");
      if (process.env.USER_TYPE === "ant" && (hasTmuxToolBeenUsed() || commandUsesTmux)) {
        await ensureSocketInitialized();
      }
      const claudeTmuxEnv = getClaudeTmuxEnv();
      const env = {};
      if (claudeTmuxEnv) {
        env.TMUX = claudeTmuxEnv;
      }
      if (currentSandboxTmpDir) {
        let posixTmpDir = currentSandboxTmpDir;
        if (getPlatform() === "windows") {
          posixTmpDir = windowsPathToPosixPath(posixTmpDir);
        }
        env.TMPDIR = posixTmpDir;
        env.CLAUDE_CODE_TMPDIR = posixTmpDir;
        env.TMPPREFIX = posixJoin(posixTmpDir, "zsh");
      }
      for (const [key, value] of getSessionEnvVars()) {
        env[key] = value;
      }
      return env;
    }
  };
}
export {
  createBashShellProvider
};
