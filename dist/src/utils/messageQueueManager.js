const feature = (_name) => false;
import { getSessionId } from "../bootstrap/state.js";
import { extractTextContent } from "./messages.js";
import { objectGroupBy } from "./objectGroupBy.js";
import { recordQueueOperation } from "./sessionStorage.js";
import { createSignal } from "./signal.js";
function logOperation(operation, content) {
  const sessionId = getSessionId();
  const queueOp = {
    type: "queue-operation",
    operation,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    sessionId,
    ...content !== void 0 && { content }
  };
  void recordQueueOperation(queueOp);
}
const commandQueue = [];
let snapshot = Object.freeze([]);
const queueChanged = createSignal();
function notifySubscribers() {
  snapshot = Object.freeze([...commandQueue]);
  queueChanged.emit();
}
const subscribeToCommandQueue = queueChanged.subscribe;
function getCommandQueueSnapshot() {
  return snapshot;
}
function getCommandQueue() {
  return [...commandQueue];
}
function getCommandQueueLength() {
  return commandQueue.length;
}
function hasCommandsInQueue() {
  return commandQueue.length > 0;
}
function recheckCommandQueue() {
  if (commandQueue.length > 0) {
    notifySubscribers();
  }
}
function enqueue(command) {
  commandQueue.push({ ...command, priority: command.priority ?? "next" });
  notifySubscribers();
  logOperation(
    "enqueue",
    typeof command.value === "string" ? command.value : void 0
  );
}
function enqueuePendingNotification(command) {
  commandQueue.push({ ...command, priority: command.priority ?? "later" });
  notifySubscribers();
  logOperation(
    "enqueue",
    typeof command.value === "string" ? command.value : void 0
  );
}
const PRIORITY_ORDER = {
  now: 0,
  next: 1,
  later: 2
};
function dequeue(filter) {
  if (commandQueue.length === 0) {
    return void 0;
  }
  let bestIdx = -1;
  let bestPriority = Infinity;
  for (let i = 0; i < commandQueue.length; i++) {
    const cmd = commandQueue[i];
    if (filter && !filter(cmd)) continue;
    const priority = PRIORITY_ORDER[cmd.priority ?? "next"];
    if (priority < bestPriority) {
      bestIdx = i;
      bestPriority = priority;
    }
  }
  if (bestIdx === -1) return void 0;
  const [dequeued] = commandQueue.splice(bestIdx, 1);
  notifySubscribers();
  logOperation("dequeue");
  return dequeued;
}
function dequeueAll() {
  if (commandQueue.length === 0) {
    return [];
  }
  const commands = [...commandQueue];
  commandQueue.length = 0;
  notifySubscribers();
  for (const _cmd of commands) {
    logOperation("dequeue");
  }
  return commands;
}
function peek(filter) {
  if (commandQueue.length === 0) {
    return void 0;
  }
  let bestIdx = -1;
  let bestPriority = Infinity;
  for (let i = 0; i < commandQueue.length; i++) {
    const cmd = commandQueue[i];
    if (filter && !filter(cmd)) continue;
    const priority = PRIORITY_ORDER[cmd.priority ?? "next"];
    if (priority < bestPriority) {
      bestIdx = i;
      bestPriority = priority;
    }
  }
  if (bestIdx === -1) return void 0;
  return commandQueue[bestIdx];
}
function dequeueAllMatching(predicate) {
  const matched = [];
  const remaining = [];
  for (const cmd of commandQueue) {
    if (predicate(cmd)) {
      matched.push(cmd);
    } else {
      remaining.push(cmd);
    }
  }
  if (matched.length === 0) {
    return [];
  }
  commandQueue.length = 0;
  commandQueue.push(...remaining);
  notifySubscribers();
  for (const _cmd of matched) {
    logOperation("dequeue");
  }
  return matched;
}
function remove(commandsToRemove) {
  if (commandsToRemove.length === 0) {
    return;
  }
  const before = commandQueue.length;
  for (let i = commandQueue.length - 1; i >= 0; i--) {
    if (commandsToRemove.includes(commandQueue[i])) {
      commandQueue.splice(i, 1);
    }
  }
  if (commandQueue.length !== before) {
    notifySubscribers();
  }
  for (const _cmd of commandsToRemove) {
    logOperation("remove");
  }
}
function removeByFilter(predicate) {
  const removed = [];
  for (let i = commandQueue.length - 1; i >= 0; i--) {
    if (predicate(commandQueue[i])) {
      removed.unshift(commandQueue.splice(i, 1)[0]);
    }
  }
  if (removed.length > 0) {
    notifySubscribers();
    for (const _cmd of removed) {
      logOperation("remove");
    }
  }
  return removed;
}
function clearCommandQueue() {
  if (commandQueue.length === 0) {
    return;
  }
  commandQueue.length = 0;
  notifySubscribers();
}
function resetCommandQueue() {
  commandQueue.length = 0;
  snapshot = Object.freeze([]);
}
const NON_EDITABLE_MODES = /* @__PURE__ */ new Set([
  "task-notification"
]);
function isPromptInputModeEditable(mode) {
  return !NON_EDITABLE_MODES.has(mode);
}
function isQueuedCommandEditable(cmd) {
  return isPromptInputModeEditable(cmd.mode) && !cmd.isMeta;
}
function isQueuedCommandVisible(cmd) {
  if (false)
    return true;
  return isQueuedCommandEditable(cmd);
}
function extractTextFromValue(value) {
  return typeof value === "string" ? value : extractTextContent(value, "\n");
}
function extractImagesFromValue(value, startId) {
  if (typeof value === "string") {
    return [];
  }
  const images = [];
  let imageIndex = 0;
  for (const block of value) {
    if (block.type === "image" && block.source.type === "base64") {
      images.push({
        id: startId + imageIndex,
        type: "image",
        content: block.source.data,
        mediaType: block.source.media_type,
        filename: `image${imageIndex + 1}`
      });
      imageIndex++;
    }
  }
  return images;
}
function popAllEditable(currentInput, currentCursorOffset) {
  if (commandQueue.length === 0) {
    return void 0;
  }
  const { editable = [], nonEditable = [] } = objectGroupBy(
    [...commandQueue],
    (cmd) => isQueuedCommandEditable(cmd) ? "editable" : "nonEditable"
  );
  if (editable.length === 0) {
    return void 0;
  }
  const queuedTexts = editable.map((cmd) => extractTextFromValue(cmd.value));
  const newInput = [...queuedTexts, currentInput].filter(Boolean).join("\n");
  const cursorOffset = queuedTexts.join("\n").length + 1 + currentCursorOffset;
  const images = [];
  let nextImageId = Date.now();
  for (const cmd of editable) {
    if (cmd.pastedContents) {
      for (const content of Object.values(cmd.pastedContents)) {
        if (content.type === "image") {
          images.push(content);
        }
      }
    }
    const cmdImages = extractImagesFromValue(cmd.value, nextImageId);
    images.push(...cmdImages);
    nextImageId += cmdImages.length;
  }
  for (const command of editable) {
    logOperation(
      "popAll",
      typeof command.value === "string" ? command.value : void 0
    );
  }
  commandQueue.length = 0;
  commandQueue.push(...nonEditable);
  notifySubscribers();
  return { text: newInput, cursorOffset, images };
}
const subscribeToPendingNotifications = subscribeToCommandQueue;
function getPendingNotificationsSnapshot() {
  return snapshot;
}
const hasPendingNotifications = hasCommandsInQueue;
const getPendingNotificationsCount = getCommandQueueLength;
const recheckPendingNotifications = recheckCommandQueue;
function dequeuePendingNotification() {
  return dequeue();
}
const resetPendingNotifications = resetCommandQueue;
const clearPendingNotifications = clearCommandQueue;
function getCommandsByMaxPriority(maxPriority) {
  const threshold = PRIORITY_ORDER[maxPriority];
  return commandQueue.filter(
    (cmd) => PRIORITY_ORDER[cmd.priority ?? "next"] <= threshold
  );
}
function isSlashCommand(cmd) {
  return typeof cmd.value === "string" && cmd.value.trim().startsWith("/") && !cmd.skipSlashCommands;
}
export {
  clearCommandQueue,
  clearPendingNotifications,
  dequeue,
  dequeueAll,
  dequeueAllMatching,
  dequeuePendingNotification,
  enqueue,
  enqueuePendingNotification,
  getCommandQueue,
  getCommandQueueLength,
  getCommandQueueSnapshot,
  getCommandsByMaxPriority,
  getPendingNotificationsCount,
  getPendingNotificationsSnapshot,
  hasCommandsInQueue,
  hasPendingNotifications,
  isPromptInputModeEditable,
  isQueuedCommandEditable,
  isQueuedCommandVisible,
  isSlashCommand,
  peek,
  popAllEditable,
  recheckCommandQueue,
  recheckPendingNotifications,
  remove,
  removeByFilter,
  resetCommandQueue,
  resetPendingNotifications,
  subscribeToCommandQueue,
  subscribeToPendingNotifications
};
