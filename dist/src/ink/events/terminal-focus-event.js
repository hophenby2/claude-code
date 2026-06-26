import { Event } from "./event.js";
class TerminalFocusEvent extends Event {
  type;
  constructor(type) {
    super();
    this.type = type;
  }
}
export {
  TerminalFocusEvent
};
