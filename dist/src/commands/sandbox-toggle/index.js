import figures from "figures";
import { SandboxManager } from "../../utils/sandbox/sandbox-adapter.js";
const command = {
  name: "sandbox",
  get description() {
    const currentlyEnabled = SandboxManager.isSandboxingEnabled();
    const autoAllow = SandboxManager.isAutoAllowBashIfSandboxedEnabled();
    const allowUnsandboxed = SandboxManager.areUnsandboxedCommandsAllowed();
    const isLocked = SandboxManager.areSandboxSettingsLockedByPolicy();
    const hasDeps = SandboxManager.checkDependencies().errors.length === 0;
    let icon;
    if (!hasDeps) {
      icon = figures.warning;
    } else {
      icon = currentlyEnabled ? figures.tick : figures.circle;
    }
    let statusText = "sandbox disabled";
    if (currentlyEnabled) {
      statusText = autoAllow ? "sandbox enabled (auto-allow)" : "sandbox enabled";
      statusText += allowUnsandboxed ? ", fallback allowed" : "";
    }
    if (isLocked) {
      statusText += " (managed)";
    }
    return `${icon} ${statusText} (\u23CE to configure)`;
  },
  argumentHint: 'exclude "command pattern"',
  get isHidden() {
    return !SandboxManager.isSupportedPlatform() || !SandboxManager.isPlatformInEnabledList();
  },
  immediate: true,
  type: "local-jsx",
  load: () => import("./sandbox-toggle.js")
};
var sandbox_toggle_default = command;
export {
  sandbox_toggle_default as default
};
