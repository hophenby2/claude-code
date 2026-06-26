import { coerce } from "semver";
import { env } from "../utils/env.js";
import { gte } from "../utils/semver.js";
import { getClearTerminalSequence } from "./clearTerminal.js";
import { cursorMove, cursorTo, eraseLines } from "./termio/csi.js";
import { BSU, ESU, HIDE_CURSOR, SHOW_CURSOR } from "./termio/dec.js";
import { link } from "./termio/osc.js";
function isProgressReportingAvailable() {
  if (!process.stdout.isTTY) {
    return false;
  }
  if (process.env.WT_SESSION) {
    return false;
  }
  if (process.env.ConEmuANSI || process.env.ConEmuPID || process.env.ConEmuTask) {
    return true;
  }
  const version = coerce(process.env.TERM_PROGRAM_VERSION);
  if (!version) {
    return false;
  }
  if (process.env.TERM_PROGRAM === "ghostty") {
    return gte(version.version, "1.2.0");
  }
  if (process.env.TERM_PROGRAM === "iTerm.app") {
    return gte(version.version, "3.6.6");
  }
  return false;
}
function isSynchronizedOutputSupported() {
  if (process.env.TMUX) return false;
  const termProgram = process.env.TERM_PROGRAM;
  const term = process.env.TERM;
  if (termProgram === "iTerm.app" || termProgram === "WezTerm" || termProgram === "WarpTerminal" || termProgram === "ghostty" || termProgram === "contour" || termProgram === "vscode" || termProgram === "alacritty") {
    return true;
  }
  if (term?.includes("kitty") || process.env.KITTY_WINDOW_ID) return true;
  if (term === "xterm-ghostty") return true;
  if (term?.startsWith("foot")) return true;
  if (term?.includes("alacritty")) return true;
  if (process.env.ZED_TERM) return true;
  if (process.env.WT_SESSION) return true;
  const vteVersion = process.env.VTE_VERSION;
  if (vteVersion) {
    const version = parseInt(vteVersion, 10);
    if (version >= 6800) return true;
  }
  return false;
}
let xtversionName;
function setXtversionName(name) {
  if (xtversionName === void 0) xtversionName = name;
}
function isXtermJs() {
  if (process.env.TERM_PROGRAM === "vscode") return true;
  return xtversionName?.startsWith("xterm.js") ?? false;
}
const EXTENDED_KEYS_TERMINALS = [
  "iTerm.app",
  "kitty",
  "WezTerm",
  "ghostty",
  "tmux",
  "windows-terminal"
];
function supportsExtendedKeys() {
  return EXTENDED_KEYS_TERMINALS.includes(env.terminal ?? "");
}
function hasCursorUpViewportYankBug() {
  return process.platform === "win32" || !!process.env.WT_SESSION;
}
const SYNC_OUTPUT_SUPPORTED = isSynchronizedOutputSupported();
function writeDiffToTerminal(terminal, diff, skipSyncMarkers = false) {
  if (diff.length === 0) {
    return;
  }
  const useSync = !skipSyncMarkers;
  let buffer = useSync ? BSU : "";
  for (const patch of diff) {
    switch (patch.type) {
      case "stdout":
        buffer += patch.content;
        break;
      case "clear":
        if (patch.count > 0) {
          buffer += eraseLines(patch.count);
        }
        break;
      case "clearTerminal":
        buffer += getClearTerminalSequence();
        break;
      case "cursorHide":
        buffer += HIDE_CURSOR;
        break;
      case "cursorShow":
        buffer += SHOW_CURSOR;
        break;
      case "cursorMove":
        buffer += cursorMove(patch.x, patch.y);
        break;
      case "cursorTo":
        buffer += cursorTo(patch.col);
        break;
      case "carriageReturn":
        buffer += "\r";
        break;
      case "hyperlink":
        buffer += link(patch.uri);
        break;
      case "styleStr":
        buffer += patch.str;
        break;
    }
  }
  if (useSync) buffer += ESU;
  terminal.stdout.write(buffer);
}
export {
  SYNC_OUTPUT_SUPPORTED,
  hasCursorUpViewportYankBug,
  isProgressReportingAvailable,
  isSynchronizedOutputSupported,
  isXtermJs,
  setXtversionName,
  supportsExtendedKeys,
  writeDiffToTerminal
};
