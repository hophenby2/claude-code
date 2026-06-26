import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import partition from "lodash-es/partition.js";
import uniqBy from "lodash-es/uniqBy.js";
import { COORDINATOR_MODE_ALLOWED_TOOLS } from "../constants/tools.js";
import { isMcpTool } from "../services/mcp/utils.js";
const PR_ACTIVITY_TOOL_SUFFIXES = [
  "subscribe_pr_activity",
  "unsubscribe_pr_activity"
];
function isPrActivitySubscriptionTool(name) {
  return PR_ACTIVITY_TOOL_SUFFIXES.some((suffix) => name.endsWith(suffix));
}
const coordinatorModeModule = false ? require2("../coordinator/coordinatorMode.js") : null;
function applyCoordinatorToolFilter(tools) {
  return tools.filter(
    (t) => COORDINATOR_MODE_ALLOWED_TOOLS.has(t.name) || isPrActivitySubscriptionTool(t.name)
  );
}
function mergeAndFilterTools(initialTools, assembled, mode) {
  const [mcp, builtIn] = partition(
    uniqBy([...initialTools, ...assembled], "name"),
    isMcpTool
  );
  const byName = (a, b) => a.name.localeCompare(b.name);
  const tools = [...builtIn.sort(byName), ...mcp.sort(byName)];
  if (false) {
    if (coordinatorModeModule.isCoordinatorMode()) {
      return applyCoordinatorToolFilter(tools);
    }
  }
  return tools;
}
export {
  applyCoordinatorToolFilter,
  isPrActivitySubscriptionTool,
  mergeAndFilterTools
};
