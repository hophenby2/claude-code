import React, { useCallback, useState } from "react";
import { Cursor } from "../utils/Cursor.js";
import { lastGrapheme } from "../utils/intl.js";
import {
  executeIndent,
  executeJoin,
  executeOpenLine,
  executeOperatorFind,
  executeOperatorMotion,
  executeOperatorTextObj,
  executeReplace,
  executeToggleCase,
  executeX
} from "../vim/operators.js";
import { transition } from "../vim/transitions.js";
import {
  createInitialPersistentState,
  createInitialVimState
} from "../vim/types.js";
import { useTextInput } from "./useTextInput.js";
function useVimInput(props) {
  const vimStateRef = React.useRef(createInitialVimState());
  const [mode, setMode] = useState("INSERT");
  const persistentRef = React.useRef(
    createInitialPersistentState()
  );
  const textInput = useTextInput({ ...props, inputFilter: void 0 });
  const { onModeChange, inputFilter } = props;
  const switchToInsertMode = useCallback(
    (offset) => {
      if (offset !== void 0) {
        textInput.setOffset(offset);
      }
      vimStateRef.current = { mode: "INSERT", insertedText: "" };
      setMode("INSERT");
      onModeChange?.("INSERT");
    },
    [textInput, onModeChange]
  );
  const switchToNormalMode = useCallback(() => {
    const current = vimStateRef.current;
    if (current.mode === "INSERT" && current.insertedText) {
      persistentRef.current.lastChange = {
        type: "insert",
        text: current.insertedText
      };
    }
    const offset = textInput.offset;
    if (offset > 0 && props.value[offset - 1] !== "\n") {
      textInput.setOffset(offset - 1);
    }
    vimStateRef.current = { mode: "NORMAL", command: { type: "idle" } };
    setMode("NORMAL");
    onModeChange?.("NORMAL");
  }, [onModeChange, textInput, props.value]);
  function createOperatorContext(cursor, isReplay = false) {
    return {
      cursor,
      text: props.value,
      setText: (newText) => props.onChange(newText),
      setOffset: (offset) => textInput.setOffset(offset),
      enterInsert: (offset) => switchToInsertMode(offset),
      getRegister: () => persistentRef.current.register,
      setRegister: (content, linewise) => {
        persistentRef.current.register = content;
        persistentRef.current.registerIsLinewise = linewise;
      },
      getLastFind: () => persistentRef.current.lastFind,
      setLastFind: (type, char) => {
        persistentRef.current.lastFind = { type, char };
      },
      recordChange: isReplay ? () => {
      } : (change) => {
        persistentRef.current.lastChange = change;
      }
    };
  }
  function replayLastChange() {
    const change = persistentRef.current.lastChange;
    if (!change) return;
    const cursor = Cursor.fromText(props.value, props.columns, textInput.offset);
    const ctx = createOperatorContext(cursor, true);
    switch (change.type) {
      case "insert":
        if (change.text) {
          const newCursor = cursor.insert(change.text);
          props.onChange(newCursor.text);
          textInput.setOffset(newCursor.offset);
        }
        break;
      case "x":
        executeX(change.count, ctx);
        break;
      case "replace":
        executeReplace(change.char, change.count, ctx);
        break;
      case "toggleCase":
        executeToggleCase(change.count, ctx);
        break;
      case "indent":
        executeIndent(change.dir, change.count, ctx);
        break;
      case "join":
        executeJoin(change.count, ctx);
        break;
      case "openLine":
        executeOpenLine(change.direction, ctx);
        break;
      case "operator":
        executeOperatorMotion(change.op, change.motion, change.count, ctx);
        break;
      case "operatorFind":
        executeOperatorFind(
          change.op,
          change.find,
          change.char,
          change.count,
          ctx
        );
        break;
      case "operatorTextObj":
        executeOperatorTextObj(
          change.op,
          change.scope,
          change.objType,
          change.count,
          ctx
        );
        break;
    }
  }
  function handleVimInput(rawInput, key) {
    const state = vimStateRef.current;
    const filtered = inputFilter ? inputFilter(rawInput, key) : rawInput;
    const input = state.mode === "INSERT" ? filtered : rawInput;
    const cursor = Cursor.fromText(props.value, props.columns, textInput.offset);
    if (key.ctrl) {
      textInput.onInput(input, key);
      return;
    }
    if (key.escape && state.mode === "INSERT") {
      switchToNormalMode();
      return;
    }
    if (key.escape && state.mode === "NORMAL") {
      vimStateRef.current = { mode: "NORMAL", command: { type: "idle" } };
      return;
    }
    if (key.return) {
      textInput.onInput(input, key);
      return;
    }
    if (state.mode === "INSERT") {
      if (key.backspace || key.delete) {
        if (state.insertedText.length > 0) {
          vimStateRef.current = {
            mode: "INSERT",
            insertedText: state.insertedText.slice(
              0,
              -(lastGrapheme(state.insertedText).length || 1)
            )
          };
        }
      } else {
        vimStateRef.current = {
          mode: "INSERT",
          insertedText: state.insertedText + input
        };
      }
      textInput.onInput(input, key);
      return;
    }
    if (state.mode !== "NORMAL") {
      return;
    }
    if (state.command.type === "idle" && (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow)) {
      textInput.onInput(input, key);
      return;
    }
    const ctx = {
      ...createOperatorContext(cursor, false),
      onUndo: props.onUndo,
      onDotRepeat: replayLastChange
    };
    const expectsMotion = state.command.type === "idle" || state.command.type === "count" || state.command.type === "operator" || state.command.type === "operatorCount";
    let vimInput = input;
    if (key.leftArrow) vimInput = "h";
    else if (key.rightArrow) vimInput = "l";
    else if (key.upArrow) vimInput = "k";
    else if (key.downArrow) vimInput = "j";
    else if (expectsMotion && key.backspace) vimInput = "h";
    else if (expectsMotion && state.command.type !== "count" && key.delete)
      vimInput = "x";
    const result = transition(state.command, vimInput, ctx);
    if (result.execute) {
      result.execute();
    }
    if (vimStateRef.current.mode === "NORMAL") {
      if (result.next) {
        vimStateRef.current = { mode: "NORMAL", command: result.next };
      } else if (result.execute) {
        vimStateRef.current = { mode: "NORMAL", command: { type: "idle" } };
      }
    }
    if (input === "?" && state.mode === "NORMAL" && state.command.type === "idle") {
      props.onChange("?");
    }
  }
  const setModeExternal = useCallback(
    (newMode) => {
      if (newMode === "INSERT") {
        vimStateRef.current = { mode: "INSERT", insertedText: "" };
      } else {
        vimStateRef.current = { mode: "NORMAL", command: { type: "idle" } };
      }
      setMode(newMode);
      onModeChange?.(newMode);
    },
    [onModeChange]
  );
  return {
    ...textInput,
    onInput: handleVimInput,
    mode,
    setMode: setModeExternal
  };
}
export {
  useVimInput
};
