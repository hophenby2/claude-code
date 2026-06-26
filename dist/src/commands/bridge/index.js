const feature = (_name) => false;
import { isBridgeEnabled } from "../../bridge/bridgeEnabled.js";
function isEnabled() {
  if (true) {
    return false;
  }
  return isBridgeEnabled();
}
const bridge = {
  type: "local-jsx",
  name: "remote-control",
  aliases: ["rc"],
  description: "Connect this terminal for remote-control sessions",
  argumentHint: "[name]",
  isEnabled,
  get isHidden() {
    return !isEnabled();
  },
  immediate: true,
  load: () => import("./bridge.js")
};
var bridge_default = bridge;
export {
  bridge_default as default
};
