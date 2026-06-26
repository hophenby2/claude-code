import { useSyncExternalStore } from "react";
import { compactWarningStore } from "./compactWarningState.js";
function useCompactWarningSuppression() {
  return useSyncExternalStore(
    compactWarningStore.subscribe,
    compactWarningStore.getState
  );
}
export {
  useCompactWarningSuppression
};
