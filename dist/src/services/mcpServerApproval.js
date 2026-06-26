import { jsx } from "react/jsx-runtime";
import { MCPServerApprovalDialog } from "../components/MCPServerApprovalDialog.js";
import { MCPServerMultiselectDialog } from "../components/MCPServerMultiselectDialog.js";
import { KeybindingSetup } from "../keybindings/KeybindingProviderSetup.js";
import { AppStateProvider } from "../state/AppState.js";
import { getMcpConfigsByScope } from "./mcp/config.js";
import { getProjectMcpServerStatus } from "./mcp/utils.js";
async function handleMcpjsonServerApprovals(root) {
  const {
    servers: projectServers
  } = getMcpConfigsByScope("project");
  const pendingServers = Object.keys(projectServers).filter((serverName) => getProjectMcpServerStatus(serverName) === "pending");
  if (pendingServers.length === 0) {
    return;
  }
  await new Promise((resolve) => {
    const done = () => void resolve();
    if (pendingServers.length === 1 && pendingServers[0] !== void 0) {
      const serverName = pendingServers[0];
      root.render(/* @__PURE__ */ jsx(AppStateProvider, { children: /* @__PURE__ */ jsx(KeybindingSetup, { children: /* @__PURE__ */ jsx(MCPServerApprovalDialog, { serverName, onDone: done }) }) }));
    } else {
      root.render(/* @__PURE__ */ jsx(AppStateProvider, { children: /* @__PURE__ */ jsx(KeybindingSetup, { children: /* @__PURE__ */ jsx(MCPServerMultiselectDialog, { serverNames: pendingServers, onDone: done }) }) }));
    }
  });
}
export {
  handleMcpjsonServerApprovals
};
