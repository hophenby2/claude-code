import { execFileSync, spawn } from "child_process";
import { constants as fsConstants, readFileSync, unlinkSync } from "fs";
import { mkdir, open, realpath } from "fs/promises";
import memoize from "lodash-es/memoize.js";
import { isAbsolute, resolve } from "path";
import { join as posixJoin } from "path/posix";
import { logEvent } from "../services/analytics/index.js";
import {
  getOriginalCwd,
  getSessionId,
  setCwdState
} from "../bootstrap/state.js";
import { generateTaskId } from "../Task.js";
import { pwd } from "./cwd.js";
import { logForDebugging } from "./debug.js";
import { errorMessage, isENOENT } from "./errors.js";
import { getFsImplementation } from "./fsOperations.js";
import { logError } from "./log.js";
import {
  createAbortedCommand,
  createFailedCommand,
  wrapSpawn
} from "./ShellCommand.js";
import { getTaskOutputDir } from "./task/diskOutput.js";
import { TaskOutput } from "./task/TaskOutput.js";
import { which } from "./which.js";
import { accessSync } from "fs";
import { onCwdChangedForHooks } from "./hooks/fileChangedWatcher.js";
import { getClaudeTempDirName } from "./permissions/filesystem.js";
import { getPlatform } from "./platform.js";
import { SandboxManager } from "./sandbox/sandbox-adapter.js";
import { invalidateSessionEnvCache } from "./sessionEnvironment.js";
import { createBashShellProvider } from "./shell/bashProvider.js";
import { getCachedPowerShellPath } from "./shell/powershellDetection.js";
import { createPowerShellProvider } from "./shell/powershellProvider.js";
import { subprocessEnv } from "./subprocessEnv.js";
import { posixPathToWindowsPath } from "./windowsPaths.js";
const DEFAULT_TIMEOUT = 30 * 60 * 1e3;
function isExecutable(shellPath) {
  try {
    accessSync(shellPath, fsConstants.X_OK);
    return true;
  } catch (_err) {
    try {
      execFileSync(shellPath, ["--version"], {
        timeout: 1e3,
        stdio: "ignore"
      });
      return true;
    } catch {
      return false;
    }
  }
}
async function findSuitableShell() {
  const shellOverride = process.env.CLAUDE_CODE_SHELL;
  if (shellOverride) {
    const isSupported = shellOverride.includes("bash") || shellOverride.includes("zsh");
    if (isSupported && isExecutable(shellOverride)) {
      logForDebugging(`Using shell override: ${shellOverride}`);
      return shellOverride;
    } else {
      logForDebugging(
        `CLAUDE_CODE_SHELL="${shellOverride}" is not a valid bash/zsh path, falling back to detection`
      );
    }
  }
  const env_shell = process.env.SHELL;
  const isEnvShellSupported = env_shell && (env_shell.includes("bash") || env_shell.includes("zsh"));
  const preferBash = env_shell?.includes("bash");
  const [zshPath, bashPath] = await Promise.all([which("zsh"), which("bash")]);
  const shellPaths = ["/bin", "/usr/bin", "/usr/local/bin", "/opt/homebrew/bin"];
  const shellOrder = preferBash ? ["bash", "zsh"] : ["zsh", "bash"];
  const supportedShells = shellOrder.flatMap(
    (shell) => shellPaths.map((path) => `${path}/${shell}`)
  );
  if (preferBash) {
    if (bashPath) supportedShells.unshift(bashPath);
    if (zshPath) supportedShells.push(zshPath);
  } else {
    if (zshPath) supportedShells.unshift(zshPath);
    if (bashPath) supportedShells.push(bashPath);
  }
  if (isEnvShellSupported && isExecutable(env_shell)) {
    supportedShells.unshift(env_shell);
  }
  const shellPath = supportedShells.find((shell) => shell && isExecutable(shell));
  if (!shellPath) {
    const errorMsg = "No suitable shell found. Claude CLI requires a Posix shell environment. Please ensure you have a valid shell installed and the SHELL environment variable set.";
    logError(new Error(errorMsg));
    throw new Error(errorMsg);
  }
  return shellPath;
}
async function getShellConfigImpl() {
  const binShell = await findSuitableShell();
  const provider = await createBashShellProvider(binShell);
  return { provider };
}
const getShellConfig = memoize(getShellConfigImpl);
const getPsProvider = memoize(async () => {
  const psPath = await getCachedPowerShellPath();
  if (!psPath) {
    throw new Error("PowerShell is not available");
  }
  return createPowerShellProvider(psPath);
});
const resolveProvider = {
  bash: async () => (await getShellConfig()).provider,
  powershell: getPsProvider
};
async function exec(command, abortSignal, shellType, options) {
  const {
    timeout,
    onProgress,
    preventCwdChanges,
    shouldUseSandbox,
    shouldAutoBackground,
    onStdout
  } = options ?? {};
  const commandTimeout = timeout || DEFAULT_TIMEOUT;
  const provider = await resolveProvider[shellType]();
  const id = Math.floor(Math.random() * 65536).toString(16).padStart(4, "0");
  const sandboxTmpDir = posixJoin(
    process.env.CLAUDE_CODE_TMPDIR || "/tmp",
    getClaudeTempDirName()
  );
  const { commandString: builtCommand, cwdFilePath } = await provider.buildExecCommand(command, {
    id,
    sandboxTmpDir: shouldUseSandbox ? sandboxTmpDir : void 0,
    useSandbox: shouldUseSandbox ?? false
  });
  let commandString = builtCommand;
  let cwd = pwd();
  try {
    await realpath(cwd);
  } catch {
    const fallback = getOriginalCwd();
    logForDebugging(
      `Shell CWD "${cwd}" no longer exists, recovering to "${fallback}"`
    );
    try {
      await realpath(fallback);
      setCwdState(fallback);
      cwd = fallback;
    } catch {
      return createFailedCommand(
        `Working directory "${cwd}" no longer exists. Please restart Claude from an existing directory.`
      );
    }
  }
  if (abortSignal.aborted) {
    return createAbortedCommand();
  }
  const binShell = provider.shellPath;
  const isSandboxedPowerShell = shouldUseSandbox && shellType === "powershell";
  const sandboxBinShell = isSandboxedPowerShell ? "/bin/sh" : binShell;
  if (shouldUseSandbox) {
    commandString = await SandboxManager.wrapWithSandbox(
      commandString,
      sandboxBinShell,
      void 0,
      abortSignal
    );
    try {
      const fs = getFsImplementation();
      await fs.mkdir(sandboxTmpDir, { mode: 448 });
    } catch (error) {
      logForDebugging(`Failed to create ${sandboxTmpDir} directory: ${error}`);
    }
  }
  const spawnBinary = isSandboxedPowerShell ? "/bin/sh" : binShell;
  const shellArgs = isSandboxedPowerShell ? ["-c", commandString] : provider.getSpawnArgs(commandString);
  const envOverrides = await provider.getEnvironmentOverrides(command);
  const usePipeMode = !!onStdout;
  const taskId = generateTaskId("local_bash");
  const taskOutput = new TaskOutput(taskId, onProgress ?? null, !usePipeMode);
  await mkdir(getTaskOutputDir(), { recursive: true });
  let outputHandle;
  if (!usePipeMode) {
    const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
    outputHandle = await open(
      taskOutput.path,
      process.platform === "win32" ? "w" : fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_APPEND | O_NOFOLLOW
    );
  }
  try {
    const childProcess = spawn(spawnBinary, shellArgs, {
      env: {
        ...subprocessEnv(),
        SHELL: shellType === "bash" ? binShell : void 0,
        GIT_EDITOR: "true",
        CLAUDECODE: "1",
        ...envOverrides,
        ...process.env.USER_TYPE === "ant" ? {
          CLAUDE_CODE_SESSION_ID: getSessionId()
        } : {}
      },
      cwd,
      stdio: usePipeMode ? ["pipe", "pipe", "pipe"] : ["pipe", outputHandle?.fd, outputHandle?.fd],
      // Don't pass the signal - we'll handle termination ourselves with tree-kill
      detached: provider.detached,
      // Prevent visible console window on Windows (no-op on other platforms)
      windowsHide: true
    });
    const shellCommand = wrapSpawn(
      childProcess,
      abortSignal,
      commandTimeout,
      taskOutput,
      shouldAutoBackground
    );
    if (outputHandle !== void 0) {
      try {
        await outputHandle.close();
      } catch {
      }
    }
    if (childProcess.stdout && onStdout) {
      childProcess.stdout.on("data", (chunk) => {
        onStdout(typeof chunk === "string" ? chunk : chunk.toString());
      });
    }
    const nativeCwdFilePath = getPlatform() === "windows" ? posixPathToWindowsPath(cwdFilePath) : cwdFilePath;
    void shellCommand.result.then(async (result) => {
      if (shouldUseSandbox) {
        SandboxManager.cleanupAfterCommand();
      }
      if (result && !preventCwdChanges && !result.backgroundTaskId) {
        try {
          let newCwd = readFileSync(nativeCwdFilePath, {
            encoding: "utf8"
          }).trim();
          if (getPlatform() === "windows") {
            newCwd = posixPathToWindowsPath(newCwd);
          }
          if (newCwd.normalize("NFC") !== cwd) {
            setCwd(newCwd, cwd);
            invalidateSessionEnvCache();
            void onCwdChangedForHooks(cwd, newCwd);
          }
        } catch {
          logEvent("tengu_shell_set_cwd", { success: false });
        }
      }
      try {
        unlinkSync(nativeCwdFilePath);
      } catch {
      }
    });
    return shellCommand;
  } catch (error) {
    if (outputHandle !== void 0) {
      try {
        await outputHandle.close();
      } catch {
      }
    }
    taskOutput.clear();
    logForDebugging(`Shell exec error: ${errorMessage(error)}`);
    return createAbortedCommand(void 0, {
      code: 126,
      // Standard Unix code for execution errors
      stderr: errorMessage(error)
    });
  }
}
function setCwd(path, relativeTo) {
  const resolved = isAbsolute(path) ? path : resolve(relativeTo || getFsImplementation().cwd(), path);
  let physicalPath;
  try {
    physicalPath = getFsImplementation().realpathSync(resolved);
  } catch (e) {
    if (isENOENT(e)) {
      throw new Error(`Path "${resolved}" does not exist`);
    }
    throw e;
  }
  setCwdState(physicalPath);
  if (process.env.NODE_ENV !== "test") {
    try {
      logEvent("tengu_shell_set_cwd", {
        success: true
      });
    } catch (_error) {
    }
  }
}
export {
  exec,
  findSuitableShell,
  getPsProvider,
  getShellConfig,
  setCwd
};
