import figures from "figures";
import "../../tasks/LocalAgentTask/LocalAgentTask.js";
import { isBackgroundTask } from "../../tasks/types.js";
import { summarizeRecentActivities } from "../../utils/collapseReadSearch.js";
function isTerminalStatus(status) {
  return status === "completed" || status === "failed" || status === "killed";
}
function getTaskStatusIcon(status, options) {
  const {
    isIdle,
    awaitingApproval,
    hasError,
    shutdownRequested
  } = options ?? {};
  if (hasError) return figures.cross;
  if (awaitingApproval) return figures.questionMarkPrefix;
  if (shutdownRequested) return figures.warning;
  if (status === "running") {
    if (isIdle) return figures.ellipsis;
    return figures.play;
  }
  if (status === "completed") return figures.tick;
  if (status === "failed" || status === "killed") return figures.cross;
  return figures.bullet;
}
function getTaskStatusColor(status, options) {
  const {
    isIdle,
    awaitingApproval,
    hasError,
    shutdownRequested
  } = options ?? {};
  if (hasError) return "error";
  if (awaitingApproval) return "warning";
  if (shutdownRequested) return "warning";
  if (isIdle) return "background";
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  if (status === "killed") return "warning";
  return "background";
}
function describeTeammateActivity(t) {
  if (t.shutdownRequested) return "stopping";
  if (t.awaitingPlanApproval) return "awaiting approval";
  if (t.isIdle) return "idle";
  return (t.progress?.recentActivities && summarizeRecentActivities(t.progress.recentActivities)) ?? t.progress?.lastActivity?.activityDescription ?? "working";
}
function shouldHideTasksFooter(tasks, showSpinnerTree) {
  if (!showSpinnerTree) return false;
  let hasVisibleTask = false;
  for (const t of Object.values(tasks)) {
    if (!isBackgroundTask(t) || false) {
      continue;
    }
    hasVisibleTask = true;
    if (t.type !== "in_process_teammate") return false;
  }
  return hasVisibleTask;
}
export {
  describeTeammateActivity,
  getTaskStatusColor,
  getTaskStatusIcon,
  isTerminalStatus,
  shouldHideTasksFooter
};
