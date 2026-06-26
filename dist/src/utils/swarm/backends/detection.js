import { env } from "../../../utils/env.js";
import { execFileNoThrow } from "../../../utils/execFileNoThrow.js";
import { TMUX_COMMAND } from "../constants.js";
const ORIGINAL_USER_TMUX = process.env.TMUX;
const ORIGINAL_TMUX_PANE = process.env.TMUX_PANE;
let isInsideTmuxCached = null;
let isInITerm2Cached = null;
function isInsideTmuxSync() {
  return !!ORIGINAL_USER_TMUX;
}
async function isInsideTmux() {
  if (isInsideTmuxCached !== null) {
    return isInsideTmuxCached;
  }
  isInsideTmuxCached = !!ORIGINAL_USER_TMUX;
  return isInsideTmuxCached;
}
function getLeaderPaneId() {
  return ORIGINAL_TMUX_PANE || null;
}
async function isTmuxAvailable() {
  const result = await execFileNoThrow(TMUX_COMMAND, ["-V"]);
  return result.code === 0;
}
function isInITerm2() {
  if (isInITerm2Cached !== null) {
    return isInITerm2Cached;
  }
  const termProgram = process.env.TERM_PROGRAM;
  const hasItermSessionId = !!process.env.ITERM_SESSION_ID;
  const terminalIsITerm = env.terminal === "iTerm.app";
  isInITerm2Cached = termProgram === "iTerm.app" || hasItermSessionId || terminalIsITerm;
  return isInITerm2Cached;
}
const IT2_COMMAND = "it2";
async function isIt2CliAvailable() {
  const result = await execFileNoThrow(IT2_COMMAND, ["session", "list"]);
  return result.code === 0;
}
function resetDetectionCache() {
  isInsideTmuxCached = null;
  isInITerm2Cached = null;
}
export {
  IT2_COMMAND,
  getLeaderPaneId,
  isInITerm2,
  isInsideTmux,
  isInsideTmuxSync,
  isIt2CliAvailable,
  isTmuxAvailable,
  resetDetectionCache
};
