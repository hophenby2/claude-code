import { useCallback, useEffect } from "react";
import { useAppStateStore, useSetAppState } from "../state/AppState.js";
const DEFAULT_TIMEOUT_MS = 8e3;
let currentTimeoutId = null;
function useNotifications() {
  const store = useAppStateStore();
  const setAppState = useSetAppState();
  const processQueue = useCallback(() => {
    setAppState((prev) => {
      const next = getNext(prev.notifications.queue);
      if (prev.notifications.current !== null || !next) {
        return prev;
      }
      currentTimeoutId = setTimeout((setAppState2, nextKey, processQueue2) => {
        currentTimeoutId = null;
        setAppState2((prev2) => {
          if (prev2.notifications.current?.key !== nextKey) {
            return prev2;
          }
          return {
            ...prev2,
            notifications: {
              queue: prev2.notifications.queue,
              current: null
            }
          };
        });
        processQueue2();
      }, next.timeoutMs ?? DEFAULT_TIMEOUT_MS, setAppState, next.key, processQueue);
      return {
        ...prev,
        notifications: {
          queue: prev.notifications.queue.filter((_) => _ !== next),
          current: next
        }
      };
    });
  }, [setAppState]);
  const addNotification = useCallback((notif) => {
    if (notif.priority === "immediate") {
      if (currentTimeoutId) {
        clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
      }
      currentTimeoutId = setTimeout((setAppState2, notif2, processQueue2) => {
        currentTimeoutId = null;
        setAppState2((prev) => {
          if (prev.notifications.current?.key !== notif2.key) {
            return prev;
          }
          return {
            ...prev,
            notifications: {
              queue: prev.notifications.queue.filter((_) => !notif2.invalidates?.includes(_.key)),
              current: null
            }
          };
        });
        processQueue2();
      }, notif.timeoutMs ?? DEFAULT_TIMEOUT_MS, setAppState, notif, processQueue);
      setAppState((prev) => ({
        ...prev,
        notifications: {
          current: notif,
          queue: (
            // Only re-queue the current notification if it's not immediate
            [...prev.notifications.current ? [prev.notifications.current] : [], ...prev.notifications.queue].filter((_) => _.priority !== "immediate" && !notif.invalidates?.includes(_.key))
          )
        }
      }));
      return;
    }
    setAppState((prev) => {
      if (notif.fold) {
        if (prev.notifications.current?.key === notif.key) {
          const folded = notif.fold(prev.notifications.current, notif);
          if (currentTimeoutId) {
            clearTimeout(currentTimeoutId);
            currentTimeoutId = null;
          }
          currentTimeoutId = setTimeout((setAppState2, foldedKey, processQueue2) => {
            currentTimeoutId = null;
            setAppState2((p) => {
              if (p.notifications.current?.key !== foldedKey) {
                return p;
              }
              return {
                ...p,
                notifications: {
                  queue: p.notifications.queue,
                  current: null
                }
              };
            });
            processQueue2();
          }, folded.timeoutMs ?? DEFAULT_TIMEOUT_MS, setAppState, folded.key, processQueue);
          return {
            ...prev,
            notifications: {
              current: folded,
              queue: prev.notifications.queue
            }
          };
        }
        const queueIdx = prev.notifications.queue.findIndex((_) => _.key === notif.key);
        if (queueIdx !== -1) {
          const folded = notif.fold(prev.notifications.queue[queueIdx], notif);
          const newQueue = [...prev.notifications.queue];
          newQueue[queueIdx] = folded;
          return {
            ...prev,
            notifications: {
              current: prev.notifications.current,
              queue: newQueue
            }
          };
        }
      }
      const queuedKeys = new Set(prev.notifications.queue.map((_) => _.key));
      const shouldAdd = !queuedKeys.has(notif.key) && prev.notifications.current?.key !== notif.key;
      if (!shouldAdd) return prev;
      const invalidatesCurrent = prev.notifications.current !== null && notif.invalidates?.includes(prev.notifications.current.key);
      if (invalidatesCurrent && currentTimeoutId) {
        clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
      }
      return {
        ...prev,
        notifications: {
          current: invalidatesCurrent ? null : prev.notifications.current,
          queue: [...prev.notifications.queue.filter((_) => _.priority !== "immediate" && !notif.invalidates?.includes(_.key)), notif]
        }
      };
    });
    processQueue();
  }, [setAppState, processQueue]);
  const removeNotification = useCallback((key) => {
    setAppState((prev) => {
      const isCurrent = prev.notifications.current?.key === key;
      const inQueue = prev.notifications.queue.some((n) => n.key === key);
      if (!isCurrent && !inQueue) {
        return prev;
      }
      if (isCurrent && currentTimeoutId) {
        clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
      }
      return {
        ...prev,
        notifications: {
          current: isCurrent ? null : prev.notifications.current,
          queue: prev.notifications.queue.filter((n) => n.key !== key)
        }
      };
    });
    processQueue();
  }, [setAppState, processQueue]);
  useEffect(() => {
    if (store.getState().notifications.queue.length > 0) {
      processQueue();
    }
  }, []);
  return {
    addNotification,
    removeNotification
  };
}
const PRIORITIES = {
  immediate: 0,
  high: 1,
  medium: 2,
  low: 3
};
function getNext(queue) {
  if (queue.length === 0) return void 0;
  return queue.reduce((min, n) => PRIORITIES[n.priority] < PRIORITIES[min.priority] ? n : min);
}
export {
  getNext,
  useNotifications
};
