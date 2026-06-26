import { nonAlphanumericKeys } from "../parse-keypress.js";
import { Event } from "./event.js";
function parseKey(keypress) {
  const key = {
    upArrow: keypress.name === "up",
    downArrow: keypress.name === "down",
    leftArrow: keypress.name === "left",
    rightArrow: keypress.name === "right",
    pageDown: keypress.name === "pagedown",
    pageUp: keypress.name === "pageup",
    wheelUp: keypress.name === "wheelup",
    wheelDown: keypress.name === "wheeldown",
    home: keypress.name === "home",
    end: keypress.name === "end",
    return: keypress.name === "return",
    escape: keypress.name === "escape",
    fn: keypress.fn,
    ctrl: keypress.ctrl,
    shift: keypress.shift,
    tab: keypress.name === "tab",
    backspace: keypress.name === "backspace",
    delete: keypress.name === "delete",
    // `parseKeypress` parses \u001B\u001B[A (meta + up arrow) as meta = false
    // but with option = true, so we need to take this into account here
    // to avoid breaking changes in Ink.
    // TODO(vadimdemedes): consider removing this in the next major version.
    meta: keypress.meta || keypress.name === "escape" || keypress.option,
    // Super (Cmd on macOS / Win key) — only arrives via kitty keyboard
    // protocol CSI u sequences. Distinct from meta (Alt/Option) so
    // bindings like cmd+c can be expressed separately from opt+c.
    super: keypress.super
  };
  let input = keypress.ctrl ? keypress.name : keypress.sequence;
  if (input === void 0) {
    input = "";
  }
  if (keypress.ctrl && input === "space") {
    input = " ";
  }
  if (keypress.code && !keypress.name) {
    input = "";
  }
  if (!keypress.name && /^\[<\d+;\d+;\d+[Mm]/.test(input)) {
    input = "";
  }
  if (input.startsWith("\x1B")) {
    input = input.slice(1);
  }
  let processedAsSpecialSequence = false;
  if (/^\[\d/.test(input) && input.endsWith("u")) {
    if (!keypress.name) {
      input = "";
    } else {
      input = keypress.name === "space" ? " " : keypress.name === "escape" ? "" : keypress.name;
    }
    processedAsSpecialSequence = true;
  }
  if (input.startsWith("[27;") && input.endsWith("~")) {
    if (!keypress.name) {
      input = "";
    } else {
      input = keypress.name === "space" ? " " : keypress.name === "escape" ? "" : keypress.name;
    }
    processedAsSpecialSequence = true;
  }
  if (input.startsWith("O") && input.length === 2 && keypress.name && keypress.name.length === 1) {
    input = keypress.name;
    processedAsSpecialSequence = true;
  }
  if (!processedAsSpecialSequence && keypress.name && nonAlphanumericKeys.includes(keypress.name)) {
    input = "";
  }
  if (input.length === 1 && typeof input[0] === "string" && input[0] >= "A" && input[0] <= "Z") {
    key.shift = true;
  }
  return [key, input];
}
class InputEvent extends Event {
  keypress;
  key;
  input;
  constructor(keypress) {
    super();
    const [key, input] = parseKey(keypress);
    this.keypress = keypress;
    this.key = key;
    this.input = input;
  }
}
export {
  InputEvent
};
