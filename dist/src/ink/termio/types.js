function defaultStyle() {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: "none",
    blink: false,
    inverse: false,
    hidden: false,
    strikethrough: false,
    overline: false,
    fg: { type: "default" },
    bg: { type: "default" },
    underlineColor: { type: "default" }
  };
}
function stylesEqual(a, b) {
  return a.bold === b.bold && a.dim === b.dim && a.italic === b.italic && a.underline === b.underline && a.blink === b.blink && a.inverse === b.inverse && a.hidden === b.hidden && a.strikethrough === b.strikethrough && a.overline === b.overline && colorsEqual(a.fg, b.fg) && colorsEqual(a.bg, b.bg) && colorsEqual(a.underlineColor, b.underlineColor);
}
function colorsEqual(a, b) {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "named":
      return a.name === b.name;
    case "indexed":
      return a.index === b.index;
    case "rgb":
      return a.r === b.r && a.g === b.g && a.b === b.b;
    case "default":
      return true;
  }
}
export {
  colorsEqual,
  defaultStyle,
  stylesEqual
};
