const feature = (_name) => false;
import { mkdirSync, writeFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import { getSessionId } from "../../bootstrap/state.js";
import "../cleanupRegistry.js";
import { logForDebugging } from "../debug.js";
import "../envUtils.js";
import { errorMessage } from "../errors.js";
import { djb2Hash } from "../hash.js";
import { jsonStringify } from "../slowOperations.js";
import { getAgentId, getAgentName, getParentSessionId } from "../teammate.js";
let isEnabled = false;
let tracePath = null;
const metadataEvents = [];
const events = [];
const MAX_EVENTS = 1e5;
const pendingSpans = /* @__PURE__ */ new Map();
const agentRegistry = /* @__PURE__ */ new Map();
let totalAgentCount = 0;
let startTimeMs = 0;
let spanIdCounter = 0;
let traceWritten = false;
let processIdCounter = 1;
const agentIdToProcessId = /* @__PURE__ */ new Map();
let writeIntervalId = null;
const STALE_SPAN_TTL_MS = 30 * 60 * 1e3;
const STALE_SPAN_CLEANUP_INTERVAL_MS = 60 * 1e3;
let staleSpanCleanupId = null;
function stringToNumericHash(str) {
  return Math.abs(djb2Hash(str)) || 1;
}
function getProcessIdForAgent(agentId) {
  const existing = agentIdToProcessId.get(agentId);
  if (existing !== void 0) return existing;
  processIdCounter++;
  agentIdToProcessId.set(agentId, processIdCounter);
  return processIdCounter;
}
function getCurrentAgentInfo() {
  const agentId = getAgentId() ?? getSessionId();
  const agentName = getAgentName() ?? "main";
  const parentSessionId = getParentSessionId();
  const existing = agentRegistry.get(agentId);
  if (existing) return existing;
  const info = {
    agentId,
    agentName,
    parentAgentId: parentSessionId,
    processId: agentId === getSessionId() ? 1 : getProcessIdForAgent(agentId),
    threadId: stringToNumericHash(agentName)
  };
  agentRegistry.set(agentId, info);
  totalAgentCount++;
  return info;
}
function getTimestamp() {
  return (Date.now() - startTimeMs) * 1e3;
}
function generateSpanId() {
  return `span_${++spanIdCounter}`;
}
function evictStaleSpans() {
  const now = getTimestamp();
  const ttlUs = STALE_SPAN_TTL_MS * 1e3;
  for (const [spanId, span] of pendingSpans) {
    if (now - span.startTime > ttlUs) {
      events.push({
        name: span.name,
        cat: span.category,
        ph: "E",
        ts: now,
        pid: span.agentInfo.processId,
        tid: span.agentInfo.threadId,
        args: {
          ...span.args,
          evicted: true,
          duration_ms: (now - span.startTime) / 1e3
        }
      });
      pendingSpans.delete(spanId);
    }
  }
}
function buildTraceDocument() {
  return jsonStringify({
    traceEvents: [...metadataEvents, ...events],
    metadata: {
      session_id: getSessionId(),
      trace_start_time: new Date(startTimeMs).toISOString(),
      agent_count: totalAgentCount,
      total_event_count: metadataEvents.length + events.length
    }
  });
}
function evictOldestEvents() {
  if (events.length < MAX_EVENTS) return;
  const dropped = events.splice(0, MAX_EVENTS / 2);
  events.unshift({
    name: "trace_truncated",
    cat: "__metadata",
    ph: "i",
    ts: dropped[dropped.length - 1]?.ts ?? 0,
    pid: 1,
    tid: 0,
    args: { dropped_events: dropped.length }
  });
  logForDebugging(
    `[Perfetto] Evicted ${dropped.length} oldest events (cap ${MAX_EVENTS})`
  );
}
function initializePerfettoTracing() {
  const envValue = process.env.CLAUDE_CODE_PERFETTO_TRACE;
  logForDebugging(
    `[Perfetto] initializePerfettoTracing called, env value: ${envValue}`
  );
  if (false) {
    if (!envValue || isEnvDefinedFalsy(envValue)) {
      logForDebugging(
        "[Perfetto] Tracing disabled (env var not set or disabled)"
      );
      return;
    }
    isEnabled = true;
    startTimeMs = Date.now();
    if (isEnvTruthy(envValue)) {
      const tracesDir = join(getClaudeConfigHomeDir(), "traces");
      tracePath = join(tracesDir, `trace-${getSessionId()}.json`);
    } else {
      tracePath = envValue;
    }
    logForDebugging(
      `[Perfetto] Tracing enabled, will write to: ${tracePath}, isEnabled=${isEnabled}`
    );
    const intervalSec = parseInt(
      process.env.CLAUDE_CODE_PERFETTO_WRITE_INTERVAL_S ?? "",
      10
    );
    if (intervalSec > 0) {
      writeIntervalId = setInterval(() => {
        void periodicWrite();
      }, intervalSec * 1e3);
      if (writeIntervalId.unref) writeIntervalId.unref();
      logForDebugging(
        `[Perfetto] Periodic write enabled, interval: ${intervalSec}s`
      );
    }
    staleSpanCleanupId = setInterval(() => {
      evictStaleSpans();
      evictOldestEvents();
    }, STALE_SPAN_CLEANUP_INTERVAL_MS);
    if (staleSpanCleanupId.unref) staleSpanCleanupId.unref();
    registerCleanup(async () => {
      logForDebugging("[Perfetto] Cleanup callback invoked");
      await writePerfettoTrace();
    });
    process.on("beforeExit", () => {
      logForDebugging("[Perfetto] beforeExit handler invoked");
      void writePerfettoTrace();
    });
    process.on("exit", () => {
      if (!traceWritten) {
        logForDebugging(
          "[Perfetto] exit handler invoked, writing trace synchronously"
        );
        writePerfettoTraceSync();
      }
    });
    const mainAgent = getCurrentAgentInfo();
    emitProcessMetadata(mainAgent);
  }
}
function emitProcessMetadata(agentInfo) {
  if (!isEnabled) return;
  metadataEvents.push({
    name: "process_name",
    cat: "__metadata",
    ph: "M",
    ts: 0,
    pid: agentInfo.processId,
    tid: 0,
    args: { name: agentInfo.agentName }
  });
  metadataEvents.push({
    name: "thread_name",
    cat: "__metadata",
    ph: "M",
    ts: 0,
    pid: agentInfo.processId,
    tid: agentInfo.threadId,
    args: { name: agentInfo.agentName }
  });
  if (agentInfo.parentAgentId) {
    metadataEvents.push({
      name: "parent_agent",
      cat: "__metadata",
      ph: "M",
      ts: 0,
      pid: agentInfo.processId,
      tid: 0,
      args: {
        parent_agent_id: agentInfo.parentAgentId
      }
    });
  }
}
function isPerfettoTracingEnabled() {
  return isEnabled;
}
function registerAgent(agentId, agentName, parentAgentId) {
  if (!isEnabled) return;
  const info = {
    agentId,
    agentName,
    parentAgentId,
    processId: getProcessIdForAgent(agentId),
    threadId: stringToNumericHash(agentName)
  };
  agentRegistry.set(agentId, info);
  totalAgentCount++;
  emitProcessMetadata(info);
}
function unregisterAgent(agentId) {
  if (!isEnabled) return;
  agentRegistry.delete(agentId);
  agentIdToProcessId.delete(agentId);
}
function startLLMRequestPerfettoSpan(args) {
  if (!isEnabled) return "";
  const spanId = generateSpanId();
  const agentInfo = getCurrentAgentInfo();
  pendingSpans.set(spanId, {
    name: "API Call",
    category: "api",
    startTime: getTimestamp(),
    agentInfo,
    args: {
      model: args.model,
      prompt_tokens: args.promptTokens,
      message_id: args.messageId,
      is_speculative: args.isSpeculative ?? false,
      query_source: args.querySource
    }
  });
  events.push({
    name: "API Call",
    cat: "api",
    ph: "B",
    ts: pendingSpans.get(spanId).startTime,
    pid: agentInfo.processId,
    tid: agentInfo.threadId,
    args: pendingSpans.get(spanId).args
  });
  return spanId;
}
function endLLMRequestPerfettoSpan(spanId, metadata) {
  if (!isEnabled || !spanId) return;
  const pending = pendingSpans.get(spanId);
  if (!pending) return;
  const endTime = getTimestamp();
  const duration = endTime - pending.startTime;
  const promptTokens = metadata.promptTokens ?? pending.args.prompt_tokens;
  const ttftMs = metadata.ttftMs;
  const ttltMs = metadata.ttltMs;
  const outputTokens = metadata.outputTokens;
  const cacheReadTokens = metadata.cacheReadTokens;
  const itps = ttftMs !== void 0 && promptTokens !== void 0 && ttftMs > 0 ? Math.round(promptTokens / (ttftMs / 1e3) * 100) / 100 : void 0;
  const samplingMs = ttltMs !== void 0 && ttftMs !== void 0 ? ttltMs - ttftMs : void 0;
  const otps = samplingMs !== void 0 && outputTokens !== void 0 && samplingMs > 0 ? Math.round(outputTokens / (samplingMs / 1e3) * 100) / 100 : void 0;
  const cacheHitRate = cacheReadTokens !== void 0 && promptTokens !== void 0 && promptTokens > 0 ? Math.round(cacheReadTokens / promptTokens * 1e4) / 100 : void 0;
  const requestSetupMs = metadata.requestSetupMs;
  const attemptStartTimes = metadata.attemptStartTimes;
  const args = {
    ...pending.args,
    ttft_ms: ttftMs,
    ttlt_ms: ttltMs,
    prompt_tokens: promptTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_creation_tokens: metadata.cacheCreationTokens,
    message_id: metadata.messageId ?? pending.args.message_id,
    success: metadata.success ?? true,
    error: metadata.error,
    duration_ms: duration / 1e3,
    request_setup_ms: requestSetupMs,
    // Derived metrics
    itps,
    otps,
    cache_hit_rate_pct: cacheHitRate
  };
  const setupUs = requestSetupMs !== void 0 && requestSetupMs > 0 ? requestSetupMs * 1e3 : 0;
  if (setupUs > 0) {
    const setupEndTs = pending.startTime + setupUs;
    events.push({
      name: "Request Setup",
      cat: "api,setup",
      ph: "B",
      ts: pending.startTime,
      pid: pending.agentInfo.processId,
      tid: pending.agentInfo.threadId,
      args: {
        request_setup_ms: requestSetupMs,
        attempt_count: attemptStartTimes?.length ?? 1
      }
    });
    if (attemptStartTimes && attemptStartTimes.length > 1) {
      const baseWallMs = attemptStartTimes[0];
      for (let i = 0; i < attemptStartTimes.length - 1; i++) {
        const attemptStartUs = pending.startTime + (attemptStartTimes[i] - baseWallMs) * 1e3;
        const attemptEndUs = pending.startTime + (attemptStartTimes[i + 1] - baseWallMs) * 1e3;
        events.push({
          name: `Attempt ${i + 1} (retry)`,
          cat: "api,retry",
          ph: "B",
          ts: attemptStartUs,
          pid: pending.agentInfo.processId,
          tid: pending.agentInfo.threadId,
          args: { attempt: i + 1 }
        });
        events.push({
          name: `Attempt ${i + 1} (retry)`,
          cat: "api,retry",
          ph: "E",
          ts: attemptEndUs,
          pid: pending.agentInfo.processId,
          tid: pending.agentInfo.threadId
        });
      }
    }
    events.push({
      name: "Request Setup",
      cat: "api,setup",
      ph: "E",
      ts: setupEndTs,
      pid: pending.agentInfo.processId,
      tid: pending.agentInfo.threadId
    });
  }
  if (ttftMs !== void 0) {
    const firstTokenStartTs = pending.startTime + setupUs;
    const firstTokenEndTs = firstTokenStartTs + ttftMs * 1e3;
    events.push({
      name: "First Token",
      cat: "api,ttft",
      ph: "B",
      ts: firstTokenStartTs,
      pid: pending.agentInfo.processId,
      tid: pending.agentInfo.threadId,
      args: {
        ttft_ms: ttftMs,
        prompt_tokens: promptTokens,
        itps,
        cache_hit_rate_pct: cacheHitRate
      }
    });
    events.push({
      name: "First Token",
      cat: "api,ttft",
      ph: "E",
      ts: firstTokenEndTs,
      pid: pending.agentInfo.processId,
      tid: pending.agentInfo.threadId
    });
    const actualSamplingMs = ttltMs !== void 0 ? ttltMs - ttftMs - setupUs / 1e3 : void 0;
    if (actualSamplingMs !== void 0 && actualSamplingMs > 0) {
      events.push({
        name: "Sampling",
        cat: "api,sampling",
        ph: "B",
        ts: firstTokenEndTs,
        pid: pending.agentInfo.processId,
        tid: pending.agentInfo.threadId,
        args: {
          sampling_ms: actualSamplingMs,
          output_tokens: outputTokens,
          otps
        }
      });
      events.push({
        name: "Sampling",
        cat: "api,sampling",
        ph: "E",
        ts: firstTokenEndTs + actualSamplingMs * 1e3,
        pid: pending.agentInfo.processId,
        tid: pending.agentInfo.threadId
      });
    }
  }
  events.push({
    name: pending.name,
    cat: pending.category,
    ph: "E",
    ts: endTime,
    pid: pending.agentInfo.processId,
    tid: pending.agentInfo.threadId,
    args
  });
  pendingSpans.delete(spanId);
}
function startToolPerfettoSpan(toolName, args) {
  if (!isEnabled) return "";
  const spanId = generateSpanId();
  const agentInfo = getCurrentAgentInfo();
  pendingSpans.set(spanId, {
    name: `Tool: ${toolName}`,
    category: "tool",
    startTime: getTimestamp(),
    agentInfo,
    args: {
      tool_name: toolName,
      ...args
    }
  });
  events.push({
    name: `Tool: ${toolName}`,
    cat: "tool",
    ph: "B",
    ts: pendingSpans.get(spanId).startTime,
    pid: agentInfo.processId,
    tid: agentInfo.threadId,
    args: pendingSpans.get(spanId).args
  });
  return spanId;
}
function endToolPerfettoSpan(spanId, metadata) {
  if (!isEnabled || !spanId) return;
  const pending = pendingSpans.get(spanId);
  if (!pending) return;
  const endTime = getTimestamp();
  const duration = endTime - pending.startTime;
  const args = {
    ...pending.args,
    success: metadata?.success ?? true,
    error: metadata?.error,
    result_tokens: metadata?.resultTokens,
    duration_ms: duration / 1e3
  };
  events.push({
    name: pending.name,
    cat: pending.category,
    ph: "E",
    ts: endTime,
    pid: pending.agentInfo.processId,
    tid: pending.agentInfo.threadId,
    args
  });
  pendingSpans.delete(spanId);
}
function startUserInputPerfettoSpan(context) {
  if (!isEnabled) return "";
  const spanId = generateSpanId();
  const agentInfo = getCurrentAgentInfo();
  pendingSpans.set(spanId, {
    name: "Waiting for User Input",
    category: "user_input",
    startTime: getTimestamp(),
    agentInfo,
    args: {
      context
    }
  });
  events.push({
    name: "Waiting for User Input",
    cat: "user_input",
    ph: "B",
    ts: pendingSpans.get(spanId).startTime,
    pid: agentInfo.processId,
    tid: agentInfo.threadId,
    args: pendingSpans.get(spanId).args
  });
  return spanId;
}
function endUserInputPerfettoSpan(spanId, metadata) {
  if (!isEnabled || !spanId) return;
  const pending = pendingSpans.get(spanId);
  if (!pending) return;
  const endTime = getTimestamp();
  const duration = endTime - pending.startTime;
  const args = {
    ...pending.args,
    decision: metadata?.decision,
    source: metadata?.source,
    duration_ms: duration / 1e3
  };
  events.push({
    name: pending.name,
    cat: pending.category,
    ph: "E",
    ts: endTime,
    pid: pending.agentInfo.processId,
    tid: pending.agentInfo.threadId,
    args
  });
  pendingSpans.delete(spanId);
}
function emitPerfettoInstant(name, category, args) {
  if (!isEnabled) return;
  const agentInfo = getCurrentAgentInfo();
  events.push({
    name,
    cat: category,
    ph: "i",
    ts: getTimestamp(),
    pid: agentInfo.processId,
    tid: agentInfo.threadId,
    args
  });
}
function emitPerfettoCounter(name, values) {
  if (!isEnabled) return;
  const agentInfo = getCurrentAgentInfo();
  events.push({
    name,
    cat: "counter",
    ph: "C",
    ts: getTimestamp(),
    pid: agentInfo.processId,
    tid: agentInfo.threadId,
    args: values
  });
}
function startInteractionPerfettoSpan(userPrompt) {
  if (!isEnabled) return "";
  const spanId = generateSpanId();
  const agentInfo = getCurrentAgentInfo();
  pendingSpans.set(spanId, {
    name: "Interaction",
    category: "interaction",
    startTime: getTimestamp(),
    agentInfo,
    args: {
      user_prompt_length: userPrompt?.length
    }
  });
  events.push({
    name: "Interaction",
    cat: "interaction",
    ph: "B",
    ts: pendingSpans.get(spanId).startTime,
    pid: agentInfo.processId,
    tid: agentInfo.threadId,
    args: pendingSpans.get(spanId).args
  });
  return spanId;
}
function endInteractionPerfettoSpan(spanId) {
  if (!isEnabled || !spanId) return;
  const pending = pendingSpans.get(spanId);
  if (!pending) return;
  const endTime = getTimestamp();
  const duration = endTime - pending.startTime;
  events.push({
    name: pending.name,
    cat: pending.category,
    ph: "E",
    ts: endTime,
    pid: pending.agentInfo.processId,
    tid: pending.agentInfo.threadId,
    args: {
      ...pending.args,
      duration_ms: duration / 1e3
    }
  });
  pendingSpans.delete(spanId);
}
function stopWriteInterval() {
  if (staleSpanCleanupId) {
    clearInterval(staleSpanCleanupId);
    staleSpanCleanupId = null;
  }
  if (writeIntervalId) {
    clearInterval(writeIntervalId);
    writeIntervalId = null;
  }
}
function closeOpenSpans() {
  for (const [spanId, pending] of pendingSpans) {
    const endTime = getTimestamp();
    events.push({
      name: pending.name,
      cat: pending.category,
      ph: "E",
      ts: endTime,
      pid: pending.agentInfo.processId,
      tid: pending.agentInfo.threadId,
      args: {
        ...pending.args,
        incomplete: true,
        duration_ms: (endTime - pending.startTime) / 1e3
      }
    });
    pendingSpans.delete(spanId);
  }
}
async function periodicWrite() {
  if (!isEnabled || !tracePath || traceWritten) return;
  try {
    await mkdir(dirname(tracePath), { recursive: true });
    await writeFile(tracePath, buildTraceDocument());
    logForDebugging(
      `[Perfetto] Periodic write: ${events.length} events to ${tracePath}`
    );
  } catch (error) {
    logForDebugging(
      `[Perfetto] Periodic write failed: ${errorMessage(error)}`,
      { level: "error" }
    );
  }
}
async function writePerfettoTrace() {
  if (!isEnabled || !tracePath || traceWritten) {
    logForDebugging(
      `[Perfetto] Skipping final write: isEnabled=${isEnabled}, tracePath=${tracePath}, traceWritten=${traceWritten}`
    );
    return;
  }
  stopWriteInterval();
  closeOpenSpans();
  logForDebugging(
    `[Perfetto] writePerfettoTrace called: events=${events.length}`
  );
  try {
    await mkdir(dirname(tracePath), { recursive: true });
    await writeFile(tracePath, buildTraceDocument());
    traceWritten = true;
    logForDebugging(`[Perfetto] Trace finalized at: ${tracePath}`);
  } catch (error) {
    logForDebugging(
      `[Perfetto] Failed to write final trace: ${errorMessage(error)}`,
      { level: "error" }
    );
  }
}
function writePerfettoTraceSync() {
  if (!isEnabled || !tracePath || traceWritten) {
    logForDebugging(
      `[Perfetto] Skipping final sync write: isEnabled=${isEnabled}, tracePath=${tracePath}, traceWritten=${traceWritten}`
    );
    return;
  }
  stopWriteInterval();
  closeOpenSpans();
  logForDebugging(
    `[Perfetto] writePerfettoTraceSync called: events=${events.length}`
  );
  try {
    const dir = dirname(tracePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(tracePath, buildTraceDocument());
    traceWritten = true;
    logForDebugging(`[Perfetto] Trace finalized synchronously at: ${tracePath}`);
  } catch (error) {
    logForDebugging(
      `[Perfetto] Failed to write final trace synchronously: ${errorMessage(error)}`,
      { level: "error" }
    );
  }
}
function getPerfettoEvents() {
  return [...metadataEvents, ...events];
}
function resetPerfettoTracer() {
  if (staleSpanCleanupId) {
    clearInterval(staleSpanCleanupId);
    staleSpanCleanupId = null;
  }
  stopWriteInterval();
  metadataEvents.length = 0;
  events.length = 0;
  pendingSpans.clear();
  agentRegistry.clear();
  agentIdToProcessId.clear();
  totalAgentCount = 0;
  processIdCounter = 1;
  spanIdCounter = 0;
  isEnabled = false;
  tracePath = null;
  startTimeMs = 0;
  traceWritten = false;
}
async function triggerPeriodicWriteForTesting() {
  await periodicWrite();
}
function evictStaleSpansForTesting() {
  evictStaleSpans();
}
const MAX_EVENTS_FOR_TESTING = MAX_EVENTS;
function evictOldestEventsForTesting() {
  evictOldestEvents();
}
export {
  MAX_EVENTS_FOR_TESTING,
  emitPerfettoCounter,
  emitPerfettoInstant,
  endInteractionPerfettoSpan,
  endLLMRequestPerfettoSpan,
  endToolPerfettoSpan,
  endUserInputPerfettoSpan,
  evictOldestEventsForTesting,
  evictStaleSpansForTesting,
  getPerfettoEvents,
  initializePerfettoTracing,
  isPerfettoTracingEnabled,
  registerAgent,
  resetPerfettoTracer,
  startInteractionPerfettoSpan,
  startLLMRequestPerfettoSpan,
  startToolPerfettoSpan,
  startUserInputPerfettoSpan,
  triggerPeriodicWriteForTesting,
  unregisterAgent
};
