import { sep } from "path";
import { getOriginalCwd } from "../bootstrap/state.js";
import { quote } from "./bash/shellQuote.js";
import { getSessionIdFromLog } from "./sessionStorage.js";
function checkCrossProjectResume(log, showAllProjects, worktreePaths) {
  const currentCwd = getOriginalCwd();
  if (!showAllProjects || !log.projectPath || log.projectPath === currentCwd) {
    return { isCrossProject: false };
  }
  if (process.env.USER_TYPE !== "ant") {
    const sessionId2 = getSessionIdFromLog(log);
    const command2 = `cd ${quote([log.projectPath])} && claude --resume ${sessionId2}`;
    return {
      isCrossProject: true,
      isSameRepoWorktree: false,
      command: command2,
      projectPath: log.projectPath
    };
  }
  const isSameRepo = worktreePaths.some(
    (wt) => log.projectPath === wt || log.projectPath.startsWith(wt + sep)
  );
  if (isSameRepo) {
    return {
      isCrossProject: true,
      isSameRepoWorktree: true,
      projectPath: log.projectPath
    };
  }
  const sessionId = getSessionIdFromLog(log);
  const command = `cd ${quote([log.projectPath])} && claude --resume ${sessionId}`;
  return {
    isCrossProject: true,
    isSameRepoWorktree: false,
    command,
    projectPath: log.projectPath
  };
}
export {
  checkCrossProjectResume
};
