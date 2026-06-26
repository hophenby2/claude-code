import { TerminalEvent } from "./terminal-event.js";
class FocusEvent extends TerminalEvent {
  relatedTarget;
  constructor(type, relatedTarget = null) {
    super(type, { bubbles: true, cancelable: false });
    this.relatedTarget = relatedTarget;
  }
}
export {
  FocusEvent
};
