import { jsx } from "react/jsx-runtime";
import { AgentsMenu } from "../../components/agents/AgentsMenu.js";
import { getTools } from "../../tools.js";
async function call(onDone, context) {
  const appState = context.getAppState();
  const permissionContext = appState.toolPermissionContext;
  const tools = getTools(permissionContext);
  return /* @__PURE__ */ jsx(AgentsMenu, { tools, onExit: onDone });
}
export {
  call
};
