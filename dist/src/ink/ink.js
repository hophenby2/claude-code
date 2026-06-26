import { jsx } from "react/jsx-runtime";
import autoBind from "auto-bind";
import { closeSync, constants as fsConstants, openSync, readSync, writeSync } from "fs";
import noop from "lodash-es/noop.js";
import throttle from "lodash-es/throttle.js";
import { ConcurrentRoot } from "react-reconciler/constants.js";
import { onExit } from "signal-exit";
import { flushInteractionTime } from "../bootstrap/state.js";
import { getYogaCounters } from "../native-ts/yoga-layout/index.js";
import { logForDebugging } from "../utils/debug.js";
import { logError } from "../utils/log.js";
import { format } from "util";
import { colorize } from "./colorize.js";
import App from "./components/App.js";
import { FRAME_INTERVAL_MS } from "./constants.js";
import * as dom from "./dom.js";
import { KeyboardEvent } from "./events/keyboard-event.js";
import { FocusManager } from "./focus.js";
import { emptyFrame } from "./frame.js";
import { dispatchClick, dispatchHover } from "./hit-test.js";
import instances from "./instances.js";
import { LogUpdate } from "./log-update.js";
import { nodeCache } from "./node-cache.js";
import { optimize } from "./optimizer.js";
import Output from "./output.js";
import reconciler, { dispatcher, getLastCommitMs, getLastYogaMs, isDebugRepaintsEnabled, recordYogaMs, resetProfileCounters } from "./reconciler.js";
import renderNodeToOutput, { consumeFollowScroll, didLayoutShift } from "./render-node-to-output.js";
import { applyPositionedHighlight, scanPositions } from "./render-to-screen.js";
import createRenderer from "./renderer.js";
import { CellWidth, CharPool, cellAt, createScreen, HyperlinkPool, isEmptyCellAt, migrateScreenPools, StylePool } from "./screen.js";
import { applySearchHighlight } from "./searchHighlight.js";
import { applySelectionOverlay, captureScrolledRows, clearSelection, createSelectionState, extendSelection, findPlainTextUrlAt, getSelectedText, hasSelection, moveFocus, selectLineAt, selectWordAt, shiftAnchor, shiftSelection, shiftSelectionForFollow, startSelection, updateSelection } from "./selection.js";
import { SYNC_OUTPUT_SUPPORTED, supportsExtendedKeys, writeDiffToTerminal } from "./terminal.js";
import { CURSOR_HOME, cursorMove, cursorPosition, DISABLE_KITTY_KEYBOARD, DISABLE_MODIFY_OTHER_KEYS, ENABLE_KITTY_KEYBOARD, ENABLE_MODIFY_OTHER_KEYS, ERASE_SCREEN } from "./termio/csi.js";
import { DBP, DFE, DISABLE_MOUSE_TRACKING, ENABLE_MOUSE_TRACKING, ENTER_ALT_SCREEN, EXIT_ALT_SCREEN, SHOW_CURSOR } from "./termio/dec.js";
import { CLEAR_ITERM2_PROGRESS, CLEAR_TAB_STATUS, setClipboard, supportsTabStatus, wrapForMultiplexer } from "./termio/osc.js";
import { TerminalWriteProvider } from "./useTerminalNotification.js";
const ALT_SCREEN_ANCHOR_CURSOR = Object.freeze({
  x: 0,
  y: 0,
  visible: false
});
const CURSOR_HOME_PATCH = Object.freeze({
  type: "stdout",
  content: CURSOR_HOME
});
const ERASE_THEN_HOME_PATCH = Object.freeze({
  type: "stdout",
  content: ERASE_SCREEN + CURSOR_HOME
});
function makeAltScreenParkPatch(terminalRows) {
  return Object.freeze({
    type: "stdout",
    content: cursorPosition(terminalRows, 1)
  });
}
class Ink {
  constructor(options) {
    this.options = options;
    autoBind(this);
    if (this.options.patchConsole) {
      this.restoreConsole = this.patchConsole();
      this.restoreStderr = this.patchStderr();
    }
    this.terminal = {
      stdout: options.stdout,
      stderr: options.stderr
    };
    this.terminalColumns = options.stdout.columns || 80;
    this.terminalRows = options.stdout.rows || 24;
    this.altScreenParkPatch = makeAltScreenParkPatch(this.terminalRows);
    this.stylePool = new StylePool();
    this.charPool = new CharPool();
    this.hyperlinkPool = new HyperlinkPool();
    this.frontFrame = emptyFrame(this.terminalRows, this.terminalColumns, this.stylePool, this.charPool, this.hyperlinkPool);
    this.backFrame = emptyFrame(this.terminalRows, this.terminalColumns, this.stylePool, this.charPool, this.hyperlinkPool);
    this.log = new LogUpdate({
      isTTY: options.stdout.isTTY || false,
      stylePool: this.stylePool
    });
    const deferredRender = () => queueMicrotask(this.onRender);
    this.scheduleRender = throttle(deferredRender, FRAME_INTERVAL_MS, {
      leading: true,
      trailing: true
    });
    this.isUnmounted = false;
    this.unsubscribeExit = onExit(this.unmount, {
      alwaysLast: false
    });
    if (options.stdout.isTTY) {
      options.stdout.on("resize", this.handleResize);
      process.on("SIGCONT", this.handleResume);
      this.unsubscribeTTYHandlers = () => {
        options.stdout.off("resize", this.handleResize);
        process.off("SIGCONT", this.handleResume);
      };
    }
    this.rootNode = dom.createNode("ink-root");
    this.focusManager = new FocusManager((target, event) => dispatcher.dispatchDiscrete(target, event));
    this.rootNode.focusManager = this.focusManager;
    this.renderer = createRenderer(this.rootNode, this.stylePool);
    this.rootNode.onRender = this.scheduleRender;
    this.rootNode.onImmediateRender = this.onRender;
    this.rootNode.onComputeLayout = () => {
      if (this.isUnmounted) {
        return;
      }
      if (this.rootNode.yogaNode) {
        const t0 = performance.now();
        this.rootNode.yogaNode.setWidth(this.terminalColumns);
        this.rootNode.yogaNode.calculateLayout(this.terminalColumns);
        const ms = performance.now() - t0;
        recordYogaMs(ms);
        const c = getYogaCounters();
        this.lastYogaCounters = {
          ms,
          ...c
        };
      }
    };
    this.container = reconciler.createContainer(
      this.rootNode,
      ConcurrentRoot,
      null,
      false,
      null,
      "id",
      noop,
      // onUncaughtError
      noop,
      // onCaughtError
      noop,
      // onRecoverableError
      noop
      // onDefaultTransitionIndicator
    );
    if (false) {
      reconciler.injectIntoDevTools({
        bundleType: 0,
        // Reporting React DOM's version, not Ink's
        // See https://github.com/facebook/react/issues/16666#issuecomment-532639905
        version: "16.13.1",
        rendererPackageName: "ink"
      });
    }
  }
  options;
  log;
  terminal;
  scheduleRender;
  // Ignore last render after unmounting a tree to prevent empty output before exit
  isUnmounted = false;
  isPaused = false;
  container;
  rootNode;
  focusManager;
  renderer;
  stylePool;
  charPool;
  hyperlinkPool;
  exitPromise;
  restoreConsole;
  restoreStderr;
  unsubscribeTTYHandlers;
  terminalColumns;
  terminalRows;
  currentNode = null;
  frontFrame;
  backFrame;
  lastPoolResetTime = performance.now();
  drainTimer = null;
  lastYogaCounters = {
    ms: 0,
    visited: 0,
    measured: 0,
    cacheHits: 0,
    live: 0
  };
  altScreenParkPatch;
  // Text selection state (alt-screen only). Owned here so the overlay
  // pass in onRender can read it and App.tsx can update it from mouse
  // events. Public so instances.get() callers can access.
  selection = createSelectionState();
  // Search highlight query (alt-screen only). Setter below triggers
  // scheduleRender; applySearchHighlight in onRender inverts matching cells.
  searchHighlightQuery = "";
  // Position-based highlight. VML scans positions ONCE (via
  // scanElementSubtree, when the target message is mounted), stores them
  // message-relative, sets this for every-frame apply. rowOffset =
  // message's current screen-top. currentIdx = which position is
  // "current" (yellow). null clears. Positions are known upfront —
  // navigation is index arithmetic, no scan-feedback loop.
  searchPositions = null;
  // React-land subscribers for selection state changes (useHasSelection).
  // Fired alongside the terminal repaint whenever the selection mutates
  // so UI (e.g. footer hints) can react to selection appearing/clearing.
  selectionListeners = /* @__PURE__ */ new Set();
  // DOM nodes currently under the pointer (mode-1003 motion). Held here
  // so App.tsx's handleMouseEvent is stateless — dispatchHover diffs
  // against this set and mutates it in place.
  hoveredNodes = /* @__PURE__ */ new Set();
  // Set by <AlternateScreen> via setAltScreenActive(). Controls the
  // renderer's cursor.y clamping (keeps cursor in-viewport to avoid
  // LF-induced scroll when screen.height === terminalRows) and gates
  // alt-screen-aware SIGCONT/resize/unmount handling.
  altScreenActive = false;
  // Set alongside altScreenActive so SIGCONT resume knows whether to
  // re-enable mouse tracking (not all <AlternateScreen> uses want it).
  altScreenMouseTracking = false;
  // True when the previous frame's screen buffer cannot be trusted for
  // blit — selection overlay mutated it, resetFramesForAltScreen()
  // replaced it with blanks, or forceRedraw() reset it to 0×0. Forces
  // one full-render frame; steady-state frames after clear it and regain
  // the blit + narrow-damage fast path.
  prevFrameContaminated = false;
  // Set by handleResize: prepend ERASE_SCREEN to the next onRender's patches
  // INSIDE the BSU/ESU block so clear+paint is atomic. Writing ERASE_SCREEN
  // synchronously in handleResize would leave the screen blank for the ~80ms
  // render() takes; deferring into the atomic block means old content stays
  // visible until the new frame is fully ready.
  needsEraseBeforePaint = false;
  // Native cursor positioning: a component (via useDeclaredCursor) declares
  // where the terminal cursor should be parked after each frame. Terminal
  // emulators render IME preedit text at the physical cursor position, and
  // screen readers / screen magnifiers track it — so parking at the text
  // input's caret makes CJK input appear inline and lets a11y tools follow.
  cursorDeclaration = null;
  // Main-screen: physical cursor position after the declared-cursor move,
  // tracked separately from frame.cursor (which must stay at content-bottom
  // for log-update's relative-move invariants). Alt-screen doesn't need
  // this — every frame begins with CSI H. null = no move emitted last frame.
  displayCursor = null;
  handleResume = () => {
    if (!this.options.stdout.isTTY) {
      return;
    }
    if (this.altScreenActive) {
      this.reenterAltScreen();
      return;
    }
    this.frontFrame = emptyFrame(this.frontFrame.viewport.height, this.frontFrame.viewport.width, this.stylePool, this.charPool, this.hyperlinkPool);
    this.backFrame = emptyFrame(this.backFrame.viewport.height, this.backFrame.viewport.width, this.stylePool, this.charPool, this.hyperlinkPool);
    this.log.reset();
    this.displayCursor = null;
  };
  // NOT debounced. A debounce opens a window where stdout.columns is NEW
  // but this.terminalColumns/Yoga are OLD — any scheduleRender during that
  // window (spinner, clock) makes log-update detect a width change and
  // clear the screen, then the debounce fires and clears again (double
  // blank→paint flicker). useVirtualScroll's height scaling already bounds
  // the per-resize cost; synchronous handling keeps dimensions consistent.
  handleResize = () => {
    const cols = this.options.stdout.columns || 80;
    const rows = this.options.stdout.rows || 24;
    if (cols === this.terminalColumns && rows === this.terminalRows) return;
    this.terminalColumns = cols;
    this.terminalRows = rows;
    this.altScreenParkPatch = makeAltScreenParkPatch(this.terminalRows);
    if (this.altScreenActive && !this.isPaused && this.options.stdout.isTTY) {
      if (this.altScreenMouseTracking) {
        this.options.stdout.write(ENABLE_MOUSE_TRACKING);
      }
      this.resetFramesForAltScreen();
      this.needsEraseBeforePaint = true;
    }
    if (this.currentNode !== null) {
      this.render(this.currentNode);
    }
  };
  resolveExitPromise = () => {
  };
  rejectExitPromise = () => {
  };
  unsubscribeExit = () => {
  };
  /**
   * Pause Ink and hand the terminal over to an external TUI (e.g. git
   * commit editor). In non-fullscreen mode this enters the alt screen;
   * in fullscreen mode we're already in alt so we just clear it.
   * Call `exitAlternateScreen()` when done to restore Ink.
   */
  enterAlternateScreen() {
    this.pause();
    this.suspendStdin();
    this.options.stdout.write(
      // Disable extended key reporting first — editors that don't speak
      // CSI-u (e.g. nano) show "Unknown sequence" for every Ctrl-<key> if
      // kitty/modifyOtherKeys stays active. exitAlternateScreen re-enables.
      DISABLE_KITTY_KEYBOARD + DISABLE_MODIFY_OTHER_KEYS + (this.altScreenMouseTracking ? DISABLE_MOUSE_TRACKING : "") + // disable mouse (no-op if off)
      (this.altScreenActive ? "" : "\x1B[?1049h") + // enter alt (already in alt if fullscreen)
      "\x1B[?1004l\x1B[0m\x1B[?25h\x1B[2J\x1B[H"
      // cursor home
    );
  }
  /**
   * Resume Ink after an external TUI handoff with a full repaint.
   * In non-fullscreen mode this exits the alt screen back to main;
   * in fullscreen mode we re-enter alt and clear + repaint.
   *
   * The re-enter matters: terminal editors (vim, nano, less) write
   * smcup/rmcup (?1049h/?1049l), so even though we started in alt,
   * the editor's rmcup on exit drops us to main screen. Without
   * re-entering, the 2J below wipes the user's main-screen scrollback
   * and subsequent renders land in main — native terminal scroll
   * returns, fullscreen scroll is dead.
   */
  exitAlternateScreen() {
    this.options.stdout.write(
      (this.altScreenActive ? ENTER_ALT_SCREEN : "") + // re-enter alt — vim's rmcup dropped us to main
      "\x1B[2J\x1B[H" + // cursor home
      (this.altScreenMouseTracking ? ENABLE_MOUSE_TRACKING : "") + // re-enable mouse (skip if CLAUDE_CODE_DISABLE_MOUSE)
      (this.altScreenActive ? "" : "\x1B[?1049l") + // exit alt (non-fullscreen only)
      "\x1B[?25l"
      // hide cursor (Ink manages)
    );
    this.resumeStdin();
    if (this.altScreenActive) {
      this.resetFramesForAltScreen();
    } else {
      this.repaint();
    }
    this.resume();
    this.options.stdout.write("\x1B[?1004h" + (supportsExtendedKeys() ? DISABLE_KITTY_KEYBOARD + ENABLE_KITTY_KEYBOARD + ENABLE_MODIFY_OTHER_KEYS : ""));
  }
  onRender() {
    if (this.isUnmounted || this.isPaused) {
      return;
    }
    if (this.drainTimer !== null) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    flushInteractionTime();
    const renderStart = performance.now();
    const terminalWidth = this.options.stdout.columns || 80;
    const terminalRows = this.options.stdout.rows || 24;
    const frame = this.renderer({
      frontFrame: this.frontFrame,
      backFrame: this.backFrame,
      isTTY: this.options.stdout.isTTY,
      terminalWidth,
      terminalRows,
      altScreen: this.altScreenActive,
      prevFrameContaminated: this.prevFrameContaminated
    });
    const rendererMs = performance.now() - renderStart;
    const follow = consumeFollowScroll();
    if (follow && this.selection.anchor && // Only translate if the selection is ON scrollbox content. Selections
    // in the footer/prompt/StickyPromptHeader are on static text — the
    // scroll doesn't move what's under them. Without this guard, a
    // footer selection would be shifted by -delta then clamped to
    // viewportBottom, teleporting it into the scrollbox. Mirror the
    // bounds check the deleted check() in ScrollKeybindingHandler had.
    this.selection.anchor.row >= follow.viewportTop && this.selection.anchor.row <= follow.viewportBottom) {
      const {
        delta,
        viewportTop,
        viewportBottom
      } = follow;
      if (this.selection.isDragging) {
        if (hasSelection(this.selection)) {
          captureScrolledRows(this.selection, this.frontFrame.screen, viewportTop, viewportTop + delta - 1, "above");
        }
        shiftAnchor(this.selection, -delta, viewportTop, viewportBottom);
      } else if (
        // Flag-3 guard: the anchor check above only proves ONE endpoint is
        // on scrollbox content. A drag from row 3 (scrollbox) into the
        // footer at row 6, then release, leaves focus outside the viewport
        // — shiftSelectionForFollow would clamp it to viewportBottom,
        // teleporting the highlight from static footer into the scrollbox.
        // Symmetric check: require BOTH ends inside to translate. A
        // straddling selection falls through to NEITHER shift NOR capture:
        // the footer endpoint pins the selection, text scrolls away under
        // the highlight, and getSelectedText reads the CURRENT screen
        // contents — no accumulation. Dragging branch doesn't need this:
        // shiftAnchor ignores focus, and the anchor DOES shift (so capture
        // is correct there even when focus is in the footer).
        !this.selection.focus || this.selection.focus.row >= viewportTop && this.selection.focus.row <= viewportBottom
      ) {
        if (hasSelection(this.selection)) {
          captureScrolledRows(this.selection, this.frontFrame.screen, viewportTop, viewportTop + delta - 1, "above");
        }
        const cleared = shiftSelectionForFollow(this.selection, -delta, viewportTop, viewportBottom);
        if (cleared) for (const cb of this.selectionListeners) cb();
      }
    }
    let selActive = false;
    let hlActive = false;
    if (this.altScreenActive) {
      selActive = hasSelection(this.selection);
      if (selActive) {
        applySelectionOverlay(frame.screen, this.selection, this.stylePool);
      }
      hlActive = applySearchHighlight(frame.screen, this.searchHighlightQuery, this.stylePool);
      if (this.searchPositions) {
        const sp = this.searchPositions;
        const posApplied = applyPositionedHighlight(frame.screen, this.stylePool, sp.positions, sp.rowOffset, sp.currentIdx);
        hlActive = hlActive || posApplied;
      }
    }
    if (didLayoutShift() || selActive || hlActive || this.prevFrameContaminated) {
      frame.screen.damage = {
        x: 0,
        y: 0,
        width: frame.screen.width,
        height: frame.screen.height
      };
    }
    let prevFrame = this.frontFrame;
    if (this.altScreenActive) {
      prevFrame = {
        ...this.frontFrame,
        cursor: ALT_SCREEN_ANCHOR_CURSOR
      };
    }
    const tDiff = performance.now();
    const diff = this.log.render(
      prevFrame,
      frame,
      this.altScreenActive,
      // DECSTBM needs BSU/ESU atomicity — without it the outer terminal
      // renders the scrolled-but-not-yet-repainted intermediate state.
      // tmux is the main case (re-emits DECSTBM with its own timing and
      // doesn't implement DEC 2026, so SYNC_OUTPUT_SUPPORTED is false).
      SYNC_OUTPUT_SUPPORTED
    );
    const diffMs = performance.now() - tDiff;
    this.backFrame = this.frontFrame;
    this.frontFrame = frame;
    if (renderStart - this.lastPoolResetTime > 5 * 60 * 1e3) {
      this.resetPools();
      this.lastPoolResetTime = renderStart;
    }
    const flickers = [];
    for (const patch of diff) {
      if (patch.type === "clearTerminal") {
        flickers.push({
          desiredHeight: frame.screen.height,
          availableHeight: frame.viewport.height,
          reason: patch.reason
        });
        if (isDebugRepaintsEnabled() && patch.debug) {
          const chain = dom.findOwnerChainAtRow(this.rootNode, patch.debug.triggerY);
          logForDebugging(`[REPAINT] full reset \xB7 ${patch.reason} \xB7 row ${patch.debug.triggerY}
  prev: "${patch.debug.prevLine}"
  next: "${patch.debug.nextLine}"
  culprit: ${chain.length ? chain.join(" < ") : "(no owner chain captured)"}`, {
            level: "warn"
          });
        }
      }
    }
    const tOptimize = performance.now();
    const optimized = optimize(diff);
    const optimizeMs = performance.now() - tOptimize;
    const hasDiff = optimized.length > 0;
    if (this.altScreenActive && hasDiff) {
      if (this.needsEraseBeforePaint) {
        this.needsEraseBeforePaint = false;
        optimized.unshift(ERASE_THEN_HOME_PATCH);
      } else {
        optimized.unshift(CURSOR_HOME_PATCH);
      }
      optimized.push(this.altScreenParkPatch);
    }
    const decl = this.cursorDeclaration;
    const rect = decl !== null ? nodeCache.get(decl.node) : void 0;
    const target = decl !== null && rect !== void 0 ? {
      x: rect.x + decl.relativeX,
      y: rect.y + decl.relativeY
    } : null;
    const parked = this.displayCursor;
    const targetMoved = target !== null && (parked === null || parked.x !== target.x || parked.y !== target.y);
    if (hasDiff || targetMoved || target === null && parked !== null) {
      if (parked !== null && !this.altScreenActive && hasDiff) {
        const pdx = prevFrame.cursor.x - parked.x;
        const pdy = prevFrame.cursor.y - parked.y;
        if (pdx !== 0 || pdy !== 0) {
          optimized.unshift({
            type: "stdout",
            content: cursorMove(pdx, pdy)
          });
        }
      }
      if (target !== null) {
        if (this.altScreenActive) {
          const row = Math.min(Math.max(target.y + 1, 1), terminalRows);
          const col = Math.min(Math.max(target.x + 1, 1), terminalWidth);
          optimized.push({
            type: "stdout",
            content: cursorPosition(row, col)
          });
        } else {
          const from = !hasDiff && parked !== null ? parked : {
            x: frame.cursor.x,
            y: frame.cursor.y
          };
          const dx = target.x - from.x;
          const dy = target.y - from.y;
          if (dx !== 0 || dy !== 0) {
            optimized.push({
              type: "stdout",
              content: cursorMove(dx, dy)
            });
          }
        }
        this.displayCursor = target;
      } else {
        if (parked !== null && !this.altScreenActive && !hasDiff) {
          const rdx = frame.cursor.x - parked.x;
          const rdy = frame.cursor.y - parked.y;
          if (rdx !== 0 || rdy !== 0) {
            optimized.push({
              type: "stdout",
              content: cursorMove(rdx, rdy)
            });
          }
        }
        this.displayCursor = null;
      }
    }
    const tWrite = performance.now();
    writeDiffToTerminal(this.terminal, optimized, this.altScreenActive && !SYNC_OUTPUT_SUPPORTED);
    const writeMs = performance.now() - tWrite;
    this.prevFrameContaminated = selActive || hlActive;
    if (frame.scrollDrainPending) {
      this.drainTimer = setTimeout(() => this.onRender(), FRAME_INTERVAL_MS >> 2);
    }
    const yogaMs = getLastYogaMs();
    const commitMs = getLastCommitMs();
    const yc = this.lastYogaCounters;
    resetProfileCounters();
    this.lastYogaCounters = {
      ms: 0,
      visited: 0,
      measured: 0,
      cacheHits: 0,
      live: 0
    };
    this.options.onFrame?.({
      durationMs: performance.now() - renderStart,
      phases: {
        renderer: rendererMs,
        diff: diffMs,
        optimize: optimizeMs,
        write: writeMs,
        patches: diff.length,
        yoga: yogaMs,
        commit: commitMs,
        yogaVisited: yc.visited,
        yogaMeasured: yc.measured,
        yogaCacheHits: yc.cacheHits,
        yogaLive: yc.live
      },
      flickers
    });
  }
  pause() {
    reconciler.flushSyncFromReconciler();
    this.onRender();
    this.isPaused = true;
  }
  resume() {
    this.isPaused = false;
    this.onRender();
  }
  /**
   * Reset frame buffers so the next render writes the full screen from scratch.
   * Call this before resume() when the terminal content has been corrupted by
   * an external process (e.g. tmux, shell, full-screen TUI).
   */
  repaint() {
    this.frontFrame = emptyFrame(this.frontFrame.viewport.height, this.frontFrame.viewport.width, this.stylePool, this.charPool, this.hyperlinkPool);
    this.backFrame = emptyFrame(this.backFrame.viewport.height, this.backFrame.viewport.width, this.stylePool, this.charPool, this.hyperlinkPool);
    this.log.reset();
    this.displayCursor = null;
  }
  /**
   * Clear the physical terminal and force a full redraw.
   *
   * The traditional readline ctrl+l — clears the visible screen and
   * redraws the current content. Also the recovery path when the terminal
   * was cleared externally (macOS Cmd+K) and Ink's diff engine thinks
   * unchanged cells don't need repainting. Scrollback is preserved.
   */
  forceRedraw() {
    if (!this.options.stdout.isTTY || this.isUnmounted || this.isPaused) return;
    this.options.stdout.write(ERASE_SCREEN + CURSOR_HOME);
    if (this.altScreenActive) {
      this.resetFramesForAltScreen();
    } else {
      this.repaint();
      this.prevFrameContaminated = true;
    }
    this.onRender();
  }
  /**
   * Mark the previous frame as untrustworthy for blit, forcing the next
   * render to do a full-damage diff instead of the per-node fast path.
   *
   * Lighter than forceRedraw() — no screen clear, no extra write. Call
   * from a useLayoutEffect cleanup when unmounting a tall overlay: the
   * blit fast path can copy stale cells from the overlay frame into rows
   * the shrunken layout no longer reaches, leaving a ghost title/divider.
   * onRender resets the flag at frame end so it's one-shot.
   */
  invalidatePrevFrame() {
    this.prevFrameContaminated = true;
  }
  /**
   * Called by the <AlternateScreen> component on mount/unmount.
   * Controls cursor.y clamping in the renderer and gates alt-screen-aware
   * behavior in SIGCONT/resize/unmount handlers. Repaints on change so
   * the first alt-screen frame (and first main-screen frame on exit) is
   * a full redraw with no stale diff state.
   */
  setAltScreenActive(active, mouseTracking = false) {
    if (this.altScreenActive === active) return;
    this.altScreenActive = active;
    this.altScreenMouseTracking = active && mouseTracking;
    if (active) {
      this.resetFramesForAltScreen();
    } else {
      this.repaint();
    }
  }
  get isAltScreenActive() {
    return this.altScreenActive;
  }
  /**
   * Re-assert terminal modes after a gap (>5s stdin silence or event-loop
   * stall). Catches tmux detach→attach, ssh reconnect, and laptop
   * sleep/wake — none of which send SIGCONT. The terminal may reset DEC
   * private modes on reconnect; this method restores them.
   *
   * Always re-asserts extended key reporting and mouse tracking. Mouse
   * tracking is idempotent (DEC private mode set-when-set is a no-op). The
   * Kitty keyboard protocol is NOT — CSI >1u is a stack push, so we pop
   * first to keep depth balanced (pop on empty stack is a no-op per spec,
   * so after a terminal reset this still restores depth 0→1). Without the
   * pop, each >5s idle gap adds a stack entry, and the single pop on exit
   * or suspend can't drain them — the shell is left in CSI u mode where
   * Ctrl+C/Ctrl+D leak as escape sequences. The alt-screen
   * re-entry (ERASE_SCREEN + frame reset) is NOT idempotent — it blanks the
   * screen — so it's opt-in via includeAltScreen. The stdin-gap caller fires
   * on ordinary >5s idle + keypress and must not erase; the event-loop stall
   * detector fires on genuine sleep/wake and opts in. tmux attach / ssh
   * reconnect typically send a resize, which already covers alt-screen via
   * handleResize.
   */
  reassertTerminalModes = (includeAltScreen = false) => {
    if (!this.options.stdout.isTTY) return;
    if (this.isPaused) return;
    if (supportsExtendedKeys()) {
      this.options.stdout.write(DISABLE_KITTY_KEYBOARD + ENABLE_KITTY_KEYBOARD + ENABLE_MODIFY_OTHER_KEYS);
    }
    if (!this.altScreenActive) return;
    if (this.altScreenMouseTracking) {
      this.options.stdout.write(ENABLE_MOUSE_TRACKING);
    }
    if (includeAltScreen) {
      this.reenterAltScreen();
    }
  };
  /**
   * Mark this instance as unmounted so future unmount() calls early-return.
   * Called by gracefulShutdown's cleanupTerminalModes() after it has sent
   * EXIT_ALT_SCREEN but before the remaining terminal-reset sequences.
   * Without this, signal-exit's deferred ink.unmount() (triggered by
   * process.exit()) runs the full unmount path: onRender() + writeSync
   * cleanup block + updateContainerSync → AlternateScreen unmount cleanup.
   * The result is 2-3 redundant EXIT_ALT_SCREEN sequences landing on the
   * main screen AFTER printResumeHint(), which tmux (at least) interprets
   * as restoring the saved cursor position — clobbering the resume hint.
   */
  detachForShutdown() {
    this.isUnmounted = true;
    this.scheduleRender.cancel?.();
    const stdin = this.options.stdin;
    this.drainStdin();
    if (stdin.isTTY && stdin.isRaw && stdin.setRawMode) {
      stdin.setRawMode(false);
    }
  }
  /** @see drainStdin */
  drainStdin() {
    drainStdin(this.options.stdin);
  }
  /**
   * Re-enter alt-screen, clear, home, re-enable mouse tracking, and reset
   * frame buffers so the next render repaints from scratch. Self-heal for
   * SIGCONT, resize, and stdin-gap/event-loop-stall (sleep/wake) — any of
   * which can leave the terminal in main-screen mode while altScreenActive
   * stays true. ENTER_ALT_SCREEN is a terminal-side no-op if already in alt.
   */
  reenterAltScreen() {
    this.options.stdout.write(ENTER_ALT_SCREEN + ERASE_SCREEN + CURSOR_HOME + (this.altScreenMouseTracking ? ENABLE_MOUSE_TRACKING : ""));
    this.resetFramesForAltScreen();
  }
  /**
   * Seed prev/back frames with full-size BLANK screens (rows×cols of empty
   * cells, not 0×0). In alt-screen mode, next.screen.height is always
   * terminalRows; if prev.screen.height is 0 (emptyFrame's default),
   * log-update sees heightDelta > 0 ('growing') and calls renderFrameSlice,
   * whose trailing per-row CR+LF at the last row scrolls the alt screen,
   * permanently desyncing the virtual and physical cursors by 1 row.
   *
   * With a rows×cols blank prev, heightDelta === 0 → standard diffEach
   * → moveCursorTo (CSI cursorMove, no LF, no scroll).
   *
   * viewport.height = rows + 1 matches the renderer's alt-screen output,
   * preventing a spurious resize trigger on the first frame. cursor.y = 0
   * matches the physical cursor after ENTER_ALT_SCREEN + CSI H (home).
   */
  resetFramesForAltScreen() {
    const rows = this.terminalRows;
    const cols = this.terminalColumns;
    const blank = () => ({
      screen: createScreen(cols, rows, this.stylePool, this.charPool, this.hyperlinkPool),
      viewport: {
        width: cols,
        height: rows + 1
      },
      cursor: {
        x: 0,
        y: 0,
        visible: true
      }
    });
    this.frontFrame = blank();
    this.backFrame = blank();
    this.log.reset();
    this.displayCursor = null;
    this.prevFrameContaminated = true;
  }
  /**
   * Copy the current selection to the clipboard without clearing the
   * highlight. Matches iTerm2's copy-on-select behavior where the selected
   * region stays visible after the automatic copy.
   */
  copySelectionNoClear() {
    if (!hasSelection(this.selection)) return "";
    const text = getSelectedText(this.selection, this.frontFrame.screen);
    if (text) {
      void setClipboard(text).then((raw) => {
        if (raw) this.options.stdout.write(raw);
      });
    }
    return text;
  }
  /**
   * Copy the current text selection to the system clipboard via OSC 52
   * and clear the selection. Returns the copied text (empty if no selection).
   */
  copySelection() {
    if (!hasSelection(this.selection)) return "";
    const text = this.copySelectionNoClear();
    clearSelection(this.selection);
    this.notifySelectionChange();
    return text;
  }
  /** Clear the current text selection without copying. */
  clearTextSelection() {
    if (!hasSelection(this.selection)) return;
    clearSelection(this.selection);
    this.notifySelectionChange();
  }
  /**
   * Set the search highlight query. Non-empty → all visible occurrences
   * are inverted (SGR 7) on the next frame; first one also underlined.
   * Empty → clears (prevFrameContaminated handles the frame after). Same
   * damage-tracking machinery as selection — setCellStyleId doesn't track
   * damage, so the overlay forces full-frame damage while active.
   */
  setSearchHighlight(query) {
    if (this.searchHighlightQuery === query) return;
    this.searchHighlightQuery = query;
    this.scheduleRender();
  }
  /** Paint an EXISTING DOM subtree to a fresh Screen at its natural
   *  height, scan for query. Returns positions relative to the element's
   *  bounding box (row 0 = element top).
   *
   *  The element comes from the MAIN tree — built with all real
   *  providers, yoga already computed. We paint it to a fresh buffer
   *  with offsets so it lands at (0,0). Same paint path as the main
   *  render. Zero drift. No second React root, no context bridge.
   *
   *  ~1-2ms (paint only, no reconcile — the DOM is already built). */
  scanElementSubtree(el) {
    if (!this.searchHighlightQuery || !el.yogaNode) return [];
    const width = Math.ceil(el.yogaNode.getComputedWidth());
    const height = Math.ceil(el.yogaNode.getComputedHeight());
    if (width <= 0 || height <= 0) return [];
    const elLeft = el.yogaNode.getComputedLeft();
    const elTop = el.yogaNode.getComputedTop();
    const screen = createScreen(width, height, this.stylePool, this.charPool, this.hyperlinkPool);
    const output = new Output({
      width,
      height,
      stylePool: this.stylePool,
      screen
    });
    renderNodeToOutput(el, output, {
      offsetX: -elLeft,
      offsetY: -elTop,
      prevScreen: void 0
    });
    const rendered = output.get();
    dom.markDirty(el);
    const positions = scanPositions(rendered, this.searchHighlightQuery);
    logForDebugging(`scanElementSubtree: q='${this.searchHighlightQuery}' el=${width}x${height}@(${elLeft},${elTop}) n=${positions.length} [${positions.slice(0, 10).map((p) => `${p.row}:${p.col}`).join(",")}${positions.length > 10 ? ",\u2026" : ""}]`);
    return positions;
  }
  /** Set the position-based highlight state. Every frame, writes CURRENT
   *  style at positions[currentIdx] + rowOffset. null clears. The scan-
   *  highlight (inverse on all matches) still runs — this overlays yellow
   *  on top. rowOffset changes as the user scrolls (= message's current
   *  screen-top); positions stay stable (message-relative). */
  setSearchPositions(state) {
    this.searchPositions = state;
    this.scheduleRender();
  }
  /**
   * Set the selection highlight background color. Replaces the per-cell
   * SGR-7 inverse with a solid theme-aware bg (matches native terminal
   * selection). Accepts the same color formats as Text backgroundColor
   * (rgb(), ansi:name, #hex, ansi256()) — colorize() routes through
   * chalk so the tmux/xterm.js level clamps in colorize.ts apply and
   * the emitted SGR is correct for the current terminal.
   *
   * Called by React-land once theme is known (ScrollKeybindingHandler's
   * useEffect watching useTheme). Before that call, withSelectionBg
   * falls back to withInverse so selection still renders on the first
   * frame; the effect fires before any mouse input so the fallback is
   * unobservable in practice.
   */
  setSelectionBgColor(color) {
    const wrapped = colorize("\0", color, "background");
    const nul = wrapped.indexOf("\0");
    if (nul <= 0 || nul === wrapped.length - 1) {
      this.stylePool.setSelectionBg(null);
      return;
    }
    this.stylePool.setSelectionBg({
      type: "ansi",
      code: wrapped.slice(0, nul),
      endCode: wrapped.slice(nul + 1)
      // always \x1b[49m for bg
    });
  }
  /**
   * Capture text from rows about to scroll out of the viewport during
   * drag-to-scroll. Must be called BEFORE the ScrollBox scrolls so the
   * screen buffer still holds the outgoing content. Accumulated into
   * the selection state and joined back in by getSelectedText.
   */
  captureScrolledRows(firstRow, lastRow, side) {
    captureScrolledRows(this.selection, this.frontFrame.screen, firstRow, lastRow, side);
  }
  /**
   * Shift anchor AND focus by dRow, clamped to [minRow, maxRow]. Used by
   * keyboard scroll handlers (PgUp/PgDn etc.) so the highlight tracks the
   * content instead of disappearing. Unlike shiftAnchor (drag-to-scroll),
   * this moves BOTH endpoints — the user isn't holding the mouse at one
   * edge. Supplies screen.width for the col-reset-on-clamp boundary.
   */
  shiftSelectionForScroll(dRow, minRow, maxRow) {
    const hadSel = hasSelection(this.selection);
    shiftSelection(this.selection, dRow, minRow, maxRow, this.frontFrame.screen.width);
    if (hadSel && !hasSelection(this.selection)) {
      this.notifySelectionChange();
    }
  }
  /**
   * Keyboard selection extension (shift+arrow/home/end). Moves focus;
   * anchor stays fixed so the highlight grows or shrinks relative to it.
   * Left/right wrap across row boundaries — native macOS text-edit
   * behavior: shift+left at col 0 wraps to end of the previous row.
   * Up/down clamp at viewport edges (no scroll-to-extend yet). Drops to
   * char mode. No-op outside alt-screen or without an active selection.
   */
  moveSelectionFocus(move) {
    if (!this.altScreenActive) return;
    const {
      focus
    } = this.selection;
    if (!focus) return;
    const {
      width,
      height
    } = this.frontFrame.screen;
    const maxCol = width - 1;
    const maxRow = height - 1;
    let {
      col,
      row
    } = focus;
    switch (move) {
      case "left":
        if (col > 0) col--;
        else if (row > 0) {
          col = maxCol;
          row--;
        }
        break;
      case "right":
        if (col < maxCol) col++;
        else if (row < maxRow) {
          col = 0;
          row++;
        }
        break;
      case "up":
        if (row > 0) row--;
        break;
      case "down":
        if (row < maxRow) row++;
        break;
      case "lineStart":
        col = 0;
        break;
      case "lineEnd":
        col = maxCol;
        break;
    }
    if (col === focus.col && row === focus.row) return;
    moveFocus(this.selection, col, row);
    this.notifySelectionChange();
  }
  /** Whether there is an active text selection. */
  hasTextSelection() {
    return hasSelection(this.selection);
  }
  /**
   * Subscribe to selection state changes. Fires whenever the selection
   * is started, updated, cleared, or copied. Returns an unsubscribe fn.
   */
  subscribeToSelectionChange(cb) {
    this.selectionListeners.add(cb);
    return () => this.selectionListeners.delete(cb);
  }
  notifySelectionChange() {
    this.onRender();
    for (const cb of this.selectionListeners) cb();
  }
  /**
   * Hit-test the rendered DOM tree at (col, row) and bubble a ClickEvent
   * from the deepest hit node up through ancestors with onClick handlers.
   * Returns true if a DOM handler consumed the click. Gated on
   * altScreenActive — clicks only make sense with a fixed viewport where
   * nodeCache rects map 1:1 to terminal cells (no scrollback offset).
   */
  dispatchClick(col, row) {
    if (!this.altScreenActive) return false;
    const blank = isEmptyCellAt(this.frontFrame.screen, col, row);
    return dispatchClick(this.rootNode, col, row, blank);
  }
  dispatchHover(col, row) {
    if (!this.altScreenActive) return;
    dispatchHover(this.rootNode, col, row, this.hoveredNodes);
  }
  dispatchKeyboardEvent(parsedKey) {
    const target = this.focusManager.activeElement ?? this.rootNode;
    const event = new KeyboardEvent(parsedKey);
    dispatcher.dispatchDiscrete(target, event);
    if (!event.defaultPrevented && parsedKey.name === "tab" && !parsedKey.ctrl && !parsedKey.meta) {
      if (parsedKey.shift) {
        this.focusManager.focusPrevious(this.rootNode);
      } else {
        this.focusManager.focusNext(this.rootNode);
      }
    }
  }
  /**
   * Look up the URL at (col, row) in the current front frame. Checks for
   * an OSC 8 hyperlink first, then falls back to scanning the row for a
   * plain-text URL (mouse tracking intercepts the terminal's native
   * Cmd+Click URL detection, so we replicate it). This is a pure lookup
   * with no side effects — call it synchronously at click time so the
   * result reflects the screen the user actually clicked on, then defer
   * the browser-open action via a timer.
   */
  getHyperlinkAt(col, row) {
    if (!this.altScreenActive) return void 0;
    const screen = this.frontFrame.screen;
    const cell = cellAt(screen, col, row);
    let url = cell?.hyperlink;
    if (!url && cell?.width === CellWidth.SpacerTail && col > 0) {
      url = cellAt(screen, col - 1, row)?.hyperlink;
    }
    return url ?? findPlainTextUrlAt(screen, col, row);
  }
  /**
   * Optional callback fired when clicking an OSC 8 hyperlink in fullscreen
   * mode. Set by FullscreenLayout via useLayoutEffect.
   */
  onHyperlinkClick;
  /**
   * Stable prototype wrapper for onHyperlinkClick. Passed to <App> as
   * onOpenHyperlink so the prop is a bound method (autoBind'd) that reads
   * the mutable field at call time — not the undefined-at-render value.
   */
  openHyperlink(url) {
    this.onHyperlinkClick?.(url);
  }
  /**
   * Handle a double- or triple-click at (col, row): select the word or
   * line under the cursor by reading the current screen buffer. Called on
   * PRESS (not release) so the highlight appears immediately and drag can
   * extend the selection word-by-word / line-by-line. Falls back to
   * char-mode startSelection if the click lands on a noSelect cell.
   */
  handleMultiClick(col, row, count) {
    if (!this.altScreenActive) return;
    const screen = this.frontFrame.screen;
    startSelection(this.selection, col, row);
    if (count === 2) selectWordAt(this.selection, screen, col, row);
    else selectLineAt(this.selection, screen, row);
    if (!this.selection.focus) this.selection.focus = this.selection.anchor;
    this.notifySelectionChange();
  }
  /**
   * Handle a drag-motion at (col, row). In char mode updates focus to the
   * exact cell. In word/line mode snaps to word/line boundaries so the
   * selection extends by word/line like native macOS. Gated on
   * altScreenActive for the same reason as dispatchClick.
   */
  handleSelectionDrag(col, row) {
    if (!this.altScreenActive) return;
    const sel = this.selection;
    if (sel.anchorSpan) {
      extendSelection(sel, this.frontFrame.screen, col, row);
    } else {
      updateSelection(sel, col, row);
    }
    this.notifySelectionChange();
  }
  // Methods to properly suspend stdin for external editor usage
  // This is needed to prevent Ink from swallowing keystrokes when an external editor is active
  stdinListeners = [];
  wasRawMode = false;
  suspendStdin() {
    const stdin = this.options.stdin;
    if (!stdin.isTTY) {
      return;
    }
    const readableListeners = stdin.listeners("readable");
    logForDebugging(`[stdin] suspendStdin: removing ${readableListeners.length} readable listener(s), wasRawMode=${stdin.isRaw ?? false}`);
    readableListeners.forEach((listener) => {
      this.stdinListeners.push({
        event: "readable",
        listener
      });
      stdin.removeListener("readable", listener);
    });
    const stdinWithRaw = stdin;
    if (stdinWithRaw.isRaw && stdinWithRaw.setRawMode) {
      stdinWithRaw.setRawMode(false);
      this.wasRawMode = true;
    }
  }
  resumeStdin() {
    const stdin = this.options.stdin;
    if (!stdin.isTTY) {
      return;
    }
    if (this.stdinListeners.length === 0 && !this.wasRawMode) {
      logForDebugging("[stdin] resumeStdin: called with no stored listeners and wasRawMode=false (possible desync)", {
        level: "warn"
      });
    }
    logForDebugging(`[stdin] resumeStdin: re-attaching ${this.stdinListeners.length} listener(s), wasRawMode=${this.wasRawMode}`);
    this.stdinListeners.forEach(({
      event,
      listener
    }) => {
      stdin.addListener(event, listener);
    });
    this.stdinListeners = [];
    if (this.wasRawMode) {
      const stdinWithRaw = stdin;
      if (stdinWithRaw.setRawMode) {
        stdinWithRaw.setRawMode(true);
      }
      this.wasRawMode = false;
    }
  }
  // Stable identity for TerminalWriteContext. An inline arrow here would
  // change on every render() call (initial mount + each resize), which
  // cascades through useContext → <AlternateScreen>'s useLayoutEffect dep
  // array → spurious exit+re-enter of the alt screen on every SIGWINCH.
  writeRaw(data) {
    this.options.stdout.write(data);
  }
  setCursorDeclaration = (decl, clearIfNode) => {
    if (decl === null && clearIfNode !== void 0 && this.cursorDeclaration?.node !== clearIfNode) {
      return;
    }
    this.cursorDeclaration = decl;
  };
  render(node) {
    this.currentNode = node;
    const tree = /* @__PURE__ */ jsx(App, { stdin: this.options.stdin, stdout: this.options.stdout, stderr: this.options.stderr, exitOnCtrlC: this.options.exitOnCtrlC, onExit: this.unmount, terminalColumns: this.terminalColumns, terminalRows: this.terminalRows, selection: this.selection, onSelectionChange: this.notifySelectionChange, onClickAt: this.dispatchClick, onHoverAt: this.dispatchHover, getHyperlinkAt: this.getHyperlinkAt, onOpenHyperlink: this.openHyperlink, onMultiClick: this.handleMultiClick, onSelectionDrag: this.handleSelectionDrag, onStdinResume: this.reassertTerminalModes, onCursorDeclaration: this.setCursorDeclaration, dispatchKeyboardEvent: this.dispatchKeyboardEvent, children: /* @__PURE__ */ jsx(TerminalWriteProvider, { value: this.writeRaw, children: node }) });
    reconciler.updateContainerSync(tree, this.container, null, noop);
    reconciler.flushSyncWork();
  }
  unmount(error) {
    if (this.isUnmounted) {
      return;
    }
    this.onRender();
    this.unsubscribeExit();
    if (typeof this.restoreConsole === "function") {
      this.restoreConsole();
    }
    this.restoreStderr?.();
    this.unsubscribeTTYHandlers?.();
    const diff = this.log.renderPreviousOutput_DEPRECATED(this.frontFrame);
    writeDiffToTerminal(this.terminal, optimize(diff));
    if (this.options.stdout.isTTY) {
      if (this.altScreenActive) {
        writeSync(1, EXIT_ALT_SCREEN);
      }
      writeSync(1, DISABLE_MOUSE_TRACKING);
      this.drainStdin();
      writeSync(1, DISABLE_MODIFY_OTHER_KEYS);
      writeSync(1, DISABLE_KITTY_KEYBOARD);
      writeSync(1, DFE);
      writeSync(1, DBP);
      writeSync(1, SHOW_CURSOR);
      writeSync(1, CLEAR_ITERM2_PROGRESS);
      if (supportsTabStatus()) writeSync(1, wrapForMultiplexer(CLEAR_TAB_STATUS));
    }
    this.isUnmounted = true;
    this.scheduleRender.cancel?.();
    if (this.drainTimer !== null) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    reconciler.updateContainerSync(null, this.container, null, noop);
    reconciler.flushSyncWork();
    instances.delete(this.options.stdout);
    this.rootNode.yogaNode?.free();
    this.rootNode.yogaNode = void 0;
    if (error instanceof Error) {
      this.rejectExitPromise(error);
    } else {
      this.resolveExitPromise();
    }
  }
  async waitUntilExit() {
    this.exitPromise ||= new Promise((resolve, reject) => {
      this.resolveExitPromise = resolve;
      this.rejectExitPromise = reject;
    });
    return this.exitPromise;
  }
  resetLineCount() {
    if (this.options.stdout.isTTY) {
      this.backFrame = this.frontFrame;
      this.frontFrame = emptyFrame(this.frontFrame.viewport.height, this.frontFrame.viewport.width, this.stylePool, this.charPool, this.hyperlinkPool);
      this.log.reset();
      this.displayCursor = null;
    }
  }
  /**
   * Replace char/hyperlink pools with fresh instances to prevent unbounded
   * growth during long sessions. Migrates the front frame's screen IDs into
   * the new pools so diffing remains correct. The back frame doesn't need
   * migration — resetScreen zeros it before any reads.
   *
   * Call between conversation turns or periodically.
   */
  resetPools() {
    this.charPool = new CharPool();
    this.hyperlinkPool = new HyperlinkPool();
    migrateScreenPools(this.frontFrame.screen, this.charPool, this.hyperlinkPool);
    this.backFrame.screen.charPool = this.charPool;
    this.backFrame.screen.hyperlinkPool = this.hyperlinkPool;
  }
  patchConsole() {
    const con = console;
    const originals = {};
    const toDebug = (...args) => logForDebugging(`console.log: ${format(...args)}`);
    const toError = (...args) => logError(new Error(`console.error: ${format(...args)}`));
    for (const m of CONSOLE_STDOUT_METHODS) {
      originals[m] = con[m];
      con[m] = toDebug;
    }
    for (const m of CONSOLE_STDERR_METHODS) {
      originals[m] = con[m];
      con[m] = toError;
    }
    originals.assert = con.assert;
    con.assert = (condition, ...args) => {
      if (!condition) toError(...args);
    };
    return () => Object.assign(con, originals);
  }
  /**
   * Intercept process.stderr.write so stray writes (config.ts, hooks.ts,
   * third-party deps) don't corrupt the alt-screen buffer. patchConsole only
   * hooks console.* methods — direct stderr writes bypass it, land at the
   * parked cursor, scroll the alt-screen, and desync frontFrame from the
   * physical terminal. Next diff writes only changed-in-React cells at
   * absolute coords → interleaved garbage.
   *
   * Swallows the write (routes text to the debug log) and, in alt-screen,
   * forces a full-damage repaint as a defensive recovery. Not patching
   * process.stdout — Ink itself writes there.
   */
  patchStderr() {
    const stderr = process.stderr;
    const originalWrite = stderr.write;
    let reentered = false;
    const intercept = (chunk, encodingOrCb, cb) => {
      const callback = typeof encodingOrCb === "function" ? encodingOrCb : cb;
      if (reentered) {
        const encoding = typeof encodingOrCb === "string" ? encodingOrCb : void 0;
        return originalWrite.call(stderr, chunk, encoding, callback);
      }
      reentered = true;
      try {
        const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        logForDebugging(`[stderr] ${text}`, {
          level: "warn"
        });
        if (this.altScreenActive && !this.isUnmounted && !this.isPaused) {
          this.prevFrameContaminated = true;
          this.scheduleRender();
        }
      } finally {
        reentered = false;
        callback?.();
      }
      return true;
    };
    stderr.write = intercept;
    return () => {
      if (stderr.write === intercept) {
        stderr.write = originalWrite;
      }
    };
  }
}
function drainStdin(stdin = process.stdin) {
  if (!stdin.isTTY) return;
  try {
    while (stdin.read() !== null) {
    }
  } catch {
  }
  if (process.platform === "win32") return;
  const tty = stdin;
  const wasRaw = tty.isRaw === true;
  let fd = -1;
  try {
    if (!wasRaw) tty.setRawMode?.(true);
    fd = openSync("/dev/tty", fsConstants.O_RDONLY | fsConstants.O_NONBLOCK);
    const buf = Buffer.alloc(1024);
    for (let i = 0; i < 64; i++) {
      if (readSync(fd, buf, 0, buf.length, null) <= 0) break;
    }
  } catch {
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd);
      } catch {
      }
    }
    if (!wasRaw) {
      try {
        tty.setRawMode?.(false);
      } catch {
      }
    }
  }
}
const CONSOLE_STDOUT_METHODS = ["log", "info", "debug", "dir", "dirxml", "count", "countReset", "group", "groupCollapsed", "groupEnd", "table", "time", "timeEnd", "timeLog"];
const CONSOLE_STDERR_METHODS = ["warn", "error", "trace"];
export {
  Ink as default,
  drainStdin
};
