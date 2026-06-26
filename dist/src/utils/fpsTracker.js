class FpsTracker {
  frameDurations = [];
  firstRenderTime;
  lastRenderTime;
  record(durationMs) {
    const now = performance.now();
    if (this.firstRenderTime === void 0) {
      this.firstRenderTime = now;
    }
    this.lastRenderTime = now;
    this.frameDurations.push(durationMs);
  }
  getMetrics() {
    if (this.frameDurations.length === 0 || this.firstRenderTime === void 0 || this.lastRenderTime === void 0) {
      return void 0;
    }
    const totalTimeMs = this.lastRenderTime - this.firstRenderTime;
    if (totalTimeMs <= 0) {
      return void 0;
    }
    const totalFrames = this.frameDurations.length;
    const averageFps = totalFrames / (totalTimeMs / 1e3);
    const sorted = this.frameDurations.slice().sort((a, b) => b - a);
    const p99Index = Math.max(0, Math.ceil(sorted.length * 0.01) - 1);
    const p99FrameTimeMs = sorted[p99Index];
    const low1PctFps = p99FrameTimeMs > 0 ? 1e3 / p99FrameTimeMs : 0;
    return {
      averageFps: Math.round(averageFps * 100) / 100,
      low1PctFps: Math.round(low1PctFps * 100) / 100
    };
  }
}
export {
  FpsTracker
};
