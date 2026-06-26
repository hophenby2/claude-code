function parseKeystroke(input) {
  const parts = input.split("+");
  const keystroke = {
    key: "",
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    super: false
  };
  for (const part of parts) {
    const lower = part.toLowerCase();
    switch (lower) {
      case "ctrl":
      case "control":
        keystroke.ctrl = true;
        break;
      case "alt":
      case "opt":
      case "option":
        keystroke.alt = true;
        break;
      case "shift":
        keystroke.shift = true;
        break;
      case "meta":
        keystroke.meta = true;
        break;
      case "cmd":
      case "command":
      case "super":
      case "win":
        keystroke.super = true;
        break;
      case "esc":
        keystroke.key = "escape";
        break;
      case "return":
        keystroke.key = "enter";
        break;
      case "space":
        keystroke.key = " ";
        break;
      case "\u2191":
        keystroke.key = "up";
        break;
      case "\u2193":
        keystroke.key = "down";
        break;
      case "\u2190":
        keystroke.key = "left";
        break;
      case "\u2192":
        keystroke.key = "right";
        break;
      default:
        keystroke.key = lower;
        break;
    }
  }
  return keystroke;
}
function parseChord(input) {
  if (input === " ") return [parseKeystroke("space")];
  return input.trim().split(/\s+/).map(parseKeystroke);
}
function keystrokeToString(ks) {
  const parts = [];
  if (ks.ctrl) parts.push("ctrl");
  if (ks.alt) parts.push("alt");
  if (ks.shift) parts.push("shift");
  if (ks.meta) parts.push("meta");
  if (ks.super) parts.push("cmd");
  const displayKey = keyToDisplayName(ks.key);
  parts.push(displayKey);
  return parts.join("+");
}
function keyToDisplayName(key) {
  switch (key) {
    case "escape":
      return "Esc";
    case " ":
      return "Space";
    case "tab":
      return "tab";
    case "enter":
      return "Enter";
    case "backspace":
      return "Backspace";
    case "delete":
      return "Delete";
    case "up":
      return "\u2191";
    case "down":
      return "\u2193";
    case "left":
      return "\u2190";
    case "right":
      return "\u2192";
    case "pageup":
      return "PageUp";
    case "pagedown":
      return "PageDown";
    case "home":
      return "Home";
    case "end":
      return "End";
    default:
      return key;
  }
}
function chordToString(chord) {
  return chord.map(keystrokeToString).join(" ");
}
function keystrokeToDisplayString(ks, platform = "linux") {
  const parts = [];
  if (ks.ctrl) parts.push("ctrl");
  if (ks.alt || ks.meta) {
    parts.push(platform === "macos" ? "opt" : "alt");
  }
  if (ks.shift) parts.push("shift");
  if (ks.super) {
    parts.push(platform === "macos" ? "cmd" : "super");
  }
  const displayKey = keyToDisplayName(ks.key);
  parts.push(displayKey);
  return parts.join("+");
}
function chordToDisplayString(chord, platform = "linux") {
  return chord.map((ks) => keystrokeToDisplayString(ks, platform)).join(" ");
}
function parseBindings(blocks) {
  const bindings = [];
  for (const block of blocks) {
    for (const [key, action] of Object.entries(block.bindings)) {
      bindings.push({
        chord: parseChord(key),
        action,
        context: block.context
      });
    }
  }
  return bindings;
}
export {
  chordToDisplayString,
  chordToString,
  keystrokeToDisplayString,
  keystrokeToString,
  parseBindings,
  parseChord,
  parseKeystroke
};
