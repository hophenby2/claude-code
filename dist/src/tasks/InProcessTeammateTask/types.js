function isInProcessTeammateTask(task) {
  return typeof task === "object" && task !== null && "type" in task && task.type === "in_process_teammate";
}
const TEAMMATE_MESSAGES_UI_CAP = 50;
function appendCappedMessage(prev, item) {
  if (prev === void 0 || prev.length === 0) {
    return [item];
  }
  if (prev.length >= TEAMMATE_MESSAGES_UI_CAP) {
    const next = prev.slice(-(TEAMMATE_MESSAGES_UI_CAP - 1));
    next.push(item);
    return next;
  }
  return [...prev, item];
}
export {
  TEAMMATE_MESSAGES_UI_CAP,
  appendCappedMessage,
  isInProcessTeammateTask
};
