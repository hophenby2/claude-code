import { randomUUID } from "crypto";
import { jsonStringify } from "../utils/slowOperations.js";
function createSyntheticAssistantMessage(request, requestId) {
  return {
    type: "assistant",
    uuid: randomUUID(),
    message: {
      id: `remote-${requestId}`,
      type: "message",
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: request.tool_use_id,
          name: request.tool_name,
          input: request.input
        }
      ],
      model: "",
      stop_reason: null,
      stop_sequence: null,
      container: null,
      context_management: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }
    },
    requestId: void 0,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function createToolStub(toolName) {
  return {
    name: toolName,
    inputSchema: {},
    isEnabled: () => true,
    userFacingName: () => toolName,
    renderToolUseMessage: (input) => {
      const entries = Object.entries(input);
      if (entries.length === 0) return "";
      return entries.slice(0, 3).map(([key, value]) => {
        const valueStr = typeof value === "string" ? value : jsonStringify(value);
        return `${key}: ${valueStr}`;
      }).join(", ");
    },
    call: async () => ({ data: "" }),
    description: async () => "",
    prompt: () => "",
    isReadOnly: () => false,
    isMcp: false,
    needsPermissions: () => true
  };
}
export {
  createSyntheticAssistantMessage,
  createToolStub
};
