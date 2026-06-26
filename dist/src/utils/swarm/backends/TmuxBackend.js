import { logForDebugging } from "../../../utils/debug.js";
import { execFileNoThrow } from "../../../utils/execFileNoThrow.js";
import { logError } from "../../../utils/log.js";
import { count } from "../../array.js";
import { sleep } from "../../sleep.js";
import {
  getSwarmSocketName,
  HIDDEN_SESSION_NAME,
  SWARM_SESSION_NAME,
  SWARM_VIEW_WINDOW_NAME,
  TMUX_COMMAND
} from "../constants.js";
import {
  getLeaderPaneId,
  isInsideTmux as isInsideTmuxFromDetection,
  isTmuxAvailable
} from "./detection.js";
import { registerTmuxBackend } from "./registry.js";
let firstPaneUsedForExternal = false;
let cachedLeaderWindowTarget = null;
let paneCreationLock = Promise.resolve();
const PANE_SHELL_INIT_DELAY_MS = 200;
function waitForPaneShellReady() {
  return sleep(PANE_SHELL_INIT_DELAY_MS);
}
function acquirePaneCreationLock() {
  let release;
  const newLock = new Promise((resolve) => {
    release = resolve;
  });
  const previousLock = paneCreationLock;
  paneCreationLock = newLock;
  return previousLock.then(() => release);
}
function getTmuxColorName(color) {
  const tmuxColors = {
    red: "red",
    blue: "blue",
    green: "green",
    yellow: "yellow",
    purple: "magenta",
    orange: "colour208",
    pink: "colour205",
    cyan: "cyan"
  };
  return tmuxColors[color];
}
function runTmuxInUserSession(args) {
  return execFileNoThrow(TMUX_COMMAND, args);
}
function runTmuxInSwarm(args) {
  return execFileNoThrow(TMUX_COMMAND, ["-L", getSwarmSocketName(), ...args]);
}
class TmuxBackend {
  type = "tmux";
  displayName = "tmux";
  supportsHideShow = true;
  /**
   * Checks if tmux is installed and available.
   * Delegates to detection.ts for consistent detection logic.
   */
  async isAvailable() {
    return isTmuxAvailable();
  }
  /**
   * Checks if we're currently running inside a tmux session.
   * Delegates to detection.ts for consistent detection logic.
   */
  async isRunningInside() {
    return isInsideTmuxFromDetection();
  }
  /**
   * Creates a new teammate pane in the swarm view.
   * Uses a lock to prevent race conditions when multiple teammates are spawned in parallel.
   */
  async createTeammatePaneInSwarmView(name, color) {
    const releaseLock = await acquirePaneCreationLock();
    try {
      const insideTmux = await this.isRunningInside();
      if (insideTmux) {
        return await this.createTeammatePaneWithLeader(name, color);
      }
      return await this.createTeammatePaneExternal(name, color);
    } finally {
      releaseLock();
    }
  }
  /**
   * Sends a command to a specific pane.
   */
  async sendCommandToPane(paneId, command, useExternalSession = false) {
    const runTmux = useExternalSession ? runTmuxInSwarm : runTmuxInUserSession;
    const result = await runTmux(["send-keys", "-t", paneId, command, "Enter"]);
    if (result.code !== 0) {
      throw new Error(
        `Failed to send command to pane ${paneId}: ${result.stderr}`
      );
    }
  }
  /**
   * Sets the border color for a specific pane.
   */
  async setPaneBorderColor(paneId, color, useExternalSession = false) {
    const tmuxColor = getTmuxColorName(color);
    const runTmux = useExternalSession ? runTmuxInSwarm : runTmuxInUserSession;
    await runTmux([
      "select-pane",
      "-t",
      paneId,
      "-P",
      `bg=default,fg=${tmuxColor}`
    ]);
    await runTmux([
      "set-option",
      "-p",
      "-t",
      paneId,
      "pane-border-style",
      `fg=${tmuxColor}`
    ]);
    await runTmux([
      "set-option",
      "-p",
      "-t",
      paneId,
      "pane-active-border-style",
      `fg=${tmuxColor}`
    ]);
  }
  /**
   * Sets the title for a pane (shown in pane border if pane-border-status is set).
   */
  async setPaneTitle(paneId, name, color, useExternalSession = false) {
    const tmuxColor = getTmuxColorName(color);
    const runTmux = useExternalSession ? runTmuxInSwarm : runTmuxInUserSession;
    await runTmux(["select-pane", "-t", paneId, "-T", name]);
    await runTmux([
      "set-option",
      "-p",
      "-t",
      paneId,
      "pane-border-format",
      `#[fg=${tmuxColor},bold] #{pane_title} #[default]`
    ]);
  }
  /**
   * Enables pane border status for a window (shows pane titles).
   */
  async enablePaneBorderStatus(windowTarget, useExternalSession = false) {
    const target = windowTarget || await this.getCurrentWindowTarget();
    if (!target) {
      return;
    }
    const runTmux = useExternalSession ? runTmuxInSwarm : runTmuxInUserSession;
    await runTmux([
      "set-option",
      "-w",
      "-t",
      target,
      "pane-border-status",
      "top"
    ]);
  }
  /**
   * Rebalances panes to achieve the desired layout.
   */
  async rebalancePanes(windowTarget, hasLeader) {
    if (hasLeader) {
      await this.rebalancePanesWithLeader(windowTarget);
    } else {
      await this.rebalancePanesTiled(windowTarget);
    }
  }
  /**
   * Kills/closes a specific pane.
   */
  async killPane(paneId, useExternalSession = false) {
    const runTmux = useExternalSession ? runTmuxInSwarm : runTmuxInUserSession;
    const result = await runTmux(["kill-pane", "-t", paneId]);
    return result.code === 0;
  }
  /**
   * Hides a pane by moving it to a detached hidden session.
   * Creates the hidden session if it doesn't exist, then uses break-pane to move the pane there.
   */
  async hidePane(paneId, useExternalSession = false) {
    const runTmux = useExternalSession ? runTmuxInSwarm : runTmuxInUserSession;
    await runTmux(["new-session", "-d", "-s", HIDDEN_SESSION_NAME]);
    const result = await runTmux([
      "break-pane",
      "-d",
      "-s",
      paneId,
      "-t",
      `${HIDDEN_SESSION_NAME}:`
    ]);
    if (result.code === 0) {
      logForDebugging(`[TmuxBackend] Hidden pane ${paneId}`);
    } else {
      logForDebugging(
        `[TmuxBackend] Failed to hide pane ${paneId}: ${result.stderr}`
      );
    }
    return result.code === 0;
  }
  /**
   * Shows a previously hidden pane by joining it back into the target window.
   * Uses `tmux join-pane` to move the pane back, then reapplies main-vertical layout
   * with leader at 30%.
   */
  async showPane(paneId, targetWindowOrPane, useExternalSession = false) {
    const runTmux = useExternalSession ? runTmuxInSwarm : runTmuxInUserSession;
    const result = await runTmux([
      "join-pane",
      "-h",
      "-s",
      paneId,
      "-t",
      targetWindowOrPane
    ]);
    if (result.code !== 0) {
      logForDebugging(
        `[TmuxBackend] Failed to show pane ${paneId}: ${result.stderr}`
      );
      return false;
    }
    logForDebugging(
      `[TmuxBackend] Showed pane ${paneId} in ${targetWindowOrPane}`
    );
    await runTmux(["select-layout", "-t", targetWindowOrPane, "main-vertical"]);
    const panesResult = await runTmux([
      "list-panes",
      "-t",
      targetWindowOrPane,
      "-F",
      "#{pane_id}"
    ]);
    const panes = panesResult.stdout.trim().split("\n").filter(Boolean);
    if (panes[0]) {
      await runTmux(["resize-pane", "-t", panes[0], "-x", "30%"]);
    }
    return true;
  }
  // Private helper methods
  /**
   * Gets the leader's pane ID.
   * Uses the TMUX_PANE env var captured at module load to ensure we always
   * get the leader's original pane, even if the user has switched panes.
   */
  async getCurrentPaneId() {
    const leaderPane = getLeaderPaneId();
    if (leaderPane) {
      return leaderPane;
    }
    const result = await execFileNoThrow(TMUX_COMMAND, [
      "display-message",
      "-p",
      "#{pane_id}"
    ]);
    if (result.code !== 0) {
      logForDebugging(
        `[TmuxBackend] Failed to get current pane ID (exit ${result.code}): ${result.stderr}`
      );
      return null;
    }
    return result.stdout.trim();
  }
  /**
   * Gets the leader's window target (session:window format).
   * Uses the leader's pane ID to query for its window, ensuring we get the
   * correct window even if the user has switched to a different window.
   * Caches the result since the leader's window won't change.
   */
  async getCurrentWindowTarget() {
    if (cachedLeaderWindowTarget) {
      return cachedLeaderWindowTarget;
    }
    const leaderPane = getLeaderPaneId();
    const args = ["display-message"];
    if (leaderPane) {
      args.push("-t", leaderPane);
    }
    args.push("-p", "#{session_name}:#{window_index}");
    const result = await execFileNoThrow(TMUX_COMMAND, args);
    if (result.code !== 0) {
      logForDebugging(
        `[TmuxBackend] Failed to get current window target (exit ${result.code}): ${result.stderr}`
      );
      return null;
    }
    cachedLeaderWindowTarget = result.stdout.trim();
    return cachedLeaderWindowTarget;
  }
  /**
   * Gets the number of panes in a window.
   */
  async getCurrentWindowPaneCount(windowTarget, useSwarmSocket = false) {
    const target = windowTarget || await this.getCurrentWindowTarget();
    if (!target) {
      return null;
    }
    const args = ["list-panes", "-t", target, "-F", "#{pane_id}"];
    const result = useSwarmSocket ? await runTmuxInSwarm(args) : await runTmuxInUserSession(args);
    if (result.code !== 0) {
      logError(
        new Error(
          `[TmuxBackend] Failed to get pane count for ${target} (exit ${result.code}): ${result.stderr}`
        )
      );
      return null;
    }
    return count(result.stdout.trim().split("\n"), Boolean);
  }
  /**
   * Checks if a tmux session exists in the swarm socket.
   */
  async hasSessionInSwarm(sessionName) {
    const result = await runTmuxInSwarm(["has-session", "-t", sessionName]);
    return result.code === 0;
  }
  /**
   * Creates the swarm session with a single window for teammates when running outside tmux.
   */
  async createExternalSwarmSession() {
    const sessionExists = await this.hasSessionInSwarm(SWARM_SESSION_NAME);
    if (!sessionExists) {
      const result = await runTmuxInSwarm([
        "new-session",
        "-d",
        "-s",
        SWARM_SESSION_NAME,
        "-n",
        SWARM_VIEW_WINDOW_NAME,
        "-P",
        "-F",
        "#{pane_id}"
      ]);
      if (result.code !== 0) {
        throw new Error(
          `Failed to create swarm session: ${result.stderr || "Unknown error"}`
        );
      }
      const paneId = result.stdout.trim();
      const windowTarget2 = `${SWARM_SESSION_NAME}:${SWARM_VIEW_WINDOW_NAME}`;
      logForDebugging(
        `[TmuxBackend] Created external swarm session with window ${windowTarget2}, pane ${paneId}`
      );
      return { windowTarget: windowTarget2, paneId };
    }
    const listResult = await runTmuxInSwarm([
      "list-windows",
      "-t",
      SWARM_SESSION_NAME,
      "-F",
      "#{window_name}"
    ]);
    const windows = listResult.stdout.trim().split("\n").filter(Boolean);
    const windowTarget = `${SWARM_SESSION_NAME}:${SWARM_VIEW_WINDOW_NAME}`;
    if (windows.includes(SWARM_VIEW_WINDOW_NAME)) {
      const paneResult = await runTmuxInSwarm([
        "list-panes",
        "-t",
        windowTarget,
        "-F",
        "#{pane_id}"
      ]);
      const panes = paneResult.stdout.trim().split("\n").filter(Boolean);
      return { windowTarget, paneId: panes[0] || "" };
    }
    const createResult = await runTmuxInSwarm([
      "new-window",
      "-t",
      SWARM_SESSION_NAME,
      "-n",
      SWARM_VIEW_WINDOW_NAME,
      "-P",
      "-F",
      "#{pane_id}"
    ]);
    if (createResult.code !== 0) {
      throw new Error(
        `Failed to create swarm-view window: ${createResult.stderr || "Unknown error"}`
      );
    }
    return { windowTarget, paneId: createResult.stdout.trim() };
  }
  /**
   * Creates a teammate pane when running inside tmux (with leader).
   */
  async createTeammatePaneWithLeader(teammateName, teammateColor) {
    const currentPaneId = await this.getCurrentPaneId();
    const windowTarget = await this.getCurrentWindowTarget();
    if (!currentPaneId || !windowTarget) {
      throw new Error("Could not determine current tmux pane/window");
    }
    const paneCount = await this.getCurrentWindowPaneCount(windowTarget);
    if (paneCount === null) {
      throw new Error("Could not determine pane count for current window");
    }
    const isFirstTeammate = paneCount === 1;
    let splitResult;
    if (isFirstTeammate) {
      splitResult = await execFileNoThrow(TMUX_COMMAND, [
        "split-window",
        "-t",
        currentPaneId,
        "-h",
        "-l",
        "70%",
        "-P",
        "-F",
        "#{pane_id}"
      ]);
    } else {
      const listResult = await execFileNoThrow(TMUX_COMMAND, [
        "list-panes",
        "-t",
        windowTarget,
        "-F",
        "#{pane_id}"
      ]);
      const panes = listResult.stdout.trim().split("\n").filter(Boolean);
      const teammatePanes = panes.slice(1);
      const teammateCount = teammatePanes.length;
      const splitVertically = teammateCount % 2 === 1;
      const targetPaneIndex = Math.floor((teammateCount - 1) / 2);
      const targetPane = teammatePanes[targetPaneIndex] || teammatePanes[teammatePanes.length - 1];
      splitResult = await execFileNoThrow(TMUX_COMMAND, [
        "split-window",
        "-t",
        targetPane,
        splitVertically ? "-v" : "-h",
        "-P",
        "-F",
        "#{pane_id}"
      ]);
    }
    if (splitResult.code !== 0) {
      throw new Error(`Failed to create teammate pane: ${splitResult.stderr}`);
    }
    const paneId = splitResult.stdout.trim();
    logForDebugging(
      `[TmuxBackend] Created teammate pane for ${teammateName}: ${paneId}`
    );
    await this.setPaneBorderColor(paneId, teammateColor);
    await this.setPaneTitle(paneId, teammateName, teammateColor);
    await this.rebalancePanesWithLeader(windowTarget);
    await waitForPaneShellReady();
    return { paneId, isFirstTeammate };
  }
  /**
   * Creates a teammate pane when running outside tmux (no leader in tmux).
   */
  async createTeammatePaneExternal(teammateName, teammateColor) {
    const { windowTarget, paneId: firstPaneId } = await this.createExternalSwarmSession();
    const paneCount = await this.getCurrentWindowPaneCount(windowTarget, true);
    if (paneCount === null) {
      throw new Error("Could not determine pane count for swarm window");
    }
    const isFirstTeammate = !firstPaneUsedForExternal && paneCount === 1;
    let paneId;
    if (isFirstTeammate) {
      paneId = firstPaneId;
      firstPaneUsedForExternal = true;
      logForDebugging(
        `[TmuxBackend] Using initial pane for first teammate ${teammateName}: ${paneId}`
      );
      await this.enablePaneBorderStatus(windowTarget, true);
    } else {
      const listResult = await runTmuxInSwarm([
        "list-panes",
        "-t",
        windowTarget,
        "-F",
        "#{pane_id}"
      ]);
      const panes = listResult.stdout.trim().split("\n").filter(Boolean);
      const teammateCount = panes.length;
      const splitVertically = teammateCount % 2 === 1;
      const targetPaneIndex = Math.floor((teammateCount - 1) / 2);
      const targetPane = panes[targetPaneIndex] || panes[panes.length - 1];
      const splitResult = await runTmuxInSwarm([
        "split-window",
        "-t",
        targetPane,
        splitVertically ? "-v" : "-h",
        "-P",
        "-F",
        "#{pane_id}"
      ]);
      if (splitResult.code !== 0) {
        throw new Error(`Failed to create teammate pane: ${splitResult.stderr}`);
      }
      paneId = splitResult.stdout.trim();
      logForDebugging(
        `[TmuxBackend] Created teammate pane for ${teammateName}: ${paneId}`
      );
    }
    await this.setPaneBorderColor(paneId, teammateColor, true);
    await this.setPaneTitle(paneId, teammateName, teammateColor, true);
    await this.rebalancePanesTiled(windowTarget);
    await waitForPaneShellReady();
    return { paneId, isFirstTeammate };
  }
  /**
   * Rebalances panes in a window with a leader.
   */
  async rebalancePanesWithLeader(windowTarget) {
    const listResult = await runTmuxInUserSession([
      "list-panes",
      "-t",
      windowTarget,
      "-F",
      "#{pane_id}"
    ]);
    const panes = listResult.stdout.trim().split("\n").filter(Boolean);
    if (panes.length <= 2) {
      return;
    }
    await runTmuxInUserSession([
      "select-layout",
      "-t",
      windowTarget,
      "main-vertical"
    ]);
    const leaderPane = panes[0];
    await runTmuxInUserSession(["resize-pane", "-t", leaderPane, "-x", "30%"]);
    logForDebugging(
      `[TmuxBackend] Rebalanced ${panes.length - 1} teammate panes with leader`
    );
  }
  /**
   * Rebalances panes in a window without a leader (tiled layout).
   */
  async rebalancePanesTiled(windowTarget) {
    const listResult = await runTmuxInSwarm([
      "list-panes",
      "-t",
      windowTarget,
      "-F",
      "#{pane_id}"
    ]);
    const panes = listResult.stdout.trim().split("\n").filter(Boolean);
    if (panes.length <= 1) {
      return;
    }
    await runTmuxInSwarm(["select-layout", "-t", windowTarget, "tiled"]);
    logForDebugging(
      `[TmuxBackend] Rebalanced ${panes.length} teammate panes with tiled layout`
    );
  }
}
registerTmuxBackend(TmuxBackend);
export {
  TmuxBackend
};
