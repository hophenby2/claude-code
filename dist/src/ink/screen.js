import {
  ansiCodesToString,
  diffAnsiCodes
} from "@alcalzone/ansi-tokenize";
import {
  unionRect
} from "./layout/geometry.js";
import { BEL, ESC, SEP } from "./termio/ansi.js";
import * as warn from "./warn.js";
class CharPool {
  strings = [" ", ""];
  // Index 0 = space, 1 = empty (spacer)
  stringMap = /* @__PURE__ */ new Map([
    [" ", 0],
    ["", 1]
  ]);
  ascii = initCharAscii();
  // charCode → index, -1 = not interned
  intern(char) {
    if (char.length === 1) {
      const code = char.charCodeAt(0);
      if (code < 128) {
        const cached = this.ascii[code];
        if (cached !== -1) return cached;
        const index2 = this.strings.length;
        this.strings.push(char);
        this.ascii[code] = index2;
        return index2;
      }
    }
    const existing = this.stringMap.get(char);
    if (existing !== void 0) return existing;
    const index = this.strings.length;
    this.strings.push(char);
    this.stringMap.set(char, index);
    return index;
  }
  get(index) {
    return this.strings[index] ?? " ";
  }
}
class HyperlinkPool {
  strings = [""];
  // Index 0 = no hyperlink
  stringMap = /* @__PURE__ */ new Map();
  intern(hyperlink) {
    if (!hyperlink) return 0;
    let id = this.stringMap.get(hyperlink);
    if (id === void 0) {
      id = this.strings.length;
      this.strings.push(hyperlink);
      this.stringMap.set(hyperlink, id);
    }
    return id;
  }
  get(id) {
    return id === 0 ? void 0 : this.strings[id];
  }
}
const INVERSE_CODE = {
  type: "ansi",
  code: "\x1B[7m",
  endCode: "\x1B[27m"
};
const BOLD_CODE = {
  type: "ansi",
  code: "\x1B[1m",
  endCode: "\x1B[22m"
};
const UNDERLINE_CODE = {
  type: "ansi",
  code: "\x1B[4m",
  endCode: "\x1B[24m"
};
const YELLOW_FG_CODE = {
  type: "ansi",
  code: "\x1B[33m",
  endCode: "\x1B[39m"
};
class StylePool {
  ids = /* @__PURE__ */ new Map();
  styles = [];
  transitionCache = /* @__PURE__ */ new Map();
  none;
  constructor() {
    this.none = this.intern([]);
  }
  /**
   * Intern a style and return its ID. Bit 0 of the ID encodes whether the
   * style has a visible effect on space characters (background, inverse,
   * underline, etc.). Foreground-only styles get even IDs; styles visible
   * on spaces get odd IDs. This lets the renderer skip invisible spaces
   * with a single bitmask check on the packed word.
   */
  intern(styles) {
    const key = styles.length === 0 ? "" : styles.map((s) => s.code).join("\0");
    let id = this.ids.get(key);
    if (id === void 0) {
      const rawId = this.styles.length;
      this.styles.push(styles.length === 0 ? [] : styles);
      id = rawId << 1 | (styles.length > 0 && hasVisibleSpaceEffect(styles) ? 1 : 0);
      this.ids.set(key, id);
    }
    return id;
  }
  /** Recover styles from an encoded ID. Strips the bit-0 flag via >>> 1. */
  get(id) {
    return this.styles[id >>> 1] ?? [];
  }
  /**
   * Returns the pre-serialized ANSI string to transition from one style to
   * another. Cached by (fromId, toId) — zero allocations after first call
   * for a given pair.
   */
  transition(fromId, toId) {
    if (fromId === toId) return "";
    const key = fromId * 1048576 + toId;
    let str = this.transitionCache.get(key);
    if (str === void 0) {
      str = ansiCodesToString(diffAnsiCodes(this.get(fromId), this.get(toId)));
      this.transitionCache.set(key, str);
    }
    return str;
  }
  /**
   * Intern a style that is `base + inverse`. Cached by base ID so
   * repeated calls for the same underlying style don't re-scan the
   * AnsiCode[] array. Used by the selection overlay.
   */
  inverseCache = /* @__PURE__ */ new Map();
  withInverse(baseId) {
    let id = this.inverseCache.get(baseId);
    if (id === void 0) {
      const baseCodes = this.get(baseId);
      const hasInverse = baseCodes.some((c) => c.endCode === "\x1B[27m");
      id = hasInverse ? baseId : this.intern([...baseCodes, INVERSE_CODE]);
      this.inverseCache.set(baseId, id);
    }
    return id;
  }
  /** Inverse + bold + yellow-bg-via-fg-swap for the CURRENT search match.
   *  OTHER matches are plain inverse — bg inherits from the theme. Current
   *  gets a distinct yellow bg (via fg-then-inverse swap) plus bold weight
   *  so it stands out in a sea of inverse. Underline was too subtle. Zero
   *  reflow risk: all pure SGR overlays, per-cell, post-layout. The yellow
   *  overrides any existing fg (syntax highlighting) on those cells — fine,
   *  the "you are here" signal IS the point, syntax color can yield. */
  currentMatchCache = /* @__PURE__ */ new Map();
  withCurrentMatch(baseId) {
    let id = this.currentMatchCache.get(baseId);
    if (id === void 0) {
      const baseCodes = this.get(baseId);
      const codes = baseCodes.filter(
        (c) => c.endCode !== "\x1B[39m" && c.endCode !== "\x1B[49m"
      );
      codes.push(YELLOW_FG_CODE);
      if (!baseCodes.some((c) => c.endCode === "\x1B[27m"))
        codes.push(INVERSE_CODE);
      if (!baseCodes.some((c) => c.endCode === "\x1B[22m")) codes.push(BOLD_CODE);
      if (!baseCodes.some((c) => c.endCode === "\x1B[24m"))
        codes.push(UNDERLINE_CODE);
      id = this.intern(codes);
      this.currentMatchCache.set(baseId, id);
    }
    return id;
  }
  /**
   * Selection overlay: REPLACE the cell's background with a solid color
   * while preserving its foreground (color, bold, italic, dim, underline).
   * Matches native terminal selection — a dedicated bg color, not SGR-7
   * inverse. Inverse swaps fg/bg per-cell, which fragments visually over
   * syntax-highlighted text (every fg color becomes a different bg stripe).
   *
   * Strips any existing bg (endCode 49m — REPLACES, so diff-added green
   * etc. don't bleed through) and any existing inverse (endCode 27m —
   * inverse on top of a solid bg would re-swap and look wrong).
   *
   * bg is set via setSelectionBg(); null → fallback to withInverse() so the
   * overlay still works before theme wiring sets a color (tests, first frame).
   * Cache is keyed by baseId only — setSelectionBg() clears it on change.
   */
  selectionBgCode = null;
  selectionBgCache = /* @__PURE__ */ new Map();
  setSelectionBg(bg) {
    if (this.selectionBgCode?.code === bg?.code) return;
    this.selectionBgCode = bg;
    this.selectionBgCache.clear();
  }
  withSelectionBg(baseId) {
    const bg = this.selectionBgCode;
    if (bg === null) return this.withInverse(baseId);
    let id = this.selectionBgCache.get(baseId);
    if (id === void 0) {
      const kept = this.get(baseId).filter(
        (c) => c.endCode !== "\x1B[49m" && c.endCode !== "\x1B[27m"
      );
      kept.push(bg);
      id = this.intern(kept);
      this.selectionBgCache.set(baseId, id);
    }
    return id;
  }
}
const VISIBLE_ON_SPACE = /* @__PURE__ */ new Set([
  "\x1B[49m",
  // background color
  "\x1B[27m",
  // inverse
  "\x1B[24m",
  // underline
  "\x1B[29m",
  // strikethrough
  "\x1B[55m"
  // overline
]);
function hasVisibleSpaceEffect(styles) {
  for (const style of styles) {
    if (VISIBLE_ON_SPACE.has(style.endCode)) return true;
  }
  return false;
}
var CellWidth = /* @__PURE__ */ ((CellWidth2) => {
  CellWidth2[CellWidth2["Narrow"] = 0] = "Narrow";
  CellWidth2[CellWidth2["Wide"] = 1] = "Wide";
  CellWidth2[CellWidth2["SpacerTail"] = 2] = "SpacerTail";
  CellWidth2[CellWidth2["SpacerHead"] = 3] = "SpacerHead";
  return CellWidth2;
})(CellWidth || {});
const EMPTY_CHAR_INDEX = 0;
const SPACER_CHAR_INDEX = 1;
function initCharAscii() {
  const table = new Int32Array(128);
  table.fill(-1);
  table[32] = EMPTY_CHAR_INDEX;
  return table;
}
const STYLE_SHIFT = 17;
const HYPERLINK_SHIFT = 2;
const HYPERLINK_MASK = 32767;
const WIDTH_MASK = 3;
function packWord1(styleId, hyperlinkId, width) {
  return styleId << STYLE_SHIFT | hyperlinkId << HYPERLINK_SHIFT | width;
}
const EMPTY_CELL_VALUE = 0n;
function isEmptyCellByIndex(screen, index) {
  const ci = index << 1;
  return screen.cells[ci] === 0 && screen.cells[ci | 1] === 0;
}
function isEmptyCellAt(screen, x, y) {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height) return true;
  return isEmptyCellByIndex(screen, y * screen.width + x);
}
function isCellEmpty(screen, cell) {
  return cell.char === " " && cell.styleId === screen.emptyStyleId && cell.width === 0 /* Narrow */ && !cell.hyperlink;
}
function internHyperlink(screen, hyperlink) {
  return screen.hyperlinkPool.intern(hyperlink);
}
function createScreen(width, height, styles, charPool, hyperlinkPool) {
  warn.ifNotInteger(width, "createScreen width");
  warn.ifNotInteger(height, "createScreen height");
  if (!Number.isInteger(width) || width < 0) {
    width = Math.max(0, Math.floor(width) || 0);
  }
  if (!Number.isInteger(height) || height < 0) {
    height = Math.max(0, Math.floor(height) || 0);
  }
  const size = width * height;
  const buf = new ArrayBuffer(size << 3);
  const cells = new Int32Array(buf);
  const cells64 = new BigInt64Array(buf);
  return {
    width,
    height,
    cells,
    cells64,
    charPool,
    hyperlinkPool,
    emptyStyleId: styles.none,
    damage: void 0,
    noSelect: new Uint8Array(size),
    softWrap: new Int32Array(height)
  };
}
function resetScreen(screen, width, height) {
  warn.ifNotInteger(width, "resetScreen width");
  warn.ifNotInteger(height, "resetScreen height");
  if (!Number.isInteger(width) || width < 0) {
    width = Math.max(0, Math.floor(width) || 0);
  }
  if (!Number.isInteger(height) || height < 0) {
    height = Math.max(0, Math.floor(height) || 0);
  }
  const size = width * height;
  if (screen.cells64.length < size) {
    const buf = new ArrayBuffer(size << 3);
    screen.cells = new Int32Array(buf);
    screen.cells64 = new BigInt64Array(buf);
    screen.noSelect = new Uint8Array(size);
  }
  if (screen.softWrap.length < height) {
    screen.softWrap = new Int32Array(height);
  }
  screen.cells64.fill(EMPTY_CELL_VALUE, 0, size);
  screen.noSelect.fill(0, 0, size);
  screen.softWrap.fill(0, 0, height);
  screen.width = width;
  screen.height = height;
  screen.damage = void 0;
}
function migrateScreenPools(screen, charPool, hyperlinkPool) {
  const oldCharPool = screen.charPool;
  const oldHyperlinkPool = screen.hyperlinkPool;
  if (oldCharPool === charPool && oldHyperlinkPool === hyperlinkPool) return;
  const size = screen.width * screen.height;
  const cells = screen.cells;
  for (let ci = 0; ci < size << 1; ci += 2) {
    const oldCharId = cells[ci];
    cells[ci] = charPool.intern(oldCharPool.get(oldCharId));
    const word1 = cells[ci + 1];
    const oldHyperlinkId = word1 >>> HYPERLINK_SHIFT & HYPERLINK_MASK;
    if (oldHyperlinkId !== 0) {
      const oldStr = oldHyperlinkPool.get(oldHyperlinkId);
      const newHyperlinkId = hyperlinkPool.intern(oldStr);
      const styleId = word1 >>> STYLE_SHIFT;
      const width = word1 & WIDTH_MASK;
      cells[ci + 1] = packWord1(styleId, newHyperlinkId, width);
    }
  }
  screen.charPool = charPool;
  screen.hyperlinkPool = hyperlinkPool;
}
function cellAt(screen, x, y) {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height)
    return void 0;
  return cellAtIndex(screen, y * screen.width + x);
}
function cellAtIndex(screen, index) {
  const ci = index << 1;
  const word1 = screen.cells[ci + 1];
  const hid = word1 >>> HYPERLINK_SHIFT & HYPERLINK_MASK;
  return {
    // Unwritten cells have charIndex=0 (EMPTY_CHAR_INDEX); charPool.get(0) returns ' '
    char: screen.charPool.get(screen.cells[ci]),
    styleId: word1 >>> STYLE_SHIFT,
    width: word1 & WIDTH_MASK,
    hyperlink: hid === 0 ? void 0 : screen.hyperlinkPool.get(hid)
  };
}
function visibleCellAtIndex(cells, charPool, hyperlinkPool, index, lastRenderedStyleId) {
  const ci = index << 1;
  const charId = cells[ci];
  if (charId === 1) return void 0;
  const word1 = cells[ci + 1];
  if (charId === 0 && (word1 & 262140) === 0) {
    const fgStyle = word1 >>> STYLE_SHIFT;
    if (fgStyle === 0 || fgStyle === lastRenderedStyleId) return void 0;
  }
  const hid = word1 >>> HYPERLINK_SHIFT & HYPERLINK_MASK;
  return {
    char: charPool.get(charId),
    styleId: word1 >>> STYLE_SHIFT,
    width: word1 & WIDTH_MASK,
    hyperlink: hid === 0 ? void 0 : hyperlinkPool.get(hid)
  };
}
function cellAtCI(screen, ci, out) {
  const w1 = ci | 1;
  const word1 = screen.cells[w1];
  out.char = screen.charPool.get(screen.cells[ci]);
  out.styleId = word1 >>> STYLE_SHIFT;
  out.width = word1 & WIDTH_MASK;
  const hid = word1 >>> HYPERLINK_SHIFT & HYPERLINK_MASK;
  out.hyperlink = hid === 0 ? void 0 : screen.hyperlinkPool.get(hid);
}
function charInCellAt(screen, x, y) {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height)
    return void 0;
  const ci = y * screen.width + x << 1;
  return screen.charPool.get(screen.cells[ci]);
}
function setCellAt(screen, x, y, cell) {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height) return;
  const ci = y * screen.width + x << 1;
  const cells = screen.cells;
  const prevWidth = cells[ci + 1] & WIDTH_MASK;
  if (prevWidth === 1 /* Wide */ && cell.width !== 1 /* Wide */) {
    const spacerX = x + 1;
    if (spacerX < screen.width) {
      const spacerCI = ci + 2;
      if ((cells[spacerCI + 1] & WIDTH_MASK) === 2 /* SpacerTail */) {
        cells[spacerCI] = EMPTY_CHAR_INDEX;
        cells[spacerCI + 1] = packWord1(
          screen.emptyStyleId,
          0,
          0 /* Narrow */
        );
      }
    }
  }
  let clearedWideX = -1;
  if (prevWidth === 2 /* SpacerTail */ && cell.width !== 2 /* SpacerTail */) {
    if (x > 0) {
      const wideCI = ci - 2;
      if ((cells[wideCI + 1] & WIDTH_MASK) === 1 /* Wide */) {
        cells[wideCI] = EMPTY_CHAR_INDEX;
        cells[wideCI + 1] = packWord1(screen.emptyStyleId, 0, 0 /* Narrow */);
        clearedWideX = x - 1;
      }
    }
  }
  cells[ci] = internCharString(screen, cell.char);
  cells[ci + 1] = packWord1(
    cell.styleId,
    internHyperlink(screen, cell.hyperlink),
    cell.width
  );
  const minX = clearedWideX >= 0 ? Math.min(x, clearedWideX) : x;
  const damage = screen.damage;
  if (damage) {
    const right = damage.x + damage.width;
    const bottom = damage.y + damage.height;
    if (minX < damage.x) {
      damage.width += damage.x - minX;
      damage.x = minX;
    } else if (x >= right) {
      damage.width = x - damage.x + 1;
    }
    if (y < damage.y) {
      damage.height += damage.y - y;
      damage.y = y;
    } else if (y >= bottom) {
      damage.height = y - damage.y + 1;
    }
  } else {
    screen.damage = { x: minX, y, width: x - minX + 1, height: 1 };
  }
  if (cell.width === 1 /* Wide */) {
    const spacerX = x + 1;
    if (spacerX < screen.width) {
      const spacerCI = ci + 2;
      if ((cells[spacerCI + 1] & WIDTH_MASK) === 1 /* Wide */) {
        const orphanCI = spacerCI + 2;
        if (spacerX + 1 < screen.width && (cells[orphanCI + 1] & WIDTH_MASK) === 2 /* SpacerTail */) {
          cells[orphanCI] = EMPTY_CHAR_INDEX;
          cells[orphanCI + 1] = packWord1(
            screen.emptyStyleId,
            0,
            0 /* Narrow */
          );
        }
      }
      cells[spacerCI] = SPACER_CHAR_INDEX;
      cells[spacerCI + 1] = packWord1(
        screen.emptyStyleId,
        0,
        2 /* SpacerTail */
      );
      const d = screen.damage;
      if (d && spacerX >= d.x + d.width) {
        d.width = spacerX - d.x + 1;
      }
    }
  }
}
function setCellStyleId(screen, x, y, styleId) {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height) return;
  const ci = y * screen.width + x << 1;
  const cells = screen.cells;
  const word1 = cells[ci + 1];
  const width = word1 & WIDTH_MASK;
  if (width === 2 /* SpacerTail */ || width === 3 /* SpacerHead */) return;
  const hid = word1 >>> HYPERLINK_SHIFT & HYPERLINK_MASK;
  cells[ci + 1] = packWord1(styleId, hid, width);
  const d = screen.damage;
  if (d) {
    screen.damage = unionRect(d, { x, y, width: 1, height: 1 });
  } else {
    screen.damage = { x, y, width: 1, height: 1 };
  }
}
function internCharString(screen, char) {
  return screen.charPool.intern(char);
}
function blitRegion(dst, src, regionX, regionY, maxX, maxY) {
  regionX = Math.max(0, regionX);
  regionY = Math.max(0, regionY);
  if (regionX >= maxX || regionY >= maxY) return;
  const rowLen = maxX - regionX;
  const srcStride = src.width << 1;
  const dstStride = dst.width << 1;
  const rowBytes = rowLen << 1;
  const srcCells = src.cells;
  const dstCells = dst.cells;
  const srcNoSel = src.noSelect;
  const dstNoSel = dst.noSelect;
  dst.softWrap.set(src.softWrap.subarray(regionY, maxY), regionY);
  if (regionX === 0 && maxX === src.width && src.width === dst.width) {
    const srcStart = regionY * srcStride;
    const totalBytes = (maxY - regionY) * srcStride;
    dstCells.set(
      srcCells.subarray(srcStart, srcStart + totalBytes),
      srcStart
      // srcStart === dstStart when strides match and regionX === 0
    );
    const nsStart = regionY * src.width;
    const nsLen = (maxY - regionY) * src.width;
    dstNoSel.set(srcNoSel.subarray(nsStart, nsStart + nsLen), nsStart);
  } else {
    let srcRowCI = regionY * srcStride + (regionX << 1);
    let dstRowCI = regionY * dstStride + (regionX << 1);
    let srcRowNS = regionY * src.width + regionX;
    let dstRowNS = regionY * dst.width + regionX;
    for (let y = regionY; y < maxY; y++) {
      dstCells.set(srcCells.subarray(srcRowCI, srcRowCI + rowBytes), dstRowCI);
      dstNoSel.set(srcNoSel.subarray(srcRowNS, srcRowNS + rowLen), dstRowNS);
      srcRowCI += srcStride;
      dstRowCI += dstStride;
      srcRowNS += src.width;
      dstRowNS += dst.width;
    }
  }
  const regionRect = {
    x: regionX,
    y: regionY,
    width: rowLen,
    height: maxY - regionY
  };
  if (dst.damage) {
    dst.damage = unionRect(dst.damage, regionRect);
  } else {
    dst.damage = regionRect;
  }
  if (maxX < dst.width) {
    let srcLastCI = regionY * src.width + (maxX - 1) << 1;
    let dstSpacerCI = regionY * dst.width + maxX << 1;
    let wroteSpacerOutsideRegion = false;
    for (let y = regionY; y < maxY; y++) {
      if ((srcCells[srcLastCI + 1] & WIDTH_MASK) === 1 /* Wide */) {
        dstCells[dstSpacerCI] = SPACER_CHAR_INDEX;
        dstCells[dstSpacerCI + 1] = packWord1(
          dst.emptyStyleId,
          0,
          2 /* SpacerTail */
        );
        wroteSpacerOutsideRegion = true;
      }
      srcLastCI += srcStride;
      dstSpacerCI += dstStride;
    }
    if (wroteSpacerOutsideRegion && dst.damage) {
      const rightEdge = dst.damage.x + dst.damage.width;
      if (rightEdge === maxX) {
        dst.damage = { ...dst.damage, width: dst.damage.width + 1 };
      }
    }
  }
}
function clearRegion(screen, regionX, regionY, regionWidth, regionHeight) {
  const startX = Math.max(0, regionX);
  const startY = Math.max(0, regionY);
  const maxX = Math.min(regionX + regionWidth, screen.width);
  const maxY = Math.min(regionY + regionHeight, screen.height);
  if (startX >= maxX || startY >= maxY) return;
  const cells = screen.cells;
  const cells64 = screen.cells64;
  const screenWidth = screen.width;
  const rowBase = startY * screenWidth;
  let damageMinX = startX;
  let damageMaxX = maxX;
  if (startX === 0 && maxX === screenWidth) {
    cells64.fill(
      EMPTY_CELL_VALUE,
      rowBase,
      rowBase + (maxY - startY) * screenWidth
    );
  } else {
    const stride = screenWidth << 1;
    const rowLen = maxX - startX;
    const checkLeft = startX > 0;
    const checkRight = maxX < screenWidth;
    let leftEdge = rowBase + startX << 1;
    let rightEdge = rowBase + maxX - 1 << 1;
    let fillStart = rowBase + startX;
    for (let y = startY; y < maxY; y++) {
      if (checkLeft) {
        if ((cells[leftEdge + 1] & WIDTH_MASK) === 2 /* SpacerTail */) {
          const prevW1 = leftEdge - 1;
          if ((cells[prevW1] & WIDTH_MASK) === 1 /* Wide */) {
            cells[prevW1 - 1] = EMPTY_CHAR_INDEX;
            cells[prevW1] = packWord1(screen.emptyStyleId, 0, 0 /* Narrow */);
            damageMinX = startX - 1;
          }
        }
      }
      if (checkRight) {
        if ((cells[rightEdge + 1] & WIDTH_MASK) === 1 /* Wide */) {
          const nextW1 = rightEdge + 3;
          if ((cells[nextW1] & WIDTH_MASK) === 2 /* SpacerTail */) {
            cells[nextW1 - 1] = EMPTY_CHAR_INDEX;
            cells[nextW1] = packWord1(screen.emptyStyleId, 0, 0 /* Narrow */);
            damageMaxX = maxX + 1;
          }
        }
      }
      cells64.fill(EMPTY_CELL_VALUE, fillStart, fillStart + rowLen);
      leftEdge += stride;
      rightEdge += stride;
      fillStart += screenWidth;
    }
  }
  const regionRect = {
    x: damageMinX,
    y: startY,
    width: damageMaxX - damageMinX,
    height: maxY - startY
  };
  if (screen.damage) {
    screen.damage = unionRect(screen.damage, regionRect);
  } else {
    screen.damage = regionRect;
  }
}
function shiftRows(screen, top, bottom, n) {
  if (n === 0 || top < 0 || bottom >= screen.height || top > bottom) return;
  const w = screen.width;
  const cells64 = screen.cells64;
  const noSel = screen.noSelect;
  const sw = screen.softWrap;
  const absN = Math.abs(n);
  if (absN > bottom - top) {
    cells64.fill(EMPTY_CELL_VALUE, top * w, (bottom + 1) * w);
    noSel.fill(0, top * w, (bottom + 1) * w);
    sw.fill(0, top, bottom + 1);
    return;
  }
  if (n > 0) {
    cells64.copyWithin(top * w, (top + n) * w, (bottom + 1) * w);
    noSel.copyWithin(top * w, (top + n) * w, (bottom + 1) * w);
    sw.copyWithin(top, top + n, bottom + 1);
    cells64.fill(EMPTY_CELL_VALUE, (bottom - n + 1) * w, (bottom + 1) * w);
    noSel.fill(0, (bottom - n + 1) * w, (bottom + 1) * w);
    sw.fill(0, bottom - n + 1, bottom + 1);
  } else {
    cells64.copyWithin((top - n) * w, top * w, (bottom + n + 1) * w);
    noSel.copyWithin((top - n) * w, top * w, (bottom + n + 1) * w);
    sw.copyWithin(top - n, top, bottom + n + 1);
    cells64.fill(EMPTY_CELL_VALUE, top * w, (top - n) * w);
    noSel.fill(0, top * w, (top - n) * w);
    sw.fill(0, top, top - n);
  }
}
const OSC8_REGEX = new RegExp(`^${ESC}\\]8${SEP}${SEP}([^${BEL}]*)${BEL}$`);
const OSC8_PREFIX = `${ESC}]8${SEP}`;
function extractHyperlinkFromStyles(styles) {
  for (const style of styles) {
    const code = style.code;
    if (code.length < 5 || !code.startsWith(OSC8_PREFIX)) continue;
    const match = code.match(OSC8_REGEX);
    if (match) {
      return match[1] || null;
    }
  }
  return null;
}
function filterOutHyperlinkStyles(styles) {
  return styles.filter(
    (style) => !style.code.startsWith(OSC8_PREFIX) || !OSC8_REGEX.test(style.code)
  );
}
function diff(prev, next) {
  const output = [];
  diffEach(prev, next, (x, y, removed, added) => {
    output.push([
      { x, y },
      removed ? { ...removed } : void 0,
      added ? { ...added } : void 0
    ]);
  });
  return output;
}
function diffEach(prev, next, cb) {
  const prevWidth = prev.width;
  const nextWidth = next.width;
  const prevHeight = prev.height;
  const nextHeight = next.height;
  let region;
  if (prevWidth === 0 && prevHeight === 0) {
    region = { x: 0, y: 0, width: nextWidth, height: nextHeight };
  } else if (next.damage) {
    region = next.damage;
    if (prev.damage) {
      region = unionRect(region, prev.damage);
    }
  } else if (prev.damage) {
    region = prev.damage;
  } else {
    region = { x: 0, y: 0, width: 0, height: 0 };
  }
  if (prevHeight > nextHeight) {
    region = unionRect(region, {
      x: 0,
      y: nextHeight,
      width: prevWidth,
      height: prevHeight - nextHeight
    });
  }
  if (prevWidth > nextWidth) {
    region = unionRect(region, {
      x: nextWidth,
      y: 0,
      width: prevWidth - nextWidth,
      height: prevHeight
    });
  }
  const maxHeight = Math.max(prevHeight, nextHeight);
  const maxWidth = Math.max(prevWidth, nextWidth);
  const endY = Math.min(region.y + region.height, maxHeight);
  const endX = Math.min(region.x + region.width, maxWidth);
  if (prevWidth === nextWidth) {
    return diffSameWidth(prev, next, region.x, endX, region.y, endY, cb);
  }
  return diffDifferentWidth(prev, next, region.x, endX, region.y, endY, cb);
}
function findNextDiff(a, b, w0, count) {
  for (let i = 0; i < count; i++, w0 += 2) {
    const w1 = w0 | 1;
    if (a[w0] !== b[w0] || a[w1] !== b[w1]) return i;
  }
  return count;
}
function diffRowBoth(prevCells, nextCells, prev, next, ci, y, startX, endX, prevCell, nextCell, cb) {
  let x = startX;
  while (x < endX) {
    const skip = findNextDiff(prevCells, nextCells, ci, endX - x);
    x += skip;
    ci += skip << 1;
    if (x >= endX) break;
    cellAtCI(prev, ci, prevCell);
    cellAtCI(next, ci, nextCell);
    if (cb(x, y, prevCell, nextCell)) return true;
    x++;
    ci += 2;
  }
  return false;
}
function diffRowRemoved(prev, ci, y, startX, endX, prevCell, cb) {
  for (let x = startX; x < endX; x++, ci += 2) {
    cellAtCI(prev, ci, prevCell);
    if (cb(x, y, prevCell, void 0)) return true;
  }
  return false;
}
function diffRowAdded(nextCells, next, ci, y, startX, endX, nextCell, cb) {
  for (let x = startX; x < endX; x++, ci += 2) {
    if (nextCells[ci] === 0 && nextCells[ci | 1] === 0) continue;
    cellAtCI(next, ci, nextCell);
    if (cb(x, y, void 0, nextCell)) return true;
  }
  return false;
}
function diffSameWidth(prev, next, startX, endX, startY, endY, cb) {
  const prevCells = prev.cells;
  const nextCells = next.cells;
  const width = prev.width;
  const prevHeight = prev.height;
  const nextHeight = next.height;
  const stride = width << 1;
  const prevCell = {
    char: " ",
    styleId: 0,
    width: 0 /* Narrow */,
    hyperlink: void 0
  };
  const nextCell = {
    char: " ",
    styleId: 0,
    width: 0 /* Narrow */,
    hyperlink: void 0
  };
  const rowEndX = Math.min(endX, width);
  let rowCI = startY * width + startX << 1;
  for (let y = startY; y < endY; y++) {
    const prevIn = y < prevHeight;
    const nextIn = y < nextHeight;
    if (prevIn && nextIn) {
      if (diffRowBoth(
        prevCells,
        nextCells,
        prev,
        next,
        rowCI,
        y,
        startX,
        rowEndX,
        prevCell,
        nextCell,
        cb
      ))
        return true;
    } else if (prevIn) {
      if (diffRowRemoved(prev, rowCI, y, startX, rowEndX, prevCell, cb))
        return true;
    } else if (nextIn) {
      if (diffRowAdded(nextCells, next, rowCI, y, startX, rowEndX, nextCell, cb))
        return true;
    }
    rowCI += stride;
  }
  return false;
}
function diffDifferentWidth(prev, next, startX, endX, startY, endY, cb) {
  const prevWidth = prev.width;
  const nextWidth = next.width;
  const prevCells = prev.cells;
  const nextCells = next.cells;
  const prevCell = {
    char: " ",
    styleId: 0,
    width: 0 /* Narrow */,
    hyperlink: void 0
  };
  const nextCell = {
    char: " ",
    styleId: 0,
    width: 0 /* Narrow */,
    hyperlink: void 0
  };
  const prevStride = prevWidth << 1;
  const nextStride = nextWidth << 1;
  let prevRowCI = startY * prevWidth + startX << 1;
  let nextRowCI = startY * nextWidth + startX << 1;
  for (let y = startY; y < endY; y++) {
    const prevIn = y < prev.height;
    const nextIn = y < next.height;
    const prevEndX = prevIn ? Math.min(endX, prevWidth) : startX;
    const nextEndX = nextIn ? Math.min(endX, nextWidth) : startX;
    const bothEndX = Math.min(prevEndX, nextEndX);
    let prevCI = prevRowCI;
    let nextCI = nextRowCI;
    for (let x = startX; x < bothEndX; x++) {
      if (prevCells[prevCI] === nextCells[nextCI] && prevCells[prevCI + 1] === nextCells[nextCI + 1]) {
        prevCI += 2;
        nextCI += 2;
        continue;
      }
      cellAtCI(prev, prevCI, prevCell);
      cellAtCI(next, nextCI, nextCell);
      prevCI += 2;
      nextCI += 2;
      if (cb(x, y, prevCell, nextCell)) return true;
    }
    if (prevEndX > bothEndX) {
      prevCI = prevRowCI + (bothEndX - startX << 1);
      for (let x = bothEndX; x < prevEndX; x++) {
        cellAtCI(prev, prevCI, prevCell);
        prevCI += 2;
        if (cb(x, y, prevCell, void 0)) return true;
      }
    }
    if (nextEndX > bothEndX) {
      nextCI = nextRowCI + (bothEndX - startX << 1);
      for (let x = bothEndX; x < nextEndX; x++) {
        if (nextCells[nextCI] === 0 && nextCells[nextCI | 1] === 0) {
          nextCI += 2;
          continue;
        }
        cellAtCI(next, nextCI, nextCell);
        nextCI += 2;
        if (cb(x, y, void 0, nextCell)) return true;
      }
    }
    prevRowCI += prevStride;
    nextRowCI += nextStride;
  }
  return false;
}
function markNoSelectRegion(screen, x, y, width, height) {
  const maxX = Math.min(x + width, screen.width);
  const maxY = Math.min(y + height, screen.height);
  const noSel = screen.noSelect;
  const stride = screen.width;
  for (let row = Math.max(0, y); row < maxY; row++) {
    const rowStart = row * stride;
    noSel.fill(1, rowStart + Math.max(0, x), rowStart + maxX);
  }
}
export {
  CellWidth,
  CharPool,
  HyperlinkPool,
  OSC8_PREFIX,
  StylePool,
  blitRegion,
  cellAt,
  cellAtIndex,
  charInCellAt,
  clearRegion,
  createScreen,
  diff,
  diffEach,
  extractHyperlinkFromStyles,
  filterOutHyperlinkStyles,
  isCellEmpty,
  isEmptyCellAt,
  markNoSelectRegion,
  migrateScreenPools,
  resetScreen,
  setCellAt,
  setCellStyleId,
  shiftRows,
  visibleCellAtIndex
};
