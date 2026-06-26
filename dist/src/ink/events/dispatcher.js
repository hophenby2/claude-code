import {
  ContinuousEventPriority,
  DefaultEventPriority,
  DiscreteEventPriority,
  NoEventPriority
} from "react-reconciler/constants.js";
import { logError } from "../../utils/log.js";
import { HANDLER_FOR_EVENT } from "./event-handlers.js";
function getHandler(node, eventType, capture) {
  const handlers = node._eventHandlers;
  if (!handlers) return void 0;
  const mapping = HANDLER_FOR_EVENT[eventType];
  if (!mapping) return void 0;
  const propName = capture ? mapping.capture : mapping.bubble;
  if (!propName) return void 0;
  return handlers[propName];
}
function collectListeners(target, event) {
  const listeners = [];
  let node = target;
  while (node) {
    const isTarget = node === target;
    const captureHandler = getHandler(node, event.type, true);
    const bubbleHandler = getHandler(node, event.type, false);
    if (captureHandler) {
      listeners.unshift({
        node,
        handler: captureHandler,
        phase: isTarget ? "at_target" : "capturing"
      });
    }
    if (bubbleHandler && (event.bubbles || isTarget)) {
      listeners.push({
        node,
        handler: bubbleHandler,
        phase: isTarget ? "at_target" : "bubbling"
      });
    }
    node = node.parentNode;
  }
  return listeners;
}
function processDispatchQueue(listeners, event) {
  let previousNode;
  for (const { node, handler, phase } of listeners) {
    if (event._isImmediatePropagationStopped()) {
      break;
    }
    if (event._isPropagationStopped() && node !== previousNode) {
      break;
    }
    event._setEventPhase(phase);
    event._setCurrentTarget(node);
    event._prepareForTarget(node);
    try {
      handler(event);
    } catch (error) {
      logError(error);
    }
    previousNode = node;
  }
}
function getEventPriority(eventType) {
  switch (eventType) {
    case "keydown":
    case "keyup":
    case "click":
    case "focus":
    case "blur":
    case "paste":
      return DiscreteEventPriority;
    case "resize":
    case "scroll":
    case "mousemove":
      return ContinuousEventPriority;
    default:
      return DefaultEventPriority;
  }
}
class Dispatcher {
  currentEvent = null;
  currentUpdatePriority = DefaultEventPriority;
  discreteUpdates = null;
  /**
   * Infer event priority from the currently-dispatching event.
   * Called by the reconciler host config's resolveUpdatePriority
   * when no explicit priority has been set.
   */
  resolveEventPriority() {
    if (this.currentUpdatePriority !== NoEventPriority) {
      return this.currentUpdatePriority;
    }
    if (this.currentEvent) {
      return getEventPriority(this.currentEvent.type);
    }
    return DefaultEventPriority;
  }
  /**
   * Dispatch an event through capture and bubble phases.
   * Returns true if preventDefault() was NOT called.
   */
  dispatch(target, event) {
    const previousEvent = this.currentEvent;
    this.currentEvent = event;
    try {
      event._setTarget(target);
      const listeners = collectListeners(target, event);
      processDispatchQueue(listeners, event);
      event._setEventPhase("none");
      event._setCurrentTarget(null);
      return !event.defaultPrevented;
    } finally {
      this.currentEvent = previousEvent;
    }
  }
  /**
   * Dispatch with discrete (sync) priority.
   * For user-initiated events: keyboard, click, focus, paste.
   */
  dispatchDiscrete(target, event) {
    if (!this.discreteUpdates) {
      return this.dispatch(target, event);
    }
    return this.discreteUpdates(
      (t, e) => this.dispatch(t, e),
      target,
      event,
      void 0,
      void 0
    );
  }
  /**
   * Dispatch with continuous priority.
   * For high-frequency events: resize, scroll, mouse move.
   */
  dispatchContinuous(target, event) {
    const previousPriority = this.currentUpdatePriority;
    try {
      this.currentUpdatePriority = ContinuousEventPriority;
      return this.dispatch(target, event);
    } finally {
      this.currentUpdatePriority = previousPriority;
    }
  }
}
export {
  Dispatcher
};
