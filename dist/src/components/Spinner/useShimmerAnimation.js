import { useMemo } from "react";
import { stringWidth } from "../../ink/stringWidth.js";
import { useAnimationFrame } from "../../ink.js";
function useShimmerAnimation(mode, message, isStalled) {
  const glimmerSpeed = mode === "requesting" ? 50 : 200;
  const [ref, time] = useAnimationFrame(isStalled ? null : glimmerSpeed);
  const messageWidth = useMemo(() => stringWidth(message), [message]);
  if (isStalled) {
    return [ref, -100];
  }
  const cyclePosition = Math.floor(time / glimmerSpeed);
  const cycleLength = messageWidth + 20;
  if (mode === "requesting") {
    return [ref, cyclePosition % cycleLength - 10];
  }
  return [ref, messageWidth + 10 - cyclePosition % cycleLength];
}
export {
  useShimmerAnimation
};
