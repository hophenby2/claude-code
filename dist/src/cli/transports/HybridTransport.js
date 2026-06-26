import axios from "axios";
import { logForDebugging } from "../../utils/debug.js";
import { logForDiagnosticsNoPII } from "../../utils/diagLogs.js";
import { getSessionIngressAuthToken } from "../../utils/sessionIngressAuth.js";
import { SerialBatchEventUploader } from "./SerialBatchEventUploader.js";
import {
  WebSocketTransport
} from "./WebSocketTransport.js";
const BATCH_FLUSH_INTERVAL_MS = 100;
const POST_TIMEOUT_MS = 15e3;
const CLOSE_GRACE_MS = 3e3;
class HybridTransport extends WebSocketTransport {
  postUrl;
  uploader;
  // stream_event delay buffer — accumulates content deltas for up to
  // BATCH_FLUSH_INTERVAL_MS before enqueueing (reduces POST count)
  streamEventBuffer = [];
  streamEventTimer = null;
  constructor(url, headers = {}, sessionId, refreshHeaders, options) {
    super(url, headers, sessionId, refreshHeaders, options);
    const { maxConsecutiveFailures, onBatchDropped } = options ?? {};
    this.postUrl = convertWsUrlToPostUrl(url);
    this.uploader = new SerialBatchEventUploader({
      // Large cap — session-ingress accepts arbitrary batch sizes. Events
      // naturally batch during in-flight POSTs; this just bounds the payload.
      maxBatchSize: 500,
      // Bridge callers use `void transport.write()` — backpressure doesn't
      // apply (they don't await). A batch >maxQueueSize deadlocks (see
      // SerialBatchEventUploader backpressure check). So set it high enough
      // to be a memory bound only. Wire real backpressure in a follow-up
      // once callers await.
      maxQueueSize: 1e5,
      baseDelayMs: 500,
      maxDelayMs: 8e3,
      jitterMs: 1e3,
      // Optional cap so a persistently-failing server can't pin the drain
      // loop for the lifetime of the process. Undefined = indefinite retry.
      // replBridge sets this; the 1P transportUtils path does not.
      maxConsecutiveFailures,
      onBatchDropped: (batchSize, failures) => {
        logForDiagnosticsNoPII(
          "error",
          "cli_hybrid_batch_dropped_max_failures",
          {
            batchSize,
            failures
          }
        );
        onBatchDropped?.(batchSize, failures);
      },
      send: (batch) => this.postOnce(batch)
    });
    logForDebugging(`HybridTransport: POST URL = ${this.postUrl}`);
    logForDiagnosticsNoPII("info", "cli_hybrid_transport_initialized");
  }
  /**
   * Enqueue a message and wait for the queue to drain. Returning flush()
   * preserves the contract that `await write()` resolves after the event is
   * POSTed (relied on by tests and replBridge's initial flush). Fire-and-forget
   * callers (`void transport.write()`) are unaffected — they don't await,
   * so the later resolution doesn't add latency.
   */
  async write(message) {
    if (message.type === "stream_event") {
      this.streamEventBuffer.push(message);
      if (!this.streamEventTimer) {
        this.streamEventTimer = setTimeout(
          () => this.flushStreamEvents(),
          BATCH_FLUSH_INTERVAL_MS
        );
      }
      return;
    }
    await this.uploader.enqueue([...this.takeStreamEvents(), message]);
    return this.uploader.flush();
  }
  async writeBatch(messages) {
    await this.uploader.enqueue([...this.takeStreamEvents(), ...messages]);
    return this.uploader.flush();
  }
  /** Snapshot before/after writeBatch() to detect silent drops. */
  get droppedBatchCount() {
    return this.uploader.droppedBatchCount;
  }
  /**
   * Block until all pending events are POSTed. Used by bridge's initial
   * history flush so onStateChange('connected') fires after persistence.
   */
  flush() {
    void this.uploader.enqueue(this.takeStreamEvents());
    return this.uploader.flush();
  }
  /** Take ownership of buffered stream_events and clear the delay timer. */
  takeStreamEvents() {
    if (this.streamEventTimer) {
      clearTimeout(this.streamEventTimer);
      this.streamEventTimer = null;
    }
    const buffered = this.streamEventBuffer;
    this.streamEventBuffer = [];
    return buffered;
  }
  /** Delay timer fired — enqueue accumulated stream_events. */
  flushStreamEvents() {
    this.streamEventTimer = null;
    void this.uploader.enqueue(this.takeStreamEvents());
  }
  close() {
    if (this.streamEventTimer) {
      clearTimeout(this.streamEventTimer);
      this.streamEventTimer = null;
    }
    this.streamEventBuffer = [];
    const uploader = this.uploader;
    let graceTimer;
    void Promise.race([
      uploader.flush(),
      new Promise((r) => {
        graceTimer = setTimeout(r, CLOSE_GRACE_MS);
      })
    ]).finally(() => {
      clearTimeout(graceTimer);
      uploader.close();
    });
    super.close();
  }
  /**
   * Single-attempt POST. Throws on retryable failures (429, 5xx, network)
   * so SerialBatchEventUploader re-queues and retries. Returns on success
   * and on permanent failures (4xx non-429, no token) so the uploader moves on.
   */
  async postOnce(events) {
    const sessionToken = getSessionIngressAuthToken();
    if (!sessionToken) {
      logForDebugging("HybridTransport: No session token available for POST");
      logForDiagnosticsNoPII("warn", "cli_hybrid_post_no_token");
      return;
    }
    const headers = {
      Authorization: `Bearer ${sessionToken}`,
      "Content-Type": "application/json"
    };
    let response;
    try {
      response = await axios.post(
        this.postUrl,
        { events },
        {
          headers,
          validateStatus: () => true,
          timeout: POST_TIMEOUT_MS
        }
      );
    } catch (error) {
      const axiosError = error;
      logForDebugging(`HybridTransport: POST error: ${axiosError.message}`);
      logForDiagnosticsNoPII("warn", "cli_hybrid_post_network_error");
      throw error;
    }
    if (response.status >= 200 && response.status < 300) {
      logForDebugging(`HybridTransport: POST success count=${events.length}`);
      return;
    }
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      logForDebugging(
        `HybridTransport: POST returned ${response.status} (permanent), dropping`
      );
      logForDiagnosticsNoPII("warn", "cli_hybrid_post_client_error", {
        status: response.status
      });
      return;
    }
    logForDebugging(
      `HybridTransport: POST returned ${response.status} (retryable)`
    );
    logForDiagnosticsNoPII("warn", "cli_hybrid_post_retryable_error", {
      status: response.status
    });
    throw new Error(`POST failed with ${response.status}`);
  }
}
function convertWsUrlToPostUrl(wsUrl) {
  const protocol = wsUrl.protocol === "wss:" ? "https:" : "http:";
  let pathname = wsUrl.pathname;
  pathname = pathname.replace("/ws/", "/session/");
  if (!pathname.endsWith("/events")) {
    pathname = pathname.endsWith("/") ? pathname + "events" : pathname + "/events";
  }
  return `${protocol}//${wsUrl.host}${pathname}${wsUrl.search}`;
}
export {
  HybridTransport
};
