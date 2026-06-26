import { useEffect } from "react";
import {
  getLastInteractionTime,
  updateLastInteractionTime
} from "../bootstrap/state.js";
import { useTerminalNotification } from "../ink/useTerminalNotification.js";
import { sendNotification } from "../services/notifier.js";
const DEFAULT_INTERACTION_THRESHOLD_MS = 6e3;
function getTimeSinceLastInteraction() {
  return Date.now() - getLastInteractionTime();
}
function hasRecentInteraction(threshold) {
  return getTimeSinceLastInteraction() < threshold;
}
function shouldNotify(threshold) {
  return process.env.NODE_ENV !== "test" && !hasRecentInteraction(threshold);
}
function useNotifyAfterTimeout(message, notificationType) {
  const terminal = useTerminalNotification();
  useEffect(() => {
    updateLastInteractionTime(true);
  }, []);
  useEffect(() => {
    let hasNotified = false;
    const timer = setInterval(() => {
      if (shouldNotify(DEFAULT_INTERACTION_THRESHOLD_MS) && !hasNotified) {
        hasNotified = true;
        clearInterval(timer);
        void sendNotification({ message, notificationType }, terminal);
      }
    }, DEFAULT_INTERACTION_THRESHOLD_MS);
    return () => clearInterval(timer);
  }, [message, notificationType, terminal]);
}
export {
  DEFAULT_INTERACTION_THRESHOLD_MS,
  useNotifyAfterTimeout
};
