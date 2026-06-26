import { spawn, spawnSync } from "child_process";
import { getSessionId } from "../bootstrap/state.js";
import instances from "../ink/instances.js";
import { registerCleanup } from "./cleanupRegistry.js";
import { pwd } from "./cwd.js";
import { logForDebugging } from "./debug.js";
const TMUX_SESSION = "panel";
function getTerminalPanelSocket() {
  const sessionId = getSessionId();
  return `claude-panel-${sessionId.slice(0, 8)}`;
}
let instance;
function getTerminalPanel() {
  if (!instance) {
    instance = new TerminalPanel();
  }
  return instance;
}
class TerminalPanel {
  hasTmux;
  cleanupRegistered = false;
  // ── public API ────────────────────────────────────────────────────
  toggle() {
    this.showShell();
  }
  // ── tmux helpers ──────────────────────────────────────────────────
  checkTmux() {
    if (this.hasTmux !== void 0) return this.hasTmux;
    const result = spawnSync("tmux", ["-V"], { encoding: "utf-8" });
    this.hasTmux = result.status === 0;
    if (!this.hasTmux) {
      logForDebugging(
        "Terminal panel: tmux not found, falling back to non-persistent shell"
      );
    }
    return this.hasTmux;
  }
  hasSession() {
    const result = spawnSync(
      "tmux",
      ["-L", getTerminalPanelSocket(), "has-session", "-t", TMUX_SESSION],
      { encoding: "utf-8" }
    );
    return result.status === 0;
  }
  createSession() {
    const shell = process.env.SHELL || "/bin/bash";
    const cwd = pwd();
    const socket = getTerminalPanelSocket();
    const result = spawnSync(
      "tmux",
      [
        "-L",
        socket,
        "new-session",
        "-d",
        "-s",
        TMUX_SESSION,
        "-c",
        cwd,
        shell,
        "-l"
      ],
      { encoding: "utf-8" }
    );
    if (result.status !== 0) {
      logForDebugging(
        `Terminal panel: failed to create tmux session: ${result.stderr}`
      );
      return false;
    }
    spawnSync("tmux", [
      "-L",
      socket,
      "bind-key",
      "-n",
      "M-j",
      "detach-client",
      ";",
      "set-option",
      "-g",
      "status-style",
      "bg=default",
      ";",
      "set-option",
      "-g",
      "status-left",
      "",
      ";",
      "set-option",
      "-g",
      "status-right",
      " Alt+J to return to Claude ",
      ";",
      "set-option",
      "-g",
      "status-right-style",
      "fg=brightblack"
    ]);
    if (!this.cleanupRegistered) {
      this.cleanupRegistered = true;
      registerCleanup(async () => {
        spawn("tmux", ["-L", socket, "kill-server"], {
          detached: true,
          stdio: "ignore"
        }).on("error", () => {
        }).unref();
      });
    }
    return true;
  }
  attachSession() {
    spawnSync(
      "tmux",
      ["-L", getTerminalPanelSocket(), "attach-session", "-t", TMUX_SESSION],
      { stdio: "inherit" }
    );
  }
  // ── show shell ────────────────────────────────────────────────────
  showShell() {
    const inkInstance = instances.get(process.stdout);
    if (!inkInstance) {
      logForDebugging("Terminal panel: no Ink instance found, aborting");
      return;
    }
    inkInstance.enterAlternateScreen();
    try {
      if (this.checkTmux() && this.ensureSession()) {
        this.attachSession();
      } else {
        this.runShellDirect();
      }
    } finally {
      inkInstance.exitAlternateScreen();
    }
  }
  // ── helpers ───────────────────────────────────────────────────────
  /** Ensure a tmux session exists, creating one if needed. */
  ensureSession() {
    if (this.hasSession()) return true;
    return this.createSession();
  }
  /** Fallback when tmux is not available — runs a non-persistent shell. */
  runShellDirect() {
    const shell = process.env.SHELL || "/bin/bash";
    const cwd = pwd();
    spawnSync(shell, ["-i", "-l"], {
      stdio: "inherit",
      cwd,
      env: process.env
    });
  }
}
export {
  getTerminalPanel,
  getTerminalPanelSocket
};
