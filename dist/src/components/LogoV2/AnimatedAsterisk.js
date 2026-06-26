import { jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { TEARDROP_ASTERISK } from "../../constants/figures.js";
import { Box, Text, useAnimationFrame } from "../../ink.js";
import { getInitialSettings } from "../../utils/settings/settings.js";
import { hueToRgb, toRGBColor } from "../Spinner/utils.js";
const SWEEP_DURATION_MS = 1500;
const SWEEP_COUNT = 2;
const TOTAL_ANIMATION_MS = SWEEP_DURATION_MS * SWEEP_COUNT;
const SETTLED_GREY = toRGBColor({
  r: 153,
  g: 153,
  b: 153
});
function AnimatedAsterisk({
  char = TEARDROP_ASTERISK
}) {
  const [reducedMotion] = useState(() => getInitialSettings().prefersReducedMotion ?? false);
  const [done, setDone] = useState(reducedMotion);
  const startTimeRef = useRef(null);
  const [ref, time] = useAnimationFrame(done ? null : 50);
  useEffect(() => {
    if (done) return;
    const t = setTimeout(setDone, TOTAL_ANIMATION_MS, true);
    return () => clearTimeout(t);
  }, [done]);
  if (done) {
    return /* @__PURE__ */ jsx(Box, { ref, children: /* @__PURE__ */ jsx(Text, { color: SETTLED_GREY, children: char }) });
  }
  if (startTimeRef.current === null) {
    startTimeRef.current = time;
  }
  const elapsed = time - startTimeRef.current;
  const hue = elapsed / SWEEP_DURATION_MS * 360 % 360;
  return /* @__PURE__ */ jsx(Box, { ref, children: /* @__PURE__ */ jsx(Text, { color: toRGBColor(hueToRgb(hue)), children: char }) });
}
export {
  AnimatedAsterisk
};
