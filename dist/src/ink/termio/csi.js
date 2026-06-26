import { ESC, ESC_TYPE, SEP } from "./ansi.js";
const CSI_PREFIX = ESC + String.fromCharCode(ESC_TYPE.CSI);
const CSI_RANGE = {
  PARAM_START: 48,
  PARAM_END: 63,
  INTERMEDIATE_START: 32,
  INTERMEDIATE_END: 47,
  FINAL_START: 64,
  FINAL_END: 126
};
function isCSIParam(byte) {
  return byte >= CSI_RANGE.PARAM_START && byte <= CSI_RANGE.PARAM_END;
}
function isCSIIntermediate(byte) {
  return byte >= CSI_RANGE.INTERMEDIATE_START && byte <= CSI_RANGE.INTERMEDIATE_END;
}
function isCSIFinal(byte) {
  return byte >= CSI_RANGE.FINAL_START && byte <= CSI_RANGE.FINAL_END;
}
function csi(...args) {
  if (args.length === 0) return CSI_PREFIX;
  if (args.length === 1) return `${CSI_PREFIX}${args[0]}`;
  const params = args.slice(0, -1);
  const final = args[args.length - 1];
  return `${CSI_PREFIX}${params.join(SEP)}${final}`;
}
const CSI = {
  // Cursor movement
  CUU: 65,
  // A - Cursor Up
  CUD: 66,
  // B - Cursor Down
  CUF: 67,
  // C - Cursor Forward
  CUB: 68,
  // D - Cursor Back
  CNL: 69,
  // E - Cursor Next Line
  CPL: 70,
  // F - Cursor Previous Line
  CHA: 71,
  // G - Cursor Horizontal Absolute
  CUP: 72,
  // H - Cursor Position
  CHT: 73,
  // I - Cursor Horizontal Tab
  VPA: 100,
  // d - Vertical Position Absolute
  HVP: 102,
  // f - Horizontal Vertical Position
  // Erase
  ED: 74,
  // J - Erase in Display
  EL: 75,
  // K - Erase in Line
  ECH: 88,
  // X - Erase Character
  // Insert/Delete
  IL: 76,
  // L - Insert Lines
  DL: 77,
  // M - Delete Lines
  ICH: 64,
  // @ - Insert Characters
  DCH: 80,
  // P - Delete Characters
  // Scroll
  SU: 83,
  // S - Scroll Up
  SD: 84,
  // T - Scroll Down
  // Modes
  SM: 104,
  // h - Set Mode
  RM: 108,
  // l - Reset Mode
  // SGR
  SGR: 109,
  // m - Select Graphic Rendition
  // Other
  DSR: 110,
  // n - Device Status Report
  DECSCUSR: 113,
  // q - Set Cursor Style (with space intermediate)
  DECSTBM: 114,
  // r - Set Top and Bottom Margins
  SCOSC: 115,
  // s - Save Cursor Position
  SCORC: 117,
  // u - Restore Cursor Position
  CBT: 90
  // Z - Cursor Backward Tabulation
};
const ERASE_DISPLAY = ["toEnd", "toStart", "all", "scrollback"];
const ERASE_LINE_REGION = ["toEnd", "toStart", "all"];
const CURSOR_STYLES = [
  { style: "block", blinking: true },
  // 0 - default
  { style: "block", blinking: true },
  // 1
  { style: "block", blinking: false },
  // 2
  { style: "underline", blinking: true },
  // 3
  { style: "underline", blinking: false },
  // 4
  { style: "bar", blinking: true },
  // 5
  { style: "bar", blinking: false }
  // 6
];
function cursorUp(n = 1) {
  return n === 0 ? "" : csi(n, "A");
}
function cursorDown(n = 1) {
  return n === 0 ? "" : csi(n, "B");
}
function cursorForward(n = 1) {
  return n === 0 ? "" : csi(n, "C");
}
function cursorBack(n = 1) {
  return n === 0 ? "" : csi(n, "D");
}
function cursorTo(col) {
  return csi(col, "G");
}
const CURSOR_LEFT = csi("G");
function cursorPosition(row, col) {
  return csi(row, col, "H");
}
const CURSOR_HOME = csi("H");
function cursorMove(x, y) {
  let result = "";
  if (x < 0) {
    result += cursorBack(-x);
  } else if (x > 0) {
    result += cursorForward(x);
  }
  if (y < 0) {
    result += cursorUp(-y);
  } else if (y > 0) {
    result += cursorDown(y);
  }
  return result;
}
const CURSOR_SAVE = csi("s");
const CURSOR_RESTORE = csi("u");
function eraseToEndOfLine() {
  return csi("K");
}
function eraseToStartOfLine() {
  return csi(1, "K");
}
function eraseLine() {
  return csi(2, "K");
}
const ERASE_LINE = csi(2, "K");
function eraseToEndOfScreen() {
  return csi("J");
}
function eraseToStartOfScreen() {
  return csi(1, "J");
}
function eraseScreen() {
  return csi(2, "J");
}
const ERASE_SCREEN = csi(2, "J");
const ERASE_SCROLLBACK = csi(3, "J");
function eraseLines(n) {
  if (n <= 0) return "";
  let result = "";
  for (let i = 0; i < n; i++) {
    result += ERASE_LINE;
    if (i < n - 1) {
      result += cursorUp(1);
    }
  }
  result += CURSOR_LEFT;
  return result;
}
function scrollUp(n = 1) {
  return n === 0 ? "" : csi(n, "S");
}
function scrollDown(n = 1) {
  return n === 0 ? "" : csi(n, "T");
}
function setScrollRegion(top, bottom) {
  return csi(top, bottom, "r");
}
const RESET_SCROLL_REGION = csi("r");
const PASTE_START = csi("200~");
const PASTE_END = csi("201~");
const FOCUS_IN = csi("I");
const FOCUS_OUT = csi("O");
const ENABLE_KITTY_KEYBOARD = csi(">1u");
const DISABLE_KITTY_KEYBOARD = csi("<u");
const ENABLE_MODIFY_OTHER_KEYS = csi(">4;2m");
const DISABLE_MODIFY_OTHER_KEYS = csi(">4m");
export {
  CSI,
  CSI_PREFIX,
  CSI_RANGE,
  CURSOR_HOME,
  CURSOR_LEFT,
  CURSOR_RESTORE,
  CURSOR_SAVE,
  CURSOR_STYLES,
  DISABLE_KITTY_KEYBOARD,
  DISABLE_MODIFY_OTHER_KEYS,
  ENABLE_KITTY_KEYBOARD,
  ENABLE_MODIFY_OTHER_KEYS,
  ERASE_DISPLAY,
  ERASE_LINE,
  ERASE_LINE_REGION,
  ERASE_SCREEN,
  ERASE_SCROLLBACK,
  FOCUS_IN,
  FOCUS_OUT,
  PASTE_END,
  PASTE_START,
  RESET_SCROLL_REGION,
  csi,
  cursorBack,
  cursorDown,
  cursorForward,
  cursorMove,
  cursorPosition,
  cursorTo,
  cursorUp,
  eraseLine,
  eraseLines,
  eraseScreen,
  eraseToEndOfLine,
  eraseToEndOfScreen,
  eraseToStartOfLine,
  eraseToStartOfScreen,
  isCSIFinal,
  isCSIIntermediate,
  isCSIParam,
  scrollDown,
  scrollUp,
  setScrollRegion
};
