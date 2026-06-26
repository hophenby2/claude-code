import { useAnimationFrame, useTerminalFocus } from "../ink.js";
const BLINK_INTERVAL_MS = 600;
function useBlink(enabled, intervalMs = BLINK_INTERVAL_MS) {
  const focused = useTerminalFocus();
  const [ref, time] = useAnimationFrame(enabled && focused ? intervalMs : null);
  if (!enabled || !focused) return [ref, true];
  const isVisible = Math.floor(time / intervalMs) % 2 === 0;
  return [ref, isVisible];
}
export {
  useBlink
};
