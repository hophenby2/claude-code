import { getGlobalConfig } from "../../../utils/config.js";
import { logForDebugging } from "../../../utils/debug.js";
import { logError } from "../../../utils/log.js";
let initialTeammateMode = null;
let cliTeammateModeOverride = null;
function setCliTeammateModeOverride(mode) {
  cliTeammateModeOverride = mode;
}
function getCliTeammateModeOverride() {
  return cliTeammateModeOverride;
}
function clearCliTeammateModeOverride(newMode) {
  cliTeammateModeOverride = null;
  initialTeammateMode = newMode;
  logForDebugging(
    `[TeammateModeSnapshot] CLI override cleared, new mode: ${newMode}`
  );
}
function captureTeammateModeSnapshot() {
  if (cliTeammateModeOverride) {
    initialTeammateMode = cliTeammateModeOverride;
    logForDebugging(
      `[TeammateModeSnapshot] Captured from CLI override: ${initialTeammateMode}`
    );
  } else {
    const config = getGlobalConfig();
    initialTeammateMode = config.teammateMode ?? "auto";
    logForDebugging(
      `[TeammateModeSnapshot] Captured from config: ${initialTeammateMode}`
    );
  }
}
function getTeammateModeFromSnapshot() {
  if (initialTeammateMode === null) {
    logError(
      new Error(
        "getTeammateModeFromSnapshot called before capture - this indicates an initialization bug"
      )
    );
    captureTeammateModeSnapshot();
  }
  return initialTeammateMode ?? "auto";
}
export {
  captureTeammateModeSnapshot,
  clearCliTeammateModeOverride,
  getCliTeammateModeOverride,
  getTeammateModeFromSnapshot,
  setCliTeammateModeOverride
};
