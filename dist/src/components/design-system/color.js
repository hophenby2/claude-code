import { colorize } from "../../ink/colorize.js";
import { getTheme } from "../../utils/theme.js";
function color(c, theme, type = "foreground") {
  return (text) => {
    if (!c) {
      return text;
    }
    if (c.startsWith("rgb(") || c.startsWith("#") || c.startsWith("ansi256(") || c.startsWith("ansi:")) {
      return colorize(text, c, type);
    }
    return colorize(text, getTheme(theme)[c], type);
  };
}
export {
  color
};
