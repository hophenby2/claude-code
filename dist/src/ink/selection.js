import { clamp } from "./layout/geometry.js";
import { CellWidth, cellAt, cellAtIndex, setCellStyleId } from "./screen.js";
function createSelectionState() {
  return {
    anchor: null,
    focus: null,
    isDragging: false,
    anchorSpan: null,
    scrolledOffAbove: [],
    scrolledOffBelow: [],
    scrolledOffAboveSW: [],
    scrolledOffBelowSW: [],
    lastPressHadAlt: false
  };
}
function startSelection(s, col, row) {
  s.anchor = { col, row };
  s.focus = null;
  s.isDragging = true;
  s.anchorSpan = null;
  s.scrolledOffAbove = [];
  s.scrolledOffBelow = [];
  s.scrolledOffAboveSW = [];
  s.scrolledOffBelowSW = [];
  s.virtualAnchorRow = void 0;
  s.virtualFocusRow = void 0;
  s.lastPressHadAlt = false;
}
function updateSelection(s, col, row) {
  if (!s.isDragging) return;
  if (!s.focus && s.anchor && s.anchor.col === col && s.anchor.row === row)
    return;
  s.focus = { col, row };
}
function finishSelection(s) {
  s.isDragging = false;
}
function clearSelection(s) {
  s.anchor = null;
  s.focus = null;
  s.isDragging = false;
  s.anchorSpan = null;
  s.scrolledOffAbove = [];
  s.scrolledOffBelow = [];
  s.scrolledOffAboveSW = [];
  s.scrolledOffBelowSW = [];
  s.virtualAnchorRow = void 0;
  s.virtualFocusRow = void 0;
  s.lastPressHadAlt = false;
}
const WORD_CHAR = /[\p{L}\p{N}_/.\-+~\\]/u;
function charClass(c) {
  if (c === " " || c === "") return 0;
  if (WORD_CHAR.test(c)) return 1;
  return 2;
}
function wordBoundsAt(screen, col, row) {
  if (row < 0 || row >= screen.height) return null;
  const width = screen.width;
  const noSelect = screen.noSelect;
  const rowOff = row * width;
  let c = col;
  if (c > 0) {
    const cell = cellAt(screen, c, row);
    if (cell && cell.width === CellWidth.SpacerTail) c -= 1;
  }
  if (c < 0 || c >= width || noSelect[rowOff + c] === 1) return null;
  const startCell = cellAt(screen, c, row);
  if (!startCell) return null;
  const cls = charClass(startCell.char);
  let lo = c;
  while (lo > 0) {
    const prev = lo - 1;
    if (noSelect[rowOff + prev] === 1) break;
    const pc = cellAt(screen, prev, row);
    if (!pc) break;
    if (pc.width === CellWidth.SpacerTail) {
      if (prev === 0 || noSelect[rowOff + prev - 1] === 1) break;
      const head = cellAt(screen, prev - 1, row);
      if (!head || charClass(head.char) !== cls) break;
      lo = prev - 1;
      continue;
    }
    if (charClass(pc.char) !== cls) break;
    lo = prev;
  }
  let hi = c;
  while (hi < width - 1) {
    const next = hi + 1;
    if (noSelect[rowOff + next] === 1) break;
    const nc = cellAt(screen, next, row);
    if (!nc) break;
    if (nc.width === CellWidth.SpacerTail) {
      hi = next;
      continue;
    }
    if (charClass(nc.char) !== cls) break;
    hi = next;
  }
  return { lo, hi };
}
function comparePoints(a, b) {
  if (a.row !== b.row) return a.row < b.row ? -1 : 1;
  if (a.col !== b.col) return a.col < b.col ? -1 : 1;
  return 0;
}
function selectWordAt(s, screen, col, row) {
  const b = wordBoundsAt(screen, col, row);
  if (!b) return;
  const lo = { col: b.lo, row };
  const hi = { col: b.hi, row };
  s.anchor = lo;
  s.focus = hi;
  s.isDragging = true;
  s.anchorSpan = { lo, hi, kind: "word" };
}
const URL_BOUNDARY = /* @__PURE__ */ new Set([..."<>\"'` "]);
function isUrlChar(c) {
  if (c.length !== 1) return false;
  const code = c.charCodeAt(0);
  return code >= 33 && code <= 126 && !URL_BOUNDARY.has(c);
}
function findPlainTextUrlAt(screen, col, row) {
  if (row < 0 || row >= screen.height) return void 0;
  const width = screen.width;
  const noSelect = screen.noSelect;
  const rowOff = row * width;
  let c = col;
  if (c > 0) {
    const cell = cellAt(screen, c, row);
    if (cell && cell.width === CellWidth.SpacerTail) c -= 1;
  }
  if (c < 0 || c >= width || noSelect[rowOff + c] === 1) return void 0;
  const startCell = cellAt(screen, c, row);
  if (!startCell || !isUrlChar(startCell.char)) return void 0;
  let lo = c;
  while (lo > 0) {
    const prev = lo - 1;
    if (noSelect[rowOff + prev] === 1) break;
    const pc = cellAt(screen, prev, row);
    if (!pc || pc.width !== CellWidth.Narrow || !isUrlChar(pc.char)) break;
    lo = prev;
  }
  let hi = c;
  while (hi < width - 1) {
    const next = hi + 1;
    if (noSelect[rowOff + next] === 1) break;
    const nc = cellAt(screen, next, row);
    if (!nc || nc.width !== CellWidth.Narrow || !isUrlChar(nc.char)) break;
    hi = next;
  }
  let token = "";
  for (let i = lo; i <= hi; i++) token += cellAt(screen, i, row).char;
  const clickIdx = c - lo;
  const schemeRe = /(?:https?|file):\/\//g;
  let urlStart = -1;
  let urlEnd = token.length;
  for (let m; m = schemeRe.exec(token); ) {
    if (m.index > clickIdx) {
      urlEnd = m.index;
      break;
    }
    urlStart = m.index;
  }
  if (urlStart < 0) return void 0;
  let url = token.slice(urlStart, urlEnd);
  const OPENER = { ")": "(", "]": "[", "}": "{" };
  while (url.length > 0) {
    const last = url.at(-1);
    if (".,;:!?".includes(last)) {
      url = url.slice(0, -1);
      continue;
    }
    const opener = OPENER[last];
    if (!opener) break;
    let opens = 0;
    let closes = 0;
    for (let i = 0; i < url.length; i++) {
      const ch = url.charAt(i);
      if (ch === opener) opens++;
      else if (ch === last) closes++;
    }
    if (closes > opens) url = url.slice(0, -1);
    else break;
  }
  if (clickIdx >= urlStart + url.length) return void 0;
  return url;
}
function selectLineAt(s, screen, row) {
  if (row < 0 || row >= screen.height) return;
  const lo = { col: 0, row };
  const hi = { col: screen.width - 1, row };
  s.anchor = lo;
  s.focus = hi;
  s.isDragging = true;
  s.anchorSpan = { lo, hi, kind: "line" };
}
function extendSelection(s, screen, col, row) {
  if (!s.isDragging || !s.anchorSpan) return;
  const span = s.anchorSpan;
  let mLo;
  let mHi;
  if (span.kind === "word") {
    const b = wordBoundsAt(screen, col, row);
    mLo = { col: b ? b.lo : col, row };
    mHi = { col: b ? b.hi : col, row };
  } else {
    const r = clamp(row, 0, screen.height - 1);
    mLo = { col: 0, row: r };
    mHi = { col: screen.width - 1, row: r };
  }
  if (comparePoints(mHi, span.lo) < 0) {
    s.anchor = span.hi;
    s.focus = mLo;
  } else if (comparePoints(mLo, span.hi) > 0) {
    s.anchor = span.lo;
    s.focus = mHi;
  } else {
    s.anchor = span.lo;
    s.focus = span.hi;
  }
}
function moveFocus(s, col, row) {
  if (!s.focus) return;
  s.anchorSpan = null;
  s.focus = { col, row };
  s.virtualFocusRow = void 0;
}
function shiftSelection(s, dRow, minRow, maxRow, width) {
  if (!s.anchor || !s.focus) return;
  const vAnchor = (s.virtualAnchorRow ?? s.anchor.row) + dRow;
  const vFocus = (s.virtualFocusRow ?? s.focus.row) + dRow;
  if (vAnchor < minRow && vFocus < minRow || vAnchor > maxRow && vFocus > maxRow) {
    clearSelection(s);
    return;
  }
  const oldMin = Math.min(
    s.virtualAnchorRow ?? s.anchor.row,
    s.virtualFocusRow ?? s.focus.row
  );
  const oldMax = Math.max(
    s.virtualAnchorRow ?? s.anchor.row,
    s.virtualFocusRow ?? s.focus.row
  );
  const oldAboveDebt = Math.max(0, minRow - oldMin);
  const oldBelowDebt = Math.max(0, oldMax - maxRow);
  const newAboveDebt = Math.max(0, minRow - Math.min(vAnchor, vFocus));
  const newBelowDebt = Math.max(0, Math.max(vAnchor, vFocus) - maxRow);
  if (newAboveDebt < oldAboveDebt) {
    const drop = oldAboveDebt - newAboveDebt;
    s.scrolledOffAbove.length -= drop;
    s.scrolledOffAboveSW.length = s.scrolledOffAbove.length;
  }
  if (newBelowDebt < oldBelowDebt) {
    const drop = oldBelowDebt - newBelowDebt;
    s.scrolledOffBelow.splice(0, drop);
    s.scrolledOffBelowSW.splice(0, drop);
  }
  if (s.scrolledOffAbove.length > newAboveDebt) {
    s.scrolledOffAbove = newAboveDebt > 0 ? s.scrolledOffAbove.slice(-newAboveDebt) : [];
    s.scrolledOffAboveSW = newAboveDebt > 0 ? s.scrolledOffAboveSW.slice(-newAboveDebt) : [];
  }
  if (s.scrolledOffBelow.length > newBelowDebt) {
    s.scrolledOffBelow = s.scrolledOffBelow.slice(0, newBelowDebt);
    s.scrolledOffBelowSW = s.scrolledOffBelowSW.slice(0, newBelowDebt);
  }
  const shift = (p, vRow) => {
    if (vRow < minRow) return { col: 0, row: minRow };
    if (vRow > maxRow) return { col: width - 1, row: maxRow };
    return { col: p.col, row: vRow };
  };
  s.anchor = shift(s.anchor, vAnchor);
  s.focus = shift(s.focus, vFocus);
  s.virtualAnchorRow = vAnchor < minRow || vAnchor > maxRow ? vAnchor : void 0;
  s.virtualFocusRow = vFocus < minRow || vFocus > maxRow ? vFocus : void 0;
  if (s.anchorSpan) {
    const sp = (p) => {
      const r = p.row + dRow;
      if (r < minRow) return { col: 0, row: minRow };
      if (r > maxRow) return { col: width - 1, row: maxRow };
      return { col: p.col, row: r };
    };
    s.anchorSpan = {
      lo: sp(s.anchorSpan.lo),
      hi: sp(s.anchorSpan.hi),
      kind: s.anchorSpan.kind
    };
  }
}
function shiftAnchor(s, dRow, minRow, maxRow) {
  if (!s.anchor) return;
  const raw = (s.virtualAnchorRow ?? s.anchor.row) + dRow;
  s.anchor = { col: s.anchor.col, row: clamp(raw, minRow, maxRow) };
  s.virtualAnchorRow = raw < minRow || raw > maxRow ? raw : void 0;
  if (s.anchorSpan) {
    const shift = (p) => ({
      col: p.col,
      row: clamp(p.row + dRow, minRow, maxRow)
    });
    s.anchorSpan = {
      lo: shift(s.anchorSpan.lo),
      hi: shift(s.anchorSpan.hi),
      kind: s.anchorSpan.kind
    };
  }
}
function shiftSelectionForFollow(s, dRow, minRow, maxRow) {
  if (!s.anchor) return false;
  const rawAnchor = (s.virtualAnchorRow ?? s.anchor.row) + dRow;
  const rawFocus = s.focus ? (s.virtualFocusRow ?? s.focus.row) + dRow : void 0;
  if (rawAnchor < minRow && rawFocus !== void 0 && rawFocus < minRow) {
    clearSelection(s);
    return true;
  }
  s.anchor = { col: s.anchor.col, row: clamp(rawAnchor, minRow, maxRow) };
  if (s.focus && rawFocus !== void 0) {
    s.focus = { col: s.focus.col, row: clamp(rawFocus, minRow, maxRow) };
  }
  s.virtualAnchorRow = rawAnchor < minRow || rawAnchor > maxRow ? rawAnchor : void 0;
  s.virtualFocusRow = rawFocus !== void 0 && (rawFocus < minRow || rawFocus > maxRow) ? rawFocus : void 0;
  if (s.anchorSpan) {
    const shift = (p) => ({
      col: p.col,
      row: clamp(p.row + dRow, minRow, maxRow)
    });
    s.anchorSpan = {
      lo: shift(s.anchorSpan.lo),
      hi: shift(s.anchorSpan.hi),
      kind: s.anchorSpan.kind
    };
  }
  return false;
}
function hasSelection(s) {
  return s.anchor !== null && s.focus !== null;
}
function selectionBounds(s) {
  if (!s.anchor || !s.focus) return null;
  return comparePoints(s.anchor, s.focus) <= 0 ? { start: s.anchor, end: s.focus } : { start: s.focus, end: s.anchor };
}
function isCellSelected(s, col, row) {
  const b = selectionBounds(s);
  if (!b) return false;
  const { start, end } = b;
  if (row < start.row || row > end.row) return false;
  if (row === start.row && col < start.col) return false;
  if (row === end.row && col > end.col) return false;
  return true;
}
function extractRowText(screen, row, colStart, colEnd) {
  const noSelect = screen.noSelect;
  const rowOff = row * screen.width;
  const contentEnd = row + 1 < screen.height ? screen.softWrap[row + 1] : 0;
  const lastCol = contentEnd > 0 ? Math.min(colEnd, contentEnd - 1) : colEnd;
  let line = "";
  for (let col = colStart; col <= lastCol; col++) {
    if (noSelect[rowOff + col] === 1) continue;
    const cell = cellAt(screen, col, row);
    if (!cell) continue;
    if (cell.width === CellWidth.SpacerTail || cell.width === CellWidth.SpacerHead) {
      continue;
    }
    line += cell.char;
  }
  return contentEnd > 0 ? line : line.replace(/\s+$/, "");
}
function joinRows(lines, text, sw) {
  if (sw && lines.length > 0) {
    lines[lines.length - 1] += text;
  } else {
    lines.push(text);
  }
}
function getSelectedText(s, screen) {
  const b = selectionBounds(s);
  if (!b) return "";
  const { start, end } = b;
  const sw = screen.softWrap;
  const lines = [];
  for (let i = 0; i < s.scrolledOffAbove.length; i++) {
    joinRows(lines, s.scrolledOffAbove[i], s.scrolledOffAboveSW[i]);
  }
  for (let row = start.row; row <= end.row; row++) {
    const rowStart = row === start.row ? start.col : 0;
    const rowEnd = row === end.row ? end.col : screen.width - 1;
    joinRows(lines, extractRowText(screen, row, rowStart, rowEnd), sw[row] > 0);
  }
  for (let i = 0; i < s.scrolledOffBelow.length; i++) {
    joinRows(lines, s.scrolledOffBelow[i], s.scrolledOffBelowSW[i]);
  }
  return lines.join("\n");
}
function captureScrolledRows(s, screen, firstRow, lastRow, side) {
  const b = selectionBounds(s);
  if (!b || firstRow > lastRow) return;
  const { start, end } = b;
  const lo = Math.max(firstRow, start.row);
  const hi = Math.min(lastRow, end.row);
  if (lo > hi) return;
  const width = screen.width;
  const sw = screen.softWrap;
  const captured = [];
  const capturedSW = [];
  for (let row = lo; row <= hi; row++) {
    const colStart = row === start.row ? start.col : 0;
    const colEnd = row === end.row ? end.col : width - 1;
    captured.push(extractRowText(screen, row, colStart, colEnd));
    capturedSW.push(sw[row] > 0);
  }
  if (side === "above") {
    s.scrolledOffAbove.push(...captured);
    s.scrolledOffAboveSW.push(...capturedSW);
    if (s.anchor && s.anchor.row === start.row && lo === start.row) {
      s.anchor = { col: 0, row: s.anchor.row };
      if (s.anchorSpan) {
        s.anchorSpan = {
          kind: s.anchorSpan.kind,
          lo: { col: 0, row: s.anchorSpan.lo.row },
          hi: { col: width - 1, row: s.anchorSpan.hi.row }
        };
      }
    }
  } else {
    s.scrolledOffBelow.unshift(...captured);
    s.scrolledOffBelowSW.unshift(...capturedSW);
    if (s.anchor && s.anchor.row === end.row && hi === end.row) {
      s.anchor = { col: width - 1, row: s.anchor.row };
      if (s.anchorSpan) {
        s.anchorSpan = {
          kind: s.anchorSpan.kind,
          lo: { col: 0, row: s.anchorSpan.lo.row },
          hi: { col: width - 1, row: s.anchorSpan.hi.row }
        };
      }
    }
  }
}
function applySelectionOverlay(screen, selection, stylePool) {
  const b = selectionBounds(selection);
  if (!b) return;
  const { start, end } = b;
  const width = screen.width;
  const noSelect = screen.noSelect;
  for (let row = start.row; row <= end.row && row < screen.height; row++) {
    const colStart = row === start.row ? start.col : 0;
    const colEnd = row === end.row ? Math.min(end.col, width - 1) : width - 1;
    const rowOff = row * width;
    for (let col = colStart; col <= colEnd; col++) {
      const idx = rowOff + col;
      if (noSelect[idx] === 1) continue;
      const cell = cellAtIndex(screen, idx);
      setCellStyleId(screen, col, row, stylePool.withSelectionBg(cell.styleId));
    }
  }
}
export {
  applySelectionOverlay,
  captureScrolledRows,
  clearSelection,
  createSelectionState,
  extendSelection,
  findPlainTextUrlAt,
  finishSelection,
  getSelectedText,
  hasSelection,
  isCellSelected,
  moveFocus,
  selectLineAt,
  selectWordAt,
  selectionBounds,
  shiftAnchor,
  shiftSelection,
  shiftSelectionForFollow,
  startSelection,
  updateSelection
};
