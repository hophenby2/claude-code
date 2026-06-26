import { z } from "zod/v4";
import { buildTool } from "../../Tool.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { isOutputLineTruncated } from "../../utils/terminal.js";
import { DESCRIPTION, PROMPT } from "./prompt.js";
import {
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage
} from "./UI.js";
const inputSchema = lazySchema(() => z.object({}).passthrough());
const outputSchema = lazySchema(
  () => z.string().describe("MCP tool execution result")
);
const MCPTool = buildTool({
  isMcp: true,
  // Overridden in mcpClient.ts with the real MCP tool name + args
  isOpenWorld() {
    return false;
  },
  // Overridden in mcpClient.ts
  name: "mcp",
  maxResultSizeChars: 1e5,
  // Overridden in mcpClient.ts
  async description() {
    return DESCRIPTION;
  },
  // Overridden in mcpClient.ts
  async prompt() {
    return PROMPT;
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  // Overridden in mcpClient.ts
  async call() {
    return {
      data: ""
    };
  },
  async checkPermissions() {
    return {
      behavior: "passthrough",
      message: "MCPTool requires permission."
    };
  },
  renderToolUseMessage,
  // Overridden in mcpClient.ts
  userFacingName: () => "mcp",
  renderToolUseProgressMessage,
  renderToolResultMessage,
  isResultTruncated(output) {
    return isOutputLineTruncated(output);
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: "tool_result",
      content
    };
  }
});
export {
  MCPTool,
  inputSchema,
  outputSchema
};
