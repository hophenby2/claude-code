import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import React, { useContext } from "react";
import Text from "../../ink/components/Text.js";
import { getTheme } from "../../utils/theme.js";
import { useTheme } from "./ThemeProvider.js";
const TextHoverColorContext = React.createContext(void 0);
function resolveColor(color, theme) {
  if (!color) return void 0;
  if (color.startsWith("rgb(") || color.startsWith("#") || color.startsWith("ansi256(") || color.startsWith("ansi:")) {
    return color;
  }
  return theme[color];
}
function ThemedText(t0) {
  const $ = _c(10);
  const {
    color,
    backgroundColor,
    dimColor: t1,
    bold: t2,
    italic: t3,
    underline: t4,
    strikethrough: t5,
    inverse: t6,
    wrap: t7,
    children
  } = t0;
  const dimColor = t1 === void 0 ? false : t1;
  const bold = t2 === void 0 ? false : t2;
  const italic = t3 === void 0 ? false : t3;
  const underline = t4 === void 0 ? false : t4;
  const strikethrough = t5 === void 0 ? false : t5;
  const inverse = t6 === void 0 ? false : t6;
  const wrap = t7 === void 0 ? "wrap" : t7;
  const [themeName] = useTheme();
  const theme = getTheme(themeName);
  const hoverColor = useContext(TextHoverColorContext);
  const resolvedColor = !color && hoverColor ? resolveColor(hoverColor, theme) : dimColor ? theme.inactive : resolveColor(color, theme);
  const resolvedBackgroundColor = backgroundColor ? theme[backgroundColor] : void 0;
  let t8;
  if ($[0] !== bold || $[1] !== children || $[2] !== inverse || $[3] !== italic || $[4] !== resolvedBackgroundColor || $[5] !== resolvedColor || $[6] !== strikethrough || $[7] !== underline || $[8] !== wrap) {
    t8 = /* @__PURE__ */ jsx(Text, { color: resolvedColor, backgroundColor: resolvedBackgroundColor, bold, italic, underline, strikethrough, inverse, wrap, children });
    $[0] = bold;
    $[1] = children;
    $[2] = inverse;
    $[3] = italic;
    $[4] = resolvedBackgroundColor;
    $[5] = resolvedColor;
    $[6] = strikethrough;
    $[7] = underline;
    $[8] = wrap;
    $[9] = t8;
  } else {
    t8 = $[9];
  }
  return t8;
}
export {
  TextHoverColorContext,
  ThemedText as default
};
