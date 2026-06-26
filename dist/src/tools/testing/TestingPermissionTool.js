import { z } from "zod/v4";
import { buildTool } from "../../Tool.js";
import { lazySchema } from "../../utils/lazySchema.js";
const NAME = "TestingPermission";
const inputSchema = lazySchema(() => z.strictObject({}));
const TestingPermissionTool = buildTool({
  name: NAME,
  maxResultSizeChars: 1e5,
  async description() {
    return "Test tool that always asks for permission";
  },
  async prompt() {
    return "Test tool that always asks for permission before executing. Used for end-to-end testing.";
  },
  get inputSchema() {
    return inputSchema();
  },
  userFacingName() {
    return "TestingPermission";
  },
  isEnabled() {
    return false;
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  async checkPermissions() {
    return {
      behavior: "ask",
      message: `Run test?`
    };
  },
  renderToolUseMessage() {
    return null;
  },
  renderToolUseProgressMessage() {
    return null;
  },
  renderToolUseQueuedMessage() {
    return null;
  },
  renderToolUseRejectedMessage() {
    return null;
  },
  renderToolResultMessage() {
    return null;
  },
  renderToolUseErrorMessage() {
    return null;
  },
  async call() {
    return {
      data: `${NAME} executed successfully`
    };
  },
  mapToolResultToToolResultBlockParam(result, toolUseID) {
    return {
      type: "tool_result",
      content: String(result),
      tool_use_id: toolUseID
    };
  }
});
export {
  TestingPermissionTool
};
