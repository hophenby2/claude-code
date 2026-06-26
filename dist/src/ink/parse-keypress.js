import { Buffer } from "buffer";
import { PASTE_END, PASTE_START } from "./termio/csi.js";
import { createTokenizer } from "./termio/tokenize.js";
const META_KEY_CODE_RE = /^(?:\x1b)([a-zA-Z0-9])$/;
const FN_KEY_RE = (
  // eslint-disable-next-line no-control-regex
  /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/
);
const CSI_U_RE = /^\x1b\[(\d+)(?:;(\d+))?u/;
const MODIFY_OTHER_KEYS_RE = /^\x1b\[27;(\d+);(\d+)~/;
const DECRPM_RE = /^\x1b\[\?(\d+);(\d+)\$y$/;
const DA1_RE = /^\x1b\[\?([\d;]*)c$/;
const DA2_RE = /^\x1b\[>([\d;]*)c$/;
const KITTY_FLAGS_RE = /^\x1b\[\?(\d+)u$/;
const CURSOR_POSITION_RE = /^\x1b\[\?(\d+);(\d+)R$/;
const OSC_RESPONSE_RE = /^\x1b\](\d+);(.*?)(?:\x07|\x1b\\)$/s;
const XTVERSION_RE = /^\x1bP>\|(.*?)(?:\x07|\x1b\\)$/s;
const SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;
function createPasteKey(content) {
  return {
    kind: "key",
    name: "",
    fn: false,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    super: false,
    sequence: content,
    raw: content,
    isPasted: true
  };
}
const DECRPM_STATUS = {
  NOT_RECOGNIZED: 0,
  SET: 1,
  RESET: 2,
  PERMANENTLY_SET: 3,
  PERMANENTLY_RESET: 4
};
function parseTerminalResponse(s) {
  if (s.startsWith("\x1B[")) {
    let m;
    if (m = DECRPM_RE.exec(s)) {
      return {
        type: "decrpm",
        mode: parseInt(m[1], 10),
        status: parseInt(m[2], 10)
      };
    }
    if (m = DA1_RE.exec(s)) {
      return { type: "da1", params: splitNumericParams(m[1]) };
    }
    if (m = DA2_RE.exec(s)) {
      return { type: "da2", params: splitNumericParams(m[1]) };
    }
    if (m = KITTY_FLAGS_RE.exec(s)) {
      return { type: "kittyKeyboard", flags: parseInt(m[1], 10) };
    }
    if (m = CURSOR_POSITION_RE.exec(s)) {
      return {
        type: "cursorPosition",
        row: parseInt(m[1], 10),
        col: parseInt(m[2], 10)
      };
    }
    return null;
  }
  if (s.startsWith("\x1B]")) {
    const m = OSC_RESPONSE_RE.exec(s);
    if (m) {
      return { type: "osc", code: parseInt(m[1], 10), data: m[2] };
    }
  }
  if (s.startsWith("\x1BP")) {
    const m = XTVERSION_RE.exec(s);
    if (m) {
      return { type: "xtversion", name: m[1] };
    }
  }
  return null;
}
function splitNumericParams(params) {
  if (!params) return [];
  return params.split(";").map((p) => parseInt(p, 10));
}
const INITIAL_STATE = {
  mode: "NORMAL",
  incomplete: "",
  pasteBuffer: ""
};
function inputToString(input) {
  if (Buffer.isBuffer(input)) {
    if (input[0] > 127 && input[1] === void 0) {
      ;
      input[0] -= 128;
      return "\x1B" + String(input);
    } else {
      return String(input);
    }
  } else if (input !== void 0 && typeof input !== "string") {
    return String(input);
  } else if (!input) {
    return "";
  } else {
    return input;
  }
}
function parseMultipleKeypresses(prevState, input = "") {
  const isFlush = input === null;
  const inputString = isFlush ? "" : inputToString(input);
  const tokenizer = prevState._tokenizer ?? createTokenizer({ x10Mouse: true });
  const tokens = isFlush ? tokenizer.flush() : tokenizer.feed(inputString);
  const keys = [];
  let inPaste = prevState.mode === "IN_PASTE";
  let pasteBuffer = prevState.pasteBuffer;
  for (const token of tokens) {
    if (token.type === "sequence") {
      if (token.value === PASTE_START) {
        inPaste = true;
        pasteBuffer = "";
      } else if (token.value === PASTE_END) {
        keys.push(createPasteKey(pasteBuffer));
        inPaste = false;
        pasteBuffer = "";
      } else if (inPaste) {
        pasteBuffer += token.value;
      } else {
        const response = parseTerminalResponse(token.value);
        if (response) {
          keys.push({ kind: "response", sequence: token.value, response });
        } else {
          const mouse = parseMouseEvent(token.value);
          if (mouse) {
            keys.push(mouse);
          } else {
            keys.push(parseKeypress(token.value));
          }
        }
      }
    } else if (token.type === "text") {
      if (inPaste) {
        pasteBuffer += token.value;
      } else if (/^\[<\d+;\d+;\d+[Mm]$/.test(token.value) || /^\[M[\x60-\x7f][\x20-\uffff]{2}$/.test(token.value)) {
        const resynthesized = "\x1B" + token.value;
        const mouse = parseMouseEvent(resynthesized);
        keys.push(mouse ?? parseKeypress(resynthesized));
      } else {
        keys.push(parseKeypress(token.value));
      }
    }
  }
  if (isFlush && inPaste && pasteBuffer) {
    keys.push(createPasteKey(pasteBuffer));
    inPaste = false;
    pasteBuffer = "";
  }
  const newState = {
    mode: inPaste ? "IN_PASTE" : "NORMAL",
    incomplete: tokenizer.buffer(),
    pasteBuffer,
    _tokenizer: tokenizer
  };
  return [keys, newState];
}
const keyName = {
  /* xterm/gnome ESC O letter */
  OP: "f1",
  OQ: "f2",
  OR: "f3",
  OS: "f4",
  /* Application keypad mode (numpad digits 0-9) */
  Op: "0",
  Oq: "1",
  Or: "2",
  Os: "3",
  Ot: "4",
  Ou: "5",
  Ov: "6",
  Ow: "7",
  Ox: "8",
  Oy: "9",
  /* Application keypad mode (numpad operators) */
  Oj: "*",
  Ok: "+",
  Ol: ",",
  Om: "-",
  On: ".",
  Oo: "/",
  OM: "return",
  /* xterm/rxvt ESC [ number ~ */
  "[11~": "f1",
  "[12~": "f2",
  "[13~": "f3",
  "[14~": "f4",
  /* from Cygwin and used in libuv */
  "[[A": "f1",
  "[[B": "f2",
  "[[C": "f3",
  "[[D": "f4",
  "[[E": "f5",
  /* common */
  "[15~": "f5",
  "[17~": "f6",
  "[18~": "f7",
  "[19~": "f8",
  "[20~": "f9",
  "[21~": "f10",
  "[23~": "f11",
  "[24~": "f12",
  /* xterm ESC [ letter */
  "[A": "up",
  "[B": "down",
  "[C": "right",
  "[D": "left",
  "[E": "clear",
  "[F": "end",
  "[H": "home",
  /* xterm/gnome ESC O letter */
  OA: "up",
  OB: "down",
  OC: "right",
  OD: "left",
  OE: "clear",
  OF: "end",
  OH: "home",
  /* xterm/rxvt ESC [ number ~ */
  "[1~": "home",
  "[2~": "insert",
  "[3~": "delete",
  "[4~": "end",
  "[5~": "pageup",
  "[6~": "pagedown",
  /* putty */
  "[[5~": "pageup",
  "[[6~": "pagedown",
  /* rxvt */
  "[7~": "home",
  "[8~": "end",
  /* rxvt keys with modifiers */
  "[a": "up",
  "[b": "down",
  "[c": "right",
  "[d": "left",
  "[e": "clear",
  "[2$": "insert",
  "[3$": "delete",
  "[5$": "pageup",
  "[6$": "pagedown",
  "[7$": "home",
  "[8$": "end",
  Oa: "up",
  Ob: "down",
  Oc: "right",
  Od: "left",
  Oe: "clear",
  "[2^": "insert",
  "[3^": "delete",
  "[5^": "pageup",
  "[6^": "pagedown",
  "[7^": "home",
  "[8^": "end",
  /* misc. */
  "[Z": "tab"
};
const nonAlphanumericKeys = [
  // Filter out single-character values (digits, operators from numpad) since
  // those are printable characters that should produce input
  ...Object.values(keyName).filter((v) => v.length > 1),
  // escape and backspace are assigned directly in parseKeypress (not via the
  // keyName map), so the spread above misses them. Without these, ctrl+escape
  // via Kitty/modifyOtherKeys leaks the literal word "escape" as input text
  // (input-event.ts:58 assigns keypress.name when ctrl is set).
  "escape",
  "backspace",
  "wheelup",
  "wheeldown",
  "mouse"
];
const isShiftKey = (code) => {
  return [
    "[a",
    "[b",
    "[c",
    "[d",
    "[e",
    "[2$",
    "[3$",
    "[5$",
    "[6$",
    "[7$",
    "[8$",
    "[Z"
  ].includes(code);
};
const isCtrlKey = (code) => {
  return [
    "Oa",
    "Ob",
    "Oc",
    "Od",
    "Oe",
    "[2^",
    "[3^",
    "[5^",
    "[6^",
    "[7^",
    "[8^"
  ].includes(code);
};
function decodeModifier(modifier) {
  const m = modifier - 1;
  return {
    shift: !!(m & 1),
    meta: !!(m & 2),
    ctrl: !!(m & 4),
    super: !!(m & 8)
  };
}
function keycodeToName(keycode) {
  switch (keycode) {
    case 9:
      return "tab";
    case 13:
      return "return";
    case 27:
      return "escape";
    case 32:
      return "space";
    case 127:
      return "backspace";
    // Kitty keyboard protocol numpad keys (KP_0 through KP_9)
    case 57399:
      return "0";
    case 57400:
      return "1";
    case 57401:
      return "2";
    case 57402:
      return "3";
    case 57403:
      return "4";
    case 57404:
      return "5";
    case 57405:
      return "6";
    case 57406:
      return "7";
    case 57407:
      return "8";
    case 57408:
      return "9";
    case 57409:
      return ".";
    case 57410:
      return "/";
    case 57411:
      return "*";
    case 57412:
      return "-";
    case 57413:
      return "+";
    case 57414:
      return "return";
    case 57415:
      return "=";
    default:
      if (keycode >= 32 && keycode <= 126) {
        return String.fromCharCode(keycode).toLowerCase();
      }
      return void 0;
  }
}
function parseMouseEvent(s) {
  const match = SGR_MOUSE_RE.exec(s);
  if (!match) return null;
  const button = parseInt(match[1], 10);
  if ((button & 64) !== 0) return null;
  return {
    kind: "mouse",
    button,
    action: match[4] === "M" ? "press" : "release",
    col: parseInt(match[2], 10),
    row: parseInt(match[3], 10),
    sequence: s
  };
}
function parseKeypress(s = "") {
  let parts;
  const key = {
    kind: "key",
    name: "",
    fn: false,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    super: false,
    sequence: s,
    raw: s,
    isPasted: false
  };
  key.sequence = key.sequence || s || key.name;
  let match;
  if (match = CSI_U_RE.exec(s)) {
    const codepoint = parseInt(match[1], 10);
    const modifier = match[2] ? parseInt(match[2], 10) : 1;
    const mods = decodeModifier(modifier);
    const name = keycodeToName(codepoint);
    return {
      kind: "key",
      name,
      fn: false,
      ctrl: mods.ctrl,
      meta: mods.meta,
      shift: mods.shift,
      option: false,
      super: mods.super,
      sequence: s,
      raw: s,
      isPasted: false
    };
  }
  if (match = MODIFY_OTHER_KEYS_RE.exec(s)) {
    const mods = decodeModifier(parseInt(match[1], 10));
    const name = keycodeToName(parseInt(match[2], 10));
    return {
      kind: "key",
      name,
      fn: false,
      ctrl: mods.ctrl,
      meta: mods.meta,
      shift: mods.shift,
      option: false,
      super: mods.super,
      sequence: s,
      raw: s,
      isPasted: false
    };
  }
  if (match = SGR_MOUSE_RE.exec(s)) {
    const button = parseInt(match[1], 10);
    if ((button & 67) === 64) return createNavKey(s, "wheelup", false);
    if ((button & 67) === 65) return createNavKey(s, "wheeldown", false);
    return createNavKey(s, "mouse", false);
  }
  if (s.length === 6 && s.startsWith("\x1B[M")) {
    const button = s.charCodeAt(3) - 32;
    if ((button & 67) === 64) return createNavKey(s, "wheelup", false);
    if ((button & 67) === 65) return createNavKey(s, "wheeldown", false);
    return createNavKey(s, "mouse", false);
  }
  if (s === "\r") {
    key.raw = void 0;
    key.name = "return";
  } else if (s === "\n") {
    key.name = "enter";
  } else if (s === "	") {
    key.name = "tab";
  } else if (s === "\b" || s === "\x1B\b") {
    key.name = "backspace";
    key.meta = s.charAt(0) === "\x1B";
  } else if (s === "\x7F" || s === "\x1B\x7F") {
    key.name = "backspace";
    key.meta = s.charAt(0) === "\x1B";
  } else if (s === "\x1B" || s === "\x1B\x1B") {
    key.name = "escape";
    key.meta = s.length === 2;
  } else if (s === " " || s === "\x1B ") {
    key.name = "space";
    key.meta = s.length === 2;
  } else if (s === "") {
    key.name = "_";
    key.ctrl = true;
  } else if (s <= "" && s.length === 1) {
    key.name = String.fromCharCode(s.charCodeAt(0) + "a".charCodeAt(0) - 1);
    key.ctrl = true;
  } else if (s.length === 1 && s >= "0" && s <= "9") {
    key.name = "number";
  } else if (s.length === 1 && s >= "a" && s <= "z") {
    key.name = s;
  } else if (s.length === 1 && s >= "A" && s <= "Z") {
    key.name = s.toLowerCase();
    key.shift = true;
  } else if (parts = META_KEY_CODE_RE.exec(s)) {
    key.meta = true;
    key.shift = /^[A-Z]$/.test(parts[1]);
  } else if (parts = FN_KEY_RE.exec(s)) {
    const segs = [...s];
    if (segs[0] === "\x1B" && segs[1] === "\x1B") {
      key.option = true;
    }
    const code = [parts[1], parts[2], parts[4], parts[6]].filter(Boolean).join("");
    const modifier = (parts[3] || parts[5] || 1) - 1;
    key.ctrl = !!(modifier & 4);
    key.meta = !!(modifier & 2);
    key.super = !!(modifier & 8);
    key.shift = !!(modifier & 1);
    key.code = code;
    key.name = keyName[code];
    key.shift = isShiftKey(code) || key.shift;
    key.ctrl = isCtrlKey(code) || key.ctrl;
  }
  if (key.raw === "\x1Bb") {
    key.meta = true;
    key.name = "left";
  } else if (key.raw === "\x1Bf") {
    key.meta = true;
    key.name = "right";
  }
  switch (s) {
    case "\x1B[1~":
      return createNavKey(s, "home", false);
    case "\x1B[4~":
      return createNavKey(s, "end", false);
    case "\x1B[5~":
      return createNavKey(s, "pageup", false);
    case "\x1B[6~":
      return createNavKey(s, "pagedown", false);
    case "\x1B[1;5D":
      return createNavKey(s, "left", true);
    case "\x1B[1;5C":
      return createNavKey(s, "right", true);
  }
  return key;
}
function createNavKey(s, name, ctrl) {
  return {
    kind: "key",
    name,
    ctrl,
    meta: false,
    shift: false,
    option: false,
    super: false,
    fn: false,
    sequence: s,
    raw: s,
    isPasted: false
  };
}
export {
  DECRPM_STATUS,
  INITIAL_STATE,
  nonAlphanumericKeys,
  parseMultipleKeypresses
};
