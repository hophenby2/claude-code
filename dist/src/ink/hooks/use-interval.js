import { useContext, useEffect, useRef, useState } from "react";
import { ClockContext } from "../components/ClockContext.js";
function useAnimationTimer(intervalMs) {
  const clock = useContext(ClockContext);
  const [time, setTime] = useState(() => clock?.now() ?? 0);
  useEffect(() => {
    if (!clock) return;
    let lastUpdate = clock.now();
    const onChange = () => {
      const now = clock.now();
      if (now - lastUpdate >= intervalMs) {
        lastUpdate = now;
        setTime(now);
      }
    };
    return clock.subscribe(onChange, false);
  }, [clock, intervalMs]);
  return time;
}
function useInterval(callback, intervalMs) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const clock = useContext(ClockContext);
  useEffect(() => {
    if (!clock || intervalMs === null) return;
    let lastUpdate = clock.now();
    const onChange = () => {
      const now = clock.now();
      if (now - lastUpdate >= intervalMs) {
        lastUpdate = now;
        callbackRef.current();
      }
    };
    return clock.subscribe(onChange, false);
  }, [clock, intervalMs]);
}
export {
  useAnimationTimer,
  useInterval
};
