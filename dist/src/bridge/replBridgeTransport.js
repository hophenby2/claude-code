import { CCRClient } from "../cli/transports/ccrClient.js";
import { SSETransport } from "../cli/transports/SSETransport.js";
import { logForDebugging } from "../utils/debug.js";
import { errorMessage } from "../utils/errors.js";
import { updateSessionIngressAuthToken } from "../utils/sessionIngressAuth.js";
import { registerWorker } from "./workSecret.js";
function createV1ReplTransport(hybrid) {
  return {
    write: (msg) => hybrid.write(msg),
    writeBatch: (msgs) => hybrid.writeBatch(msgs),
    close: () => hybrid.close(),
    isConnectedStatus: () => hybrid.isConnectedStatus(),
    getStateLabel: () => hybrid.getStateLabel(),
    setOnData: (cb) => hybrid.setOnData(cb),
    setOnClose: (cb) => hybrid.setOnClose(cb),
    setOnConnect: (cb) => hybrid.setOnConnect(cb),
    connect: () => void hybrid.connect(),
    // v1 Session-Ingress WS doesn't use SSE sequence numbers; replay
    // semantics are different. Always return 0 so the seq-num carryover
    // logic in replBridge is a no-op for v1.
    getLastSequenceNum: () => 0,
    get droppedBatchCount() {
      return hybrid.droppedBatchCount;
    },
    reportState: () => {
    },
    reportMetadata: () => {
    },
    reportDelivery: () => {
    },
    flush: () => Promise.resolve()
  };
}
async function createV2ReplTransport(opts) {
  const {
    sessionUrl,
    ingressToken,
    sessionId,
    initialSequenceNum,
    getAuthToken
  } = opts;
  let getAuthHeaders;
  if (getAuthToken) {
    getAuthHeaders = () => {
      const token = getAuthToken();
      if (!token) return {};
      return { Authorization: `Bearer ${token}` };
    };
  } else {
    updateSessionIngressAuthToken(ingressToken);
  }
  const epoch = opts.epoch ?? await registerWorker(sessionUrl, ingressToken);
  logForDebugging(
    `[bridge:repl] CCR v2: worker sessionId=${sessionId} epoch=${epoch}${opts.epoch !== void 0 ? " (from /bridge)" : " (via registerWorker)"}`
  );
  const sseUrl = new URL(sessionUrl);
  sseUrl.pathname = sseUrl.pathname.replace(/\/$/, "") + "/worker/events/stream";
  const sse = new SSETransport(
    sseUrl,
    {},
    sessionId,
    void 0,
    initialSequenceNum,
    getAuthHeaders
  );
  let onCloseCb;
  const ccr = new CCRClient(sse, new URL(sessionUrl), {
    getAuthHeaders,
    heartbeatIntervalMs: opts.heartbeatIntervalMs,
    heartbeatJitterFraction: opts.heartbeatJitterFraction,
    // Default is process.exit(1) — correct for spawn-mode children. In-process,
    // that kills the REPL. Close instead: replBridge's onClose wakes the poll
    // loop, which picks up the server's re-dispatch (with fresh epoch).
    onEpochMismatch: () => {
      logForDebugging(
        "[bridge:repl] CCR v2: epoch superseded (409) \u2014 closing for poll-loop recovery"
      );
      try {
        ccr.close();
        sse.close();
        onCloseCb?.(4090);
      } catch (closeErr) {
        logForDebugging(
          `[bridge:repl] CCR v2: error during epoch-mismatch cleanup: ${errorMessage(closeErr)}`,
          { level: "error" }
        );
      }
      throw new Error("epoch superseded");
    }
  });
  sse.setOnEvent((event) => {
    ccr.reportDelivery(event.event_id, "received");
    ccr.reportDelivery(event.event_id, "processed");
  });
  let onConnectCb;
  let ccrInitialized = false;
  let closed = false;
  return {
    write(msg) {
      return ccr.writeEvent(msg);
    },
    async writeBatch(msgs) {
      for (const m of msgs) {
        if (closed) break;
        await ccr.writeEvent(m);
      }
    },
    close() {
      closed = true;
      ccr.close();
      sse.close();
    },
    isConnectedStatus() {
      return ccrInitialized;
    },
    getStateLabel() {
      if (sse.isClosedStatus()) return "closed";
      if (sse.isConnectedStatus()) return ccrInitialized ? "connected" : "init";
      return "connecting";
    },
    setOnData(cb) {
      sse.setOnData(cb);
    },
    setOnClose(cb) {
      onCloseCb = cb;
      sse.setOnClose((code) => {
        ccr.close();
        cb(code ?? 4092);
      });
    },
    setOnConnect(cb) {
      onConnectCb = cb;
    },
    getLastSequenceNum() {
      return sse.getLastSequenceNum();
    },
    // v2 write path (CCRClient) doesn't set maxConsecutiveFailures — no drops.
    droppedBatchCount: 0,
    reportState(state) {
      ccr.reportState(state);
    },
    reportMetadata(metadata) {
      ccr.reportMetadata(metadata);
    },
    reportDelivery(eventId, status) {
      ccr.reportDelivery(eventId, status);
    },
    flush() {
      return ccr.flush();
    },
    connect() {
      if (!opts.outboundOnly) {
        void sse.connect();
      }
      void ccr.initialize(epoch).then(
        () => {
          ccrInitialized = true;
          logForDebugging(
            `[bridge:repl] v2 transport ready for writes (epoch=${epoch}, sse=${sse.isConnectedStatus() ? "open" : "opening"})`
          );
          onConnectCb?.();
        },
        (err) => {
          logForDebugging(
            `[bridge:repl] CCR v2 initialize failed: ${errorMessage(err)}`,
            { level: "error" }
          );
          ccr.close();
          sse.close();
          onCloseCb?.(4091);
        }
      );
    }
  };
}
export {
  createV1ReplTransport,
  createV2ReplTransport
};
