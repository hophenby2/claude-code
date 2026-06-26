import { jsonStringify } from "../../utils/slowOperations.js";
class RetryableError extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
  retryAfterMs;
}
class SerialBatchEventUploader {
  pending = [];
  pendingAtClose = 0;
  draining = false;
  closed = false;
  backpressureResolvers = [];
  sleepResolve = null;
  flushResolvers = [];
  droppedBatches = 0;
  config;
  constructor(config) {
    this.config = config;
  }
  /**
   * Monotonic count of batches dropped via maxConsecutiveFailures. Callers
   * can snapshot before flush() and compare after to detect silent drops
   * (flush() resolves normally even when batches were dropped).
   */
  get droppedBatchCount() {
    return this.droppedBatches;
  }
  /**
   * Pending queue depth. After close(), returns the count at close time —
   * close() clears the queue but shutdown diagnostics may read this after.
   */
  get pendingCount() {
    return this.closed ? this.pendingAtClose : this.pending.length;
  }
  /**
   * Add events to the pending buffer. Returns immediately if space is
   * available. Blocks (awaits) if the buffer is full — caller pauses
   * until drain frees space.
   */
  async enqueue(events) {
    if (this.closed) return;
    const items = Array.isArray(events) ? events : [events];
    if (items.length === 0) return;
    while (this.pending.length + items.length > this.config.maxQueueSize && !this.closed) {
      await new Promise((resolve) => {
        this.backpressureResolvers.push(resolve);
      });
    }
    if (this.closed) return;
    this.pending.push(...items);
    void this.drain();
  }
  /**
   * Block until all pending events have been sent.
   * Used at turn boundaries and graceful shutdown.
   */
  flush() {
    if (this.pending.length === 0 && !this.draining) {
      return Promise.resolve();
    }
    void this.drain();
    return new Promise((resolve) => {
      this.flushResolvers.push(resolve);
    });
  }
  /**
   * Drop pending events and stop processing.
   * Resolves any blocked enqueue() and flush() callers.
   */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.pendingAtClose = this.pending.length;
    this.pending = [];
    this.sleepResolve?.();
    this.sleepResolve = null;
    for (const resolve of this.backpressureResolvers) resolve();
    this.backpressureResolvers = [];
    for (const resolve of this.flushResolvers) resolve();
    this.flushResolvers = [];
  }
  /**
   * Drain loop. At most one instance runs at a time (guarded by this.draining).
   * Sends batches serially. On failure, backs off and retries indefinitely.
   */
  async drain() {
    if (this.draining || this.closed) return;
    this.draining = true;
    let failures = 0;
    try {
      while (this.pending.length > 0 && !this.closed) {
        const batch = this.takeBatch();
        if (batch.length === 0) continue;
        try {
          await this.config.send(batch);
          failures = 0;
        } catch (err) {
          failures++;
          if (this.config.maxConsecutiveFailures !== void 0 && failures >= this.config.maxConsecutiveFailures) {
            this.droppedBatches++;
            this.config.onBatchDropped?.(batch.length, failures);
            failures = 0;
            this.releaseBackpressure();
            continue;
          }
          this.pending = batch.concat(this.pending);
          const retryAfterMs = err instanceof RetryableError ? err.retryAfterMs : void 0;
          await this.sleep(this.retryDelay(failures, retryAfterMs));
          continue;
        }
        this.releaseBackpressure();
      }
    } finally {
      this.draining = false;
      if (this.pending.length === 0) {
        for (const resolve of this.flushResolvers) resolve();
        this.flushResolvers = [];
      }
    }
  }
  /**
   * Pull the next batch from pending. Respects both maxBatchSize and
   * maxBatchBytes. The first item is always taken; subsequent items only
   * if adding them keeps the cumulative JSON size under maxBatchBytes.
   *
   * Un-serializable items (BigInt, circular refs, throwing toJSON) are
   * dropped in place — they can never be sent and leaving them at
   * pending[0] would poison the queue and hang flush() forever.
   */
  takeBatch() {
    const { maxBatchSize, maxBatchBytes } = this.config;
    if (maxBatchBytes === void 0) {
      return this.pending.splice(0, maxBatchSize);
    }
    let bytes = 0;
    let count = 0;
    while (count < this.pending.length && count < maxBatchSize) {
      let itemBytes;
      try {
        itemBytes = Buffer.byteLength(jsonStringify(this.pending[count]));
      } catch {
        this.pending.splice(count, 1);
        continue;
      }
      if (count > 0 && bytes + itemBytes > maxBatchBytes) break;
      bytes += itemBytes;
      count++;
    }
    return this.pending.splice(0, count);
  }
  retryDelay(failures, retryAfterMs) {
    const jitter = Math.random() * this.config.jitterMs;
    if (retryAfterMs !== void 0) {
      const clamped = Math.max(
        this.config.baseDelayMs,
        Math.min(retryAfterMs, this.config.maxDelayMs)
      );
      return clamped + jitter;
    }
    const exponential = Math.min(
      this.config.baseDelayMs * 2 ** (failures - 1),
      this.config.maxDelayMs
    );
    return exponential + jitter;
  }
  releaseBackpressure() {
    const resolvers = this.backpressureResolvers;
    this.backpressureResolvers = [];
    for (const resolve of resolvers) resolve();
  }
  sleep(ms) {
    return new Promise((resolve) => {
      this.sleepResolve = resolve;
      setTimeout(
        (self, resolve2) => {
          self.sleepResolve = null;
          resolve2();
        },
        ms,
        this,
        resolve
      );
    });
  }
}
export {
  RetryableError,
  SerialBatchEventUploader
};
