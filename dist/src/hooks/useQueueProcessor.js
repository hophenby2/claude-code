import { useEffect, useSyncExternalStore } from "react";
import {
  getCommandQueueSnapshot,
  subscribeToCommandQueue
} from "../utils/messageQueueManager.js";
import { processQueueIfReady } from "../utils/queueProcessor.js";
function useQueueProcessor({
  executeQueuedInput,
  hasActiveLocalJsxUI,
  queryGuard
}) {
  const isQueryActive = useSyncExternalStore(
    queryGuard.subscribe,
    queryGuard.getSnapshot
  );
  const queueSnapshot = useSyncExternalStore(
    subscribeToCommandQueue,
    getCommandQueueSnapshot
  );
  useEffect(() => {
    if (isQueryActive) return;
    if (hasActiveLocalJsxUI) return;
    if (queueSnapshot.length === 0) return;
    processQueueIfReady({ executeInput: executeQueuedInput });
  }, [
    queueSnapshot,
    isQueryActive,
    executeQueuedInput,
    hasActiveLocalJsxUI,
    queryGuard
  ]);
}
export {
  useQueueProcessor
};
