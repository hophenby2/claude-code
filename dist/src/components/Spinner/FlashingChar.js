import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Text, useTheme } from "../../ink.js";
import { getTheme } from "../../utils/theme.js";
import { interpolateColor, parseRGB, toRGBColor } from "./utils.js";
function FlashingChar(t0) {
  const $ = _c(9);
  const {
    char,
    flashOpacity,
    messageColor,
    shimmerColor
  } = t0;
  const [themeName] = useTheme();
  let t1;
  if ($[0] !== char || $[1] !== flashOpacity || $[2] !== messageColor || $[3] !== shimmerColor || $[4] !== themeName) {
    t1 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const theme = getTheme(themeName);
      const baseColorStr = theme[messageColor];
      const shimmerColorStr = theme[shimmerColor];
      const baseRGB = baseColorStr ? parseRGB(baseColorStr) : null;
      const shimmerRGB = shimmerColorStr ? parseRGB(shimmerColorStr) : null;
      if (baseRGB && shimmerRGB) {
        const interpolated = interpolateColor(baseRGB, shimmerRGB, flashOpacity);
        t1 = /* @__PURE__ */ jsx(Text, { color: toRGBColor(interpolated), children: char });
        break bb0;
      }
    }
    $[0] = char;
    $[1] = flashOpacity;
    $[2] = messageColor;
    $[3] = shimmerColor;
    $[4] = themeName;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  if (t1 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t1;
  }
  const shouldUseShimmer = flashOpacity > 0.5;
  const t2 = shouldUseShimmer ? shimmerColor : messageColor;
  let t3;
  if ($[6] !== char || $[7] !== t2) {
    t3 = /* @__PURE__ */ jsx(Text, { color: t2, children: char });
    $[6] = char;
    $[7] = t2;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  return t3;
}
export {
  FlashingChar
};
