import { jsx } from "react/jsx-runtime";
import { HooksConfigMenu } from "../../components/hooks/HooksConfigMenu.js";
import { logEvent } from "../../services/analytics/index.js";
import { getTools } from "../../tools.js";
const call = async (onDone, context) => {
  logEvent("tengu_hooks_command", {});
  const appState = context.getAppState();
  const permissionContext = appState.toolPermissionContext;
  const toolNames = getTools(permissionContext).map((tool) => tool.name);
  return /* @__PURE__ */ jsx(HooksConfigMenu, { toolNames, onExit: onDone });
};
export {
  call
};
