import { shouldInferenceConfigCommandBeImmediate } from "../../utils/immediateCommand.js";
import { getMainLoopModel, renderModelName } from "../../utils/model/model.js";
var model_default = {
  type: "local-jsx",
  name: "model",
  get description() {
    return `Set the AI model for Claude Code (currently ${renderModelName(getMainLoopModel())})`;
  },
  argumentHint: "[model]",
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate();
  },
  load: () => import("./model.js")
};
export {
  model_default as default
};
