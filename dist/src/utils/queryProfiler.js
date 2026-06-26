import { logForDebugging } from "./debug.js";
import { isEnvTruthy } from "./envUtils.js";
import { formatMs, formatTimelineLine, getPerformance } from "./profilerBase.js";
const ENABLED = isEnvTruthy(process.env.CLAUDE_CODE_PROFILE_QUERY);
const memorySnapshots = /* @__PURE__ */ new Map();
let queryCount = 0;
let firstTokenTime = null;
function startQueryProfile() {
  if (!ENABLED) return;
  const perf = getPerformance();
  perf.clearMarks();
  memorySnapshots.clear();
  firstTokenTime = null;
  queryCount++;
  queryCheckpoint("query_user_input_received");
}
function queryCheckpoint(name) {
  if (!ENABLED) return;
  const perf = getPerformance();
  perf.mark(name);
  memorySnapshots.set(name, process.memoryUsage());
  if (name === "query_first_chunk_received" && firstTokenTime === null) {
    const marks = perf.getEntriesByType("mark");
    if (marks.length > 0) {
      const lastMark = marks[marks.length - 1];
      firstTokenTime = lastMark?.startTime ?? 0;
    }
  }
}
function endQueryProfile() {
  if (!ENABLED) return;
  queryCheckpoint("query_profile_end");
}
function getSlowWarning(deltaMs, name) {
  if (name === "query_user_input_received") {
    return "";
  }
  if (deltaMs > 1e3) {
    return ` \u26A0\uFE0F  VERY SLOW`;
  }
  if (deltaMs > 100) {
    return ` \u26A0\uFE0F  SLOW`;
  }
  if (name.includes("git_status") && deltaMs > 50) {
    return " \u26A0\uFE0F  git status";
  }
  if (name.includes("tool_schema") && deltaMs > 50) {
    return " \u26A0\uFE0F  tool schemas";
  }
  if (name.includes("client_creation") && deltaMs > 50) {
    return " \u26A0\uFE0F  client creation";
  }
  return "";
}
function getQueryProfileReport() {
  if (!ENABLED) {
    return "Query profiling not enabled (set CLAUDE_CODE_PROFILE_QUERY=1)";
  }
  const perf = getPerformance();
  const marks = perf.getEntriesByType("mark");
  if (marks.length === 0) {
    return "No query profiling checkpoints recorded";
  }
  const lines = [];
  lines.push("=".repeat(80));
  lines.push(`QUERY PROFILING REPORT - Query #${queryCount}`);
  lines.push("=".repeat(80));
  lines.push("");
  const baselineTime = marks[0]?.startTime ?? 0;
  let prevTime = baselineTime;
  let apiRequestSentTime = 0;
  let firstChunkTime = 0;
  for (const mark of marks) {
    const relativeTime = mark.startTime - baselineTime;
    const deltaMs = mark.startTime - prevTime;
    lines.push(
      formatTimelineLine(
        relativeTime,
        deltaMs,
        mark.name,
        memorySnapshots.get(mark.name),
        10,
        9,
        getSlowWarning(deltaMs, mark.name)
      )
    );
    if (mark.name === "query_api_request_sent") {
      apiRequestSentTime = relativeTime;
    }
    if (mark.name === "query_first_chunk_received") {
      firstChunkTime = relativeTime;
    }
    prevTime = mark.startTime;
  }
  const lastMark = marks[marks.length - 1];
  const totalTime = lastMark ? lastMark.startTime - baselineTime : 0;
  lines.push("");
  lines.push("-".repeat(80));
  if (firstChunkTime > 0) {
    const preRequestOverhead = apiRequestSentTime;
    const networkLatency = firstChunkTime - apiRequestSentTime;
    const preRequestPercent = (preRequestOverhead / firstChunkTime * 100).toFixed(1);
    const networkPercent = (networkLatency / firstChunkTime * 100).toFixed(1);
    lines.push(`Total TTFT: ${formatMs(firstChunkTime)}ms`);
    lines.push(
      `  - Pre-request overhead: ${formatMs(preRequestOverhead)}ms (${preRequestPercent}%)`
    );
    lines.push(
      `  - Network latency: ${formatMs(networkLatency)}ms (${networkPercent}%)`
    );
  } else {
    lines.push(`Total time: ${formatMs(totalTime)}ms`);
  }
  lines.push(getPhaseSummary(marks, baselineTime));
  lines.push("=".repeat(80));
  return lines.join("\n");
}
function getPhaseSummary(marks, baselineTime) {
  const phases = [
    {
      name: "Context loading",
      start: "query_context_loading_start",
      end: "query_context_loading_end"
    },
    {
      name: "Microcompact",
      start: "query_microcompact_start",
      end: "query_microcompact_end"
    },
    {
      name: "Autocompact",
      start: "query_autocompact_start",
      end: "query_autocompact_end"
    },
    { name: "Query setup", start: "query_setup_start", end: "query_setup_end" },
    {
      name: "Tool schemas",
      start: "query_tool_schema_build_start",
      end: "query_tool_schema_build_end"
    },
    {
      name: "Message normalization",
      start: "query_message_normalization_start",
      end: "query_message_normalization_end"
    },
    {
      name: "Client creation",
      start: "query_client_creation_start",
      end: "query_client_creation_end"
    },
    {
      name: "Network TTFB",
      start: "query_api_request_sent",
      end: "query_first_chunk_received"
    },
    {
      name: "Tool execution",
      start: "query_tool_execution_start",
      end: "query_tool_execution_end"
    }
  ];
  const markMap = new Map(marks.map((m) => [m.name, m.startTime - baselineTime]));
  const lines = [];
  lines.push("");
  lines.push("PHASE BREAKDOWN:");
  for (const phase of phases) {
    const startTime = markMap.get(phase.start);
    const endTime = markMap.get(phase.end);
    if (startTime !== void 0 && endTime !== void 0) {
      const duration = endTime - startTime;
      const bar = "\u2588".repeat(Math.min(Math.ceil(duration / 10), 50));
      lines.push(
        `  ${phase.name.padEnd(22)} ${formatMs(duration).padStart(10)}ms ${bar}`
      );
    }
  }
  const apiRequestSent = markMap.get("query_api_request_sent");
  if (apiRequestSent !== void 0) {
    lines.push("");
    lines.push(
      `  ${"Total pre-API overhead".padEnd(22)} ${formatMs(apiRequestSent).padStart(10)}ms`
    );
  }
  return lines.join("\n");
}
function logQueryProfileReport() {
  if (!ENABLED) return;
  logForDebugging(getQueryProfileReport());
}
export {
  endQueryProfile,
  logQueryProfileReport,
  queryCheckpoint,
  startQueryProfile
};
