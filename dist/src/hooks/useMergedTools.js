import { useMemo } from "react";
import { assembleToolPool } from "../tools.js";
import { mergeAndFilterTools } from "../utils/toolPool.js";
function useMergedTools(initialTools, mcpTools, toolPermissionContext) {
  let replBridgeEnabled = false;
  let replBridgeOutboundOnly = false;
  return useMemo(() => {
    const assembled = assembleToolPool(toolPermissionContext, mcpTools);
    return mergeAndFilterTools(
      initialTools,
      assembled,
      toolPermissionContext.mode
    );
  }, [
    initialTools,
    mcpTools,
    toolPermissionContext,
    replBridgeEnabled,
    replBridgeOutboundOnly
  ]);
}
export {
  useMergedTools
};
