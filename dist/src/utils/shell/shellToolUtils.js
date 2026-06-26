import { BASH_TOOL_NAME } from "../../tools/BashTool/toolName.js";
import { POWERSHELL_TOOL_NAME } from "../../tools/PowerShellTool/toolName.js";
import { isEnvDefinedFalsy, isEnvTruthy } from "../envUtils.js";
import { getPlatform } from "../platform.js";
const SHELL_TOOL_NAMES = [BASH_TOOL_NAME, POWERSHELL_TOOL_NAME];
function isPowerShellToolEnabled() {
  if (getPlatform() !== "windows") return false;
  return process.env.USER_TYPE === "ant" ? !isEnvDefinedFalsy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL) : isEnvTruthy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL);
}
export {
  SHELL_TOOL_NAMES,
  isPowerShellToolEnabled
};
