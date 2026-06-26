import { useSyncExternalStore } from "react";
import {
  getCommandQueueSnapshot,
  subscribeToCommandQueue
} from "../utils/messageQueueManager.js";
function useCommandQueue() {
  return useSyncExternalStore(subscribeToCommandQueue, getCommandQueueSnapshot);
}
export {
  useCommandQueue
};
