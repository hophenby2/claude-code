import { initializeAnalyticsSink } from "../services/analytics/sink.js";
import { initializeErrorLogSink } from "./errorLogSink.js";
function initSinks() {
  initializeErrorLogSink();
  initializeAnalyticsSink();
}
export {
  initSinks
};
