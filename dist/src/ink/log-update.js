import {
  ansiCodesToString,
  diffAnsiCodes
} from "@alcalzone/ansi-tokenize";
import { logForDebugging } from "../utils/debug.js";
import {
  CellWidth,
  cellAt,
  charInCellAt,
  diffEach,
  isEmptyCellAt,
  shiftRows,
  visibleCellAtIndex
} from "./screen.js";
import {
  CURSOR_HOME,
  scrollDown as csiScrollDown,
  scrollUp as csiScrollUp,
  RESET_SCROLL_REGION,
  setScrollRegion
} from "./termio/csi.js";
import { LINK_END, link as oscLink } from "./termio/osc.js";
const CARRIAGE_RETURN = { type: "carriageReturn" };
const NEWLINE = { type: "stdout", content: "\n" };
class LogUpdate {
  constructor(options) {
    this.options = options;
    this.state = {
      previousOutput: ""
    };
  }
  options;
  state;
  renderPreviousOutput_DEPRECATED(prevFrame) {
    if (!this.options.isTTY) {
      return [NEWLINE];
    }
    return this.getRenderOpsForDone(prevFrame);
  }
  // Called when process resumes from suspension (SIGCONT) to prevent clobbering terminal content
  reset() {
    this.state.previousOutput = "";
  }
  renderFullFrame(frame) {
    const { screen } = frame;
    const lines = [];
    let currentStyles = [];
    let currentHyperlink = void 0;
    for (let y = 0; y < screen.height; y++) {
      let line = "";
      for (let x = 0; x < screen.width; x++) {
        const cell = cellAt(screen, x, y);
        if (cell && cell.width !== CellWidth.SpacerTail) {
          if (cell.hyperlink !== currentHyperlink) {
            if (currentHyperlink !== void 0) {
              line += LINK_END;
            }
            if (cell.hyperlink !== void 0) {
              line += oscLink(cell.hyperlink);
            }
            currentHyperlink = cell.hyperlink;
          }
          const cellStyles = this.options.stylePool.get(cell.styleId);
          const styleDiff = diffAnsiCodes(currentStyles, cellStyles);
          if (styleDiff.length > 0) {
            line += ansiCodesToString(styleDiff);
            currentStyles = cellStyles;
          }
          line += cell.char;
        }
      }
      if (currentHyperlink !== void 0) {
        line += LINK_END;
        currentHyperlink = void 0;
      }
      const resetCodes = diffAnsiCodes(currentStyles, []);
      if (resetCodes.length > 0) {
        line += ansiCodesToString(resetCodes);
        currentStyles = [];
      }
      lines.push(line.trimEnd());
    }
    if (lines.length === 0) {
      return [];
    }
    return [{ type: "stdout", content: lines.join("\n") }];
  }
  getRenderOpsForDone(prev) {
    this.state.previousOutput = "";
    if (!prev.cursor.visible) {
      return [{ type: "cursorShow" }];
    }
    return [];
  }
  render(prev, next, altScreen = false, decstbmSafe = true) {
    if (!this.options.isTTY) {
      return this.renderFullFrame(next);
    }
    const startTime = performance.now();
    const stylePool = this.options.stylePool;
    if (next.viewport.height < prev.viewport.height || prev.viewport.width !== 0 && next.viewport.width !== prev.viewport.width) {
      return fullResetSequence_CAUSES_FLICKER(next, "resize", stylePool);
    }
    let scrollPatch = [];
    if (altScreen && next.scrollHint && decstbmSafe) {
      const { top, bottom, delta } = next.scrollHint;
      if (top >= 0 && bottom < prev.screen.height && bottom < next.screen.height) {
        shiftRows(prev.screen, top, bottom, delta);
        scrollPatch = [
          {
            type: "stdout",
            content: setScrollRegion(top + 1, bottom + 1) + (delta > 0 ? csiScrollUp(delta) : csiScrollDown(-delta)) + RESET_SCROLL_REGION + CURSOR_HOME
          }
        ];
      }
    }
    const cursorAtBottom = prev.cursor.y >= prev.screen.height;
    const isGrowing = next.screen.height > prev.screen.height;
    const prevHadScrollback = cursorAtBottom && prev.screen.height >= prev.viewport.height;
    const isShrinking = next.screen.height < prev.screen.height;
    const nextFitsViewport = next.screen.height <= prev.viewport.height;
    if (prevHadScrollback && nextFitsViewport && isShrinking) {
      logForDebugging(
        `Full reset (shrink->below): prevHeight=${prev.screen.height}, nextHeight=${next.screen.height}, viewport=${prev.viewport.height}`
      );
      return fullResetSequence_CAUSES_FLICKER(next, "offscreen", stylePool);
    }
    if (prev.screen.height >= prev.viewport.height && prev.screen.height > 0 && cursorAtBottom && !isGrowing) {
      const viewportY2 = prev.screen.height - prev.viewport.height;
      const scrollbackRows = viewportY2 + 1;
      let scrollbackChangeY = -1;
      diffEach(prev.screen, next.screen, (_x, y) => {
        if (y < scrollbackRows) {
          scrollbackChangeY = y;
          return true;
        }
      });
      if (scrollbackChangeY >= 0) {
        const prevLine = readLine(prev.screen, scrollbackChangeY);
        const nextLine = readLine(next.screen, scrollbackChangeY);
        return fullResetSequence_CAUSES_FLICKER(next, "offscreen", stylePool, {
          triggerY: scrollbackChangeY,
          prevLine,
          nextLine
        });
      }
    }
    const screen = new VirtualScreen(prev.cursor, next.viewport.width);
    const heightDelta = Math.max(next.screen.height, 1) - Math.max(prev.screen.height, 1);
    const shrinking = heightDelta < 0;
    const growing = heightDelta > 0;
    if (shrinking) {
      const linesToClear = prev.screen.height - next.screen.height;
      if (linesToClear > prev.viewport.height) {
        return fullResetSequence_CAUSES_FLICKER(
          next,
          "offscreen",
          this.options.stylePool
        );
      }
      screen.txn((prev2) => [
        [
          { type: "clear", count: linesToClear },
          { type: "cursorMove", x: 0, y: -1 }
        ],
        { dx: -prev2.x, dy: -linesToClear }
      ]);
    }
    const cursorRestoreScroll = prevHadScrollback ? 1 : 0;
    const viewportY = growing ? Math.max(
      0,
      prev.screen.height - prev.viewport.height + cursorRestoreScroll
    ) : Math.max(prev.screen.height, next.screen.height) - next.viewport.height + cursorRestoreScroll;
    let currentStyleId = stylePool.none;
    let currentHyperlink = void 0;
    let needsFullReset = false;
    let resetTriggerY = -1;
    diffEach(prev.screen, next.screen, (x, y, removed, added) => {
      if (growing && y >= prev.screen.height) {
        return;
      }
      if (added && (added.width === CellWidth.SpacerTail || added.width === CellWidth.SpacerHead)) {
        return;
      }
      if (removed && (removed.width === CellWidth.SpacerTail || removed.width === CellWidth.SpacerHead) && !added) {
        return;
      }
      if (added && isEmptyCellAt(next.screen, x, y) && !removed) {
        return;
      }
      if (y < viewportY) {
        needsFullReset = true;
        resetTriggerY = y;
        return true;
      }
      moveCursorTo(screen, x, y);
      if (added) {
        const targetHyperlink = added.hyperlink;
        currentHyperlink = transitionHyperlink(
          screen.diff,
          currentHyperlink,
          targetHyperlink
        );
        const styleStr = stylePool.transition(currentStyleId, added.styleId);
        if (writeCellWithStyleStr(screen, added, styleStr)) {
          currentStyleId = added.styleId;
        }
      } else if (removed) {
        const styleIdToReset = currentStyleId;
        const hyperlinkToReset = currentHyperlink;
        currentStyleId = stylePool.none;
        currentHyperlink = void 0;
        screen.txn(() => {
          const patches = [];
          transitionStyle(patches, stylePool, styleIdToReset, stylePool.none);
          transitionHyperlink(patches, hyperlinkToReset, void 0);
          patches.push({ type: "stdout", content: " " });
          return [patches, { dx: 1, dy: 0 }];
        });
      }
    });
    if (needsFullReset) {
      return fullResetSequence_CAUSES_FLICKER(next, "offscreen", stylePool, {
        triggerY: resetTriggerY,
        prevLine: readLine(prev.screen, resetTriggerY),
        nextLine: readLine(next.screen, resetTriggerY)
      });
    }
    currentStyleId = transitionStyle(
      screen.diff,
      stylePool,
      currentStyleId,
      stylePool.none
    );
    currentHyperlink = transitionHyperlink(
      screen.diff,
      currentHyperlink,
      void 0
    );
    if (growing) {
      renderFrameSlice(
        screen,
        next,
        prev.screen.height,
        next.screen.height,
        stylePool
      );
    }
    if (altScreen) {
    } else if (next.cursor.y >= next.screen.height) {
      screen.txn((prev2) => {
        const rowsToCreate = next.cursor.y - prev2.y;
        if (rowsToCreate > 0) {
          const patches = new Array(1 + rowsToCreate);
          patches[0] = CARRIAGE_RETURN;
          for (let i = 0; i < rowsToCreate; i++) {
            patches[1 + i] = NEWLINE;
          }
          return [patches, { dx: -prev2.x, dy: rowsToCreate }];
        }
        const dy = next.cursor.y - prev2.y;
        if (dy !== 0 || prev2.x !== next.cursor.x) {
          const patches = [CARRIAGE_RETURN];
          patches.push({ type: "cursorMove", x: next.cursor.x, y: dy });
          return [patches, { dx: next.cursor.x - prev2.x, dy }];
        }
        return [[], { dx: 0, dy: 0 }];
      });
    } else {
      moveCursorTo(screen, next.cursor.x, next.cursor.y);
    }
    const elapsed = performance.now() - startTime;
    if (elapsed > 50) {
      const damage = next.screen.damage;
      const damageInfo = damage ? `${damage.width}x${damage.height} at (${damage.x},${damage.y})` : "none";
      logForDebugging(
        `Slow render: ${elapsed.toFixed(1)}ms, screen: ${next.screen.height}x${next.screen.width}, damage: ${damageInfo}, changes: ${screen.diff.length}`
      );
    }
    return scrollPatch.length > 0 ? [...scrollPatch, ...screen.diff] : screen.diff;
  }
}
function transitionHyperlink(diff, current, target) {
  if (current !== target) {
    diff.push({ type: "hyperlink", uri: target ?? "" });
    return target;
  }
  return current;
}
function transitionStyle(diff, stylePool, currentId, targetId) {
  const str = stylePool.transition(currentId, targetId);
  if (str.length > 0) {
    diff.push({ type: "styleStr", str });
  }
  return targetId;
}
function readLine(screen, y) {
  let line = "";
  for (let x = 0; x < screen.width; x++) {
    line += charInCellAt(screen, x, y) ?? " ";
  }
  return line.trimEnd();
}
function fullResetSequence_CAUSES_FLICKER(frame, reason, stylePool, debug) {
  const screen = new VirtualScreen({ x: 0, y: 0 }, frame.viewport.width);
  renderFrame(screen, frame, stylePool);
  return [{ type: "clearTerminal", reason, debug }, ...screen.diff];
}
function renderFrame(screen, frame, stylePool) {
  renderFrameSlice(screen, frame, 0, frame.screen.height, stylePool);
}
function renderFrameSlice(screen, frame, startY, endY, stylePool) {
  let currentStyleId = stylePool.none;
  let currentHyperlink = void 0;
  let lastRenderedStyleId = -1;
  const { width: screenWidth, cells, charPool, hyperlinkPool } = frame.screen;
  let index = startY * screenWidth;
  for (let y = startY; y < endY; y += 1) {
    if (screen.cursor.y < y) {
      const rowsToAdvance = y - screen.cursor.y;
      screen.txn((prev) => {
        const patches = new Array(1 + rowsToAdvance);
        patches[0] = CARRIAGE_RETURN;
        for (let i = 0; i < rowsToAdvance; i++) {
          patches[1 + i] = NEWLINE;
        }
        return [patches, { dx: -prev.x, dy: rowsToAdvance }];
      });
    }
    lastRenderedStyleId = -1;
    for (let x = 0; x < screenWidth; x += 1, index += 1) {
      const cell = visibleCellAtIndex(
        cells,
        charPool,
        hyperlinkPool,
        index,
        lastRenderedStyleId
      );
      if (!cell) {
        continue;
      }
      moveCursorTo(screen, x, y);
      const targetHyperlink = cell.hyperlink;
      currentHyperlink = transitionHyperlink(
        screen.diff,
        currentHyperlink,
        targetHyperlink
      );
      const styleStr = stylePool.transition(currentStyleId, cell.styleId);
      if (writeCellWithStyleStr(screen, cell, styleStr)) {
        currentStyleId = cell.styleId;
        lastRenderedStyleId = cell.styleId;
      }
    }
    currentStyleId = transitionStyle(
      screen.diff,
      stylePool,
      currentStyleId,
      stylePool.none
    );
    currentHyperlink = transitionHyperlink(
      screen.diff,
      currentHyperlink,
      void 0
    );
    screen.txn((prev) => [[CARRIAGE_RETURN, NEWLINE], { dx: -prev.x, dy: 1 }]);
  }
  transitionStyle(screen.diff, stylePool, currentStyleId, stylePool.none);
  transitionHyperlink(screen.diff, currentHyperlink, void 0);
  return screen;
}
function writeCellWithStyleStr(screen, cell, styleStr) {
  const cellWidth = cell.width === CellWidth.Wide ? 2 : 1;
  const px = screen.cursor.x;
  const vw = screen.viewportWidth;
  if (cellWidth === 2 && px < vw) {
    const threshold = cell.char.length > 2 ? vw : vw + 1;
    if (px + 2 >= threshold) {
      return false;
    }
  }
  const diff = screen.diff;
  if (styleStr.length > 0) {
    diff.push({ type: "styleStr", str: styleStr });
  }
  const needsCompensation = cellWidth === 2 && needsWidthCompensation(cell.char);
  if (needsCompensation && px + 1 < vw) {
    diff.push({ type: "cursorTo", col: px + 2 });
    diff.push({ type: "stdout", content: " " });
    diff.push({ type: "cursorTo", col: px + 1 });
  }
  diff.push({ type: "stdout", content: cell.char });
  if (needsCompensation) {
    diff.push({ type: "cursorTo", col: px + cellWidth + 1 });
  }
  if (px >= vw) {
    screen.cursor.x = cellWidth;
    screen.cursor.y++;
  } else {
    screen.cursor.x = px + cellWidth;
  }
  return true;
}
function moveCursorTo(screen, targetX, targetY) {
  screen.txn((prev) => {
    const dx = targetX - prev.x;
    const dy = targetY - prev.y;
    const inPendingWrap = prev.x >= screen.viewportWidth;
    if (inPendingWrap) {
      return [
        [CARRIAGE_RETURN, { type: "cursorMove", x: targetX, y: dy }],
        { dx, dy }
      ];
    }
    if (dy !== 0) {
      return [
        [CARRIAGE_RETURN, { type: "cursorMove", x: targetX, y: dy }],
        { dx, dy }
      ];
    }
    return [[{ type: "cursorMove", x: dx, y: dy }], { dx, dy }];
  });
}
function needsWidthCompensation(char) {
  const cp = char.codePointAt(0);
  if (cp === void 0) return false;
  if (cp >= 129648 && cp <= 129791 || cp >= 129792 && cp <= 130047) {
    return true;
  }
  if (char.length >= 2) {
    for (let i = 0; i < char.length; i++) {
      if (char.charCodeAt(i) === 65039) return true;
    }
  }
  return false;
}
class VirtualScreen {
  constructor(origin, viewportWidth) {
    this.viewportWidth = viewportWidth;
    this.cursor = { ...origin };
  }
  viewportWidth;
  // Public for direct mutation by writeCellWithStyleStr (avoids txn overhead).
  // File-private class — not exposed outside log-update.ts.
  cursor;
  diff = [];
  txn(fn) {
    const [patches, next] = fn(this.cursor);
    for (const patch of patches) {
      this.diff.push(patch);
    }
    this.cursor.x += next.dx;
    this.cursor.y += next.dy;
  }
}
export {
  LogUpdate
};
