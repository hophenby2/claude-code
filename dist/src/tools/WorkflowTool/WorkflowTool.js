import { z } from "zod/v4";
import { buildTool } from "../../Tool.js";
import { WORKFLOW_TOOL_NAME } from "./constants.js";
const inputSchema = z.strictObject({});
const unavailableMessage = "Workflow scripts are not available in this reconstructed build.";
const WorkflowTool = buildTool({
  name: WORKFLOW_TOOL_NAME,
  searchHint: "run workflow scripts",
  maxResultSizeChars: 1e4,
  isEnabled() {
    return false;
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  get inputSchema() {
    return inputSchema;
  },
  async description() {
    return unavailableMessage;
  },
  async prompt() {
    return unavailableMessage;
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: "tool_result",
      content: output.message
    };
  },
  renderToolUseMessage() {
    return unavailableMessage;
  },
  async call() {
    throw new Error(unavailableMessage);
  }
});
var WorkflowTool_default = WorkflowTool;
export {
  WorkflowTool,
  WorkflowTool_default as default
};
