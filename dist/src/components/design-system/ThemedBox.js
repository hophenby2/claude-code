import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import Box from "../../ink/components/Box.js";
import { getTheme } from "../../utils/theme.js";
import { useTheme } from "./ThemeProvider.js";
function resolveColor(color, theme) {
  if (!color) return void 0;
  if (color.startsWith("rgb(") || color.startsWith("#") || color.startsWith("ansi256(") || color.startsWith("ansi:")) {
    return color;
  }
  return theme[color];
}
function ThemedBox(t0) {
  const $ = _c(33);
  let backgroundColor;
  let borderBottomColor;
  let borderColor;
  let borderLeftColor;
  let borderRightColor;
  let borderTopColor;
  let children;
  let ref;
  let rest;
  if ($[0] !== t0) {
    ({
      borderColor,
      borderTopColor,
      borderBottomColor,
      borderLeftColor,
      borderRightColor,
      backgroundColor,
      children,
      ref,
      ...rest
    } = t0);
    $[0] = t0;
    $[1] = backgroundColor;
    $[2] = borderBottomColor;
    $[3] = borderColor;
    $[4] = borderLeftColor;
    $[5] = borderRightColor;
    $[6] = borderTopColor;
    $[7] = children;
    $[8] = ref;
    $[9] = rest;
  } else {
    backgroundColor = $[1];
    borderBottomColor = $[2];
    borderColor = $[3];
    borderLeftColor = $[4];
    borderRightColor = $[5];
    borderTopColor = $[6];
    children = $[7];
    ref = $[8];
    rest = $[9];
  }
  const [themeName] = useTheme();
  let resolvedBorderBottomColor;
  let resolvedBorderColor;
  let resolvedBorderLeftColor;
  let resolvedBorderRightColor;
  let resolvedBorderTopColor;
  let t1;
  if ($[10] !== backgroundColor || $[11] !== borderBottomColor || $[12] !== borderColor || $[13] !== borderLeftColor || $[14] !== borderRightColor || $[15] !== borderTopColor || $[16] !== themeName) {
    const theme = getTheme(themeName);
    resolvedBorderColor = resolveColor(borderColor, theme);
    resolvedBorderTopColor = resolveColor(borderTopColor, theme);
    resolvedBorderBottomColor = resolveColor(borderBottomColor, theme);
    resolvedBorderLeftColor = resolveColor(borderLeftColor, theme);
    resolvedBorderRightColor = resolveColor(borderRightColor, theme);
    t1 = resolveColor(backgroundColor, theme);
    $[10] = backgroundColor;
    $[11] = borderBottomColor;
    $[12] = borderColor;
    $[13] = borderLeftColor;
    $[14] = borderRightColor;
    $[15] = borderTopColor;
    $[16] = themeName;
    $[17] = resolvedBorderBottomColor;
    $[18] = resolvedBorderColor;
    $[19] = resolvedBorderLeftColor;
    $[20] = resolvedBorderRightColor;
    $[21] = resolvedBorderTopColor;
    $[22] = t1;
  } else {
    resolvedBorderBottomColor = $[17];
    resolvedBorderColor = $[18];
    resolvedBorderLeftColor = $[19];
    resolvedBorderRightColor = $[20];
    resolvedBorderTopColor = $[21];
    t1 = $[22];
  }
  const resolvedBackgroundColor = t1;
  let t2;
  if ($[23] !== children || $[24] !== ref || $[25] !== resolvedBackgroundColor || $[26] !== resolvedBorderBottomColor || $[27] !== resolvedBorderColor || $[28] !== resolvedBorderLeftColor || $[29] !== resolvedBorderRightColor || $[30] !== resolvedBorderTopColor || $[31] !== rest) {
    t2 = /* @__PURE__ */ jsx(Box, { ref, borderColor: resolvedBorderColor, borderTopColor: resolvedBorderTopColor, borderBottomColor: resolvedBorderBottomColor, borderLeftColor: resolvedBorderLeftColor, borderRightColor: resolvedBorderRightColor, backgroundColor: resolvedBackgroundColor, ...rest, children });
    $[23] = children;
    $[24] = ref;
    $[25] = resolvedBackgroundColor;
    $[26] = resolvedBorderBottomColor;
    $[27] = resolvedBorderColor;
    $[28] = resolvedBorderLeftColor;
    $[29] = resolvedBorderRightColor;
    $[30] = resolvedBorderTopColor;
    $[31] = rest;
    $[32] = t2;
  } else {
    t2 = $[32];
  }
  return t2;
}
var ThemedBox_default = ThemedBox;
export {
  ThemedBox_default as default
};
