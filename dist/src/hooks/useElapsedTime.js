import { useCallback, useSyncExternalStore } from "react";
import { formatDuration } from "../utils/format.js";
function useElapsedTime(startTime, isRunning, ms = 1e3, pausedMs = 0, endTime) {
  const get = () => formatDuration(Math.max(0, (endTime ?? Date.now()) - startTime - pausedMs));
  const subscribe = useCallback(
    (notify) => {
      if (!isRunning) return () => {
      };
      const interval = setInterval(notify, ms);
      return () => clearInterval(interval);
    },
    [isRunning, ms]
  );
  return useSyncExternalStore(subscribe, get, get);
}
export {
  useElapsedTime
};
