import { Ajv } from "ajv";
import { z } from "zod/v4";
import { buildTool } from "../../Tool.js";
import { TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from "../../utils/errors.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { jsonStringify } from "../../utils/slowOperations.js";
const inputSchema = lazySchema(() => z.object({}).passthrough());
const outputSchema = lazySchema(
  () => z.string().describe("Structured output tool result")
);
const SYNTHETIC_OUTPUT_TOOL_NAME = "StructuredOutput";
function isSyntheticOutputToolEnabled(opts) {
  return opts.isNonInteractiveSession;
}
const SyntheticOutputTool = buildTool({
  isMcp: false,
  isEnabled() {
    return true;
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  isOpenWorld() {
    return false;
  },
  name: SYNTHETIC_OUTPUT_TOOL_NAME,
  searchHint: "return the final response as structured JSON",
  maxResultSizeChars: 1e5,
  async description() {
    return "Return structured output in the requested format";
  },
  async prompt() {
    return `Use this tool to return your final response in the requested structured format. You MUST call this tool exactly once at the end of your response to provide the structured output.`;
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  async call(input) {
    return {
      data: "Structured output provided successfully",
      structured_output: input
    };
  },
  async checkPermissions(input) {
    return {
      behavior: "allow",
      updatedInput: input
    };
  },
  // Minimal UI implementations - this tool is for non-interactive SDK/CLI use
  renderToolUseMessage(input) {
    const keys = Object.keys(input);
    if (keys.length === 0) return null;
    if (keys.length <= 3) {
      return keys.map((k) => `${k}: ${jsonStringify(input[k])}`).join(", ");
    }
    return `${keys.length} fields: ${keys.slice(0, 3).join(", ")}\u2026`;
  },
  renderToolUseRejectedMessage() {
    return "Structured output rejected";
  },
  renderToolUseErrorMessage() {
    return "Structured output error";
  },
  renderToolUseProgressMessage() {
    return null;
  },
  renderToolResultMessage(output) {
    return output;
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: "tool_result",
      content
    };
  }
});
const toolCache = /* @__PURE__ */ new WeakMap();
function createSyntheticOutputTool(jsonSchema) {
  const cached = toolCache.get(jsonSchema);
  if (cached) return cached;
  const result = buildSyntheticOutputTool(jsonSchema);
  toolCache.set(jsonSchema, result);
  return result;
}
function buildSyntheticOutputTool(jsonSchema) {
  try {
    const ajv = new Ajv({ allErrors: true });
    const isValidSchema = ajv.validateSchema(jsonSchema);
    if (!isValidSchema) {
      return { error: ajv.errorsText(ajv.errors) };
    }
    const validateSchema = ajv.compile(jsonSchema);
    return {
      tool: {
        ...SyntheticOutputTool,
        inputJSONSchema: jsonSchema,
        async call(input) {
          const isValid = validateSchema(input);
          if (!isValid) {
            const errors = validateSchema.errors?.map((e) => `${e.instancePath || "root"}: ${e.message}`).join(", ");
            throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
              `Output does not match required schema: ${errors}`,
              `StructuredOutput schema mismatch: ${(errors ?? "").slice(0, 150)}`
            );
          }
          return {
            data: "Structured output provided successfully",
            structured_output: input
          };
        }
      }
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
export {
  SYNTHETIC_OUTPUT_TOOL_NAME,
  SyntheticOutputTool,
  createSyntheticOutputTool,
  isSyntheticOutputToolEnabled
};
