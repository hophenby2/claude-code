import { isInputModeCharacter } from "../components/PromptInput/inputModes.js";
import { useNotifications } from "../context/notifications.js";
import stripAnsi from "strip-ansi";
import { markBackslashReturnUsed } from "../commands/terminalSetup/terminalSetup.js";
import { addToHistory } from "../history.js";
import {
  Cursor,
  getLastKill,
  pushToKillRing,
  recordYank,
  resetKillAccumulation,
  resetYankState,
  updateYankLength,
  yankPop
} from "../utils/Cursor.js";
import { env } from "../utils/env.js";
import { isFullscreenEnvEnabled } from "../utils/fullscreen.js";
import { isModifierPressed, prewarmModifiers } from "../utils/modifiers.js";
import { useDoublePress } from "./useDoublePress.js";
const NOOP_HANDLER = () => {
};
function mapInput(input_map) {
  const map = new Map(input_map);
  return function(input) {
    return (map.get(input) ?? NOOP_HANDLER)(input);
  };
}
function useTextInput({
  value: originalValue,
  onChange,
  onSubmit,
  onExit,
  onExitMessage,
  onHistoryUp,
  onHistoryDown,
  onHistoryReset,
  onClearInput,
  mask = "",
  multiline = false,
  cursorChar,
  invert,
  columns,
  onImagePaste: _onImagePaste,
  disableCursorMovementForUpDownKeys = false,
  disableEscapeDoublePress = false,
  maxVisibleLines,
  externalOffset,
  onOffsetChange,
  inputFilter,
  inlineGhostText,
  dim
}) {
  if (env.terminal === "Apple_Terminal") {
    prewarmModifiers();
  }
  const offset = externalOffset;
  const setOffset = onOffsetChange;
  const cursor = Cursor.fromText(originalValue, columns, offset);
  const { addNotification, removeNotification } = useNotifications();
  const handleCtrlC = useDoublePress(
    (show) => {
      onExitMessage?.(show, "Ctrl-C");
    },
    () => onExit?.(),
    () => {
      if (originalValue) {
        onChange("");
        setOffset(0);
        onHistoryReset?.();
      }
    }
  );
  const handleEscape = useDoublePress(
    (show) => {
      if (!originalValue || !show) {
        return;
      }
      addNotification({
        key: "escape-again-to-clear",
        text: "Esc again to clear",
        priority: "immediate",
        timeoutMs: 1e3
      });
    },
    () => {
      removeNotification("escape-again-to-clear");
      onClearInput?.();
      if (originalValue) {
        if (originalValue.trim() !== "") {
          addToHistory(originalValue);
        }
        onChange("");
        setOffset(0);
        onHistoryReset?.();
      }
    }
  );
  const handleEmptyCtrlD = useDoublePress(
    (show) => {
      if (originalValue !== "") {
        return;
      }
      onExitMessage?.(show, "Ctrl-D");
    },
    () => {
      if (originalValue !== "") {
        return;
      }
      onExit?.();
    }
  );
  function handleCtrlD() {
    if (cursor.text === "") {
      handleEmptyCtrlD();
      return cursor;
    }
    return cursor.del();
  }
  function killToLineEnd() {
    const { cursor: newCursor, killed } = cursor.deleteToLineEnd();
    pushToKillRing(killed, "append");
    return newCursor;
  }
  function killToLineStart() {
    const { cursor: newCursor, killed } = cursor.deleteToLineStart();
    pushToKillRing(killed, "prepend");
    return newCursor;
  }
  function killWordBefore() {
    const { cursor: newCursor, killed } = cursor.deleteWordBefore();
    pushToKillRing(killed, "prepend");
    return newCursor;
  }
  function yank() {
    const text = getLastKill();
    if (text.length > 0) {
      const startOffset = cursor.offset;
      const newCursor = cursor.insert(text);
      recordYank(startOffset, text.length);
      return newCursor;
    }
    return cursor;
  }
  function handleYankPop() {
    const popResult = yankPop();
    if (!popResult) {
      return cursor;
    }
    const { text, start, length } = popResult;
    const before = cursor.text.slice(0, start);
    const after = cursor.text.slice(start + length);
    const newText = before + text + after;
    const newOffset = start + text.length;
    updateYankLength(text.length);
    return Cursor.fromText(newText, columns, newOffset);
  }
  const handleCtrl = mapInput([
    ["a", () => cursor.startOfLine()],
    ["b", () => cursor.left()],
    ["c", handleCtrlC],
    ["d", handleCtrlD],
    ["e", () => cursor.endOfLine()],
    ["f", () => cursor.right()],
    ["h", () => cursor.deleteTokenBefore() ?? cursor.backspace()],
    ["k", killToLineEnd],
    ["n", () => downOrHistoryDown()],
    ["p", () => upOrHistoryUp()],
    ["u", killToLineStart],
    ["w", killWordBefore],
    ["y", yank]
  ]);
  const handleMeta = mapInput([
    ["b", () => cursor.prevWord()],
    ["f", () => cursor.nextWord()],
    ["d", () => cursor.deleteWordAfter()],
    ["y", handleYankPop]
  ]);
  function handleEnter(key) {
    if (multiline && cursor.offset > 0 && cursor.text[cursor.offset - 1] === "\\") {
      markBackslashReturnUsed();
      return cursor.backspace().insert("\n");
    }
    if (key.meta || key.shift) {
      return cursor.insert("\n");
    }
    if (env.terminal === "Apple_Terminal" && isModifierPressed("shift")) {
      return cursor.insert("\n");
    }
    onSubmit?.(originalValue);
  }
  function upOrHistoryUp() {
    if (disableCursorMovementForUpDownKeys) {
      onHistoryUp?.();
      return cursor;
    }
    const cursorUp = cursor.up();
    if (!cursorUp.equals(cursor)) {
      return cursorUp;
    }
    if (multiline) {
      const cursorUpLogical = cursor.upLogicalLine();
      if (!cursorUpLogical.equals(cursor)) {
        return cursorUpLogical;
      }
    }
    onHistoryUp?.();
    return cursor;
  }
  function downOrHistoryDown() {
    if (disableCursorMovementForUpDownKeys) {
      onHistoryDown?.();
      return cursor;
    }
    const cursorDown = cursor.down();
    if (!cursorDown.equals(cursor)) {
      return cursorDown;
    }
    if (multiline) {
      const cursorDownLogical = cursor.downLogicalLine();
      if (!cursorDownLogical.equals(cursor)) {
        return cursorDownLogical;
      }
    }
    onHistoryDown?.();
    return cursor;
  }
  function mapKey(key) {
    switch (true) {
      case key.escape:
        return () => {
          if (disableEscapeDoublePress) return cursor;
          handleEscape();
          return cursor;
        };
      case (key.leftArrow && (key.ctrl || key.meta || key.fn)):
        return () => cursor.prevWord();
      case (key.rightArrow && (key.ctrl || key.meta || key.fn)):
        return () => cursor.nextWord();
      case key.backspace:
        return key.meta || key.ctrl ? killWordBefore : () => cursor.deleteTokenBefore() ?? cursor.backspace();
      case key.delete:
        return key.meta ? killToLineEnd : () => cursor.del();
      case key.ctrl:
        return handleCtrl;
      case key.home:
        return () => cursor.startOfLine();
      case key.end:
        return () => cursor.endOfLine();
      case key.pageDown:
        if (isFullscreenEnvEnabled()) {
          return NOOP_HANDLER;
        }
        return () => cursor.endOfLine();
      case key.pageUp:
        if (isFullscreenEnvEnabled()) {
          return NOOP_HANDLER;
        }
        return () => cursor.startOfLine();
      case key.wheelUp:
      case key.wheelDown:
        return NOOP_HANDLER;
      case key.return:
        return () => handleEnter(key);
      case key.meta:
        return handleMeta;
      case key.tab:
        return () => cursor;
      case (key.upArrow && !key.shift):
        return upOrHistoryUp;
      case (key.downArrow && !key.shift):
        return downOrHistoryDown;
      case key.leftArrow:
        return () => cursor.left();
      case key.rightArrow:
        return () => cursor.right();
      default: {
        return function(input) {
          switch (true) {
            // Home key
            case (input === "\x1B[H" || input === "\x1B[1~"):
              return cursor.startOfLine();
            // End key
            case (input === "\x1B[F" || input === "\x1B[4~"):
              return cursor.endOfLine();
            default: {
              const text = stripAnsi(input).replace(/(?<=[^\\\r\n])\r$/, "").replace(/\r/g, "\n");
              if (cursor.isAtStart() && isInputModeCharacter(input)) {
                return cursor.insert(text).left();
              }
              return cursor.insert(text);
            }
          }
        };
      }
    }
  }
  function isKillKey(key, input) {
    if (key.ctrl && (input === "k" || input === "u" || input === "w")) {
      return true;
    }
    if (key.meta && (key.backspace || key.delete)) {
      return true;
    }
    return false;
  }
  function isYankKey(key, input) {
    return (key.ctrl || key.meta) && input === "y";
  }
  function onInput(input, key) {
    const filteredInput = inputFilter ? inputFilter(input, key) : input;
    if (filteredInput === "" && input !== "") {
      return;
    }
    if (!key.backspace && !key.delete && input.includes("\x7F")) {
      const delCount = (input.match(/\x7f/g) || []).length;
      let currentCursor = cursor;
      for (let i = 0; i < delCount; i++) {
        currentCursor = currentCursor.deleteTokenBefore() ?? currentCursor.backspace();
      }
      if (!cursor.equals(currentCursor)) {
        if (cursor.text !== currentCursor.text) {
          onChange(currentCursor.text);
        }
        setOffset(currentCursor.offset);
      }
      resetKillAccumulation();
      resetYankState();
      return;
    }
    if (!isKillKey(key, filteredInput)) {
      resetKillAccumulation();
    }
    if (!isYankKey(key, filteredInput)) {
      resetYankState();
    }
    const nextCursor = mapKey(key)(filteredInput);
    if (nextCursor) {
      if (!cursor.equals(nextCursor)) {
        if (cursor.text !== nextCursor.text) {
          onChange(nextCursor.text);
        }
        setOffset(nextCursor.offset);
      }
      if (filteredInput.length > 1 && filteredInput.endsWith("\r") && !filteredInput.slice(0, -1).includes("\r") && // Backslash+CR is a stale VS Code Shift+Enter binding, not
      // coalesced Enter. See default handler above.
      filteredInput[filteredInput.length - 2] !== "\\") {
        onSubmit?.(nextCursor.text);
      }
    }
  }
  const ghostTextForRender = inlineGhostText && dim && inlineGhostText.insertPosition === offset ? { text: inlineGhostText.text, dim } : void 0;
  const cursorPos = cursor.getPosition();
  return {
    onInput,
    renderedValue: cursor.render(
      cursorChar,
      mask,
      invert,
      ghostTextForRender,
      maxVisibleLines
    ),
    offset,
    setOffset,
    cursorLine: cursorPos.line - cursor.getViewportStartLine(maxVisibleLines),
    cursorColumn: cursorPos.column,
    viewportCharOffset: cursor.getViewportCharOffset(maxVisibleLines),
    viewportCharEnd: cursor.getViewportCharEnd(maxVisibleLines)
  };
}
export {
  useTextInput
};
