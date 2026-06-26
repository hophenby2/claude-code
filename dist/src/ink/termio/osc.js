import { Buffer } from "buffer";
import { env } from "../../utils/env.js";
import { execFileNoThrow } from "../../utils/execFileNoThrow.js";
import { BEL, ESC, ESC_TYPE, SEP } from "./ansi.js";
const OSC_PREFIX = ESC + String.fromCharCode(ESC_TYPE.OSC);
const ST = ESC + "\\";
function osc(...parts) {
  const terminator = env.terminal === "kitty" ? ST : BEL;
  return `${OSC_PREFIX}${parts.join(SEP)}${terminator}`;
}
function wrapForMultiplexer(sequence) {
  if (process.env["TMUX"]) {
    const escaped = sequence.replaceAll("\x1B", "\x1B\x1B");
    return `\x1BPtmux;${escaped}\x1B\\`;
  }
  if (process.env["STY"]) {
    return `\x1BP${sequence}\x1B\\`;
  }
  return sequence;
}
function getClipboardPath() {
  const nativeAvailable = process.platform === "darwin" && !process.env["SSH_CONNECTION"];
  if (nativeAvailable) return "native";
  if (process.env["TMUX"]) return "tmux-buffer";
  return "osc52";
}
function tmuxPassthrough(payload) {
  return `${ESC}Ptmux;${payload.replaceAll(ESC, ESC + ESC)}${ST}`;
}
async function tmuxLoadBuffer(text) {
  if (!process.env["TMUX"]) return false;
  const args = process.env["LC_TERMINAL"] === "iTerm2" ? ["load-buffer", "-"] : ["load-buffer", "-w", "-"];
  const { code } = await execFileNoThrow("tmux", args, {
    input: text,
    useCwd: false,
    timeout: 2e3
  });
  return code === 0;
}
async function setClipboard(text) {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  const raw = osc(OSC.CLIPBOARD, "c", b64);
  if (!process.env["SSH_CONNECTION"]) copyNative(text);
  const tmuxBufferLoaded = await tmuxLoadBuffer(text);
  if (tmuxBufferLoaded) return tmuxPassthrough(`${ESC}]52;c;${b64}${BEL}`);
  return raw;
}
let linuxCopy;
function copyNative(text) {
  const opts = { input: text, useCwd: false, timeout: 2e3 };
  switch (process.platform) {
    case "darwin":
      void execFileNoThrow("pbcopy", [], opts);
      return;
    case "linux": {
      if (linuxCopy === null) return;
      if (linuxCopy === "wl-copy") {
        void execFileNoThrow("wl-copy", [], opts);
        return;
      }
      if (linuxCopy === "xclip") {
        void execFileNoThrow("xclip", ["-selection", "clipboard"], opts);
        return;
      }
      if (linuxCopy === "xsel") {
        void execFileNoThrow("xsel", ["--clipboard", "--input"], opts);
        return;
      }
      void execFileNoThrow("wl-copy", [], opts).then((r) => {
        if (r.code === 0) {
          linuxCopy = "wl-copy";
          return;
        }
        void execFileNoThrow("xclip", ["-selection", "clipboard"], opts).then(
          (r2) => {
            if (r2.code === 0) {
              linuxCopy = "xclip";
              return;
            }
            void execFileNoThrow("xsel", ["--clipboard", "--input"], opts).then(
              (r3) => {
                linuxCopy = r3.code === 0 ? "xsel" : null;
              }
            );
          }
        );
      });
      return;
    }
    case "win32":
      void execFileNoThrow("clip", [], opts);
      return;
  }
}
function _resetLinuxCopyCache() {
  linuxCopy = void 0;
}
const OSC = {
  SET_TITLE_AND_ICON: 0,
  SET_ICON: 1,
  SET_TITLE: 2,
  SET_COLOR: 4,
  SET_CWD: 7,
  HYPERLINK: 8,
  ITERM2: 9,
  // iTerm2 proprietary sequences
  SET_FG_COLOR: 10,
  SET_BG_COLOR: 11,
  SET_CURSOR_COLOR: 12,
  CLIPBOARD: 52,
  KITTY: 99,
  // Kitty notification protocol
  RESET_COLOR: 104,
  RESET_FG_COLOR: 110,
  RESET_BG_COLOR: 111,
  RESET_CURSOR_COLOR: 112,
  SEMANTIC_PROMPT: 133,
  GHOSTTY: 777,
  // Ghostty notification protocol
  TAB_STATUS: 21337
  // Tab status extension
};
function parseOSC(content) {
  const semicolonIdx = content.indexOf(";");
  const command = semicolonIdx >= 0 ? content.slice(0, semicolonIdx) : content;
  const data = semicolonIdx >= 0 ? content.slice(semicolonIdx + 1) : "";
  const commandNum = parseInt(command, 10);
  if (commandNum === OSC.SET_TITLE_AND_ICON) {
    return { type: "title", action: { type: "both", title: data } };
  }
  if (commandNum === OSC.SET_ICON) {
    return { type: "title", action: { type: "iconName", name: data } };
  }
  if (commandNum === OSC.SET_TITLE) {
    return { type: "title", action: { type: "windowTitle", title: data } };
  }
  if (commandNum === OSC.HYPERLINK) {
    const parts = data.split(";");
    const paramsStr = parts[0] ?? "";
    const url = parts.slice(1).join(";");
    if (url === "") {
      return { type: "link", action: { type: "end" } };
    }
    const params = {};
    if (paramsStr) {
      for (const pair of paramsStr.split(":")) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx >= 0) {
          params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
        }
      }
    }
    return {
      type: "link",
      action: {
        type: "start",
        url,
        params: Object.keys(params).length > 0 ? params : void 0
      }
    };
  }
  if (commandNum === OSC.TAB_STATUS) {
    return { type: "tabStatus", action: parseTabStatus(data) };
  }
  return { type: "unknown", sequence: `\x1B]${content}` };
}
function parseOscColor(spec) {
  const hex = spec.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) {
    return {
      type: "rgb",
      r: parseInt(hex[1], 16),
      g: parseInt(hex[2], 16),
      b: parseInt(hex[3], 16)
    };
  }
  const rgb = spec.match(
    /^rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})$/i
  );
  if (rgb) {
    const scale = (s) => Math.round(parseInt(s, 16) / (16 ** s.length - 1) * 255);
    return {
      type: "rgb",
      r: scale(rgb[1]),
      g: scale(rgb[2]),
      b: scale(rgb[3])
    };
  }
  return null;
}
function parseTabStatus(data) {
  const action = {};
  for (const [key, value] of splitTabStatusPairs(data)) {
    switch (key) {
      case "indicator":
        action.indicator = value === "" ? null : parseOscColor(value);
        break;
      case "status":
        action.status = value === "" ? null : value;
        break;
      case "status-color":
        action.statusColor = value === "" ? null : parseOscColor(value);
        break;
    }
  }
  return action;
}
function* splitTabStatusPairs(data) {
  let key = "";
  let val = "";
  let inVal = false;
  let esc = false;
  for (const c of data) {
    if (esc) {
      if (inVal) val += c;
      else key += c;
      esc = false;
    } else if (c === "\\") {
      esc = true;
    } else if (c === ";") {
      yield [key, val];
      key = "";
      val = "";
      inVal = false;
    } else if (c === "=" && !inVal) {
      inVal = true;
    } else if (inVal) {
      val += c;
    } else {
      key += c;
    }
  }
  if (key || inVal) yield [key, val];
}
function link(url, params) {
  if (!url) return LINK_END;
  const p = { id: osc8Id(url), ...params };
  const paramStr = Object.entries(p).map(([k, v]) => `${k}=${v}`).join(":");
  return osc(OSC.HYPERLINK, paramStr, url);
}
function osc8Id(url) {
  let h = 0;
  for (let i = 0; i < url.length; i++)
    h = (h << 5) - h + url.charCodeAt(i) | 0;
  return (h >>> 0).toString(36);
}
const LINK_END = osc(OSC.HYPERLINK, "", "");
const ITERM2 = {
  NOTIFY: 0,
  BADGE: 2,
  PROGRESS: 4
};
const PROGRESS = {
  CLEAR: 0,
  SET: 1,
  ERROR: 2,
  INDETERMINATE: 3
};
const CLEAR_ITERM2_PROGRESS = `${OSC_PREFIX}${OSC.ITERM2};${ITERM2.PROGRESS};${PROGRESS.CLEAR};${BEL}`;
const CLEAR_TERMINAL_TITLE = `${OSC_PREFIX}${OSC.SET_TITLE_AND_ICON};${BEL}`;
const CLEAR_TAB_STATUS = osc(
  OSC.TAB_STATUS,
  "indicator=;status=;status-color="
);
function supportsTabStatus() {
  return process.env.USER_TYPE === "ant";
}
function tabStatus(fields) {
  const parts = [];
  const rgb = (c) => c.type === "rgb" ? `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, "0")).join("")}` : "";
  if ("indicator" in fields)
    parts.push(`indicator=${fields.indicator ? rgb(fields.indicator) : ""}`);
  if ("status" in fields)
    parts.push(
      `status=${fields.status?.replaceAll("\\", "\\\\").replaceAll(";", "\\;") ?? ""}`
    );
  if ("statusColor" in fields)
    parts.push(
      `status-color=${fields.statusColor ? rgb(fields.statusColor) : ""}`
    );
  return osc(OSC.TAB_STATUS, parts.join(";"));
}
export {
  CLEAR_ITERM2_PROGRESS,
  CLEAR_TAB_STATUS,
  CLEAR_TERMINAL_TITLE,
  ITERM2,
  LINK_END,
  OSC,
  OSC_PREFIX,
  PROGRESS,
  ST,
  _resetLinuxCopyCache,
  getClipboardPath,
  link,
  osc,
  parseOSC,
  parseOscColor,
  setClipboard,
  supportsTabStatus,
  tabStatus,
  tmuxLoadBuffer,
  wrapForMultiplexer
};
