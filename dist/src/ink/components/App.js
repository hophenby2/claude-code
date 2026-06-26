import { jsx } from "react/jsx-runtime";
import { PureComponent } from "react";
import { updateLastInteractionTime } from "../../bootstrap/state.js";
import { logForDebugging } from "../../utils/debug.js";
import { stopCapturingEarlyInput } from "../../utils/earlyInput.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { isMouseClicksDisabled } from "../../utils/fullscreen.js";
import { logError } from "../../utils/log.js";
import { EventEmitter } from "../events/emitter.js";
import { InputEvent } from "../events/input-event.js";
import { TerminalFocusEvent } from "../events/terminal-focus-event.js";
import { INITIAL_STATE, parseMultipleKeypresses } from "../parse-keypress.js";
import reconciler from "../reconciler.js";
import { finishSelection, hasSelection, startSelection } from "../selection.js";
import { isXtermJs, setXtversionName, supportsExtendedKeys } from "../terminal.js";
import { getTerminalFocused, setTerminalFocused } from "../terminal-focus-state.js";
import { TerminalQuerier, xtversion } from "../terminal-querier.js";
import { DISABLE_KITTY_KEYBOARD, DISABLE_MODIFY_OTHER_KEYS, ENABLE_KITTY_KEYBOARD, ENABLE_MODIFY_OTHER_KEYS, FOCUS_IN, FOCUS_OUT } from "../termio/csi.js";
import { DBP, DFE, DISABLE_MOUSE_TRACKING, EBP, EFE, HIDE_CURSOR, SHOW_CURSOR } from "../termio/dec.js";
import AppContext from "./AppContext.js";
import { ClockProvider } from "./ClockContext.js";
import CursorDeclarationContext from "./CursorDeclarationContext.js";
import ErrorOverview from "./ErrorOverview.js";
import StdinContext from "./StdinContext.js";
import { TerminalFocusProvider } from "./TerminalFocusContext.js";
import { TerminalSizeContext } from "./TerminalSizeContext.js";
const SUPPORTS_SUSPEND = process.platform !== "win32";
const STDIN_RESUME_GAP_MS = 5e3;
const MULTI_CLICK_TIMEOUT_MS = 500;
const MULTI_CLICK_DISTANCE = 1;
class App extends PureComponent {
  static displayName = "InternalApp";
  static getDerivedStateFromError(error) {
    return {
      error
    };
  }
  state = {
    error: void 0
  };
  // Count how many components enabled raw mode to avoid disabling
  // raw mode until all components don't need it anymore
  rawModeEnabledCount = 0;
  internal_eventEmitter = new EventEmitter();
  keyParseState = INITIAL_STATE;
  // Timer for flushing incomplete escape sequences
  incompleteEscapeTimer = null;
  // Timeout durations for incomplete sequences (ms)
  NORMAL_TIMEOUT = 50;
  // Short timeout for regular esc sequences
  PASTE_TIMEOUT = 500;
  // Longer timeout for paste operations
  // Terminal query/response dispatch. Responses arrive on stdin (parsed
  // out by parse-keypress) and are routed to pending promise resolvers.
  querier = new TerminalQuerier(this.props.stdout);
  // Multi-click tracking for double/triple-click text selection. A click
  // within MULTI_CLICK_TIMEOUT_MS and MULTI_CLICK_DISTANCE of the previous
  // click increments clickCount; otherwise it resets to 1.
  lastClickTime = 0;
  lastClickCol = -1;
  lastClickRow = -1;
  clickCount = 0;
  // Deferred hyperlink-open timer — cancelled if a second click arrives
  // within MULTI_CLICK_TIMEOUT_MS (so double-clicking a hyperlink selects
  // the word without also opening the browser). DOM onClick dispatch is
  // NOT deferred — it returns true from onClickAt and skips this timer.
  pendingHyperlinkTimer = null;
  // Last mode-1003 motion position. Terminals already dedupe to cell
  // granularity but this also lets us skip dispatchHover entirely on
  // repeat events (drag-then-release at same cell, etc.).
  lastHoverCol = -1;
  lastHoverRow = -1;
  // Timestamp of last stdin chunk. Used to detect long gaps (tmux attach,
  // ssh reconnect, laptop wake) and trigger terminal mode re-assert.
  // Initialized to now so startup doesn't false-trigger.
  lastStdinTime = Date.now();
  // Determines if TTY is supported on the provided stdin
  isRawModeSupported() {
    return this.props.stdin.isTTY;
  }
  render() {
    return /* @__PURE__ */ jsx(TerminalSizeContext.Provider, { value: {
      columns: this.props.terminalColumns,
      rows: this.props.terminalRows
    }, children: /* @__PURE__ */ jsx(AppContext.Provider, { value: {
      exit: this.handleExit
    }, children: /* @__PURE__ */ jsx(StdinContext.Provider, { value: {
      stdin: this.props.stdin,
      setRawMode: this.handleSetRawMode,
      isRawModeSupported: this.isRawModeSupported(),
      internal_exitOnCtrlC: this.props.exitOnCtrlC,
      internal_eventEmitter: this.internal_eventEmitter,
      internal_querier: this.querier
    }, children: /* @__PURE__ */ jsx(TerminalFocusProvider, { children: /* @__PURE__ */ jsx(ClockProvider, { children: /* @__PURE__ */ jsx(CursorDeclarationContext.Provider, { value: this.props.onCursorDeclaration ?? (() => {
    }), children: this.state.error ? /* @__PURE__ */ jsx(ErrorOverview, { error: this.state.error }) : this.props.children }) }) }) }) }) });
  }
  componentDidMount() {
    if (this.props.stdout.isTTY && !isEnvTruthy(process.env.CLAUDE_CODE_ACCESSIBILITY)) {
      this.props.stdout.write(HIDE_CURSOR);
    }
  }
  componentWillUnmount() {
    if (this.props.stdout.isTTY) {
      this.props.stdout.write(SHOW_CURSOR);
    }
    if (this.incompleteEscapeTimer) {
      clearTimeout(this.incompleteEscapeTimer);
      this.incompleteEscapeTimer = null;
    }
    if (this.pendingHyperlinkTimer) {
      clearTimeout(this.pendingHyperlinkTimer);
      this.pendingHyperlinkTimer = null;
    }
    if (this.isRawModeSupported()) {
      this.handleSetRawMode(false);
    }
  }
  componentDidCatch(error) {
    this.handleExit(error);
  }
  handleSetRawMode = (isEnabled) => {
    const {
      stdin
    } = this.props;
    if (!this.isRawModeSupported()) {
      if (stdin === process.stdin) {
        throw new Error("Raw mode is not supported on the current process.stdin, which Ink uses as input stream by default.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported");
      } else {
        throw new Error("Raw mode is not supported on the stdin provided to Ink.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported");
      }
    }
    stdin.setEncoding("utf8");
    if (isEnabled) {
      if (this.rawModeEnabledCount === 0) {
        stopCapturingEarlyInput();
        stdin.ref();
        stdin.setRawMode(true);
        stdin.addListener("readable", this.handleReadable);
        this.props.stdout.write(EBP);
        this.props.stdout.write(EFE);
        if (supportsExtendedKeys()) {
          this.props.stdout.write(ENABLE_KITTY_KEYBOARD);
          this.props.stdout.write(ENABLE_MODIFY_OTHER_KEYS);
        }
        setImmediate(() => {
          void Promise.all([this.querier.send(xtversion()), this.querier.flush()]).then(([r]) => {
            if (r) {
              setXtversionName(r.name);
              logForDebugging(`XTVERSION: terminal identified as "${r.name}"`);
            } else {
              logForDebugging("XTVERSION: no reply (terminal ignored query)");
            }
          });
        });
      }
      this.rawModeEnabledCount++;
      return;
    }
    if (--this.rawModeEnabledCount === 0) {
      this.props.stdout.write(DISABLE_MODIFY_OTHER_KEYS);
      this.props.stdout.write(DISABLE_KITTY_KEYBOARD);
      this.props.stdout.write(DFE);
      this.props.stdout.write(DBP);
      stdin.setRawMode(false);
      stdin.removeListener("readable", this.handleReadable);
      stdin.unref();
    }
  };
  // Helper to flush incomplete escape sequences
  flushIncomplete = () => {
    this.incompleteEscapeTimer = null;
    if (!this.keyParseState.incomplete) return;
    if (this.props.stdin.readableLength > 0) {
      this.incompleteEscapeTimer = setTimeout(this.flushIncomplete, this.NORMAL_TIMEOUT);
      return;
    }
    this.processInput(null);
  };
  // Process input through the parser and handle the results
  processInput = (input) => {
    const [keys, newState] = parseMultipleKeypresses(this.keyParseState, input);
    this.keyParseState = newState;
    if (keys.length > 0) {
      reconciler.discreteUpdates(processKeysInBatch, this, keys, void 0, void 0);
    }
    if (this.keyParseState.incomplete) {
      if (this.incompleteEscapeTimer) {
        clearTimeout(this.incompleteEscapeTimer);
      }
      this.incompleteEscapeTimer = setTimeout(this.flushIncomplete, this.keyParseState.mode === "IN_PASTE" ? this.PASTE_TIMEOUT : this.NORMAL_TIMEOUT);
    }
  };
  handleReadable = () => {
    const now = Date.now();
    if (now - this.lastStdinTime > STDIN_RESUME_GAP_MS) {
      this.props.onStdinResume?.();
    }
    this.lastStdinTime = now;
    try {
      let chunk;
      while ((chunk = this.props.stdin.read()) !== null) {
        this.processInput(chunk);
      }
    } catch (error) {
      logError(error);
      const {
        stdin
      } = this.props;
      if (this.rawModeEnabledCount > 0 && !stdin.listeners("readable").includes(this.handleReadable)) {
        logForDebugging("handleReadable: re-attaching stdin readable listener after error recovery", {
          level: "warn"
        });
        stdin.addListener("readable", this.handleReadable);
      }
    }
  };
  handleInput = (input) => {
    if (input === "" && this.props.exitOnCtrlC) {
      this.handleExit();
    }
  };
  handleExit = (error) => {
    if (this.isRawModeSupported()) {
      this.handleSetRawMode(false);
    }
    this.props.onExit(error);
  };
  handleTerminalFocus = (isFocused) => {
    setTerminalFocused(isFocused);
  };
  handleSuspend = () => {
    if (!this.isRawModeSupported()) {
      return;
    }
    const rawModeCountBeforeSuspend = this.rawModeEnabledCount;
    while (this.rawModeEnabledCount > 0) {
      this.handleSetRawMode(false);
    }
    if (this.props.stdout.isTTY) {
      this.props.stdout.write(SHOW_CURSOR + DFE + DISABLE_MOUSE_TRACKING);
    }
    this.internal_eventEmitter.emit("suspend");
    const resumeHandler = () => {
      for (let i = 0; i < rawModeCountBeforeSuspend; i++) {
        if (this.isRawModeSupported()) {
          this.handleSetRawMode(true);
        }
      }
      if (this.props.stdout.isTTY) {
        if (!isEnvTruthy(process.env.CLAUDE_CODE_ACCESSIBILITY)) {
          this.props.stdout.write(HIDE_CURSOR);
        }
        this.props.stdout.write(EFE);
      }
      this.internal_eventEmitter.emit("resume");
      process.removeListener("SIGCONT", resumeHandler);
    };
    process.on("SIGCONT", resumeHandler);
    process.kill(process.pid, "SIGSTOP");
  };
}
function processKeysInBatch(app, items, _unused1, _unused2) {
  if (items.some((i) => i.kind === "key" || i.kind === "mouse" && !((i.button & 32) !== 0 && (i.button & 3) === 3))) {
    updateLastInteractionTime();
  }
  for (const item of items) {
    if (item.kind === "response") {
      app.querier.onResponse(item.response);
      continue;
    }
    if (item.kind === "mouse") {
      handleMouseEvent(app, item);
      continue;
    }
    const sequence = item.sequence;
    if (sequence === FOCUS_IN) {
      app.handleTerminalFocus(true);
      const event2 = new TerminalFocusEvent("terminalfocus");
      app.internal_eventEmitter.emit("terminalfocus", event2);
      continue;
    }
    if (sequence === FOCUS_OUT) {
      app.handleTerminalFocus(false);
      if (app.props.selection.isDragging) {
        finishSelection(app.props.selection);
        app.props.onSelectionChange();
      }
      const event2 = new TerminalFocusEvent("terminalblur");
      app.internal_eventEmitter.emit("terminalblur", event2);
      continue;
    }
    if (!getTerminalFocused()) {
      setTerminalFocused(true);
    }
    if (item.name === "z" && item.ctrl && SUPPORTS_SUSPEND) {
      app.handleSuspend();
      continue;
    }
    app.handleInput(sequence);
    const event = new InputEvent(item);
    app.internal_eventEmitter.emit("input", event);
    app.props.dispatchKeyboardEvent(item);
  }
}
function handleMouseEvent(app, m) {
  if (isMouseClicksDisabled()) return;
  const sel = app.props.selection;
  const col = m.col - 1;
  const row = m.row - 1;
  const baseButton = m.button & 3;
  if (m.action === "press") {
    if ((m.button & 32) !== 0 && baseButton === 3) {
      if (sel.isDragging) {
        finishSelection(sel);
        app.props.onSelectionChange();
      }
      if (col === app.lastHoverCol && row === app.lastHoverRow) return;
      app.lastHoverCol = col;
      app.lastHoverRow = row;
      app.props.onHoverAt(col, row);
      return;
    }
    if (baseButton !== 0) {
      app.clickCount = 0;
      return;
    }
    if ((m.button & 32) !== 0) {
      app.props.onSelectionDrag(col, row);
      return;
    }
    if (sel.isDragging) {
      finishSelection(sel);
      app.props.onSelectionChange();
    }
    const now = Date.now();
    const nearLast = now - app.lastClickTime < MULTI_CLICK_TIMEOUT_MS && Math.abs(col - app.lastClickCol) <= MULTI_CLICK_DISTANCE && Math.abs(row - app.lastClickRow) <= MULTI_CLICK_DISTANCE;
    app.clickCount = nearLast ? app.clickCount + 1 : 1;
    app.lastClickTime = now;
    app.lastClickCol = col;
    app.lastClickRow = row;
    if (app.clickCount >= 2) {
      if (app.pendingHyperlinkTimer) {
        clearTimeout(app.pendingHyperlinkTimer);
        app.pendingHyperlinkTimer = null;
      }
      const count = app.clickCount === 2 ? 2 : 3;
      app.props.onMultiClick(col, row, count);
      return;
    }
    startSelection(sel, col, row);
    sel.lastPressHadAlt = (m.button & 8) !== 0;
    app.props.onSelectionChange();
    return;
  }
  if (baseButton !== 0) {
    if (!sel.isDragging) return;
    finishSelection(sel);
    app.props.onSelectionChange();
    return;
  }
  finishSelection(sel);
  if (!hasSelection(sel) && sel.anchor) {
    if (!app.props.onClickAt(col, row)) {
      const url = app.props.getHyperlinkAt(col, row);
      if (url && process.env.TERM_PROGRAM !== "vscode" && !isXtermJs()) {
        if (app.pendingHyperlinkTimer) {
          clearTimeout(app.pendingHyperlinkTimer);
        }
        app.pendingHyperlinkTimer = setTimeout((app2, url2) => {
          app2.pendingHyperlinkTimer = null;
          app2.props.onOpenHyperlink(url2);
        }, MULTI_CLICK_TIMEOUT_MS, app, url);
      }
    }
  }
  app.props.onSelectionChange();
}
export {
  App as default,
  handleMouseEvent
};
