import { isPolicyAllowed } from "../../services/policyLimits/index.js";
import { isClaudeAISubscriber } from "../../utils/auth.js";
var remote_env_default = {
  type: "local-jsx",
  name: "remote-env",
  description: "Configure the default remote environment for teleport sessions",
  isEnabled: () => isClaudeAISubscriber() && isPolicyAllowed("allow_remote_sessions"),
  get isHidden() {
    return !isClaudeAISubscriber() || !isPolicyAllowed("allow_remote_sessions");
  },
  load: () => import("./remote-env.js")
};
export {
  remote_env_default as default
};
