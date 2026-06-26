import { sleep } from "../../utils/sleep.js";
class WorkerStateUploader {
  inflight = null;
  pending = null;
  closed = false;
  config;
  constructor(config) {
    this.config = config;
  }
  /**
   * Enqueue a patch to PUT /worker. Coalesces with any existing pending
   * patch. Fire-and-forget — callers don't need to await.
   */
  enqueue(patch) {
    if (this.closed) return;
    this.pending = this.pending ? coalescePatches(this.pending, patch) : patch;
    void this.drain();
  }
  close() {
    this.closed = true;
    this.pending = null;
  }
  async drain() {
    if (this.inflight || this.closed) return;
    if (!this.pending) return;
    const payload = this.pending;
    this.pending = null;
    this.inflight = this.sendWithRetry(payload).then(() => {
      this.inflight = null;
      if (this.pending && !this.closed) {
        void this.drain();
      }
    });
  }
  /** Retries indefinitely with exponential backoff until success or close(). */
  async sendWithRetry(payload) {
    let current = payload;
    let failures = 0;
    while (!this.closed) {
      const ok = await this.config.send(current);
      if (ok) return;
      failures++;
      await sleep(this.retryDelay(failures));
      if (this.pending && !this.closed) {
        current = coalescePatches(current, this.pending);
        this.pending = null;
      }
    }
  }
  retryDelay(failures) {
    const exponential = Math.min(
      this.config.baseDelayMs * 2 ** (failures - 1),
      this.config.maxDelayMs
    );
    const jitter = Math.random() * this.config.jitterMs;
    return exponential + jitter;
  }
}
function coalescePatches(base, overlay) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if ((key === "external_metadata" || key === "internal_metadata") && merged[key] && typeof merged[key] === "object" && typeof value === "object" && value !== null) {
      merged[key] = {
        ...merged[key],
        ...value
      };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}
export {
  WorkerStateUploader
};
