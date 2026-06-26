import { z } from "zod/v4";
import { buildTool } from "../../Tool.js";
const inputSchema = z.strictObject({});
const unavailableMessage = "Overflow testing is not available in this reconstructed build.";
const OverflowTestTool = buildTool({
  name: "OverflowTest",
  searchHint: "exercise overflow handling",
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
var OverflowTestTool_default = OverflowTestTool;
export {
  OverflowTestTool,
  OverflowTestTool_default as default
};
