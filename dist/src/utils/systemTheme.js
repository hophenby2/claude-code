let cachedSystemTheme;
function getSystemThemeName() {
  if (cachedSystemTheme === void 0) {
    cachedSystemTheme = detectFromColorFgBg() ?? "dark";
  }
  return cachedSystemTheme;
}
function setCachedSystemTheme(theme) {
  cachedSystemTheme = theme;
}
function resolveThemeSetting(setting) {
  if (setting === "auto") {
    return getSystemThemeName();
  }
  return setting;
}
function themeFromOscColor(data) {
  const rgb = parseOscRgb(data);
  if (!rgb) return void 0;
  const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return luminance > 0.5 ? "light" : "dark";
}
function parseOscRgb(data) {
  const rgbMatch = /^rgba?:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i.exec(data);
  if (rgbMatch) {
    return {
      r: hexComponent(rgbMatch[1]),
      g: hexComponent(rgbMatch[2]),
      b: hexComponent(rgbMatch[3])
    };
  }
  const hashMatch = /^#([0-9a-f]+)$/i.exec(data);
  if (hashMatch && hashMatch[1].length % 3 === 0) {
    const hex = hashMatch[1];
    const n = hex.length / 3;
    return {
      r: hexComponent(hex.slice(0, n)),
      g: hexComponent(hex.slice(n, 2 * n)),
      b: hexComponent(hex.slice(2 * n))
    };
  }
  return void 0;
}
function hexComponent(hex) {
  const max = 16 ** hex.length - 1;
  return parseInt(hex, 16) / max;
}
function detectFromColorFgBg() {
  const colorfgbg = process.env["COLORFGBG"];
  if (!colorfgbg) return void 0;
  const parts = colorfgbg.split(";");
  const bg = parts[parts.length - 1];
  if (bg === void 0 || bg === "") return void 0;
  const bgNum = Number(bg);
  if (!Number.isInteger(bgNum) || bgNum < 0 || bgNum > 15) return void 0;
  return bgNum <= 6 || bgNum === 8 ? "dark" : "light";
}
export {
  getSystemThemeName,
  resolveThemeSetting,
  setCachedSystemTheme,
  themeFromOscColor
};
