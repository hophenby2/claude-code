import { getIsNonInteractiveSession } from "../../bootstrap/state.js";
const command = {
  name: "chrome",
  description: "Claude in Chrome (Beta) settings",
  availability: ["claude-ai"],
  isEnabled: () => !getIsNonInteractiveSession(),
  type: "local-jsx",
  load: () => import("./chrome.js")
};
var chrome_default = command;
export {
  chrome_default as default
};
