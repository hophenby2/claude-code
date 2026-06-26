import { escapeXml } from "./xml.js";
const ANSI_COLORS = {
  30: { r: 0, g: 0, b: 0 },
  // black
  31: { r: 205, g: 49, b: 49 },
  // red
  32: { r: 13, g: 188, b: 121 },
  // green
  33: { r: 229, g: 229, b: 16 },
  // yellow
  34: { r: 36, g: 114, b: 200 },
  // blue
  35: { r: 188, g: 63, b: 188 },
  // magenta
  36: { r: 17, g: 168, b: 205 },
  // cyan
  37: { r: 229, g: 229, b: 229 },
  // white
  // Bright colors
  90: { r: 102, g: 102, b: 102 },
  // bright black (gray)
  91: { r: 241, g: 76, b: 76 },
  // bright red
  92: { r: 35, g: 209, b: 139 },
  // bright green
  93: { r: 245, g: 245, b: 67 },
  // bright yellow
  94: { r: 59, g: 142, b: 234 },
  // bright blue
  95: { r: 214, g: 112, b: 214 },
  // bright magenta
  96: { r: 41, g: 184, b: 219 },
  // bright cyan
  97: { r: 255, g: 255, b: 255 }
  // bright white
};
const DEFAULT_FG = { r: 229, g: 229, b: 229 };
const DEFAULT_BG = { r: 30, g: 30, b: 30 };
function parseAnsi(text) {
  const lines = [];
  const rawLines = text.split("\n");
  for (const line of rawLines) {
    const spans = [];
    let currentColor = DEFAULT_FG;
    let bold = false;
    let i = 0;
    while (i < line.length) {
      if (line[i] === "\x1B" && line[i + 1] === "[") {
        let j = i + 2;
        while (j < line.length && !/[A-Za-z]/.test(line[j])) {
          j++;
        }
        if (line[j] === "m") {
          const codes = line.slice(i + 2, j).split(";").map(Number);
          let k = 0;
          while (k < codes.length) {
            const code = codes[k];
            if (code === 0) {
              currentColor = DEFAULT_FG;
              bold = false;
            } else if (code === 1) {
              bold = true;
            } else if (code >= 30 && code <= 37) {
              currentColor = ANSI_COLORS[code] || DEFAULT_FG;
            } else if (code >= 90 && code <= 97) {
              currentColor = ANSI_COLORS[code] || DEFAULT_FG;
            } else if (code === 39) {
              currentColor = DEFAULT_FG;
            } else if (code === 38) {
              if (codes[k + 1] === 5 && codes[k + 2] !== void 0) {
                const colorIndex = codes[k + 2];
                currentColor = get256Color(colorIndex);
                k += 2;
              } else if (codes[k + 1] === 2 && codes[k + 2] !== void 0 && codes[k + 3] !== void 0 && codes[k + 4] !== void 0) {
                currentColor = {
                  r: codes[k + 2],
                  g: codes[k + 3],
                  b: codes[k + 4]
                };
                k += 4;
              }
            }
            k++;
          }
        }
        i = j + 1;
        continue;
      }
      const textStart = i;
      while (i < line.length && line[i] !== "\x1B") {
        i++;
      }
      const spanText = line.slice(textStart, i);
      if (spanText) {
        spans.push({ text: spanText, color: currentColor, bold });
      }
    }
    if (spans.length === 0) {
      spans.push({ text: "", color: DEFAULT_FG, bold: false });
    }
    lines.push(spans);
  }
  return lines;
}
function get256Color(index) {
  if (index < 16) {
    const standardColors = [
      { r: 0, g: 0, b: 0 },
      // 0 black
      { r: 128, g: 0, b: 0 },
      // 1 red
      { r: 0, g: 128, b: 0 },
      // 2 green
      { r: 128, g: 128, b: 0 },
      // 3 yellow
      { r: 0, g: 0, b: 128 },
      // 4 blue
      { r: 128, g: 0, b: 128 },
      // 5 magenta
      { r: 0, g: 128, b: 128 },
      // 6 cyan
      { r: 192, g: 192, b: 192 },
      // 7 white
      { r: 128, g: 128, b: 128 },
      // 8 bright black
      { r: 255, g: 0, b: 0 },
      // 9 bright red
      { r: 0, g: 255, b: 0 },
      // 10 bright green
      { r: 255, g: 255, b: 0 },
      // 11 bright yellow
      { r: 0, g: 0, b: 255 },
      // 12 bright blue
      { r: 255, g: 0, b: 255 },
      // 13 bright magenta
      { r: 0, g: 255, b: 255 },
      // 14 bright cyan
      { r: 255, g: 255, b: 255 }
      // 15 bright white
    ];
    return standardColors[index] || DEFAULT_FG;
  }
  if (index < 232) {
    const i = index - 16;
    const r = Math.floor(i / 36);
    const g = Math.floor(i % 36 / 6);
    const b = i % 6;
    return {
      r: r === 0 ? 0 : 55 + r * 40,
      g: g === 0 ? 0 : 55 + g * 40,
      b: b === 0 ? 0 : 55 + b * 40
    };
  }
  const gray = (index - 232) * 10 + 8;
  return { r: gray, g: gray, b: gray };
}
function ansiToSvg(ansiText, options = {}) {
  const {
    fontFamily = "Menlo, Monaco, monospace",
    fontSize = 14,
    lineHeight = 22,
    paddingX = 24,
    paddingY = 24,
    backgroundColor = `rgb(${DEFAULT_BG.r}, ${DEFAULT_BG.g}, ${DEFAULT_BG.b})`,
    borderRadius = 8
  } = options;
  const lines = parseAnsi(ansiText);
  while (lines.length > 0 && lines[lines.length - 1].every((span) => span.text.trim() === "")) {
    lines.pop();
  }
  const charWidthEstimate = fontSize * 0.6;
  const maxLineLength = Math.max(
    ...lines.map((spans) => spans.reduce((acc, s) => acc + s.text.length, 0))
  );
  const width = Math.ceil(maxLineLength * charWidthEstimate + paddingX * 2);
  const height = lines.length * lineHeight + paddingY * 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
`;
  svg += `  <rect width="100%" height="100%" fill="${backgroundColor}" rx="${borderRadius}" ry="${borderRadius}"/>
`;
  svg += `  <style>
`;
  svg += `    text { font-family: ${fontFamily}; font-size: ${fontSize}px; white-space: pre; }
`;
  svg += `    .b { font-weight: bold; }
`;
  svg += `  </style>
`;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const spans = lines[lineIndex];
    const y = paddingY + (lineIndex + 1) * lineHeight - (lineHeight - fontSize) / 2;
    svg += `  <text x="${paddingX}" y="${y}" xml:space="preserve">`;
    for (const span of spans) {
      if (!span.text) continue;
      const colorStr = `rgb(${span.color.r}, ${span.color.g}, ${span.color.b})`;
      const boldClass = span.bold ? ' class="b"' : "";
      svg += `<tspan fill="${colorStr}"${boldClass}>${escapeXml(span.text)}</tspan>`;
    }
    svg += `</text>
`;
  }
  svg += `</svg>`;
  return svg;
}
export {
  DEFAULT_BG,
  DEFAULT_FG,
  ansiToSvg,
  parseAnsi
};
