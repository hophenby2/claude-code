import { useRef } from "react";
function useStalledAnimation(time, currentResponseLength, hasActiveTools = false, reducedMotion = false) {
  const lastTokenTime = useRef(time);
  const lastResponseLength = useRef(currentResponseLength);
  const mountTime = useRef(time);
  const stalledIntensityRef = useRef(0);
  const lastSmoothTime = useRef(time);
  if (currentResponseLength > lastResponseLength.current) {
    lastTokenTime.current = time;
    lastResponseLength.current = currentResponseLength;
    stalledIntensityRef.current = 0;
    lastSmoothTime.current = time;
  }
  let timeSinceLastToken;
  if (hasActiveTools) {
    timeSinceLastToken = 0;
    lastTokenTime.current = time;
  } else if (currentResponseLength > 0) {
    timeSinceLastToken = time - lastTokenTime.current;
  } else {
    timeSinceLastToken = time - mountTime.current;
  }
  const isStalled = timeSinceLastToken > 3e3 && !hasActiveTools;
  const intensity = isStalled ? Math.min((timeSinceLastToken - 3e3) / 2e3, 1) : 0;
  if (!reducedMotion && (intensity > 0 || stalledIntensityRef.current > 0)) {
    const dt = time - lastSmoothTime.current;
    if (dt >= 50) {
      const steps = Math.floor(dt / 50);
      let current = stalledIntensityRef.current;
      for (let i = 0; i < steps; i++) {
        const diff = intensity - current;
        if (Math.abs(diff) < 0.01) {
          current = intensity;
          break;
        }
        current += diff * 0.1;
      }
      stalledIntensityRef.current = current;
      lastSmoothTime.current = time;
    }
  } else {
    stalledIntensityRef.current = intensity;
    lastSmoothTime.current = time;
  }
  const effectiveIntensity = reducedMotion ? intensity : stalledIntensityRef.current;
  return { isStalled, stalledIntensity: effectiveIntensity };
}
export {
  useStalledAnimation
};
