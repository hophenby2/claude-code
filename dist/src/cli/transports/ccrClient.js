import { randomUUID } from "crypto";
import { decodeJwtExpiry } from "../../bridge/jwtUtils.js";
import { logForDebugging } from "../../utils/debug.js";
import { logForDiagnosticsNoPII } from "../../utils/diagLogs.js";
import { errorMessage, getErrnoCode } from "../../utils/errors.js";
import { createAxiosInstance } from "../../utils/proxy.js";
import {
  registerSessionActivityCallback,
  unregisterSessionActivityCallback
} from "../../utils/sessionActivity.js";
import {
  getSessionIngressAuthHeaders,
  getSessionIngressAuthToken
} from "../../utils/sessionIngressAuth.js";
import { sleep } from "../../utils/sleep.js";
import { getClaudeCodeUserAgent } from "../../utils/userAgent.js";
import {
  RetryableError,
  SerialBatchEventUploader
} from "./SerialBatchEventUploader.js";
import { WorkerStateUploader } from "./WorkerStateUploader.js";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 2e4;
const STREAM_EVENT_FLUSH_INTERVAL_MS = 100;
function alwaysValidStatus() {
  return true;
}
class CCRInitError extends Error {
  constructor(reason) {
    super(`CCRClient init failed: ${reason}`);
    this.reason = reason;
  }
  reason;
}
const MAX_CONSECUTIVE_AUTH_FAILURES = 10;
function createStreamAccumulator() {
  return { byMessage: /* @__PURE__ */ new Map(), scopeToMessage: /* @__PURE__ */ new Map() };
}
function scopeKey(m) {
  return `${m.session_id}:${m.parent_tool_use_id ?? ""}`;
}
function accumulateStreamEvents(buffer, state) {
  const out = [];
  const touched = /* @__PURE__ */ new Map();
  for (const msg of buffer) {
    switch (msg.event.type) {
      case "message_start": {
        const id = msg.event.message.id;
        const prevId = state.scopeToMessage.get(scopeKey(msg));
        if (prevId) state.byMessage.delete(prevId);
        state.scopeToMessage.set(scopeKey(msg), id);
        state.byMessage.set(id, []);
        out.push(msg);
        break;
      }
      case "content_block_delta": {
        if (msg.event.delta.type !== "text_delta") {
          out.push(msg);
          break;
        }
        const messageId = state.scopeToMessage.get(scopeKey(msg));
        const blocks = messageId ? state.byMessage.get(messageId) : void 0;
        if (!blocks) {
          out.push(msg);
          break;
        }
        const chunks = blocks[msg.event.index] ??= [];
        chunks.push(msg.event.delta.text);
        const existing = touched.get(chunks);
        if (existing) {
          existing.event.delta.text = chunks.join("");
          break;
        }
        const snapshot = {
          type: "stream_event",
          uuid: msg.uuid,
          session_id: msg.session_id,
          parent_tool_use_id: msg.parent_tool_use_id,
          event: {
            type: "content_block_delta",
            index: msg.event.index,
            delta: { type: "text_delta", text: chunks.join("") }
          }
        };
        touched.set(chunks, snapshot);
        out.push(snapshot);
        break;
      }
      default:
        out.push(msg);
    }
  }
  return out;
}
function clearStreamAccumulatorForMessage(state, assistant) {
  state.byMessage.delete(assistant.message.id);
  const scope = scopeKey(assistant);
  if (state.scopeToMessage.get(scope) === assistant.message.id) {
    state.scopeToMessage.delete(scope);
  }
}
class CCRClient {
  workerEpoch = 0;
  heartbeatIntervalMs;
  heartbeatJitterFraction;
  heartbeatTimer = null;
  heartbeatInFlight = false;
  closed = false;
  consecutiveAuthFailures = 0;
  currentState = null;
  sessionBaseUrl;
  sessionId;
  http = createAxiosInstance({ keepAlive: true });
  // stream_event delay buffer — accumulates content deltas for up to
  // STREAM_EVENT_FLUSH_INTERVAL_MS before enqueueing (reduces POST count
  // and enables text_delta coalescing). Mirrors HybridTransport's pattern.
  streamEventBuffer = [];
  streamEventTimer = null;
  // Full-so-far text accumulator. Persists across flushes so each emitted
  // text_delta event carries the complete text from the start of the block —
  // mid-stream reconnects see a self-contained snapshot. Keyed by API message
  // ID; cleared in writeEvent when the complete assistant message arrives.
  streamTextAccumulator = createStreamAccumulator();
  workerState;
  eventUploader;
  internalEventUploader;
  deliveryUploader;
  /**
   * Called when the server returns 409 (a newer worker epoch superseded ours).
   * Default: process.exit(1) — correct for spawn-mode children where the
   * parent bridge re-spawns. In-process callers (replBridge) MUST override
   * this to close gracefully instead; exit would kill the user's REPL.
   */
  onEpochMismatch;
  /**
   * Auth header source. Defaults to the process-wide session-ingress token
   * (CLAUDE_CODE_SESSION_ACCESS_TOKEN env var). Callers managing multiple
   * concurrent sessions with distinct JWTs MUST inject this — the env-var
   * path is a process global and would stomp across sessions.
   */
  getAuthHeaders;
  constructor(transport, sessionUrl, opts) {
    this.onEpochMismatch = opts?.onEpochMismatch ?? (() => {
      process.exit(1);
    });
    this.heartbeatIntervalMs = opts?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.heartbeatJitterFraction = opts?.heartbeatJitterFraction ?? 0;
    this.getAuthHeaders = opts?.getAuthHeaders ?? getSessionIngressAuthHeaders;
    if (sessionUrl.protocol !== "http:" && sessionUrl.protocol !== "https:") {
      throw new Error(
        `CCRClient: Expected http(s) URL, got ${sessionUrl.protocol}`
      );
    }
    const pathname = sessionUrl.pathname.replace(/\/$/, "");
    this.sessionBaseUrl = `${sessionUrl.protocol}//${sessionUrl.host}${pathname}`;
    this.sessionId = pathname.split("/").pop() || "";
    this.workerState = new WorkerStateUploader({
      send: (body) => this.request(
        "put",
        "/worker",
        { worker_epoch: this.workerEpoch, ...body },
        "PUT worker"
      ).then((r) => r.ok),
      baseDelayMs: 500,
      maxDelayMs: 3e4,
      jitterMs: 500
    });
    this.eventUploader = new SerialBatchEventUploader({
      maxBatchSize: 100,
      maxBatchBytes: 10 * 1024 * 1024,
      // flushStreamEventBuffer() enqueues a full 100ms window of accumulated
      // stream_events in one call. A burst of mixed delta types that don't
      // fold into a single snapshot could exceed the old cap (50) and deadlock
      // on the SerialBatchEventUploader backpressure check. Match
      // HybridTransport's bound — high enough to be memory-only.
      maxQueueSize: 1e5,
      send: async (batch) => {
        const result = await this.request(
          "post",
          "/worker/events",
          { worker_epoch: this.workerEpoch, events: batch },
          "client events"
        );
        if (!result.ok) {
          throw new RetryableError(
            "client event POST failed",
            result.retryAfterMs
          );
        }
      },
      baseDelayMs: 500,
      maxDelayMs: 3e4,
      jitterMs: 500
    });
    this.internalEventUploader = new SerialBatchEventUploader({
      maxBatchSize: 100,
      maxBatchBytes: 10 * 1024 * 1024,
      maxQueueSize: 200,
      send: async (batch) => {
        const result = await this.request(
          "post",
          "/worker/internal-events",
          { worker_epoch: this.workerEpoch, events: batch },
          "internal events"
        );
        if (!result.ok) {
          throw new RetryableError(
            "internal event POST failed",
            result.retryAfterMs
          );
        }
      },
      baseDelayMs: 500,
      maxDelayMs: 3e4,
      jitterMs: 500
    });
    this.deliveryUploader = new SerialBatchEventUploader({
      maxBatchSize: 64,
      maxQueueSize: 64,
      send: async (batch) => {
        const result = await this.request(
          "post",
          "/worker/events/delivery",
          {
            worker_epoch: this.workerEpoch,
            updates: batch.map((d) => ({
              event_id: d.eventId,
              status: d.status
            }))
          },
          "delivery batch"
        );
        if (!result.ok) {
          throw new RetryableError("delivery POST failed", result.retryAfterMs);
        }
      },
      baseDelayMs: 500,
      maxDelayMs: 3e4,
      jitterMs: 500
    });
    transport.setOnEvent((event) => {
      this.reportDelivery(event.event_id, "received");
    });
  }
  /**
   * Initialize the session worker:
   * 1. Take worker_epoch from the argument, or fall back to
   *    CLAUDE_CODE_WORKER_EPOCH (set by env-manager / bridge spawner)
   * 2. Report state as 'idle'
   * 3. Start heartbeat timer
   *
   * In-process callers (replBridge) pass the epoch directly — they
   * registered the worker themselves and there is no parent process
   * setting env vars.
   */
  async initialize(epoch) {
    const startMs = Date.now();
    if (Object.keys(this.getAuthHeaders()).length === 0) {
      throw new CCRInitError("no_auth_headers");
    }
    if (epoch === void 0) {
      const rawEpoch = process.env.CLAUDE_CODE_WORKER_EPOCH;
      epoch = rawEpoch ? parseInt(rawEpoch, 10) : NaN;
    }
    if (isNaN(epoch)) {
      throw new CCRInitError("missing_epoch");
    }
    this.workerEpoch = epoch;
    const restoredPromise = this.getWorkerState();
    const result = await this.request(
      "put",
      "/worker",
      {
        worker_status: "idle",
        worker_epoch: this.workerEpoch,
        // Clear stale pending_action/task_summary left by a prior
        // worker crash — the in-session clears don't survive process restart.
        external_metadata: {
          pending_action: null,
          task_summary: null
        }
      },
      "PUT worker (init)"
    );
    if (!result.ok) {
      throw new CCRInitError("worker_register_failed");
    }
    this.currentState = "idle";
    this.startHeartbeat();
    registerSessionActivityCallback(() => {
      void this.writeEvent({ type: "keep_alive" });
    });
    logForDebugging(`CCRClient: initialized, epoch=${this.workerEpoch}`);
    logForDiagnosticsNoPII("info", "cli_worker_lifecycle_initialized", {
      epoch: this.workerEpoch,
      duration_ms: Date.now() - startMs
    });
    const { metadata, durationMs } = await restoredPromise;
    if (!this.closed) {
      logForDiagnosticsNoPII("info", "cli_worker_state_restored", {
        duration_ms: durationMs,
        had_state: metadata !== null
      });
    }
    return metadata;
  }
  // Control_requests are marked processed and not re-delivered on
  // restart, so read back what the prior worker wrote.
  async getWorkerState() {
    const startMs = Date.now();
    const authHeaders = this.getAuthHeaders();
    if (Object.keys(authHeaders).length === 0) {
      return { metadata: null, durationMs: 0 };
    }
    const data = await this.getWithRetry(
      `${this.sessionBaseUrl}/worker`,
      authHeaders,
      "worker_state"
    );
    return {
      metadata: data?.worker?.external_metadata ?? null,
      durationMs: Date.now() - startMs
    };
  }
  /**
   * Send an authenticated HTTP request to CCR. Handles auth headers,
   * 409 epoch mismatch, and error logging. Returns { ok: true } on 2xx.
   * On 429, reads Retry-After (integer seconds) so the uploader can honor
   * the server's backoff hint instead of blindly exponentiating.
   */
  async request(method, path, body, label, { timeout = 1e4 } = {}) {
    const authHeaders = this.getAuthHeaders();
    if (Object.keys(authHeaders).length === 0) return { ok: false };
    try {
      const response = await this.http[method](
        `${this.sessionBaseUrl}${path}`,
        body,
        {
          headers: {
            ...authHeaders,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "User-Agent": getClaudeCodeUserAgent()
          },
          validateStatus: alwaysValidStatus,
          timeout
        }
      );
      if (response.status >= 200 && response.status < 300) {
        this.consecutiveAuthFailures = 0;
        return { ok: true };
      }
      if (response.status === 409) {
        this.handleEpochMismatch();
      }
      if (response.status === 401 || response.status === 403) {
        const tok = getSessionIngressAuthToken();
        const exp = tok ? decodeJwtExpiry(tok) : null;
        if (exp !== null && exp * 1e3 < Date.now()) {
          logForDebugging(
            `CCRClient: session_token expired (exp=${new Date(exp * 1e3).toISOString()}) \u2014 no refresh was delivered, exiting`,
            { level: "error" }
          );
          logForDiagnosticsNoPII("error", "cli_worker_token_expired_no_refresh");
          this.onEpochMismatch();
        }
        this.consecutiveAuthFailures++;
        if (this.consecutiveAuthFailures >= MAX_CONSECUTIVE_AUTH_FAILURES) {
          logForDebugging(
            `CCRClient: ${this.consecutiveAuthFailures} consecutive auth failures with a valid-looking token \u2014 server-side auth unrecoverable, exiting`,
            { level: "error" }
          );
          logForDiagnosticsNoPII("error", "cli_worker_auth_failures_exhausted");
          this.onEpochMismatch();
        }
      }
      logForDebugging(`CCRClient: ${label} returned ${response.status}`, {
        level: "warn"
      });
      logForDiagnosticsNoPII("warn", "cli_worker_request_failed", {
        method,
        path,
        status: response.status
      });
      if (response.status === 429) {
        const raw = response.headers?.["retry-after"];
        const seconds = typeof raw === "string" ? parseInt(raw, 10) : NaN;
        if (!isNaN(seconds) && seconds >= 0) {
          return { ok: false, retryAfterMs: seconds * 1e3 };
        }
      }
      return { ok: false };
    } catch (error) {
      logForDebugging(`CCRClient: ${label} failed: ${errorMessage(error)}`, {
        level: "warn"
      });
      logForDiagnosticsNoPII("warn", "cli_worker_request_error", {
        method,
        path,
        error_code: getErrnoCode(error)
      });
      return { ok: false };
    }
  }
  /** Report worker state to CCR via PUT /sessions/{id}/worker. */
  reportState(state, details) {
    if (state === this.currentState && !details) return;
    this.currentState = state;
    this.workerState.enqueue({
      worker_status: state,
      requires_action_details: details ? {
        tool_name: details.tool_name,
        action_description: details.action_description,
        request_id: details.request_id
      } : null
    });
  }
  /** Report external metadata to CCR via PUT /worker. */
  reportMetadata(metadata) {
    this.workerState.enqueue({ external_metadata: metadata });
  }
  /**
   * Handle epoch mismatch (409 Conflict). A newer CC instance has replaced
   * this one — exit immediately.
   */
  handleEpochMismatch() {
    logForDebugging("CCRClient: Epoch mismatch (409), shutting down", {
      level: "error"
    });
    logForDiagnosticsNoPII("error", "cli_worker_epoch_mismatch");
    this.onEpochMismatch();
  }
  /** Start periodic heartbeat. */
  startHeartbeat() {
    this.stopHeartbeat();
    const schedule = () => {
      const jitter = this.heartbeatIntervalMs * this.heartbeatJitterFraction * (2 * Math.random() - 1);
      this.heartbeatTimer = setTimeout(tick, this.heartbeatIntervalMs + jitter);
    };
    const tick = () => {
      void this.sendHeartbeat();
      if (this.heartbeatTimer === null) return;
      schedule();
    };
    schedule();
  }
  /** Stop heartbeat timer. */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  /** Send a heartbeat via POST /sessions/{id}/worker/heartbeat. */
  async sendHeartbeat() {
    if (this.heartbeatInFlight) return;
    this.heartbeatInFlight = true;
    try {
      const result = await this.request(
        "post",
        "/worker/heartbeat",
        { session_id: this.sessionId, worker_epoch: this.workerEpoch },
        "Heartbeat",
        { timeout: 5e3 }
      );
      if (result.ok) {
        logForDebugging("CCRClient: Heartbeat sent");
      }
    } finally {
      this.heartbeatInFlight = false;
    }
  }
  /**
   * Write a StdoutMessage as a client event via POST /sessions/{id}/worker/events.
   * These events are visible to frontend clients via the SSE stream.
   * Injects a UUID if missing to ensure server-side idempotency on retry.
   *
   * stream_event messages are held in a 100ms delay buffer and accumulated
   * (text_deltas for the same content block emit a full-so-far snapshot per
   * flush). A non-stream_event write flushes the buffer first so downstream
   * ordering is preserved.
   */
  async writeEvent(message) {
    if (message.type === "stream_event") {
      this.streamEventBuffer.push(message);
      if (!this.streamEventTimer) {
        this.streamEventTimer = setTimeout(
          () => void this.flushStreamEventBuffer(),
          STREAM_EVENT_FLUSH_INTERVAL_MS
        );
      }
      return;
    }
    await this.flushStreamEventBuffer();
    if (message.type === "assistant") {
      clearStreamAccumulatorForMessage(this.streamTextAccumulator, message);
    }
    await this.eventUploader.enqueue(this.toClientEvent(message));
  }
  /** Wrap a StdoutMessage as a ClientEvent, injecting a UUID if missing. */
  toClientEvent(message) {
    const msg = message;
    return {
      payload: {
        ...msg,
        uuid: typeof msg.uuid === "string" ? msg.uuid : randomUUID()
      }
    };
  }
  /**
   * Drain the stream_event delay buffer: accumulate text_deltas into
   * full-so-far snapshots, clear the timer, enqueue the resulting events.
   * Called from the timer, from writeEvent on a non-stream message, and from
   * flush(). close() drops the buffer — call flush() first if you need
   * delivery.
   */
  async flushStreamEventBuffer() {
    if (this.streamEventTimer) {
      clearTimeout(this.streamEventTimer);
      this.streamEventTimer = null;
    }
    if (this.streamEventBuffer.length === 0) return;
    const buffered = this.streamEventBuffer;
    this.streamEventBuffer = [];
    const payloads = accumulateStreamEvents(
      buffered,
      this.streamTextAccumulator
    );
    await this.eventUploader.enqueue(
      payloads.map((payload) => ({ payload, ephemeral: true }))
    );
  }
  /**
   * Write an internal worker event via POST /sessions/{id}/worker/internal-events.
   * These events are NOT visible to frontend clients — they store worker-internal
   * state (transcript messages, compaction markers) needed for session resume.
   */
  async writeInternalEvent(eventType, payload, {
    isCompaction = false,
    agentId
  } = {}) {
    const event = {
      payload: {
        type: eventType,
        ...payload,
        uuid: typeof payload.uuid === "string" ? payload.uuid : randomUUID()
      },
      ...isCompaction && { is_compaction: true },
      ...agentId && { agent_id: agentId }
    };
    await this.internalEventUploader.enqueue(event);
  }
  /**
   * Flush pending internal events. Call between turns and on shutdown
   * to ensure transcript entries are persisted.
   */
  flushInternalEvents() {
    return this.internalEventUploader.flush();
  }
  /**
   * Flush pending client events (writeEvent queue). Call before close()
   * when the caller needs delivery confirmation — close() abandons the
   * queue. Resolves once the uploader drains or rejects; returns
   * regardless of whether individual POSTs succeeded (check server state
   * separately if that matters).
   */
  async flush() {
    await this.flushStreamEventBuffer();
    return this.eventUploader.flush();
  }
  /**
   * Read foreground agent internal events from
   * GET /sessions/{id}/worker/internal-events.
   * Returns transcript entries from the last compaction boundary, or null on failure.
   * Used for session resume.
   */
  async readInternalEvents() {
    return this.paginatedGet("/worker/internal-events", {}, "internal_events");
  }
  /**
   * Read all subagent internal events from
   * GET /sessions/{id}/worker/internal-events?subagents=true.
   * Returns a merged stream across all non-foreground agents, each from its
   * compaction point. Used for session resume.
   */
  async readSubagentInternalEvents() {
    return this.paginatedGet(
      "/worker/internal-events",
      { subagents: "true" },
      "subagent_events"
    );
  }
  /**
   * Paginated GET with retry. Fetches all pages from a list endpoint,
   * retrying each page on failure with exponential backoff + jitter.
   */
  async paginatedGet(path, params, context) {
    const authHeaders = this.getAuthHeaders();
    if (Object.keys(authHeaders).length === 0) return null;
    const allEvents = [];
    let cursor;
    do {
      const url = new URL(`${this.sessionBaseUrl}${path}`);
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }
      const page = await this.getWithRetry(
        url.toString(),
        authHeaders,
        context
      );
      if (!page) return null;
      allEvents.push(...page.data ?? []);
      cursor = page.next_cursor;
    } while (cursor);
    logForDebugging(
      `CCRClient: Read ${allEvents.length} internal events from ${path}${params.subagents ? " (subagents)" : ""}`
    );
    return allEvents;
  }
  /**
   * Single GET request with retry. Returns the parsed response body
   * on success, null if all retries are exhausted.
   */
  async getWithRetry(url, authHeaders, context) {
    for (let attempt = 1; attempt <= 10; attempt++) {
      let response;
      try {
        response = await this.http.get(url, {
          headers: {
            ...authHeaders,
            "anthropic-version": "2023-06-01",
            "User-Agent": getClaudeCodeUserAgent()
          },
          validateStatus: alwaysValidStatus,
          timeout: 3e4
        });
      } catch (error) {
        logForDebugging(
          `CCRClient: GET ${url} failed (attempt ${attempt}/10): ${errorMessage(error)}`,
          { level: "warn" }
        );
        if (attempt < 10) {
          const delay = Math.min(500 * 2 ** (attempt - 1), 3e4) + Math.random() * 500;
          await sleep(delay);
        }
        continue;
      }
      if (response.status >= 200 && response.status < 300) {
        return response.data;
      }
      if (response.status === 409) {
        this.handleEpochMismatch();
      }
      logForDebugging(
        `CCRClient: GET ${url} returned ${response.status} (attempt ${attempt}/10)`,
        { level: "warn" }
      );
      if (attempt < 10) {
        const delay = Math.min(500 * 2 ** (attempt - 1), 3e4) + Math.random() * 500;
        await sleep(delay);
      }
    }
    logForDebugging("CCRClient: GET retries exhausted", { level: "error" });
    logForDiagnosticsNoPII("error", "cli_worker_get_retries_exhausted", {
      context
    });
    return null;
  }
  /**
   * Report delivery status for a client-to-worker event.
   * POST /v1/code/sessions/{id}/worker/events/delivery (batch endpoint)
   */
  reportDelivery(eventId, status) {
    void this.deliveryUploader.enqueue({ eventId, status });
  }
  /** Get the current epoch (for external use). */
  getWorkerEpoch() {
    return this.workerEpoch;
  }
  /** Internal-event queue depth — shutdown-snapshot backpressure signal. */
  get internalEventsPending() {
    return this.internalEventUploader.pendingCount;
  }
  /** Clean up uploaders and timers. */
  close() {
    this.closed = true;
    this.stopHeartbeat();
    unregisterSessionActivityCallback();
    if (this.streamEventTimer) {
      clearTimeout(this.streamEventTimer);
      this.streamEventTimer = null;
    }
    this.streamEventBuffer = [];
    this.streamTextAccumulator.byMessage.clear();
    this.streamTextAccumulator.scopeToMessage.clear();
    this.workerState.close();
    this.eventUploader.close();
    this.internalEventUploader.close();
    this.deliveryUploader.close();
  }
}
export {
  CCRClient,
  CCRInitError,
  accumulateStreamEvents,
  clearStreamAccumulatorForMessage,
  createStreamAccumulator
};
