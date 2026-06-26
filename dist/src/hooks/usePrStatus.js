import { useEffect, useRef, useState } from "react";
import { getLastInteractionTime } from "../bootstrap/state.js";
import { fetchPrStatus } from "../utils/ghPrStatus.js";
const POLL_INTERVAL_MS = 6e4;
const SLOW_GH_THRESHOLD_MS = 4e3;
const IDLE_STOP_MS = 60 * 6e4;
const INITIAL_STATE = {
  number: null,
  url: null,
  reviewState: null,
  lastUpdated: 0
};
function usePrStatus(isLoading, enabled = true) {
  const [prStatus, setPrStatus] = useState(INITIAL_STATE);
  const timeoutRef = useRef(null);
  const disabledRef = useRef(false);
  const lastFetchRef = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    if (disabledRef.current) return;
    let cancelled = false;
    let lastSeenInteractionTime = -1;
    let lastActivityTimestamp = Date.now();
    async function poll() {
      if (cancelled) return;
      const currentInteractionTime = getLastInteractionTime();
      if (lastSeenInteractionTime !== currentInteractionTime) {
        lastSeenInteractionTime = currentInteractionTime;
        lastActivityTimestamp = Date.now();
      } else if (Date.now() - lastActivityTimestamp >= IDLE_STOP_MS) {
        return;
      }
      const start = Date.now();
      const result = await fetchPrStatus();
      if (cancelled) return;
      lastFetchRef.current = start;
      setPrStatus((prev) => {
        const newNumber = result?.number ?? null;
        const newReviewState = result?.reviewState ?? null;
        if (prev.number === newNumber && prev.reviewState === newReviewState) {
          return prev;
        }
        return {
          number: newNumber,
          url: result?.url ?? null,
          reviewState: newReviewState,
          lastUpdated: Date.now()
        };
      });
      if (Date.now() - start > SLOW_GH_THRESHOLD_MS) {
        disabledRef.current = true;
        return;
      }
      if (!cancelled) {
        timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
    const elapsed = Date.now() - lastFetchRef.current;
    if (elapsed >= POLL_INTERVAL_MS) {
      void poll();
    } else {
      timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS - elapsed);
    }
    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isLoading, enabled]);
  return prStatus;
}
export {
  usePrStatus
};
