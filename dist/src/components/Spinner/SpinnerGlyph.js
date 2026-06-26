import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text, useTheme } from "../../ink.js";
import { getTheme } from "../../utils/theme.js";
import { getDefaultCharacters, interpolateColor, parseRGB, toRGBColor } from "./utils.js";
const DEFAULT_CHARACTERS = getDefaultCharacters();
const SPINNER_FRAMES = [...DEFAULT_CHARACTERS, ...[...DEFAULT_CHARACTERS].reverse()];
const REDUCED_MOTION_DOT = "\u25CF";
const REDUCED_MOTION_CYCLE_MS = 2e3;
const ERROR_RED = {
  r: 171,
  g: 43,
  b: 63
};
function SpinnerGlyph(t0) {
  const $ = _c(9);
  const {
    frame,
    messageColor,
    stalledIntensity: t1,
    reducedMotion: t2,
    time: t3
  } = t0;
  const stalledIntensity = t1 === void 0 ? 0 : t1;
  const reducedMotion = t2 === void 0 ? false : t2;
  const time = t3 === void 0 ? 0 : t3;
  const [themeName] = useTheme();
  const theme = getTheme(themeName);
  if (reducedMotion) {
    const isDim = Math.floor(time / (REDUCED_MOTION_CYCLE_MS / 2)) % 2 === 1;
    let t42;
    if ($[0] !== isDim || $[1] !== messageColor) {
      t42 = /* @__PURE__ */ jsx(Box, { flexWrap: "wrap", height: 1, width: 2, children: /* @__PURE__ */ jsx(Text, { color: messageColor, dimColor: isDim, children: REDUCED_MOTION_DOT }) });
      $[0] = isDim;
      $[1] = messageColor;
      $[2] = t42;
    } else {
      t42 = $[2];
    }
    return t42;
  }
  const spinnerChar = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
  if (stalledIntensity > 0) {
    const baseColorStr = theme[messageColor];
    const baseRGB = baseColorStr ? parseRGB(baseColorStr) : null;
    if (baseRGB) {
      const interpolated = interpolateColor(baseRGB, ERROR_RED, stalledIntensity);
      return /* @__PURE__ */ jsx(Box, { flexWrap: "wrap", height: 1, width: 2, children: /* @__PURE__ */ jsx(Text, { color: toRGBColor(interpolated), children: spinnerChar }) });
    }
    const color = stalledIntensity > 0.5 ? "error" : messageColor;
    let t42;
    if ($[3] !== color || $[4] !== spinnerChar) {
      t42 = /* @__PURE__ */ jsx(Box, { flexWrap: "wrap", height: 1, width: 2, children: /* @__PURE__ */ jsx(Text, { color, children: spinnerChar }) });
      $[3] = color;
      $[4] = spinnerChar;
      $[5] = t42;
    } else {
      t42 = $[5];
    }
    return t42;
  }
  let t4;
  if ($[6] !== messageColor || $[7] !== spinnerChar) {
    t4 = /* @__PURE__ */ jsx(Box, { flexWrap: "wrap", height: 1, width: 2, children: /* @__PURE__ */ jsx(Text, { color: messageColor, children: spinnerChar }) });
    $[6] = messageColor;
    $[7] = spinnerChar;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  return t4;
}
export {
  SpinnerGlyph
};
