import { FILE_EDIT_TOOL_NAME } from "../../tools/FileEditTool/constants.js";
import { FILE_READ_TOOL_NAME } from "../../tools/FileReadTool/prompt.js";
import { FILE_WRITE_TOOL_NAME } from "../../tools/FileWriteTool/prompt.js";
import { GLOB_TOOL_NAME } from "../../tools/GlobTool/prompt.js";
import { GREP_TOOL_NAME } from "../../tools/GrepTool/prompt.js";
import { NOTEBOOK_EDIT_TOOL_NAME } from "../../tools/NotebookEditTool/constants.js";
import { WEB_FETCH_TOOL_NAME } from "../../tools/WebFetchTool/prompt.js";
import { WEB_SEARCH_TOOL_NAME } from "../../tools/WebSearchTool/prompt.js";
import { SHELL_TOOL_NAMES } from "../../utils/shell/shellToolUtils.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
const DEFAULT_MAX_INPUT_TOKENS = 18e4;
const DEFAULT_TARGET_INPUT_TOKENS = 4e4;
const TOOLS_CLEARABLE_RESULTS = [
  ...SHELL_TOOL_NAMES,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  FILE_READ_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME
];
const TOOLS_CLEARABLE_USES = [
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
  NOTEBOOK_EDIT_TOOL_NAME
];
function getAPIContextManagement(options) {
  const {
    hasThinking = false,
    isRedactThinkingActive = false,
    clearAllThinking = false
  } = options ?? {};
  const strategies = [];
  if (hasThinking && !isRedactThinkingActive) {
    strategies.push({
      type: "clear_thinking_20251015",
      keep: clearAllThinking ? { type: "thinking_turns", value: 1 } : "all"
    });
  }
  if (process.env.USER_TYPE !== "ant") {
    return strategies.length > 0 ? { edits: strategies } : void 0;
  }
  const useClearToolResults = isEnvTruthy(
    process.env.USE_API_CLEAR_TOOL_RESULTS
  );
  const useClearToolUses = isEnvTruthy(process.env.USE_API_CLEAR_TOOL_USES);
  if (!useClearToolResults && !useClearToolUses) {
    return strategies.length > 0 ? { edits: strategies } : void 0;
  }
  if (useClearToolResults) {
    const triggerThreshold = process.env.API_MAX_INPUT_TOKENS ? parseInt(process.env.API_MAX_INPUT_TOKENS) : DEFAULT_MAX_INPUT_TOKENS;
    const keepTarget = process.env.API_TARGET_INPUT_TOKENS ? parseInt(process.env.API_TARGET_INPUT_TOKENS) : DEFAULT_TARGET_INPUT_TOKENS;
    const strategy = {
      type: "clear_tool_uses_20250919",
      trigger: {
        type: "input_tokens",
        value: triggerThreshold
      },
      clear_at_least: {
        type: "input_tokens",
        value: triggerThreshold - keepTarget
      },
      clear_tool_inputs: TOOLS_CLEARABLE_RESULTS
    };
    strategies.push(strategy);
  }
  if (useClearToolUses) {
    const triggerThreshold = process.env.API_MAX_INPUT_TOKENS ? parseInt(process.env.API_MAX_INPUT_TOKENS) : DEFAULT_MAX_INPUT_TOKENS;
    const keepTarget = process.env.API_TARGET_INPUT_TOKENS ? parseInt(process.env.API_TARGET_INPUT_TOKENS) : DEFAULT_TARGET_INPUT_TOKENS;
    const strategy = {
      type: "clear_tool_uses_20250919",
      trigger: {
        type: "input_tokens",
        value: triggerThreshold
      },
      clear_at_least: {
        type: "input_tokens",
        value: triggerThreshold - keepTarget
      },
      exclude_tools: TOOLS_CLEARABLE_USES
    };
    strategies.push(strategy);
  }
  return strategies.length > 0 ? { edits: strategies } : void 0;
}
export {
  getAPIContextManagement
};
