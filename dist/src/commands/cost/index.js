import { isClaudeAISubscriber } from "../../utils/auth.js";
const cost = {
  type: "local",
  name: "cost",
  description: "Show the total cost and duration of the current session",
  get isHidden() {
    if (process.env.USER_TYPE === "ant") {
      return false;
    }
    return isClaudeAISubscriber();
  },
  supportsNonInteractive: true,
  load: () => import("./cost.js")
};
var cost_default = cost;
export {
  cost_default as default
};
