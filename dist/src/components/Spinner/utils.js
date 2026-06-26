function getDefaultCharacters() {
  if (process.env.TERM === "xterm-ghostty") {
    return ["\xB7", "\u2722", "\u2733", "\u2736", "\u273B", "*"];
  }
  return process.platform === "darwin" ? ["\xB7", "\u2722", "\u2733", "\u2736", "\u273B", "\u273D"] : ["\xB7", "\u2722", "*", "\u2736", "\u273B", "\u273D"];
}
function interpolateColor(color1, color2, t) {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * t),
    g: Math.round(color1.g + (color2.g - color1.g) * t),
    b: Math.round(color1.b + (color2.b - color1.b) * t)
  };
}
function toRGBColor(color) {
  return `rgb(${color.r},${color.g},${color.b})`;
}
function hueToRgb(hue) {
  const h = (hue % 360 + 360) % 360;
  const s = 0.7;
  const l = 0.6;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(h / 60 % 2 - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}
const RGB_CACHE = /* @__PURE__ */ new Map();
function parseRGB(colorStr) {
  const cached = RGB_CACHE.get(colorStr);
  if (cached !== void 0) return cached;
  const match = colorStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  const result = match ? {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10)
  } : null;
  RGB_CACHE.set(colorStr, result);
  return result;
}
export {
  getDefaultCharacters,
  hueToRgb,
  interpolateColor,
  parseRGB,
  toRGBColor
};
