import { spawnSync } from "child_process";
import { getIsInteractive } from "../bootstrap/state.js";
import { logForDebugging } from "./debug.js";
import { isEnvDefinedFalsy, isEnvTruthy, isTuiSmokeTestMode } from "./envUtils.js";
import { execFileNoThrow } from "./execFileNoThrow.js";
let loggedTmuxCcDisable = false;
let checkedTmuxMouseHint = false;
let tmuxControlModeProbed;
function isTmuxControlModeEnvHeuristic() {
  if (!process.env.TMUX) return false;
  if (process.env.TERM_PROGRAM !== "iTerm.app") return false;
  const term = process.env.TERM ?? "";
  return !term.startsWith("screen") && !term.startsWith("tmux");
}
function probeTmuxControlModeSync() {
  tmuxControlModeProbed = isTmuxControlModeEnvHeuristic();
  if (tmuxControlModeProbed) return;
  if (!process.env.TMUX) return;
  if (process.env.TERM_PROGRAM) return;
  let result;
  try {
    result = spawnSync(
      "tmux",
      ["display-message", "-p", "#{client_control_mode}"],
      { encoding: "utf8", timeout: 2e3 }
    );
  } catch {
    return;
  }
  if (result.status !== 0) return;
  tmuxControlModeProbed = result.stdout.trim() === "1";
}
function isTmuxControlMode() {
  if (tmuxControlModeProbed === void 0) probeTmuxControlModeSync();
  return tmuxControlModeProbed ?? false;
}
function _resetTmuxControlModeProbeForTesting() {
  tmuxControlModeProbed = void 0;
  loggedTmuxCcDisable = false;
}
function isFullscreenEnvEnabled() {
  if (isTuiSmokeTestMode()) return false;
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_NO_FLICKER)) return false;
  if (isEnvTruthy(process.env.CLAUDE_CODE_NO_FLICKER)) return true;
  if (isTmuxControlMode()) {
    if (!loggedTmuxCcDisable) {
      loggedTmuxCcDisable = true;
      logForDebugging(
        "fullscreen disabled: tmux -CC (iTerm2 integration mode) detected \xB7 set CLAUDE_CODE_NO_FLICKER=1 to override"
      );
    }
    return false;
  }
  return process.env.USER_TYPE === "ant";
}
function isMouseTrackingEnabled() {
  if (isTuiSmokeTestMode()) return false;
  return !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_MOUSE);
}
function isMouseClicksDisabled() {
  return isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_MOUSE_CLICKS);
}
function isFullscreenActive() {
  return getIsInteractive() && isFullscreenEnvEnabled();
}
async function maybeGetTmuxMouseHint() {
  if (!process.env.TMUX) return null;
  if (!isFullscreenActive() || isTmuxControlMode()) return null;
  if (checkedTmuxMouseHint) return null;
  checkedTmuxMouseHint = true;
  const { stdout, code } = await execFileNoThrow(
    "tmux",
    ["show", "-Av", "mouse"],
    { useCwd: false, timeout: 2e3 }
  );
  if (code !== 0 || stdout.trim() === "on") return null;
  return "tmux detected \xB7 scroll with PgUp/PgDn \xB7 or add 'set -g mouse on' to ~/.tmux.conf for wheel scroll";
}
function _resetForTesting() {
  loggedTmuxCcDisable = false;
  checkedTmuxMouseHint = false;
}
export {
  _resetForTesting,
  _resetTmuxControlModeProbeForTesting,
  isFullscreenActive,
  isFullscreenEnvEnabled,
  isMouseClicksDisabled,
  isMouseTrackingEnabled,
  isTmuxControlMode,
  maybeGetTmuxMouseHint
};
