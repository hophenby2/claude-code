import { dirname, join } from "path";
import { getSessionId } from "../bootstrap/state.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { logForDebugging } from "./debug.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "./envUtils.js";
import { getFsImplementation } from "./fsOperations.js";
import { formatMs, formatTimelineLine, getPerformance } from "./profilerBase.js";
import { writeFileSync_DEPRECATED } from "./slowOperations.js";
const DETAILED_PROFILING = isEnvTruthy(process.env.CLAUDE_CODE_PROFILE_STARTUP);
const STATSIG_SAMPLE_RATE = 5e-3;
const STATSIG_LOGGING_SAMPLED = process.env.USER_TYPE === "ant" || Math.random() < STATSIG_SAMPLE_RATE;
const SHOULD_PROFILE = DETAILED_PROFILING || STATSIG_LOGGING_SAMPLED;
const memorySnapshots = [];
const PHASE_DEFINITIONS = {
  import_time: ["cli_entry", "main_tsx_imports_loaded"],
  init_time: ["init_function_start", "init_function_end"],
  settings_time: ["eagerLoadSettings_start", "eagerLoadSettings_end"],
  total_time: ["cli_entry", "main_after_run"]
};
if (SHOULD_PROFILE) {
  profileCheckpoint("profiler_initialized");
}
function profileCheckpoint(name) {
  if (!SHOULD_PROFILE) return;
  const perf = getPerformance();
  perf.mark(name);
  if (DETAILED_PROFILING) {
    memorySnapshots.push(process.memoryUsage());
  }
}
function getReport() {
  if (!DETAILED_PROFILING) {
    return "Startup profiling not enabled";
  }
  const perf = getPerformance();
  const marks = perf.getEntriesByType("mark");
  if (marks.length === 0) {
    return "No profiling checkpoints recorded";
  }
  const lines = [];
  lines.push("=".repeat(80));
  lines.push("STARTUP PROFILING REPORT");
  lines.push("=".repeat(80));
  lines.push("");
  let prevTime = 0;
  for (const [i, mark] of marks.entries()) {
    lines.push(
      formatTimelineLine(
        mark.startTime,
        mark.startTime - prevTime,
        mark.name,
        memorySnapshots[i],
        8,
        7
      )
    );
    prevTime = mark.startTime;
  }
  const lastMark = marks[marks.length - 1];
  lines.push("");
  lines.push(`Total startup time: ${formatMs(lastMark?.startTime ?? 0)}ms`);
  lines.push("=".repeat(80));
  return lines.join("\n");
}
let reported = false;
function profileReport() {
  if (reported) return;
  reported = true;
  logStartupPerf();
  if (DETAILED_PROFILING) {
    const path = getStartupPerfLogPath();
    const dir = dirname(path);
    const fs = getFsImplementation();
    fs.mkdirSync(dir);
    writeFileSync_DEPRECATED(path, getReport(), {
      encoding: "utf8",
      flush: true
    });
    logForDebugging("Startup profiling report:");
    logForDebugging(getReport());
  }
}
function isDetailedProfilingEnabled() {
  return DETAILED_PROFILING;
}
function getStartupPerfLogPath() {
  return join(getClaudeConfigHomeDir(), "startup-perf", `${getSessionId()}.txt`);
}
function logStartupPerf() {
  if (!STATSIG_LOGGING_SAMPLED) return;
  const perf = getPerformance();
  const marks = perf.getEntriesByType("mark");
  if (marks.length === 0) return;
  const checkpointTimes = /* @__PURE__ */ new Map();
  for (const mark of marks) {
    checkpointTimes.set(mark.name, mark.startTime);
  }
  const metadata = {};
  for (const [phaseName, [startCheckpoint, endCheckpoint]] of Object.entries(
    PHASE_DEFINITIONS
  )) {
    const startTime = checkpointTimes.get(startCheckpoint);
    const endTime = checkpointTimes.get(endCheckpoint);
    if (startTime !== void 0 && endTime !== void 0) {
      metadata[`${phaseName}_ms`] = Math.round(endTime - startTime);
    }
  }
  metadata.checkpoint_count = marks.length;
  logEvent(
    "tengu_startup_perf",
    metadata
  );
}
export {
  getStartupPerfLogPath,
  isDetailedProfilingEnabled,
  logStartupPerf,
  profileCheckpoint,
  profileReport
};
