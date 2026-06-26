import { useContext, useEffect, useState } from "react";
import { ClockContext } from "../components/ClockContext.js";
import { useTerminalViewport } from "./use-terminal-viewport.js";
function useAnimationFrame(intervalMs = 16) {
  const clock = useContext(ClockContext);
  const [viewportRef, { isVisible }] = useTerminalViewport();
  const [time, setTime] = useState(() => clock?.now() ?? 0);
  const active = isVisible && intervalMs !== null;
  useEffect(() => {
    if (!clock || !active) return;
    let lastUpdate = clock.now();
    const onChange = () => {
      const now = clock.now();
      if (now - lastUpdate >= intervalMs) {
        lastUpdate = now;
        setTime(now);
      }
    };
    return clock.subscribe(onChange, true);
  }, [clock, intervalMs, active]);
  return [viewportRef, time];
}
export {
  useAnimationFrame
};
