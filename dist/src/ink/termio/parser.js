import { getGraphemeSegmenter } from "../../utils/intl.js";
import { C0 } from "./ansi.js";
import { CSI, CURSOR_STYLES, ERASE_DISPLAY, ERASE_LINE_REGION } from "./csi.js";
import { DEC } from "./dec.js";
import { parseEsc } from "./esc.js";
import { parseOSC } from "./osc.js";
import { applySGR } from "./sgr.js";
import { createTokenizer } from "./tokenize.js";
import { defaultStyle } from "./types.js";
function isEmoji(codePoint) {
  return codePoint >= 9728 && codePoint <= 9983 || codePoint >= 9984 && codePoint <= 10175 || codePoint >= 127744 && codePoint <= 129535 || codePoint >= 129536 && codePoint <= 129791 || codePoint >= 127456 && codePoint <= 127487;
}
function isEastAsianWide(codePoint) {
  return codePoint >= 4352 && codePoint <= 4447 || codePoint >= 11904 && codePoint <= 40959 || codePoint >= 44032 && codePoint <= 55203 || codePoint >= 63744 && codePoint <= 64255 || codePoint >= 65040 && codePoint <= 65055 || codePoint >= 65072 && codePoint <= 65135 || codePoint >= 65280 && codePoint <= 65376 || codePoint >= 65504 && codePoint <= 65510 || codePoint >= 131072 && codePoint <= 196605 || codePoint >= 196608 && codePoint <= 262141;
}
function hasMultipleCodepoints(str) {
  let count = 0;
  for (const _ of str) {
    count++;
    if (count > 1) return true;
  }
  return false;
}
function graphemeWidth(grapheme) {
  if (hasMultipleCodepoints(grapheme)) return 2;
  const codePoint = grapheme.codePointAt(0);
  if (codePoint === void 0) return 1;
  if (isEmoji(codePoint) || isEastAsianWide(codePoint)) return 2;
  return 1;
}
function* segmentGraphemes(str) {
  for (const { segment } of getGraphemeSegmenter().segment(str)) {
    yield { value: segment, width: graphemeWidth(segment) };
  }
}
function parseCSIParams(paramStr) {
  if (paramStr === "") return [];
  return paramStr.split(/[;:]/).map((s) => s === "" ? 0 : parseInt(s, 10));
}
function parseCSI(rawSequence) {
  const inner = rawSequence.slice(2);
  if (inner.length === 0) return null;
  const finalByte = inner.charCodeAt(inner.length - 1);
  const beforeFinal = inner.slice(0, -1);
  let privateMode = "";
  let paramStr = beforeFinal;
  let intermediate = "";
  if (beforeFinal.length > 0 && "?>=".includes(beforeFinal[0])) {
    privateMode = beforeFinal[0];
    paramStr = beforeFinal.slice(1);
  }
  const intermediateMatch = paramStr.match(/([^0-9;:]+)$/);
  if (intermediateMatch) {
    intermediate = intermediateMatch[1];
    paramStr = paramStr.slice(0, -intermediate.length);
  }
  const params = parseCSIParams(paramStr);
  const p0 = params[0] ?? 1;
  const p1 = params[1] ?? 1;
  if (finalByte === CSI.SGR && privateMode === "") {
    return { type: "sgr", params: paramStr };
  }
  if (finalByte === CSI.CUU) {
    return {
      type: "cursor",
      action: { type: "move", direction: "up", count: p0 }
    };
  }
  if (finalByte === CSI.CUD) {
    return {
      type: "cursor",
      action: { type: "move", direction: "down", count: p0 }
    };
  }
  if (finalByte === CSI.CUF) {
    return {
      type: "cursor",
      action: { type: "move", direction: "forward", count: p0 }
    };
  }
  if (finalByte === CSI.CUB) {
    return {
      type: "cursor",
      action: { type: "move", direction: "back", count: p0 }
    };
  }
  if (finalByte === CSI.CNL) {
    return { type: "cursor", action: { type: "nextLine", count: p0 } };
  }
  if (finalByte === CSI.CPL) {
    return { type: "cursor", action: { type: "prevLine", count: p0 } };
  }
  if (finalByte === CSI.CHA) {
    return { type: "cursor", action: { type: "column", col: p0 } };
  }
  if (finalByte === CSI.CUP || finalByte === CSI.HVP) {
    return { type: "cursor", action: { type: "position", row: p0, col: p1 } };
  }
  if (finalByte === CSI.VPA) {
    return { type: "cursor", action: { type: "row", row: p0 } };
  }
  if (finalByte === CSI.ED) {
    const region = ERASE_DISPLAY[params[0] ?? 0] ?? "toEnd";
    return { type: "erase", action: { type: "display", region } };
  }
  if (finalByte === CSI.EL) {
    const region = ERASE_LINE_REGION[params[0] ?? 0] ?? "toEnd";
    return { type: "erase", action: { type: "line", region } };
  }
  if (finalByte === CSI.ECH) {
    return { type: "erase", action: { type: "chars", count: p0 } };
  }
  if (finalByte === CSI.SU) {
    return { type: "scroll", action: { type: "up", count: p0 } };
  }
  if (finalByte === CSI.SD) {
    return { type: "scroll", action: { type: "down", count: p0 } };
  }
  if (finalByte === CSI.DECSTBM) {
    return {
      type: "scroll",
      action: { type: "setRegion", top: p0, bottom: p1 }
    };
  }
  if (finalByte === CSI.SCOSC) {
    return { type: "cursor", action: { type: "save" } };
  }
  if (finalByte === CSI.SCORC) {
    return { type: "cursor", action: { type: "restore" } };
  }
  if (finalByte === CSI.DECSCUSR && intermediate === " ") {
    const styleInfo = CURSOR_STYLES[p0] ?? CURSOR_STYLES[0];
    return { type: "cursor", action: { type: "style", ...styleInfo } };
  }
  if (privateMode === "?" && (finalByte === CSI.SM || finalByte === CSI.RM)) {
    const enabled = finalByte === CSI.SM;
    if (p0 === DEC.CURSOR_VISIBLE) {
      return {
        type: "cursor",
        action: enabled ? { type: "show" } : { type: "hide" }
      };
    }
    if (p0 === DEC.ALT_SCREEN_CLEAR || p0 === DEC.ALT_SCREEN) {
      return { type: "mode", action: { type: "alternateScreen", enabled } };
    }
    if (p0 === DEC.BRACKETED_PASTE) {
      return { type: "mode", action: { type: "bracketedPaste", enabled } };
    }
    if (p0 === DEC.MOUSE_NORMAL) {
      return {
        type: "mode",
        action: { type: "mouseTracking", mode: enabled ? "normal" : "off" }
      };
    }
    if (p0 === DEC.MOUSE_BUTTON) {
      return {
        type: "mode",
        action: { type: "mouseTracking", mode: enabled ? "button" : "off" }
      };
    }
    if (p0 === DEC.MOUSE_ANY) {
      return {
        type: "mode",
        action: { type: "mouseTracking", mode: enabled ? "any" : "off" }
      };
    }
    if (p0 === DEC.FOCUS_EVENTS) {
      return { type: "mode", action: { type: "focusEvents", enabled } };
    }
  }
  return { type: "unknown", sequence: rawSequence };
}
function identifySequence(seq) {
  if (seq.length < 2) return "unknown";
  if (seq.charCodeAt(0) !== C0.ESC) return "unknown";
  const second = seq.charCodeAt(1);
  if (second === 91) return "csi";
  if (second === 93) return "osc";
  if (second === 79) return "ss3";
  return "esc";
}
class Parser {
  tokenizer = createTokenizer();
  style = defaultStyle();
  inLink = false;
  linkUrl;
  reset() {
    this.tokenizer.reset();
    this.style = defaultStyle();
    this.inLink = false;
    this.linkUrl = void 0;
  }
  /** Feed input and get resulting actions */
  feed(input) {
    const tokens = this.tokenizer.feed(input);
    const actions = [];
    for (const token of tokens) {
      const tokenActions = this.processToken(token);
      actions.push(...tokenActions);
    }
    return actions;
  }
  processToken(token) {
    switch (token.type) {
      case "text":
        return this.processText(token.value);
      case "sequence":
        return this.processSequence(token.value);
    }
  }
  processText(text) {
    const actions = [];
    let current = "";
    for (const char of text) {
      if (char.charCodeAt(0) === C0.BEL) {
        if (current) {
          const graphemes = [...segmentGraphemes(current)];
          if (graphemes.length > 0) {
            actions.push({ type: "text", graphemes, style: { ...this.style } });
          }
          current = "";
        }
        actions.push({ type: "bell" });
      } else {
        current += char;
      }
    }
    if (current) {
      const graphemes = [...segmentGraphemes(current)];
      if (graphemes.length > 0) {
        actions.push({ type: "text", graphemes, style: { ...this.style } });
      }
    }
    return actions;
  }
  processSequence(seq) {
    const seqType = identifySequence(seq);
    switch (seqType) {
      case "csi": {
        const action = parseCSI(seq);
        if (!action) return [];
        if (action.type === "sgr") {
          this.style = applySGR(action.params, this.style);
          return [];
        }
        return [action];
      }
      case "osc": {
        let content = seq.slice(2);
        if (content.endsWith("\x07")) {
          content = content.slice(0, -1);
        } else if (content.endsWith("\x1B\\")) {
          content = content.slice(0, -2);
        }
        const action = parseOSC(content);
        if (action) {
          if (action.type === "link") {
            if (action.action.type === "start") {
              this.inLink = true;
              this.linkUrl = action.action.url;
            } else {
              this.inLink = false;
              this.linkUrl = void 0;
            }
          }
          return [action];
        }
        return [];
      }
      case "esc": {
        const escContent = seq.slice(1);
        const action = parseEsc(escContent);
        return action ? [action] : [];
      }
      case "ss3":
        return [{ type: "unknown", sequence: seq }];
      default:
        return [{ type: "unknown", sequence: seq }];
    }
  }
}
export {
  Parser
};
