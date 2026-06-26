import { TerminalEvent } from "./terminal-event.js";
class KeyboardEvent extends TerminalEvent {
  key;
  ctrl;
  shift;
  meta;
  superKey;
  fn;
  constructor(parsedKey) {
    super("keydown", { bubbles: true, cancelable: true });
    this.key = keyFromParsed(parsedKey);
    this.ctrl = parsedKey.ctrl;
    this.shift = parsedKey.shift;
    this.meta = parsedKey.meta || parsedKey.option;
    this.superKey = parsedKey.super;
    this.fn = parsedKey.fn;
  }
}
function keyFromParsed(parsed) {
  const seq = parsed.sequence ?? "";
  const name = parsed.name ?? "";
  if (parsed.ctrl) return name;
  if (seq.length === 1) {
    const code = seq.charCodeAt(0);
    if (code >= 32 && code !== 127) return seq;
  }
  return name || seq;
}
export {
  KeyboardEvent
};
