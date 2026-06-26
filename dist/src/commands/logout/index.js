import { isEnvTruthy } from "../../utils/envUtils.js";
var logout_default = {
  type: "local-jsx",
  name: "logout",
  description: "Sign out from your Anthropic account",
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGOUT_COMMAND),
  load: () => import("./logout.js")
};
export {
  logout_default as default
};
