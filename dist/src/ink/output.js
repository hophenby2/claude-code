import {
  styledCharsFromTokens,
  tokenize
} from "@alcalzone/ansi-tokenize";
import { logForDebugging } from "../utils/debug.js";
import { getGraphemeSegmenter } from "../utils/intl.js";
import sliceAnsi from "../utils/sliceAnsi.js";
import { reorderBidi } from "./bidi.js";
import { unionRect } from "./layout/geometry.js";
import {
  blitRegion,
  CellWidth,
  extractHyperlinkFromStyles,
  filterOutHyperlinkStyles,
  markNoSelectRegion,
  OSC8_PREFIX,
  resetScreen,
  setCellAt,
  shiftRows
} from "./screen.js";
import { stringWidth } from "./stringWidth.js";
import { widestLine } from "./widest-line.js";
function intersectClip(parent, child) {
  if (!parent) return child;
  return {
    x1: maxDefined(parent.x1, child.x1),
    x2: minDefined(parent.x2, child.x2),
    y1: maxDefined(parent.y1, child.y1),
    y2: minDefined(parent.y2, child.y2)
  };
}
function maxDefined(a, b) {
  if (a === void 0) return b;
  if (b === void 0) return a;
  return Math.max(a, b);
}
function minDefined(a, b) {
  if (a === void 0) return b;
  if (b === void 0) return a;
  return Math.min(a, b);
}
class Output {
  width;
  height;
  stylePool;
  screen;
  operations = [];
  charCache = /* @__PURE__ */ new Map();
  constructor(options) {
    const { width, height, stylePool, screen } = options;
    this.width = width;
    this.height = height;
    this.stylePool = stylePool;
    this.screen = screen;
    resetScreen(screen, width, height);
  }
  /**
   * Reuse this Output for a new frame. Zeroes the screen buffer, clears
   * the operation list (backing storage is retained), and caps charCache
   * growth. Preserving charCache across frames is the main win — most
   * lines don't change between renders, so tokenize + grapheme clustering
   * becomes a cache hit.
   */
  reset(width, height, screen) {
    this.width = width;
    this.height = height;
    this.screen = screen;
    this.operations.length = 0;
    resetScreen(screen, width, height);
    if (this.charCache.size > 16384) this.charCache.clear();
  }
  /**
   * Copy cells from a source screen region (blit = block image transfer).
   */
  blit(src, x, y, width, height) {
    this.operations.push({ type: "blit", src, x, y, width, height });
  }
  /**
   * Shift full-width rows within [top, bottom] by n. n > 0 = up. Mirrors
   * what DECSTBM + SU/SD does to the terminal. Paired with blit() to reuse
   * prevScreen content during pure scroll, avoiding full child re-render.
   */
  shift(top, bottom, n) {
    this.operations.push({ type: "shift", top, bottom, n });
  }
  /**
   * Clear a region by writing empty cells. Used when a node shrinks to
   * ensure stale content from the previous frame is removed.
   */
  clear(region, fromAbsolute) {
    this.operations.push({ type: "clear", region, fromAbsolute });
  }
  /**
   * Mark a region as non-selectable (excluded from fullscreen text
   * selection copy + highlight). Used by <NoSelect> to fence off
   * gutters (line numbers, diff sigils). Applied AFTER blit/write so
   * the mark wins regardless of what's blitted into the region.
   */
  noSelect(region) {
    this.operations.push({ type: "noSelect", region });
  }
  write(x, y, text, softWrap) {
    if (!text) {
      return;
    }
    this.operations.push({
      type: "write",
      x,
      y,
      text,
      softWrap
    });
  }
  clip(clip) {
    this.operations.push({
      type: "clip",
      clip
    });
  }
  unclip() {
    this.operations.push({
      type: "unclip"
    });
  }
  get() {
    const screen = this.screen;
    const screenWidth = this.width;
    const screenHeight = this.height;
    let blitCells = 0;
    let writeCells = 0;
    const absoluteClears = [];
    for (const operation of this.operations) {
      if (operation.type !== "clear") continue;
      const { x, y, width, height } = operation.region;
      const startX = Math.max(0, x);
      const startY = Math.max(0, y);
      const maxX = Math.min(x + width, screenWidth);
      const maxY = Math.min(y + height, screenHeight);
      if (startX >= maxX || startY >= maxY) continue;
      const rect = {
        x: startX,
        y: startY,
        width: maxX - startX,
        height: maxY - startY
      };
      screen.damage = screen.damage ? unionRect(screen.damage, rect) : rect;
      if (operation.fromAbsolute) absoluteClears.push(rect);
    }
    const clips = [];
    for (const operation of this.operations) {
      switch (operation.type) {
        case "clear":
          continue;
        case "clip":
          clips.push(intersectClip(clips.at(-1), operation.clip));
          continue;
        case "unclip":
          clips.pop();
          continue;
        case "blit": {
          const {
            src,
            x: regionX,
            y: regionY,
            width: regionWidth,
            height: regionHeight
          } = operation;
          const clip = clips.at(-1);
          const startX = Math.max(regionX, clip?.x1 ?? 0);
          const startY = Math.max(regionY, clip?.y1 ?? 0);
          const maxY = Math.min(
            regionY + regionHeight,
            screenHeight,
            src.height,
            clip?.y2 ?? Infinity
          );
          const maxX = Math.min(
            regionX + regionWidth,
            screenWidth,
            src.width,
            clip?.x2 ?? Infinity
          );
          if (startX >= maxX || startY >= maxY) continue;
          if (absoluteClears.length === 0) {
            blitRegion(screen, src, startX, startY, maxX, maxY);
            blitCells += (maxY - startY) * (maxX - startX);
            continue;
          }
          let rowStart = startY;
          for (let row = startY; row <= maxY; row++) {
            const excluded = row < maxY && absoluteClears.some(
              (r) => row >= r.y && row < r.y + r.height && startX >= r.x && maxX <= r.x + r.width
            );
            if (excluded || row === maxY) {
              if (row > rowStart) {
                blitRegion(screen, src, startX, rowStart, maxX, row);
                blitCells += (row - rowStart) * (maxX - startX);
              }
              rowStart = row + 1;
            }
          }
          continue;
        }
        case "shift": {
          shiftRows(screen, operation.top, operation.bottom, operation.n);
          continue;
        }
        case "write": {
          const { text, softWrap } = operation;
          let { x, y } = operation;
          let lines = text.split("\n");
          let swFrom = 0;
          let prevContentEnd = 0;
          const clip = clips.at(-1);
          if (clip) {
            const clipHorizontally = typeof clip?.x1 === "number" && typeof clip?.x2 === "number";
            const clipVertically = typeof clip?.y1 === "number" && typeof clip?.y2 === "number";
            if (clipHorizontally) {
              const width = widestLine(text);
              if (x + width <= clip.x1 || x >= clip.x2) {
                continue;
              }
            }
            if (clipVertically) {
              const height = lines.length;
              if (y + height <= clip.y1 || y >= clip.y2) {
                continue;
              }
            }
            if (clipHorizontally) {
              lines = lines.map((line) => {
                const from = x < clip.x1 ? clip.x1 - x : 0;
                const width = stringWidth(line);
                const to = x + width > clip.x2 ? clip.x2 - x : width;
                let sliced = sliceAnsi(line, from, to);
                if (stringWidth(sliced) > to - from) {
                  sliced = sliceAnsi(line, from, to - 1);
                }
                return sliced;
              });
              if (x < clip.x1) {
                x = clip.x1;
              }
            }
            if (clipVertically) {
              const from = y < clip.y1 ? clip.y1 - y : 0;
              const height = lines.length;
              const to = y + height > clip.y2 ? clip.y2 - y : height;
              if (softWrap && from > 0 && softWrap[from] === true) {
                prevContentEnd = x + stringWidth(lines[from - 1]);
              }
              lines = lines.slice(from, to);
              swFrom = from;
              if (y < clip.y1) {
                y = clip.y1;
              }
            }
          }
          const swBits = screen.softWrap;
          let offsetY = 0;
          for (const line of lines) {
            const lineY = y + offsetY;
            if (lineY >= screenHeight) {
              break;
            }
            const contentEnd = writeLineToScreen(
              screen,
              line,
              x,
              lineY,
              screenWidth,
              this.stylePool,
              this.charCache
            );
            writeCells += contentEnd - x;
            if (softWrap) {
              const isSW = softWrap[swFrom + offsetY] === true;
              swBits[lineY] = isSW ? prevContentEnd : 0;
              prevContentEnd = contentEnd;
            }
            offsetY++;
          }
          continue;
        }
      }
    }
    for (const operation of this.operations) {
      if (operation.type === "noSelect") {
        const { x, y, width, height } = operation.region;
        markNoSelectRegion(screen, x, y, width, height);
      }
    }
    const totalCells = blitCells + writeCells;
    if (totalCells > 1e3 && writeCells > blitCells) {
      logForDebugging(
        `High write ratio: blit=${blitCells}, write=${writeCells} (${(writeCells / totalCells * 100).toFixed(1)}% writes), screen=${screenHeight}x${screenWidth}`
      );
    }
    return screen;
  }
}
function stylesEqual(a, b) {
  if (a === b) return true;
  const len = a.length;
  if (len !== b.length) return false;
  if (len === 0) return true;
  for (let i = 0; i < len; i++) {
    if (a[i].code !== b[i].code) return false;
  }
  return true;
}
function styledCharsWithGraphemeClustering(chars, stylePool) {
  const charCount = chars.length;
  if (charCount === 0) return [];
  const result = [];
  const bufferChars = [];
  let bufferStyles = chars[0].styles;
  for (let i = 0; i < charCount; i++) {
    const char = chars[i];
    const styles = char.styles;
    if (bufferChars.length > 0 && !stylesEqual(styles, bufferStyles)) {
      flushBuffer(bufferChars.join(""), bufferStyles, stylePool, result);
      bufferChars.length = 0;
    }
    bufferChars.push(char.value);
    bufferStyles = styles;
  }
  if (bufferChars.length > 0) {
    flushBuffer(bufferChars.join(""), bufferStyles, stylePool, result);
  }
  return result;
}
function flushBuffer(buffer, styles, stylePool, out) {
  const hyperlink = extractHyperlinkFromStyles(styles) ?? void 0;
  const hasOsc8Styles = hyperlink !== void 0 || styles.some(
    (s) => s.code.length >= OSC8_PREFIX.length && s.code.startsWith(OSC8_PREFIX)
  );
  const filteredStyles = hasOsc8Styles ? filterOutHyperlinkStyles(styles) : styles;
  const styleId = stylePool.intern(filteredStyles);
  for (const { segment: grapheme } of getGraphemeSegmenter().segment(buffer)) {
    out.push({
      value: grapheme,
      width: stringWidth(grapheme),
      styleId,
      hyperlink
    });
  }
}
function writeLineToScreen(screen, line, x, y, screenWidth, stylePool, charCache) {
  let characters = charCache.get(line);
  if (!characters) {
    characters = reorderBidi(
      styledCharsWithGraphemeClustering(
        styledCharsFromTokens(tokenize(line)),
        stylePool
      )
    );
    charCache.set(line, characters);
  }
  let offsetX = x;
  for (let charIdx = 0; charIdx < characters.length; charIdx++) {
    const character = characters[charIdx];
    const codePoint = character.value.codePointAt(0);
    if (codePoint !== void 0 && codePoint <= 31) {
      if (codePoint === 9) {
        const tabWidth = 8;
        const spacesToNextStop = tabWidth - offsetX % tabWidth;
        for (let i = 0; i < spacesToNextStop && offsetX < screenWidth; i++) {
          setCellAt(screen, offsetX, y, {
            char: " ",
            styleId: stylePool.none,
            width: CellWidth.Narrow,
            hyperlink: void 0
          });
          offsetX++;
        }
      } else if (codePoint === 27) {
        const nextChar = characters[charIdx + 1]?.value;
        const nextCode = nextChar?.codePointAt(0);
        if (nextChar === "(" || nextChar === ")" || nextChar === "*" || nextChar === "+") {
          charIdx += 2;
        } else if (nextChar === "[") {
          charIdx++;
          while (charIdx < characters.length - 1) {
            charIdx++;
            const c = characters[charIdx]?.value.codePointAt(0);
            if (c !== void 0 && c >= 64 && c <= 126) {
              break;
            }
          }
        } else if (nextChar === "]" || nextChar === "P" || nextChar === "_" || nextChar === "^" || nextChar === "X") {
          charIdx++;
          while (charIdx < characters.length - 1) {
            charIdx++;
            const c = characters[charIdx]?.value;
            if (c === "\x07") {
              break;
            }
            if (c === "\x1B") {
              const nextC = characters[charIdx + 1]?.value;
              if (nextC === "\\") {
                charIdx++;
                break;
              }
            }
          }
        } else if (nextCode !== void 0 && nextCode >= 48 && nextCode <= 126) {
          charIdx++;
        }
      }
      continue;
    }
    const charWidth = character.width;
    if (charWidth === 0) {
      continue;
    }
    const isWideCharacter = charWidth >= 2;
    if (isWideCharacter && offsetX + 2 > screenWidth) {
      setCellAt(screen, offsetX, y, {
        char: " ",
        styleId: stylePool.none,
        width: CellWidth.SpacerHead,
        hyperlink: void 0
      });
      offsetX++;
      continue;
    }
    setCellAt(screen, offsetX, y, {
      char: character.value,
      styleId: character.styleId,
      width: isWideCharacter ? CellWidth.Wide : CellWidth.Narrow,
      hyperlink: character.hyperlink
    });
    offsetX += isWideCharacter ? 2 : 1;
  }
  return offsetX;
}
export {
  Output as default
};
