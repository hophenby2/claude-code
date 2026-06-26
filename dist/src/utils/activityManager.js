import { getActiveTimeCounter as getActiveTimeCounterImpl } from "../bootstrap/state.js";
class ActivityManager {
  activeOperations = /* @__PURE__ */ new Set();
  lastUserActivityTime = 0;
  // Start with 0 to indicate no activity yet
  lastCLIRecordedTime;
  isCLIActive = false;
  USER_ACTIVITY_TIMEOUT_MS = 5e3;
  // 5 seconds
  getNow;
  getActiveTimeCounter;
  static instance = null;
  constructor(options) {
    this.getNow = options?.getNow ?? (() => Date.now());
    this.getActiveTimeCounter = options?.getActiveTimeCounter ?? getActiveTimeCounterImpl;
    this.lastCLIRecordedTime = this.getNow();
  }
  static getInstance() {
    if (!ActivityManager.instance) {
      ActivityManager.instance = new ActivityManager();
    }
    return ActivityManager.instance;
  }
  /**
   * Reset the singleton instance (for testing purposes)
   */
  static resetInstance() {
    ActivityManager.instance = null;
  }
  /**
   * Create a new instance with custom options (for testing purposes)
   */
  static createInstance(options) {
    ActivityManager.instance = new ActivityManager(options);
    return ActivityManager.instance;
  }
  /**
   * Called when user interacts with the CLI (typing, commands, etc.)
   */
  recordUserActivity() {
    if (!this.isCLIActive && this.lastUserActivityTime !== 0) {
      const now = this.getNow();
      const timeSinceLastActivity = (now - this.lastUserActivityTime) / 1e3;
      if (timeSinceLastActivity > 0) {
        const activeTimeCounter = this.getActiveTimeCounter();
        if (activeTimeCounter) {
          const timeoutSeconds = this.USER_ACTIVITY_TIMEOUT_MS / 1e3;
          if (timeSinceLastActivity < timeoutSeconds) {
            activeTimeCounter.add(timeSinceLastActivity, { type: "user" });
          }
        }
      }
    }
    this.lastUserActivityTime = this.getNow();
  }
  /**
   * Starts tracking CLI activity (tool execution, AI response, etc.)
   */
  startCLIActivity(operationId) {
    if (this.activeOperations.has(operationId)) {
      this.endCLIActivity(operationId);
    }
    const wasEmpty = this.activeOperations.size === 0;
    this.activeOperations.add(operationId);
    if (wasEmpty) {
      this.isCLIActive = true;
      this.lastCLIRecordedTime = this.getNow();
    }
  }
  /**
   * Stops tracking CLI activity
   */
  endCLIActivity(operationId) {
    this.activeOperations.delete(operationId);
    if (this.activeOperations.size === 0) {
      const now = this.getNow();
      const timeSinceLastRecord = (now - this.lastCLIRecordedTime) / 1e3;
      if (timeSinceLastRecord > 0) {
        const activeTimeCounter = this.getActiveTimeCounter();
        if (activeTimeCounter) {
          activeTimeCounter.add(timeSinceLastRecord, { type: "cli" });
        }
      }
      this.lastCLIRecordedTime = now;
      this.isCLIActive = false;
    }
  }
  /**
   * Convenience method to track an async operation automatically (mainly for testing/debugging)
   */
  async trackOperation(operationId, fn) {
    this.startCLIActivity(operationId);
    try {
      return await fn();
    } finally {
      this.endCLIActivity(operationId);
    }
  }
  /**
   * Gets current activity states (mainly for testing/debugging)
   */
  getActivityStates() {
    const now = this.getNow();
    const timeSinceUserActivity = (now - this.lastUserActivityTime) / 1e3;
    const isUserActive = timeSinceUserActivity < this.USER_ACTIVITY_TIMEOUT_MS / 1e3;
    return {
      isUserActive,
      isCLIActive: this.isCLIActive,
      activeOperationCount: this.activeOperations.size
    };
  }
}
const activityManager = ActivityManager.getInstance();
export {
  ActivityManager,
  activityManager
};
