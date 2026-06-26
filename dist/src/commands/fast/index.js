import {
  FAST_MODE_MODEL_DISPLAY,
  isFastModeEnabled
} from "../../utils/fastMode.js";
import { shouldInferenceConfigCommandBeImmediate } from "../../utils/immediateCommand.js";
const fast = {
  type: "local-jsx",
  name: "fast",
  get description() {
    return `Toggle fast mode (${FAST_MODE_MODEL_DISPLAY} only)`;
  },
  availability: ["claude-ai", "console"],
  isEnabled: () => isFastModeEnabled(),
  get isHidden() {
    return !isFastModeEnabled();
  },
  argumentHint: "[on|off]",
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate();
  },
  load: () => import("./fast.js")
};
var fast_default = fast;
export {
  fast_default as default
};
