import { csi } from "./csi.js";
const DEC = {
  CURSOR_VISIBLE: 25,
  ALT_SCREEN: 47,
  ALT_SCREEN_CLEAR: 1049,
  MOUSE_NORMAL: 1e3,
  MOUSE_BUTTON: 1002,
  MOUSE_ANY: 1003,
  MOUSE_SGR: 1006,
  FOCUS_EVENTS: 1004,
  BRACKETED_PASTE: 2004,
  SYNCHRONIZED_UPDATE: 2026
};
function decset(mode) {
  return csi(`?${mode}h`);
}
function decreset(mode) {
  return csi(`?${mode}l`);
}
const BSU = decset(DEC.SYNCHRONIZED_UPDATE);
const ESU = decreset(DEC.SYNCHRONIZED_UPDATE);
const EBP = decset(DEC.BRACKETED_PASTE);
const DBP = decreset(DEC.BRACKETED_PASTE);
const EFE = decset(DEC.FOCUS_EVENTS);
const DFE = decreset(DEC.FOCUS_EVENTS);
const SHOW_CURSOR = decset(DEC.CURSOR_VISIBLE);
const HIDE_CURSOR = decreset(DEC.CURSOR_VISIBLE);
const ENTER_ALT_SCREEN = decset(DEC.ALT_SCREEN_CLEAR);
const EXIT_ALT_SCREEN = decreset(DEC.ALT_SCREEN_CLEAR);
const ENABLE_MOUSE_TRACKING = decset(DEC.MOUSE_NORMAL) + decset(DEC.MOUSE_BUTTON) + decset(DEC.MOUSE_ANY) + decset(DEC.MOUSE_SGR);
const DISABLE_MOUSE_TRACKING = decreset(DEC.MOUSE_SGR) + decreset(DEC.MOUSE_ANY) + decreset(DEC.MOUSE_BUTTON) + decreset(DEC.MOUSE_NORMAL);
export {
  BSU,
  DBP,
  DEC,
  DFE,
  DISABLE_MOUSE_TRACKING,
  EBP,
  EFE,
  ENABLE_MOUSE_TRACKING,
  ENTER_ALT_SCREEN,
  ESU,
  EXIT_ALT_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR,
  decreset,
  decset
};
