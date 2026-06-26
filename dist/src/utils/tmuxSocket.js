import { posix } from "path";
import { registerCleanup } from "./cleanupRegistry.js";
import { logForDebugging } from "./debug.js";
import { toError } from "./errors.js";
import { execFileNoThrow } from "./execFileNoThrow.js";
import { logError } from "./log.js";
import { getPlatform } from "./platform.js";
const TMUX_COMMAND = "tmux";
const CLAUDE_SOCKET_PREFIX = "claude";
async function execTmux(args, opts) {
  if (getPlatform() === "windows") {
    const result2 = await execFileNoThrow("wsl", ["-e", TMUX_COMMAND, ...args], {
      env: { ...process.env, WSL_UTF8: "1" },
      ...opts
    });
    return {
      stdout: result2.stdout || "",
      stderr: result2.stderr || "",
      code: result2.code || 0
    };
  }
  const result = await execFileNoThrow(TMUX_COMMAND, args, opts);
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    code: result.code || 0
  };
}
let socketName = null;
let socketPath = null;
let serverPid = null;
let isInitializing = false;
let initPromise = null;
let tmuxAvailabilityChecked = false;
let tmuxAvailable = false;
let tmuxToolUsed = false;
function getClaudeSocketName() {
  if (!socketName) {
    socketName = `${CLAUDE_SOCKET_PREFIX}-${process.pid}`;
  }
  return socketName;
}
function getClaudeSocketPath() {
  return socketPath;
}
function setClaudeSocketInfo(path, pid) {
  socketPath = path;
  serverPid = pid;
}
function isSocketInitialized() {
  return socketPath !== null && serverPid !== null;
}
function getClaudeTmuxEnv() {
  if (!socketPath || serverPid === null) {
    return null;
  }
  return `${socketPath},${serverPid},0`;
}
async function checkTmuxAvailable() {
  if (!tmuxAvailabilityChecked) {
    const result = getPlatform() === "windows" ? await execFileNoThrow("wsl", ["-e", TMUX_COMMAND, "-V"], {
      env: { ...process.env, WSL_UTF8: "1" },
      useCwd: false
    }) : await execFileNoThrow("which", [TMUX_COMMAND], {
      useCwd: false
    });
    tmuxAvailable = result.code === 0;
    if (!tmuxAvailable) {
      logForDebugging(
        `[Socket] tmux is not installed. The Tmux tool and Teammate tool will not be available.`
      );
    }
    tmuxAvailabilityChecked = true;
  }
  return tmuxAvailable;
}
function isTmuxAvailable() {
  return tmuxAvailabilityChecked && tmuxAvailable;
}
function markTmuxToolUsed() {
  tmuxToolUsed = true;
}
function hasTmuxToolBeenUsed() {
  return tmuxToolUsed;
}
async function ensureSocketInitialized() {
  if (isSocketInitialized()) {
    return;
  }
  const available = await checkTmuxAvailable();
  if (!available) {
    return;
  }
  if (isInitializing && initPromise) {
    try {
      await initPromise;
    } catch {
    }
    return;
  }
  isInitializing = true;
  initPromise = doInitialize();
  try {
    await initPromise;
  } catch (error) {
    const err = toError(error);
    logError(err);
    logForDebugging(
      `[Socket] Failed to initialize tmux socket: ${err.message}. Tmux isolation will be disabled.`
    );
  } finally {
    isInitializing = false;
  }
}
async function killTmuxServer() {
  const socket = getClaudeSocketName();
  logForDebugging(`[Socket] Killing tmux server for socket: ${socket}`);
  const result = await execTmux(["-L", socket, "kill-server"]);
  if (result.code === 0) {
    logForDebugging(`[Socket] Successfully killed tmux server`);
  } else {
    logForDebugging(
      `[Socket] Failed to kill tmux server (exit ${result.code}): ${result.stderr}`
    );
  }
}
async function doInitialize() {
  const socket = getClaudeSocketName();
  const result = await execTmux([
    "-L",
    socket,
    "new-session",
    "-d",
    "-s",
    "base",
    "-e",
    "CLAUDE_CODE_SKIP_PROMPT_HISTORY=true",
    ...getPlatform() === "windows" ? ["-e", "WSL_INTEROP=/run/WSL/1_interop"] : []
  ]);
  if (result.code !== 0) {
    const checkResult = await execTmux([
      "-L",
      socket,
      "has-session",
      "-t",
      "base"
    ]);
    if (checkResult.code !== 0) {
      throw new Error(
        `Failed to create tmux session on socket ${socket}: ${result.stderr}`
      );
    }
  }
  registerCleanup(killTmuxServer);
  await execTmux([
    "-L",
    socket,
    "set-environment",
    "-g",
    "CLAUDE_CODE_SKIP_PROMPT_HISTORY",
    "true"
  ]);
  if (getPlatform() === "windows") {
    await execTmux([
      "-L",
      socket,
      "set-environment",
      "-g",
      "WSL_INTEROP",
      "/run/WSL/1_interop"
    ]);
  }
  const infoResult = await execTmux([
    "-L",
    socket,
    "display-message",
    "-p",
    "#{socket_path},#{pid}"
  ]);
  if (infoResult.code === 0) {
    const [path, pidStr] = infoResult.stdout.trim().split(",");
    if (path && pidStr) {
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid)) {
        setClaudeSocketInfo(path, pid);
        return;
      }
    }
    logForDebugging(
      `[Socket] Failed to parse socket info from tmux output: "${infoResult.stdout.trim()}". Using fallback path.`
    );
  } else {
    logForDebugging(
      `[Socket] Failed to get socket info via display-message (exit ${infoResult.code}): ${infoResult.stderr}. Using fallback path.`
    );
  }
  const uid = process.getuid?.() ?? 0;
  const baseTmpDir = process.env.TMPDIR || "/tmp";
  const fallbackPath = posix.join(baseTmpDir, `tmux-${uid}`, socket);
  const pidResult = await execTmux([
    "-L",
    socket,
    "display-message",
    "-p",
    "#{pid}"
  ]);
  if (pidResult.code === 0) {
    const pid = parseInt(pidResult.stdout.trim(), 10);
    if (!isNaN(pid)) {
      logForDebugging(
        `[Socket] Using fallback socket path: ${fallbackPath} (server PID: ${pid})`
      );
      setClaudeSocketInfo(fallbackPath, pid);
      return;
    }
    logForDebugging(
      `[Socket] Failed to parse server PID from tmux output: "${pidResult.stdout.trim()}"`
    );
  } else {
    logForDebugging(
      `[Socket] Failed to get server PID (exit ${pidResult.code}): ${pidResult.stderr}`
    );
  }
  throw new Error(
    `Failed to get socket info for ${socket}: primary="${infoResult.stderr}", fallback="${pidResult.stderr}"`
  );
}
function resetSocketState() {
  socketName = null;
  socketPath = null;
  serverPid = null;
  isInitializing = false;
  initPromise = null;
  tmuxAvailabilityChecked = false;
  tmuxAvailable = false;
  tmuxToolUsed = false;
}
export {
  checkTmuxAvailable,
  ensureSocketInitialized,
  getClaudeSocketName,
  getClaudeSocketPath,
  getClaudeTmuxEnv,
  hasTmuxToolBeenUsed,
  isSocketInitialized,
  isTmuxAvailable,
  markTmuxToolUsed,
  resetSocketState,
  setClaudeSocketInfo
};
