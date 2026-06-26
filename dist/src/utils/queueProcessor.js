import {
  dequeue,
  dequeueAllMatching,
  hasCommandsInQueue,
  peek
} from "./messageQueueManager.js";
function isSlashCommand(cmd) {
  if (typeof cmd.value === "string") {
    return cmd.value.trim().startsWith("/");
  }
  for (const block of cmd.value) {
    if (block.type === "text") {
      return block.text.trim().startsWith("/");
    }
  }
  return false;
}
function processQueueIfReady({
  executeInput
}) {
  const isMainThread = (cmd) => cmd.agentId === void 0;
  const next = peek(isMainThread);
  if (!next) {
    return { processed: false };
  }
  if (isSlashCommand(next) || next.mode === "bash") {
    const cmd = dequeue(isMainThread);
    void executeInput([cmd]);
    return { processed: true };
  }
  const targetMode = next.mode;
  const commands = dequeueAllMatching(
    (cmd) => isMainThread(cmd) && !isSlashCommand(cmd) && cmd.mode === targetMode
  );
  if (commands.length === 0) {
    return { processed: false };
  }
  void executeInput(commands);
  return { processed: true };
}
function hasQueuedCommands() {
  return hasCommandsInQueue();
}
export {
  hasQueuedCommands,
  processQueueIfReady
};
