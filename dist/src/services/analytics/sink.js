import { trackDatadogEvent } from "./datadog.js";
import { logEventTo1P, shouldSampleEvent } from "./firstPartyEventLogger.js";
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from "./growthbook.js";
import { attachAnalyticsSink, stripProtoFields } from "./index.js";
import { isSinkKilled } from "./sinkKillswitch.js";
const DATADOG_GATE_NAME = "tengu_log_datadog_events";
let isDatadogGateEnabled = void 0;
function shouldTrackDatadog() {
  if (isSinkKilled("datadog")) {
    return false;
  }
  if (isDatadogGateEnabled !== void 0) {
    return isDatadogGateEnabled;
  }
  try {
    return checkStatsigFeatureGate_CACHED_MAY_BE_STALE(DATADOG_GATE_NAME);
  } catch {
    return false;
  }
}
function logEventImpl(eventName, metadata) {
  const sampleResult = shouldSampleEvent(eventName);
  if (sampleResult === 0) {
    return;
  }
  const metadataWithSampleRate = sampleResult !== null ? { ...metadata, sample_rate: sampleResult } : metadata;
  if (shouldTrackDatadog()) {
    void trackDatadogEvent(eventName, stripProtoFields(metadataWithSampleRate));
  }
  logEventTo1P(eventName, metadataWithSampleRate);
}
function logEventAsyncImpl(eventName, metadata) {
  logEventImpl(eventName, metadata);
  return Promise.resolve();
}
function initializeAnalyticsGates() {
  isDatadogGateEnabled = checkStatsigFeatureGate_CACHED_MAY_BE_STALE(DATADOG_GATE_NAME);
}
function initializeAnalyticsSink() {
  attachAnalyticsSink({
    logEvent: logEventImpl,
    logEventAsync: logEventAsyncImpl
  });
}
export {
  initializeAnalyticsGates,
  initializeAnalyticsSink
};
