import { z } from "zod/v4";
import {
  SYNTHETIC_OUTPUT_TOOL_NAME,
  SyntheticOutputTool
} from "../../tools/SyntheticOutputTool/SyntheticOutputTool.js";
import { substituteArguments } from "../argumentSubstitution.js";
import { lazySchema } from "../lazySchema.js";
import { hasSuccessfulToolCall } from "../messages.js";
import { addFunctionHook } from "./sessionHooks.js";
const hookResponseSchema = lazySchema(
  () => z.object({
    ok: z.boolean().describe("Whether the condition was met"),
    reason: z.string().describe("Reason, if the condition was not met").optional()
  })
);
function addArgumentsToPrompt(prompt, jsonInput) {
  return substituteArguments(prompt, jsonInput);
}
function createStructuredOutputTool() {
  return {
    ...SyntheticOutputTool,
    inputSchema: hookResponseSchema(),
    inputJSONSchema: {
      type: "object",
      properties: {
        ok: {
          type: "boolean",
          description: "Whether the condition was met"
        },
        reason: {
          type: "string",
          description: "Reason, if the condition was not met"
        }
      },
      required: ["ok"],
      additionalProperties: false
    },
    async prompt() {
      return `Use this tool to return your verification result. You MUST call this tool exactly once at the end of your response.`;
    }
  };
}
function registerStructuredOutputEnforcement(setAppState, sessionId) {
  addFunctionHook(
    setAppState,
    sessionId,
    "Stop",
    "",
    // No matcher - applies to all stops
    (messages) => hasSuccessfulToolCall(messages, SYNTHETIC_OUTPUT_TOOL_NAME),
    `You MUST call the ${SYNTHETIC_OUTPUT_TOOL_NAME} tool to complete this request. Call this tool now.`,
    { timeout: 5e3 }
  );
}
export {
  addArgumentsToPrompt,
  createStructuredOutputTool,
  hookResponseSchema,
  registerStructuredOutputEnforcement
};
