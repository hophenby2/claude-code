import {
  DEFAULT_OUTPUT_STYLE_NAME,
  OUTPUT_STYLE_CONFIG
} from "../constants/outputStyles.js";
import { getSettings_DEPRECATED } from "./settings/settings.js";
function getQuerySourceForAgent(agentType, isBuiltInAgent) {
  if (isBuiltInAgent) {
    return agentType ? `agent:builtin:${agentType}` : "agent:default";
  } else {
    return "agent:custom";
  }
}
function getQuerySourceForREPL() {
  const settings = getSettings_DEPRECATED();
  const style = settings?.outputStyle ?? DEFAULT_OUTPUT_STYLE_NAME;
  if (style === DEFAULT_OUTPUT_STYLE_NAME) {
    return "repl_main_thread";
  }
  const isBuiltIn = style in OUTPUT_STYLE_CONFIG;
  return isBuiltIn ? `repl_main_thread:outputStyle:${style}` : "repl_main_thread:outputStyle:custom";
}
export {
  getQuerySourceForAgent,
  getQuerySourceForREPL
};
