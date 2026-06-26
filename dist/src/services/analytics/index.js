function stripProtoFields(metadata) {
  let result;
  for (const key in metadata) {
    if (key.startsWith("_PROTO_")) {
      if (result === void 0) {
        result = { ...metadata };
      }
      delete result[key];
    }
  }
  return result ?? metadata;
}
const eventQueue = [];
let sink = null;
function attachAnalyticsSink(newSink) {
  if (sink !== null) {
    return;
  }
  sink = newSink;
  if (eventQueue.length > 0) {
    const queuedEvents = [...eventQueue];
    eventQueue.length = 0;
    if (process.env.USER_TYPE === "ant") {
      sink.logEvent("analytics_sink_attached", {
        queued_event_count: queuedEvents.length
      });
    }
    queueMicrotask(() => {
      for (const event of queuedEvents) {
        if (event.async) {
          void sink.logEventAsync(event.eventName, event.metadata);
        } else {
          sink.logEvent(event.eventName, event.metadata);
        }
      }
    });
  }
}
function logEvent(eventName, metadata) {
  if (sink === null) {
    eventQueue.push({ eventName, metadata, async: false });
    return;
  }
  sink.logEvent(eventName, metadata);
}
async function logEventAsync(eventName, metadata) {
  if (sink === null) {
    eventQueue.push({ eventName, metadata, async: true });
    return;
  }
  await sink.logEventAsync(eventName, metadata);
}
function _resetForTesting() {
  sink = null;
  eventQueue.length = 0;
}
export {
  _resetForTesting,
  attachAnalyticsSink,
  logEvent,
  logEventAsync,
  stripProtoFields
};
