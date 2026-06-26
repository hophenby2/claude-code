import { createSignal } from "./signal.js";
class AwsAuthStatusManager {
  static instance = null;
  status = {
    isAuthenticating: false,
    output: []
  };
  changed = createSignal();
  static getInstance() {
    if (!AwsAuthStatusManager.instance) {
      AwsAuthStatusManager.instance = new AwsAuthStatusManager();
    }
    return AwsAuthStatusManager.instance;
  }
  getStatus() {
    return {
      ...this.status,
      output: [...this.status.output]
    };
  }
  startAuthentication() {
    this.status = {
      isAuthenticating: true,
      output: []
    };
    this.changed.emit(this.getStatus());
  }
  addOutput(line) {
    this.status.output.push(line);
    this.changed.emit(this.getStatus());
  }
  setError(error) {
    this.status.error = error;
    this.changed.emit(this.getStatus());
  }
  endAuthentication(success) {
    if (success) {
      this.status = {
        isAuthenticating: false,
        output: []
      };
    } else {
      this.status.isAuthenticating = false;
    }
    this.changed.emit(this.getStatus());
  }
  subscribe = this.changed.subscribe;
  // Clean up for testing
  static reset() {
    if (AwsAuthStatusManager.instance) {
      AwsAuthStatusManager.instance.changed.clear();
      AwsAuthStatusManager.instance = null;
    }
  }
}
export {
  AwsAuthStatusManager
};
