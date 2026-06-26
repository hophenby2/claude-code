function isBackgroundTask(task) {
  if (task.status !== "running" && task.status !== "pending") {
    return false;
  }
  if ("isBackgrounded" in task && task.isBackgrounded === false) {
    return false;
  }
  return true;
}
export {
  isBackgroundTask
};
