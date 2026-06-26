import {
  logEvent
} from "../services/analytics/index.js";
async function logUnaryEvent(event) {
  logEvent("tengu_unary_event", {
    event: event.event,
    completion_type: event.completion_type,
    language_name: await event.metadata.language_name,
    message_id: event.metadata.message_id,
    platform: event.metadata.platform,
    ...event.metadata.hasFeedback !== void 0 && {
      hasFeedback: event.metadata.hasFeedback
    }
  });
}
export {
  logUnaryEvent
};
