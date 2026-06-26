import { getIsNonInteractiveSession } from "../bootstrap/state.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { logForDebugging } from "./debug.js";
import { isEnvTruthy } from "./envUtils.js";
import { getPerformance } from "./profilerBase.js";
import { jsonStringify } from "./slowOperations.js";
const DETAILED_PROFILING = isEnvTruthy(process.env.CLAUDE_CODE_PROFILE_STARTUP);
const STATSIG_SAMPLE_RATE = 0.05;
const STATSIG_LOGGING_SAMPLED = process.env.USER_TYPE === "ant" || Math.random() < STATSIG_SAMPLE_RATE;
const SHOULD_PROFILE = DETAILED_PROFILING || STATSIG_LOGGING_SAMPLED;
const MARK_PREFIX = "headless_";
let currentTurnNumber = -1;
function clearHeadlessMarks() {
  const perf = getPerformance();
  const allMarks = perf.getEntriesByType("mark");
  for (const mark of allMarks) {
    if (mark.name.startsWith(MARK_PREFIX)) {
      perf.clearMarks(mark.name);
    }
  }
}
function headlessProfilerStartTurn() {
  if (!getIsNonInteractiveSession()) return;
  if (!SHOULD_PROFILE) return;
  currentTurnNumber++;
  clearHeadlessMarks();
  const perf = getPerformance();
  perf.mark(`${MARK_PREFIX}turn_start`);
  if (DETAILED_PROFILING) {
    logForDebugging(`[headlessProfiler] Started turn ${currentTurnNumber}`);
  }
}
function headlessProfilerCheckpoint(name) {
  if (!getIsNonInteractiveSession()) return;
  if (!SHOULD_PROFILE) return;
  const perf = getPerformance();
  perf.mark(`${MARK_PREFIX}${name}`);
  if (DETAILED_PROFILING) {
    logForDebugging(
      `[headlessProfiler] Checkpoint: ${name} at ${perf.now().toFixed(1)}ms`
    );
  }
}
function logHeadlessProfilerTurn() {
  if (!getIsNonInteractiveSession()) return;
  if (!SHOULD_PROFILE) return;
  const perf = getPerformance();
  const allMarks = perf.getEntriesByType("mark");
  const marks = allMarks.filter((mark) => mark.name.startsWith(MARK_PREFIX));
  if (marks.length === 0) return;
  const checkpointTimes = /* @__PURE__ */ new Map();
  for (const mark of marks) {
    const name = mark.name.slice(MARK_PREFIX.length);
    checkpointTimes.set(name, mark.startTime);
  }
  const turnStart = checkpointTimes.get("turn_start");
  if (turnStart === void 0) return;
  const metadata = {
    turn_number: currentTurnNumber
  };
  const systemMessageTime = checkpointTimes.get("system_message_yielded");
  if (systemMessageTime !== void 0 && currentTurnNumber === 0) {
    metadata.time_to_system_message_ms = Math.round(systemMessageTime);
  }
  const queryStartTime = checkpointTimes.get("query_started");
  if (queryStartTime !== void 0) {
    metadata.time_to_query_start_ms = Math.round(queryStartTime - turnStart);
  }
  const firstChunkTime = checkpointTimes.get("first_chunk");
  if (firstChunkTime !== void 0) {
    metadata.time_to_first_response_ms = Math.round(firstChunkTime - turnStart);
  }
  const apiRequestTime = checkpointTimes.get("api_request_sent");
  if (queryStartTime !== void 0 && apiRequestTime !== void 0) {
    metadata.query_overhead_ms = Math.round(apiRequestTime - queryStartTime);
  }
  metadata.checkpoint_count = marks.length;
  if (process.env.CLAUDE_CODE_ENTRYPOINT) {
    metadata.entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT;
  }
  if (STATSIG_LOGGING_SAMPLED) {
    logEvent(
      "tengu_headless_latency",
      metadata
    );
  }
  if (DETAILED_PROFILING) {
    logForDebugging(
      `[headlessProfiler] Turn ${currentTurnNumber} metrics: ${jsonStringify(metadata)}`
    );
  }
}
export {
  headlessProfilerCheckpoint,
  headlessProfilerStartTurn,
  logHeadlessProfilerTurn
};
