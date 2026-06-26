import { csi } from "./termio/csi.js";
import { osc } from "./termio/osc.js";
function decrqm(mode) {
  return {
    request: csi(`?${mode}$p`),
    match: (r) => r.type === "decrpm" && r.mode === mode
  };
}
function da1() {
  return {
    request: csi("c"),
    match: (r) => r.type === "da1"
  };
}
function da2() {
  return {
    request: csi(">c"),
    match: (r) => r.type === "da2"
  };
}
function kittyKeyboard() {
  return {
    request: csi("?u"),
    match: (r) => r.type === "kittyKeyboard"
  };
}
function cursorPosition() {
  return {
    request: csi("?6n"),
    match: (r) => r.type === "cursorPosition"
  };
}
function oscColor(code) {
  return {
    request: osc(code, "?"),
    match: (r) => r.type === "osc" && r.code === code
  };
}
function xtversion() {
  return {
    request: csi(">0q"),
    match: (r) => r.type === "xtversion"
  };
}
const SENTINEL = csi("c");
class TerminalQuerier {
  constructor(stdout) {
    this.stdout = stdout;
  }
  stdout;
  /**
   * Interleaved queue of queries and sentinels in send order. Terminals
   * respond in order, so each flush() barrier only drains queries queued
   * before it — concurrent batches from independent callers stay isolated.
   */
  queue = [];
  /**
   * Send a query and wait for its response.
   *
   * Resolves with the response when `query.match` matches an incoming
   * TerminalResponse, or with `undefined` when a flush() sentinel arrives
   * before any matching response (meaning the terminal ignored the query).
   *
   * Never rejects; never times out on its own. If you never call flush()
   * and the terminal doesn't respond, the promise remains pending.
   */
  send(query) {
    return new Promise((resolve) => {
      this.queue.push({
        kind: "query",
        match: query.match,
        resolve: (r) => resolve(r)
      });
      this.stdout.write(query.request);
    });
  }
  /**
   * Send the DA1 sentinel. Resolves when DA1's response arrives.
   *
   * As a side effect, all queries still pending when DA1 arrives are
   * resolved with `undefined` (terminal didn't respond → doesn't support
   * the query). This is the barrier that makes send() timeout-free.
   *
   * Safe to call with no pending queries — still waits for a round-trip.
   */
  flush() {
    return new Promise((resolve) => {
      this.queue.push({ kind: "sentinel", resolve });
      this.stdout.write(SENTINEL);
    });
  }
  /**
   * Dispatch a response parsed from stdin. Called by App.tsx's
   * processKeysInBatch for every `kind: 'response'` item.
   *
   * Matching strategy:
   * - First, try to match a pending query (FIFO, first match wins).
   *   This lets callers send(da1()) explicitly if they want the DA1
   *   params — a separate DA1 write means the terminal sends TWO DA1
   *   responses. The first matches the explicit query; the second
   *   (unmatched) fires the sentinel.
   * - Otherwise, if this is a DA1, fire the FIRST pending sentinel:
   *   resolve any queries queued before that sentinel with undefined
   *   (the terminal answered DA1 without answering them → unsupported)
   *   and signal its flush() completion. Only draining up to the first
   *   sentinel keeps later batches intact when multiple callers have
   *   concurrent queries in flight.
   * - Unsolicited responses (no match, no sentinel) are silently dropped.
   */
  onResponse(r) {
    const idx = this.queue.findIndex((p) => p.kind === "query" && p.match(r));
    if (idx !== -1) {
      const [q] = this.queue.splice(idx, 1);
      if (q?.kind === "query") q.resolve(r);
      return;
    }
    if (r.type === "da1") {
      const s = this.queue.findIndex((p) => p.kind === "sentinel");
      if (s === -1) return;
      for (const p of this.queue.splice(0, s + 1)) {
        if (p.kind === "query") p.resolve(void 0);
        else p.resolve();
      }
    }
  }
}
export {
  TerminalQuerier,
  cursorPosition,
  da1,
  da2,
  decrqm,
  kittyKeyboard,
  oscColor,
  xtversion
};
