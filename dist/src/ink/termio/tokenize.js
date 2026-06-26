import { C0, ESC_TYPE, isEscFinal } from "./ansi.js";
import { isCSIFinal, isCSIIntermediate, isCSIParam } from "./csi.js";
function createTokenizer(options) {
  let currentState = "ground";
  let currentBuffer = "";
  const x10Mouse = options?.x10Mouse ?? false;
  return {
    feed(input) {
      const result = tokenize(
        input,
        currentState,
        currentBuffer,
        false,
        x10Mouse
      );
      currentState = result.state.state;
      currentBuffer = result.state.buffer;
      return result.tokens;
    },
    flush() {
      const result = tokenize("", currentState, currentBuffer, true, x10Mouse);
      currentState = result.state.state;
      currentBuffer = result.state.buffer;
      return result.tokens;
    },
    reset() {
      currentState = "ground";
      currentBuffer = "";
    },
    buffer() {
      return currentBuffer;
    }
  };
}
function tokenize(input, initialState, initialBuffer, flush, x10Mouse) {
  const tokens = [];
  const result = {
    state: initialState,
    buffer: ""
  };
  const data = initialBuffer + input;
  let i = 0;
  let textStart = 0;
  let seqStart = 0;
  const flushText = () => {
    if (i > textStart) {
      const text = data.slice(textStart, i);
      if (text) {
        tokens.push({ type: "text", value: text });
      }
    }
    textStart = i;
  };
  const emitSequence = (seq) => {
    if (seq) {
      tokens.push({ type: "sequence", value: seq });
    }
    result.state = "ground";
    textStart = i;
  };
  while (i < data.length) {
    const code = data.charCodeAt(i);
    switch (result.state) {
      case "ground":
        if (code === C0.ESC) {
          flushText();
          seqStart = i;
          result.state = "escape";
          i++;
        } else {
          i++;
        }
        break;
      case "escape":
        if (code === ESC_TYPE.CSI) {
          result.state = "csi";
          i++;
        } else if (code === ESC_TYPE.OSC) {
          result.state = "osc";
          i++;
        } else if (code === ESC_TYPE.DCS) {
          result.state = "dcs";
          i++;
        } else if (code === ESC_TYPE.APC) {
          result.state = "apc";
          i++;
        } else if (code === 79) {
          result.state = "ss3";
          i++;
        } else if (isCSIIntermediate(code)) {
          result.state = "escapeIntermediate";
          i++;
        } else if (isEscFinal(code)) {
          i++;
          emitSequence(data.slice(seqStart, i));
        } else if (code === C0.ESC) {
          emitSequence(data.slice(seqStart, i));
          seqStart = i;
          result.state = "escape";
          i++;
        } else {
          result.state = "ground";
          textStart = seqStart;
        }
        break;
      case "escapeIntermediate":
        if (isCSIIntermediate(code)) {
          i++;
        } else if (isEscFinal(code)) {
          i++;
          emitSequence(data.slice(seqStart, i));
        } else {
          result.state = "ground";
          textStart = seqStart;
        }
        break;
      case "csi":
        if (x10Mouse && code === 77 && i - seqStart === 2 && (i + 1 >= data.length || data.charCodeAt(i + 1) >= 32) && (i + 2 >= data.length || data.charCodeAt(i + 2) >= 32) && (i + 3 >= data.length || data.charCodeAt(i + 3) >= 32)) {
          if (i + 4 <= data.length) {
            i += 4;
            emitSequence(data.slice(seqStart, i));
          } else {
            i = data.length;
          }
          break;
        }
        if (isCSIFinal(code)) {
          i++;
          emitSequence(data.slice(seqStart, i));
        } else if (isCSIParam(code) || isCSIIntermediate(code)) {
          i++;
        } else {
          result.state = "ground";
          textStart = seqStart;
        }
        break;
      case "ss3":
        if (code >= 64 && code <= 126) {
          i++;
          emitSequence(data.slice(seqStart, i));
        } else {
          result.state = "ground";
          textStart = seqStart;
        }
        break;
      case "osc":
        if (code === C0.BEL) {
          i++;
          emitSequence(data.slice(seqStart, i));
        } else if (code === C0.ESC && i + 1 < data.length && data.charCodeAt(i + 1) === ESC_TYPE.ST) {
          i += 2;
          emitSequence(data.slice(seqStart, i));
        } else {
          i++;
        }
        break;
      case "dcs":
      case "apc":
        if (code === C0.BEL) {
          i++;
          emitSequence(data.slice(seqStart, i));
        } else if (code === C0.ESC && i + 1 < data.length && data.charCodeAt(i + 1) === ESC_TYPE.ST) {
          i += 2;
          emitSequence(data.slice(seqStart, i));
        } else {
          i++;
        }
        break;
    }
  }
  if (result.state === "ground") {
    flushText();
  } else if (flush) {
    const remaining = data.slice(seqStart);
    if (remaining) tokens.push({ type: "sequence", value: remaining });
    result.state = "ground";
  } else {
    result.buffer = data.slice(seqStart);
  }
  return { tokens, state: result };
}
export {
  createTokenizer
};
