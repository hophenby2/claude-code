import { validateBoundedIntEnvVar } from "../envValidation.js";
import { getTaskOutputPath } from "./diskOutput.js";
const TASK_MAX_OUTPUT_UPPER_LIMIT = 16e4;
const TASK_MAX_OUTPUT_DEFAULT = 32e3;
function getMaxTaskOutputLength() {
  const result = validateBoundedIntEnvVar(
    "TASK_MAX_OUTPUT_LENGTH",
    process.env.TASK_MAX_OUTPUT_LENGTH,
    TASK_MAX_OUTPUT_DEFAULT,
    TASK_MAX_OUTPUT_UPPER_LIMIT
  );
  return result.effective;
}
function formatTaskOutput(output, taskId) {
  const maxLen = getMaxTaskOutputLength();
  if (output.length <= maxLen) {
    return { content: output, wasTruncated: false };
  }
  const filePath = getTaskOutputPath(taskId);
  const header = `[Truncated. Full output: ${filePath}]

`;
  const availableSpace = maxLen - header.length;
  const truncated = output.slice(-availableSpace);
  return { content: header + truncated, wasTruncated: true };
}
export {
  TASK_MAX_OUTPUT_DEFAULT,
  TASK_MAX_OUTPUT_UPPER_LIMIT,
  formatTaskOutput,
  getMaxTaskOutputLength
};
