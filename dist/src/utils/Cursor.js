import { stringWidth } from "../ink/stringWidth.js";
import { wrapAnsi } from "../ink/wrapAnsi.js";
import {
  firstGrapheme,
  getGraphemeSegmenter,
  getWordSegmenter
} from "./intl.js";
const KILL_RING_MAX_SIZE = 10;
let killRing = [];
let killRingIndex = 0;
let lastActionWasKill = false;
let lastYankStart = 0;
let lastYankLength = 0;
let lastActionWasYank = false;
function pushToKillRing(text, direction = "append") {
  if (text.length > 0) {
    if (lastActionWasKill && killRing.length > 0) {
      if (direction === "prepend") {
        killRing[0] = text + killRing[0];
      } else {
        killRing[0] = killRing[0] + text;
      }
    } else {
      killRing.unshift(text);
      if (killRing.length > KILL_RING_MAX_SIZE) {
        killRing.pop();
      }
    }
    lastActionWasKill = true;
    lastActionWasYank = false;
  }
}
function getLastKill() {
  return killRing[0] ?? "";
}
function getKillRingItem(index) {
  if (killRing.length === 0) return "";
  const normalizedIndex = (index % killRing.length + killRing.length) % killRing.length;
  return killRing[normalizedIndex] ?? "";
}
function getKillRingSize() {
  return killRing.length;
}
function clearKillRing() {
  killRing = [];
  killRingIndex = 0;
  lastActionWasKill = false;
  lastActionWasYank = false;
  lastYankStart = 0;
  lastYankLength = 0;
}
function resetKillAccumulation() {
  lastActionWasKill = false;
}
function recordYank(start, length) {
  lastYankStart = start;
  lastYankLength = length;
  lastActionWasYank = true;
  killRingIndex = 0;
}
function canYankPop() {
  return lastActionWasYank && killRing.length > 1;
}
function yankPop() {
  if (!lastActionWasYank || killRing.length <= 1) {
    return null;
  }
  killRingIndex = (killRingIndex + 1) % killRing.length;
  const text = killRing[killRingIndex] ?? "";
  return { text, start: lastYankStart, length: lastYankLength };
}
function updateYankLength(length) {
  lastYankLength = length;
}
function resetYankState() {
  lastActionWasYank = false;
}
const VIM_WORD_CHAR_REGEX = /^[\p{L}\p{N}\p{M}_]$/u;
const WHITESPACE_REGEX = /\s/;
const isVimWordChar = (ch) => VIM_WORD_CHAR_REGEX.test(ch);
const isVimWhitespace = (ch) => WHITESPACE_REGEX.test(ch);
const isVimPunctuation = (ch) => ch.length > 0 && !isVimWhitespace(ch) && !isVimWordChar(ch);
class Cursor {
  constructor(measuredText, offset = 0, selection = 0) {
    this.measuredText = measuredText;
    this.selection = selection;
    this.offset = Math.max(0, Math.min(this.text.length, offset));
  }
  measuredText;
  selection;
  offset;
  static fromText(text, columns, offset = 0, selection = 0) {
    return new Cursor(new MeasuredText(text, columns - 1), offset, selection);
  }
  getViewportStartLine(maxVisibleLines) {
    if (maxVisibleLines === void 0 || maxVisibleLines <= 0) return 0;
    const { line } = this.getPosition();
    const allLines = this.measuredText.getWrappedText();
    if (allLines.length <= maxVisibleLines) return 0;
    const half = Math.floor(maxVisibleLines / 2);
    let startLine = Math.max(0, line - half);
    const endLine = Math.min(allLines.length, startLine + maxVisibleLines);
    if (endLine - startLine < maxVisibleLines) {
      startLine = Math.max(0, endLine - maxVisibleLines);
    }
    return startLine;
  }
  getViewportCharOffset(maxVisibleLines) {
    const startLine = this.getViewportStartLine(maxVisibleLines);
    if (startLine === 0) return 0;
    const wrappedLines = this.measuredText.getWrappedLines();
    return wrappedLines[startLine]?.startOffset ?? 0;
  }
  getViewportCharEnd(maxVisibleLines) {
    const startLine = this.getViewportStartLine(maxVisibleLines);
    const allLines = this.measuredText.getWrappedLines();
    if (maxVisibleLines === void 0 || maxVisibleLines <= 0)
      return this.text.length;
    const endLine = Math.min(allLines.length, startLine + maxVisibleLines);
    if (endLine >= allLines.length) return this.text.length;
    return allLines[endLine]?.startOffset ?? this.text.length;
  }
  render(cursorChar, mask, invert, ghostText, maxVisibleLines) {
    const { line, column } = this.getPosition();
    const allLines = this.measuredText.getWrappedText();
    const startLine = this.getViewportStartLine(maxVisibleLines);
    const endLine = maxVisibleLines !== void 0 && maxVisibleLines > 0 ? Math.min(allLines.length, startLine + maxVisibleLines) : allLines.length;
    return allLines.slice(startLine, endLine).map((text, i) => {
      const currentLine = i + startLine;
      let displayText = text;
      if (mask) {
        const graphemes = Array.from(getGraphemeSegmenter().segment(text));
        if (currentLine === allLines.length - 1) {
          const visibleCount = Math.min(6, graphemes.length);
          const maskCount = graphemes.length - visibleCount;
          const splitOffset = graphemes.length > visibleCount ? graphemes[maskCount].index : 0;
          displayText = mask.repeat(maskCount) + text.slice(splitOffset);
        } else {
          displayText = mask.repeat(graphemes.length);
        }
      }
      if (line !== currentLine) return displayText.trimEnd();
      let beforeCursor = "";
      let atCursor = cursorChar;
      let afterCursor = "";
      let currentWidth = 0;
      let cursorFound = false;
      for (const { segment } of getGraphemeSegmenter().segment(displayText)) {
        if (cursorFound) {
          afterCursor += segment;
          continue;
        }
        const nextWidth = currentWidth + stringWidth(segment);
        if (nextWidth > column) {
          atCursor = segment;
          cursorFound = true;
        } else {
          currentWidth = nextWidth;
          beforeCursor += segment;
        }
      }
      let renderedCursor;
      let ghostSuffix = "";
      if (ghostText && currentLine === allLines.length - 1 && this.isAtEnd() && ghostText.text.length > 0) {
        const firstGhostChar = firstGrapheme(ghostText.text) || ghostText.text[0];
        renderedCursor = cursorChar ? invert(firstGhostChar) : firstGhostChar;
        const ghostRest = ghostText.text.slice(firstGhostChar.length);
        if (ghostRest.length > 0) {
          ghostSuffix = ghostText.dim(ghostRest);
        }
      } else {
        renderedCursor = cursorChar ? invert(atCursor) : atCursor;
      }
      return beforeCursor + renderedCursor + ghostSuffix + afterCursor.trimEnd();
    }).join("\n");
  }
  left() {
    if (this.offset === 0) return this;
    const chip = this.imageRefEndingAt(this.offset);
    if (chip) return new Cursor(this.measuredText, chip.start);
    const prevOffset = this.measuredText.prevOffset(this.offset);
    return new Cursor(this.measuredText, prevOffset);
  }
  right() {
    if (this.offset >= this.text.length) return this;
    const chip = this.imageRefStartingAt(this.offset);
    if (chip) return new Cursor(this.measuredText, chip.end);
    const nextOffset = this.measuredText.nextOffset(this.offset);
    return new Cursor(this.measuredText, Math.min(nextOffset, this.text.length));
  }
  /**
   * If an [Image #N] chip ends at `offset`, return its bounds. Used by left()
   * to hop the cursor over the chip instead of stepping into it.
   */
  imageRefEndingAt(offset) {
    const m = this.text.slice(0, offset).match(/\[Image #\d+\]$/);
    return m ? { start: offset - m[0].length, end: offset } : null;
  }
  imageRefStartingAt(offset) {
    const m = this.text.slice(offset).match(/^\[Image #\d+\]/);
    return m ? { start: offset, end: offset + m[0].length } : null;
  }
  /**
   * If offset lands strictly inside an [Image #N] chip, snap it to the given
   * boundary. Used by word-movement methods so Ctrl+W / Alt+D never leave a
   * partial chip.
   */
  snapOutOfImageRef(offset, toward) {
    const re = /\[Image #\d+\]/g;
    let m;
    while ((m = re.exec(this.text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (offset > start && offset < end) {
        return toward === "start" ? start : end;
      }
    }
    return offset;
  }
  up() {
    const { line, column } = this.getPosition();
    if (line === 0) {
      return this;
    }
    const prevLine = this.measuredText.getWrappedText()[line - 1];
    if (prevLine === void 0) {
      return this;
    }
    const prevLineDisplayWidth = stringWidth(prevLine);
    if (column > prevLineDisplayWidth) {
      const newOffset2 = this.getOffset({
        line: line - 1,
        column: prevLineDisplayWidth
      });
      return new Cursor(this.measuredText, newOffset2, 0);
    }
    const newOffset = this.getOffset({ line: line - 1, column });
    return new Cursor(this.measuredText, newOffset, 0);
  }
  down() {
    const { line, column } = this.getPosition();
    if (line >= this.measuredText.lineCount - 1) {
      return this;
    }
    const nextLine = this.measuredText.getWrappedText()[line + 1];
    if (nextLine === void 0) {
      return this;
    }
    const nextLineDisplayWidth = stringWidth(nextLine);
    if (column > nextLineDisplayWidth) {
      const newOffset2 = this.getOffset({
        line: line + 1,
        column: nextLineDisplayWidth
      });
      return new Cursor(this.measuredText, newOffset2, 0);
    }
    const newOffset = this.getOffset({
      line: line + 1,
      column
    });
    return new Cursor(this.measuredText, newOffset, 0);
  }
  /**
   * Move to the start of the current line (column 0).
   * This is the raw version used internally by startOfLine.
   */
  startOfCurrentLine() {
    const { line } = this.getPosition();
    return new Cursor(
      this.measuredText,
      this.getOffset({
        line,
        column: 0
      }),
      0
    );
  }
  startOfLine() {
    const { line, column } = this.getPosition();
    if (column === 0 && line > 0) {
      return new Cursor(
        this.measuredText,
        this.getOffset({
          line: line - 1,
          column: 0
        }),
        0
      );
    }
    return this.startOfCurrentLine();
  }
  firstNonBlankInLine() {
    const { line } = this.getPosition();
    const lineText = this.measuredText.getWrappedText()[line] || "";
    const match = lineText.match(/^\s*\S/);
    const column = match?.index ? match.index + match[0].length - 1 : 0;
    const offset = this.getOffset({ line, column });
    return new Cursor(this.measuredText, offset, 0);
  }
  endOfLine() {
    const { line } = this.getPosition();
    const column = this.measuredText.getLineLength(line);
    const offset = this.getOffset({ line, column });
    return new Cursor(this.measuredText, offset, 0);
  }
  // Helper methods for finding logical line boundaries
  findLogicalLineStart(fromOffset = this.offset) {
    const prevNewline = this.text.lastIndexOf("\n", fromOffset - 1);
    return prevNewline === -1 ? 0 : prevNewline + 1;
  }
  findLogicalLineEnd(fromOffset = this.offset) {
    const nextNewline = this.text.indexOf("\n", fromOffset);
    return nextNewline === -1 ? this.text.length : nextNewline;
  }
  // Helper to get logical line bounds for current position
  getLogicalLineBounds() {
    return {
      start: this.findLogicalLineStart(),
      end: this.findLogicalLineEnd()
    };
  }
  // Helper to create cursor with preserved column, clamped to line length
  // Snaps to grapheme boundary to avoid landing mid-grapheme
  createCursorWithColumn(lineStart, lineEnd, targetColumn) {
    const lineLength = lineEnd - lineStart;
    const clampedColumn = Math.min(targetColumn, lineLength);
    const rawOffset = lineStart + clampedColumn;
    const offset = this.measuredText.snapToGraphemeBoundary(rawOffset);
    return new Cursor(this.measuredText, offset, 0);
  }
  endOfLogicalLine() {
    return new Cursor(this.measuredText, this.findLogicalLineEnd(), 0);
  }
  startOfLogicalLine() {
    return new Cursor(this.measuredText, this.findLogicalLineStart(), 0);
  }
  firstNonBlankInLogicalLine() {
    const { start, end } = this.getLogicalLineBounds();
    const lineText = this.text.slice(start, end);
    const match = lineText.match(/\S/);
    const offset = start + (match?.index ?? 0);
    return new Cursor(this.measuredText, offset, 0);
  }
  upLogicalLine() {
    const { start: currentStart } = this.getLogicalLineBounds();
    if (currentStart === 0) {
      return new Cursor(this.measuredText, 0, 0);
    }
    const currentColumn = this.offset - currentStart;
    const prevLineEnd = currentStart - 1;
    const prevLineStart = this.findLogicalLineStart(prevLineEnd);
    return this.createCursorWithColumn(
      prevLineStart,
      prevLineEnd,
      currentColumn
    );
  }
  downLogicalLine() {
    const { start: currentStart, end: currentEnd } = this.getLogicalLineBounds();
    if (currentEnd >= this.text.length) {
      return new Cursor(this.measuredText, this.text.length, 0);
    }
    const currentColumn = this.offset - currentStart;
    const nextLineStart = currentEnd + 1;
    const nextLineEnd = this.findLogicalLineEnd(nextLineStart);
    return this.createCursorWithColumn(
      nextLineStart,
      nextLineEnd,
      currentColumn
    );
  }
  // Vim word vs WORD movements:
  // - word (lowercase w/b/e): sequences of letters, digits, and underscores
  // - WORD (uppercase W/B/E): sequences of non-whitespace characters
  // For example, in "hello-world!", word movements see 3 words: "hello", "world", and nothing
  // But WORD movements see 1 WORD: "hello-world!"
  nextWord() {
    if (this.isAtEnd()) {
      return this;
    }
    const wordBoundaries = this.measuredText.getWordBoundaries();
    for (const boundary of wordBoundaries) {
      if (boundary.isWordLike && boundary.start > this.offset) {
        return new Cursor(this.measuredText, boundary.start);
      }
    }
    return new Cursor(this.measuredText, this.text.length);
  }
  endOfWord() {
    if (this.isAtEnd()) {
      return this;
    }
    const wordBoundaries = this.measuredText.getWordBoundaries();
    for (const boundary of wordBoundaries) {
      if (!boundary.isWordLike) continue;
      if (this.offset >= boundary.start && this.offset < boundary.end - 1) {
        return new Cursor(this.measuredText, boundary.end - 1);
      }
      if (this.offset === boundary.end - 1) {
        for (const nextBoundary of wordBoundaries) {
          if (nextBoundary.isWordLike && nextBoundary.start > this.offset) {
            return new Cursor(this.measuredText, nextBoundary.end - 1);
          }
        }
        return this;
      }
    }
    for (const boundary of wordBoundaries) {
      if (boundary.isWordLike && boundary.start > this.offset) {
        return new Cursor(this.measuredText, boundary.end - 1);
      }
    }
    return this;
  }
  prevWord() {
    if (this.isAtStart()) {
      return this;
    }
    const wordBoundaries = this.measuredText.getWordBoundaries();
    let prevWordStart = null;
    for (const boundary of wordBoundaries) {
      if (!boundary.isWordLike) continue;
      if (boundary.start < this.offset) {
        if (this.offset > boundary.start && this.offset <= boundary.end) {
          return new Cursor(this.measuredText, boundary.start);
        }
        prevWordStart = boundary.start;
      }
    }
    if (prevWordStart !== null) {
      return new Cursor(this.measuredText, prevWordStart);
    }
    return new Cursor(this.measuredText, 0);
  }
  // Vim-specific word methods
  // In Vim, a "word" is either:
  // 1. A sequence of word characters (letters, digits, underscore) - including Unicode
  // 2. A sequence of non-blank, non-word characters (punctuation/symbols)
  nextVimWord() {
    if (this.isAtEnd()) {
      return this;
    }
    let pos = this.offset;
    const advance = (p) => this.measuredText.nextOffset(p);
    const currentGrapheme = this.graphemeAt(pos);
    if (!currentGrapheme) {
      return this;
    }
    if (isVimWordChar(currentGrapheme)) {
      while (pos < this.text.length && isVimWordChar(this.graphemeAt(pos))) {
        pos = advance(pos);
      }
    } else if (isVimPunctuation(currentGrapheme)) {
      while (pos < this.text.length && isVimPunctuation(this.graphemeAt(pos))) {
        pos = advance(pos);
      }
    }
    while (pos < this.text.length && WHITESPACE_REGEX.test(this.graphemeAt(pos))) {
      pos = advance(pos);
    }
    return new Cursor(this.measuredText, pos);
  }
  endOfVimWord() {
    if (this.isAtEnd()) {
      return this;
    }
    const text = this.text;
    let pos = this.offset;
    const advance = (p) => this.measuredText.nextOffset(p);
    if (this.graphemeAt(pos) === "") {
      return this;
    }
    pos = advance(pos);
    while (pos < text.length && WHITESPACE_REGEX.test(this.graphemeAt(pos))) {
      pos = advance(pos);
    }
    if (pos >= text.length) {
      return new Cursor(this.measuredText, text.length);
    }
    const charAtPos = this.graphemeAt(pos);
    if (isVimWordChar(charAtPos)) {
      while (pos < text.length) {
        const nextPos = advance(pos);
        if (nextPos >= text.length || !isVimWordChar(this.graphemeAt(nextPos)))
          break;
        pos = nextPos;
      }
    } else if (isVimPunctuation(charAtPos)) {
      while (pos < text.length) {
        const nextPos = advance(pos);
        if (nextPos >= text.length || !isVimPunctuation(this.graphemeAt(nextPos)))
          break;
        pos = nextPos;
      }
    }
    return new Cursor(this.measuredText, pos);
  }
  prevVimWord() {
    if (this.isAtStart()) {
      return this;
    }
    let pos = this.offset;
    const retreat = (p) => this.measuredText.prevOffset(p);
    pos = retreat(pos);
    while (pos > 0 && WHITESPACE_REGEX.test(this.graphemeAt(pos))) {
      pos = retreat(pos);
    }
    if (pos === 0 && WHITESPACE_REGEX.test(this.graphemeAt(0))) {
      return new Cursor(this.measuredText, 0);
    }
    const charAtPos = this.graphemeAt(pos);
    if (isVimWordChar(charAtPos)) {
      while (pos > 0) {
        const prevPos = retreat(pos);
        if (!isVimWordChar(this.graphemeAt(prevPos))) break;
        pos = prevPos;
      }
    } else if (isVimPunctuation(charAtPos)) {
      while (pos > 0) {
        const prevPos = retreat(pos);
        if (!isVimPunctuation(this.graphemeAt(prevPos))) break;
        pos = prevPos;
      }
    }
    return new Cursor(this.measuredText, pos);
  }
  nextWORD() {
    let nextCursor = this;
    while (!nextCursor.isOverWhitespace() && !nextCursor.isAtEnd()) {
      nextCursor = nextCursor.right();
    }
    while (nextCursor.isOverWhitespace() && !nextCursor.isAtEnd()) {
      nextCursor = nextCursor.right();
    }
    return nextCursor;
  }
  endOfWORD() {
    if (this.isAtEnd()) {
      return this;
    }
    let cursor = this;
    const atEndOfWORD = !cursor.isOverWhitespace() && (cursor.right().isOverWhitespace() || cursor.right().isAtEnd());
    if (atEndOfWORD) {
      cursor = cursor.right();
      return cursor.endOfWORD();
    }
    if (cursor.isOverWhitespace()) {
      cursor = cursor.nextWORD();
    }
    while (!cursor.right().isOverWhitespace() && !cursor.isAtEnd()) {
      cursor = cursor.right();
    }
    return cursor;
  }
  prevWORD() {
    let cursor = this;
    if (cursor.left().isOverWhitespace()) {
      cursor = cursor.left();
    }
    while (cursor.isOverWhitespace() && !cursor.isAtStart()) {
      cursor = cursor.left();
    }
    if (!cursor.isOverWhitespace()) {
      while (!cursor.left().isOverWhitespace() && !cursor.isAtStart()) {
        cursor = cursor.left();
      }
    }
    return cursor;
  }
  modifyText(end, insertString = "") {
    const startOffset = this.offset;
    const endOffset = end.offset;
    const newText = this.text.slice(0, startOffset) + insertString + this.text.slice(endOffset);
    return Cursor.fromText(
      newText,
      this.columns,
      startOffset + insertString.normalize("NFC").length
    );
  }
  insert(insertString) {
    const newCursor = this.modifyText(this, insertString);
    return newCursor;
  }
  del() {
    if (this.isAtEnd()) {
      return this;
    }
    return this.modifyText(this.right());
  }
  backspace() {
    if (this.isAtStart()) {
      return this;
    }
    return this.left().modifyText(this);
  }
  deleteToLineStart() {
    if (this.offset > 0 && this.text[this.offset - 1] === "\n") {
      return { cursor: this.left().modifyText(this), killed: "\n" };
    }
    const startCursor = this.startOfLine();
    const killed = this.text.slice(startCursor.offset, this.offset);
    return { cursor: startCursor.modifyText(this), killed };
  }
  deleteToLineEnd() {
    if (this.text[this.offset] === "\n") {
      return { cursor: this.modifyText(this.right()), killed: "\n" };
    }
    const endCursor = this.endOfLine();
    const killed = this.text.slice(this.offset, endCursor.offset);
    return { cursor: this.modifyText(endCursor), killed };
  }
  deleteToLogicalLineEnd() {
    if (this.text[this.offset] === "\n") {
      return this.modifyText(this.right());
    }
    return this.modifyText(this.endOfLogicalLine());
  }
  deleteWordBefore() {
    if (this.isAtStart()) {
      return { cursor: this, killed: "" };
    }
    const target = this.snapOutOfImageRef(this.prevWord().offset, "start");
    const prevWordCursor = new Cursor(this.measuredText, target);
    const killed = this.text.slice(prevWordCursor.offset, this.offset);
    return { cursor: prevWordCursor.modifyText(this), killed };
  }
  /**
   * Deletes a token before the cursor if one exists.
   * Supports pasted text refs: [Pasted text #1], [Pasted text #1 +10 lines],
   * [...Truncated text #1 +10 lines...]
   *
   * Note: @mentions are NOT tokenized since users may want to correct typos
   * in file paths. Use Ctrl/Cmd+backspace for word-deletion on mentions.
   *
   * Returns null if no token found at cursor position.
   * Only triggers when cursor is at end of token (followed by whitespace or EOL).
   */
  deleteTokenBefore() {
    const chipAfter = this.imageRefStartingAt(this.offset);
    if (chipAfter) {
      const end = this.text[chipAfter.end] === " " ? chipAfter.end + 1 : chipAfter.end;
      return this.modifyText(new Cursor(this.measuredText, end));
    }
    if (this.isAtStart()) {
      return null;
    }
    const charAfter = this.text[this.offset];
    if (charAfter !== void 0 && !/\s/.test(charAfter)) {
      return null;
    }
    const textBefore = this.text.slice(0, this.offset);
    const pasteMatch = textBefore.match(
      /(^|\s)\[(Pasted text #\d+(?: \+\d+ lines)?|Image #\d+|\.\.\.Truncated text #\d+ \+\d+ lines\.\.\.)\]$/
    );
    if (pasteMatch) {
      const matchStart = pasteMatch.index + pasteMatch[1].length;
      return new Cursor(this.measuredText, matchStart).modifyText(this);
    }
    return null;
  }
  deleteWordAfter() {
    if (this.isAtEnd()) {
      return this;
    }
    const target = this.snapOutOfImageRef(this.nextWord().offset, "end");
    return this.modifyText(new Cursor(this.measuredText, target));
  }
  graphemeAt(pos) {
    if (pos >= this.text.length) return "";
    const nextOff = this.measuredText.nextOffset(pos);
    return this.text.slice(pos, nextOff);
  }
  isOverWhitespace() {
    const currentChar = this.text[this.offset] ?? "";
    return /\s/.test(currentChar);
  }
  equals(other) {
    return this.offset === other.offset && this.measuredText === other.measuredText;
  }
  isAtStart() {
    return this.offset === 0;
  }
  isAtEnd() {
    return this.offset >= this.text.length;
  }
  startOfFirstLine() {
    return new Cursor(this.measuredText, 0, 0);
  }
  startOfLastLine() {
    const lastNewlineIndex = this.text.lastIndexOf("\n");
    if (lastNewlineIndex === -1) {
      return this.startOfLine();
    }
    return new Cursor(this.measuredText, lastNewlineIndex + 1, 0);
  }
  goToLine(lineNumber) {
    const lines = this.text.split("\n");
    const targetLine = Math.min(Math.max(0, lineNumber - 1), lines.length - 1);
    let offset = 0;
    for (let i = 0; i < targetLine; i++) {
      offset += (lines[i]?.length ?? 0) + 1;
    }
    return new Cursor(this.measuredText, offset, 0);
  }
  endOfFile() {
    return new Cursor(this.measuredText, this.text.length, 0);
  }
  get text() {
    return this.measuredText.text;
  }
  get columns() {
    return this.measuredText.columns + 1;
  }
  getPosition() {
    return this.measuredText.getPositionFromOffset(this.offset);
  }
  getOffset(position) {
    return this.measuredText.getOffsetFromPosition(position);
  }
  /**
   * Find a character using vim f/F/t/T semantics.
   *
   * @param char - The character to find
   * @param type - 'f' (forward to), 'F' (backward to), 't' (forward till), 'T' (backward till)
   * @param count - Find the Nth occurrence
   * @returns The target offset, or null if not found
   */
  findCharacter(char, type, count = 1) {
    const text = this.text;
    const forward = type === "f" || type === "t";
    const till = type === "t" || type === "T";
    let found = 0;
    if (forward) {
      let pos = this.measuredText.nextOffset(this.offset);
      while (pos < text.length) {
        const grapheme = this.graphemeAt(pos);
        if (grapheme === char) {
          found++;
          if (found === count) {
            return till ? Math.max(this.offset, this.measuredText.prevOffset(pos)) : pos;
          }
        }
        pos = this.measuredText.nextOffset(pos);
      }
    } else {
      if (this.offset === 0) return null;
      let pos = this.measuredText.prevOffset(this.offset);
      while (pos >= 0) {
        const grapheme = this.graphemeAt(pos);
        if (grapheme === char) {
          found++;
          if (found === count) {
            return till ? Math.min(this.offset, this.measuredText.nextOffset(pos)) : pos;
          }
        }
        if (pos === 0) break;
        pos = this.measuredText.prevOffset(pos);
      }
    }
    return null;
  }
}
class WrappedLine {
  constructor(text, startOffset, isPrecededByNewline, endsWithNewline = false) {
    this.text = text;
    this.startOffset = startOffset;
    this.isPrecededByNewline = isPrecededByNewline;
    this.endsWithNewline = endsWithNewline;
  }
  text;
  startOffset;
  isPrecededByNewline;
  endsWithNewline;
  equals(other) {
    return this.text === other.text && this.startOffset === other.startOffset;
  }
  get length() {
    return this.text.length + (this.endsWithNewline ? 1 : 0);
  }
}
class MeasuredText {
  constructor(text, columns) {
    this.columns = columns;
    this.text = text.normalize("NFC");
    this.navigationCache = /* @__PURE__ */ new Map();
  }
  columns;
  _wrappedLines;
  text;
  navigationCache;
  graphemeBoundaries;
  /**
   * Lazily computes and caches wrapped lines.
   * This expensive operation is deferred until actually needed.
   */
  get wrappedLines() {
    if (!this._wrappedLines) {
      this._wrappedLines = this.measureWrappedText();
    }
    return this._wrappedLines;
  }
  getGraphemeBoundaries() {
    if (!this.graphemeBoundaries) {
      this.graphemeBoundaries = [];
      for (const { index } of getGraphemeSegmenter().segment(this.text)) {
        this.graphemeBoundaries.push(index);
      }
      this.graphemeBoundaries.push(this.text.length);
    }
    return this.graphemeBoundaries;
  }
  wordBoundariesCache;
  /**
   * Get word boundaries using Intl.Segmenter for proper Unicode word segmentation.
   * This correctly handles CJK (Chinese, Japanese, Korean) text where each character
   * is typically its own word, as well as scripts that use spaces between words.
   */
  getWordBoundaries() {
    if (!this.wordBoundariesCache) {
      this.wordBoundariesCache = [];
      for (const segment of getWordSegmenter().segment(this.text)) {
        this.wordBoundariesCache.push({
          start: segment.index,
          end: segment.index + segment.segment.length,
          isWordLike: segment.isWordLike ?? false
        });
      }
    }
    return this.wordBoundariesCache;
  }
  /**
   * Binary search for boundaries.
   * @param boundaries: Sorted array of boundaries
   * @param target: Target offset
   * @param findNext: If true, finds first boundary > target. If false, finds last boundary < target.
   * @returns The found boundary index, or appropriate default
   */
  binarySearchBoundary(boundaries, target, findNext) {
    let left = 0;
    let right = boundaries.length - 1;
    let result = findNext ? this.text.length : 0;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const boundary = boundaries[mid];
      if (boundary === void 0) break;
      if (findNext) {
        if (boundary > target) {
          result = boundary;
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      } else {
        if (boundary < target) {
          result = boundary;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
    }
    return result;
  }
  // Convert string index to display width
  stringIndexToDisplayWidth(text, index) {
    if (index <= 0) return 0;
    if (index >= text.length) return stringWidth(text);
    return stringWidth(text.substring(0, index));
  }
  // Convert display width to string index
  displayWidthToStringIndex(text, targetWidth) {
    if (targetWidth <= 0) return 0;
    if (!text) return 0;
    if (text === this.text) {
      return this.offsetAtDisplayWidth(targetWidth);
    }
    let currentWidth = 0;
    let currentOffset = 0;
    for (const { segment, index } of getGraphemeSegmenter().segment(text)) {
      const segmentWidth = stringWidth(segment);
      if (currentWidth + segmentWidth > targetWidth) {
        break;
      }
      currentWidth += segmentWidth;
      currentOffset = index + segment.length;
    }
    return currentOffset;
  }
  /**
   * Find the string offset that corresponds to a target display width.
   */
  offsetAtDisplayWidth(targetWidth) {
    if (targetWidth <= 0) return 0;
    let currentWidth = 0;
    const boundaries = this.getGraphemeBoundaries();
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      if (start === void 0 || end === void 0) continue;
      const segment = this.text.substring(start, end);
      const segmentWidth = stringWidth(segment);
      if (currentWidth + segmentWidth > targetWidth) {
        return start;
      }
      currentWidth += segmentWidth;
    }
    return this.text.length;
  }
  measureWrappedText() {
    const wrappedText = wrapAnsi(this.text, this.columns, {
      hard: true,
      trim: false
    });
    const wrappedLines = [];
    let searchOffset = 0;
    let lastNewLinePos = -1;
    const lines = wrappedText.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      const isPrecededByNewline = (startOffset) => i === 0 || startOffset > 0 && this.text[startOffset - 1] === "\n";
      if (text.length === 0) {
        lastNewLinePos = this.text.indexOf("\n", lastNewLinePos + 1);
        if (lastNewLinePos !== -1) {
          const startOffset = lastNewLinePos;
          const endsWithNewline = true;
          wrappedLines.push(
            new WrappedLine(
              text,
              startOffset,
              isPrecededByNewline(startOffset),
              endsWithNewline
            )
          );
        } else {
          const startOffset = this.text.length;
          wrappedLines.push(
            new WrappedLine(
              text,
              startOffset,
              isPrecededByNewline(startOffset),
              false
            )
          );
        }
      } else {
        const startOffset = this.text.indexOf(text, searchOffset);
        if (startOffset === -1) {
          throw new Error("Failed to find wrapped line in text");
        }
        searchOffset = startOffset + text.length;
        const potentialNewlinePos = startOffset + text.length;
        const endsWithNewline = potentialNewlinePos < this.text.length && this.text[potentialNewlinePos] === "\n";
        if (endsWithNewline) {
          lastNewLinePos = potentialNewlinePos;
        }
        wrappedLines.push(
          new WrappedLine(
            text,
            startOffset,
            isPrecededByNewline(startOffset),
            endsWithNewline
          )
        );
      }
    }
    return wrappedLines;
  }
  getWrappedText() {
    return this.wrappedLines.map(
      (line) => line.isPrecededByNewline ? line.text : line.text.trimStart()
    );
  }
  getWrappedLines() {
    return this.wrappedLines;
  }
  getLine(line) {
    const lines = this.wrappedLines;
    return lines[Math.max(0, Math.min(line, lines.length - 1))];
  }
  getOffsetFromPosition(position) {
    const wrappedLine = this.getLine(position.line);
    if (wrappedLine.text.length === 0 && wrappedLine.endsWithNewline) {
      return wrappedLine.startOffset;
    }
    const leadingWhitespace = wrappedLine.isPrecededByNewline ? 0 : wrappedLine.text.length - wrappedLine.text.trimStart().length;
    const displayColumnWithLeading = position.column + leadingWhitespace;
    const stringIndex = this.displayWidthToStringIndex(
      wrappedLine.text,
      displayColumnWithLeading
    );
    const offset = wrappedLine.startOffset + stringIndex;
    const lineEnd = wrappedLine.startOffset + wrappedLine.text.length;
    let maxOffset = lineEnd;
    const lineDisplayWidth = stringWidth(wrappedLine.text);
    if (wrappedLine.endsWithNewline && position.column > lineDisplayWidth) {
      maxOffset = lineEnd + 1;
    }
    return Math.min(offset, maxOffset);
  }
  getLineLength(line) {
    const wrappedLine = this.getLine(line);
    return stringWidth(wrappedLine.text);
  }
  getPositionFromOffset(offset) {
    const lines = this.wrappedLines;
    for (let line2 = 0; line2 < lines.length; line2++) {
      const currentLine = lines[line2];
      const nextLine = lines[line2 + 1];
      if (offset >= currentLine.startOffset && (!nextLine || offset < nextLine.startOffset)) {
        const stringPosInLine = offset - currentLine.startOffset;
        let displayColumn;
        if (currentLine.isPrecededByNewline) {
          displayColumn = this.stringIndexToDisplayWidth(
            currentLine.text,
            stringPosInLine
          );
        } else {
          const leadingWhitespace = currentLine.text.length - currentLine.text.trimStart().length;
          if (stringPosInLine < leadingWhitespace) {
            displayColumn = 0;
          } else {
            const trimmedText = currentLine.text.trimStart();
            const posInTrimmed = stringPosInLine - leadingWhitespace;
            displayColumn = this.stringIndexToDisplayWidth(
              trimmedText,
              posInTrimmed
            );
          }
        }
        return {
          line: line2,
          column: Math.max(0, displayColumn)
        };
      }
    }
    const line = lines.length - 1;
    const lastLine = this.wrappedLines[line];
    return {
      line,
      column: stringWidth(lastLine.text)
    };
  }
  get lineCount() {
    return this.wrappedLines.length;
  }
  withCache(key, compute) {
    const cached = this.navigationCache.get(key);
    if (cached !== void 0) return cached;
    const result = compute();
    this.navigationCache.set(key, result);
    return result;
  }
  nextOffset(offset) {
    return this.withCache(`next:${offset}`, () => {
      const boundaries = this.getGraphemeBoundaries();
      return this.binarySearchBoundary(boundaries, offset, true);
    });
  }
  prevOffset(offset) {
    if (offset <= 0) return 0;
    return this.withCache(`prev:${offset}`, () => {
      const boundaries = this.getGraphemeBoundaries();
      return this.binarySearchBoundary(boundaries, offset, false);
    });
  }
  /**
   * Snap an arbitrary code-unit offset to the start of the containing grapheme.
   * If offset is already on a boundary, returns it unchanged.
   */
  snapToGraphemeBoundary(offset) {
    if (offset <= 0) return 0;
    if (offset >= this.text.length) return this.text.length;
    const boundaries = this.getGraphemeBoundaries();
    let lo = 0;
    let hi = boundaries.length - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (boundaries[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return boundaries[lo];
  }
}
export {
  Cursor,
  MeasuredText,
  VIM_WORD_CHAR_REGEX,
  WHITESPACE_REGEX,
  canYankPop,
  clearKillRing,
  getKillRingItem,
  getKillRingSize,
  getLastKill,
  isVimPunctuation,
  isVimWhitespace,
  isVimWordChar,
  pushToKillRing,
  recordYank,
  resetKillAccumulation,
  resetYankState,
  updateYankLength,
  yankPop
};
