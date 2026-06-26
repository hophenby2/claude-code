import { randomUUID } from "crypto";
import { getIsNonInteractiveSession, getSessionId } from "../bootstrap/state.js";
const MAX_QUEUE_SIZE = 1e3;
const queue = [];
function enqueueSdkEvent(event) {
  if (!getIsNonInteractiveSession()) {
    return;
  }
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift();
  }
  queue.push(event);
}
function drainSdkEvents() {
  if (queue.length === 0) {
    return [];
  }
  const events = queue.splice(0);
  return events.map((e) => ({
    ...e,
    uuid: randomUUID(),
    session_id: getSessionId()
  }));
}
function emitTaskTerminatedSdk(taskId, status, opts) {
  enqueueSdkEvent({
    type: "system",
    subtype: "task_notification",
    task_id: taskId,
    tool_use_id: opts?.toolUseId,
    status,
    output_file: opts?.outputFile ?? "",
    summary: opts?.summary ?? "",
    usage: opts?.usage
  });
}
export {
  drainSdkEvents,
  emitTaskTerminatedSdk,
  enqueueSdkEvent
};
