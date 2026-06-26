import { useSyncExternalStore } from "react";
import {
  isClassifierChecking,
  subscribeClassifierChecking
} from "./classifierApprovals.js";
function useIsClassifierChecking(toolUseID) {
  return useSyncExternalStore(
    subscribeClassifierChecking,
    () => isClassifierChecking(toolUseID)
  );
}
export {
  useIsClassifierChecking
};
