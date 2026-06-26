import { useEffect, useRef } from "react";
import { getIsRemoteMode } from "../../bootstrap/state.js";
import {
  useNotifications
} from "../../context/notifications.js";
import { logError } from "../../utils/log.js";
function useStartupNotification(compute) {
  const { addNotification } = useNotifications();
  const hasRunRef = useRef(false);
  const computeRef = useRef(compute);
  computeRef.current = compute;
  useEffect(() => {
    if (getIsRemoteMode() || hasRunRef.current) return;
    hasRunRef.current = true;
    void Promise.resolve().then(() => computeRef.current()).then((result) => {
      if (!result) return;
      for (const n of Array.isArray(result) ? result : [result]) {
        addNotification(n);
      }
    }).catch(logError);
  }, [addNotification]);
}
export {
  useStartupNotification
};
