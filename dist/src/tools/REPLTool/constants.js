import { isEnvDefinedFalsy, isEnvTruthy } from "../../utils/envUtils.js";
import { AGENT_TOOL_NAME } from "../AgentTool/constants.js";
import { BASH_TOOL_NAME } from "../BashTool/toolName.js";
import { FILE_EDIT_TOOL_NAME } from "../FileEditTool/constants.js";
import { FILE_READ_TOOL_NAME } from "../FileReadTool/prompt.js";
import { FILE_WRITE_TOOL_NAME } from "../FileWriteTool/prompt.js";
import { GLOB_TOOL_NAME } from "../GlobTool/prompt.js";
import { GREP_TOOL_NAME } from "../GrepTool/prompt.js";
import { NOTEBOOK_EDIT_TOOL_NAME } from "../NotebookEditTool/constants.js";
const REPL_TOOL_NAME = "REPL";
function isReplModeEnabled() {
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_REPL)) return false;
  if (isEnvTruthy(process.env.CLAUDE_REPL_MODE)) return true;
  return process.env.USER_TYPE === "ant" && process.env.CLAUDE_CODE_ENTRYPOINT === "cli";
}
const REPL_ONLY_TOOLS = /* @__PURE__ */ new Set([
  FILE_READ_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  BASH_TOOL_NAME,
  NOTEBOOK_EDIT_TOOL_NAME,
  AGENT_TOOL_NAME
]);
export {
  REPL_ONLY_TOOLS,
  REPL_TOOL_NAME,
  isReplModeEnabled
};
