import { logForDebugging } from "../../../utils/debug.js";
import { execFileNoThrow } from "../../../utils/execFileNoThrow.js";
import { IT2_COMMAND, isInITerm2, isIt2CliAvailable } from "./detection.js";
import { registerITermBackend } from "./registry.js";
const teammateSessionIds = [];
let firstPaneUsed = false;
let paneCreationLock = Promise.resolve();
function acquirePaneCreationLock() {
  let release;
  const newLock = new Promise((resolve) => {
    release = resolve;
  });
  const previousLock = paneCreationLock;
  paneCreationLock = newLock;
  return previousLock.then(() => release);
}
function runIt2(args) {
  return execFileNoThrow(IT2_COMMAND, args);
}
function parseSplitOutput(output) {
  const match = output.match(/Created new pane:\s*(.+)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return "";
}
function getLeaderSessionId() {
  const itermSessionId = process.env.ITERM_SESSION_ID;
  if (!itermSessionId) {
    return null;
  }
  const colonIndex = itermSessionId.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }
  return itermSessionId.slice(colonIndex + 1);
}
class ITermBackend {
  type = "iterm2";
  displayName = "iTerm2";
  supportsHideShow = false;
  /**
   * Checks if iTerm2 backend is available (in iTerm2 with it2 CLI installed).
   */
  async isAvailable() {
    const inITerm2 = isInITerm2();
    logForDebugging(`[ITermBackend] isAvailable check: inITerm2=${inITerm2}`);
    if (!inITerm2) {
      logForDebugging("[ITermBackend] isAvailable: false (not in iTerm2)");
      return false;
    }
    const it2Available = await isIt2CliAvailable();
    logForDebugging(
      `[ITermBackend] isAvailable: ${it2Available} (it2 CLI ${it2Available ? "found" : "not found"})`
    );
    return it2Available;
  }
  /**
   * Checks if we're currently running inside iTerm2.
   */
  async isRunningInside() {
    const result = isInITerm2();
    logForDebugging(`[ITermBackend] isRunningInside: ${result}`);
    return result;
  }
  /**
   * Creates a new teammate pane in the swarm view.
   * Uses a lock to prevent race conditions when multiple teammates are spawned in parallel.
   */
  async createTeammatePaneInSwarmView(name, color) {
    logForDebugging(
      `[ITermBackend] createTeammatePaneInSwarmView called for ${name} with color ${color}`
    );
    const releaseLock = await acquirePaneCreationLock();
    try {
      while (true) {
        const isFirstTeammate = !firstPaneUsed;
        logForDebugging(
          `[ITermBackend] Creating pane: isFirstTeammate=${isFirstTeammate}, existingPanes=${teammateSessionIds.length}`
        );
        let splitArgs;
        let targetedTeammateId;
        if (isFirstTeammate) {
          const leaderSessionId = getLeaderSessionId();
          if (leaderSessionId) {
            splitArgs = ["session", "split", "-v", "-s", leaderSessionId];
            logForDebugging(
              `[ITermBackend] First split from leader session: ${leaderSessionId}`
            );
          } else {
            splitArgs = ["session", "split", "-v"];
            logForDebugging(
              "[ITermBackend] First split from active session (no leader ID)"
            );
          }
        } else {
          targetedTeammateId = teammateSessionIds[teammateSessionIds.length - 1];
          if (targetedTeammateId) {
            splitArgs = ["session", "split", "-s", targetedTeammateId];
            logForDebugging(
              `[ITermBackend] Subsequent split from teammate session: ${targetedTeammateId}`
            );
          } else {
            splitArgs = ["session", "split"];
            logForDebugging(
              "[ITermBackend] Subsequent split from active session (no teammate ID)"
            );
          }
        }
        const splitResult = await runIt2(splitArgs);
        if (splitResult.code !== 0) {
          if (targetedTeammateId) {
            const listResult = await runIt2(["session", "list"]);
            if (listResult.code === 0 && !listResult.stdout.includes(targetedTeammateId)) {
              logForDebugging(
                `[ITermBackend] Split failed targeting dead session ${targetedTeammateId}, pruning and retrying: ${splitResult.stderr}`
              );
              const idx = teammateSessionIds.indexOf(targetedTeammateId);
              if (idx !== -1) {
                teammateSessionIds.splice(idx, 1);
              }
              if (teammateSessionIds.length === 0) {
                firstPaneUsed = false;
              }
              continue;
            }
          }
          throw new Error(
            `Failed to create iTerm2 split pane: ${splitResult.stderr}`
          );
        }
        if (isFirstTeammate) {
          firstPaneUsed = true;
        }
        const paneId = parseSplitOutput(splitResult.stdout);
        if (!paneId) {
          throw new Error(
            `Failed to parse session ID from split output: ${splitResult.stdout}`
          );
        }
        logForDebugging(
          `[ITermBackend] Created teammate pane for ${name}: ${paneId}`
        );
        teammateSessionIds.push(paneId);
        return { paneId, isFirstTeammate };
      }
    } finally {
      releaseLock();
    }
  }
  /**
   * Sends a command to a specific pane.
   */
  async sendCommandToPane(paneId, command, _useExternalSession) {
    const args = paneId ? ["session", "run", "-s", paneId, command] : ["session", "run", command];
    const result = await runIt2(args);
    if (result.code !== 0) {
      throw new Error(
        `Failed to send command to iTerm2 pane ${paneId}: ${result.stderr}`
      );
    }
  }
  /**
   * No-op for iTerm2 - tab colors would require escape sequences but we skip
   * them for performance (each it2 call is slow).
   */
  async setPaneBorderColor(_paneId, _color, _useExternalSession) {
  }
  /**
   * No-op for iTerm2 - titles would require escape sequences but we skip
   * them for performance (each it2 call is slow).
   */
  async setPaneTitle(_paneId, _name, _color, _useExternalSession) {
  }
  /**
   * No-op for iTerm2 - pane titles are shown in tabs automatically.
   */
  async enablePaneBorderStatus(_windowTarget, _useExternalSession) {
  }
  /**
   * No-op for iTerm2 - pane balancing is handled automatically.
   */
  async rebalancePanes(_windowTarget, _hasLeader) {
    logForDebugging(
      "[ITermBackend] Pane rebalancing not implemented for iTerm2"
    );
  }
  /**
   * Kills/closes a specific pane using the it2 CLI.
   * Also removes the pane from tracked session IDs so subsequent spawns
   * don't try to split from a dead session.
   */
  async killPane(paneId, _useExternalSession) {
    const result = await runIt2(["session", "close", "-f", "-s", paneId]);
    const idx = teammateSessionIds.indexOf(paneId);
    if (idx !== -1) {
      teammateSessionIds.splice(idx, 1);
    }
    if (teammateSessionIds.length === 0) {
      firstPaneUsed = false;
    }
    return result.code === 0;
  }
  /**
   * Stub for hiding a pane - not supported in iTerm2 backend.
   * iTerm2 doesn't have a direct equivalent to tmux's break-pane.
   */
  async hidePane(_paneId, _useExternalSession) {
    logForDebugging("[ITermBackend] hidePane not supported in iTerm2");
    return false;
  }
  /**
   * Stub for showing a hidden pane - not supported in iTerm2 backend.
   * iTerm2 doesn't have a direct equivalent to tmux's join-pane.
   */
  async showPane(_paneId, _targetWindowOrPane, _useExternalSession) {
    logForDebugging("[ITermBackend] showPane not supported in iTerm2");
    return false;
  }
}
registerITermBackend(ITermBackend);
export {
  ITermBackend
};
