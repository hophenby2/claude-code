import { EventEmitter as NodeEventEmitter } from "events";
import { Event } from "./event.js";
class EventEmitter extends NodeEventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
  }
  emit(type, ...args) {
    if (type === "error") {
      return super.emit(type, ...args);
    }
    const listeners = this.rawListeners(type);
    if (listeners.length === 0) {
      return false;
    }
    const ccEvent = args[0] instanceof Event ? args[0] : null;
    for (const listener of listeners) {
      listener.apply(this, args);
      if (ccEvent?.didStopImmediatePropagation()) {
        break;
      }
    }
    return true;
  }
}
export {
  EventEmitter
};
