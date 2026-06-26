import {
  AGENT_COLOR_TO_THEME_COLOR
} from "../tools/AgentTool/agentColorManager.js";
const DEFAULT_AGENT_THEME_COLOR = "cyan_FOR_SUBAGENTS_ONLY";
function toInkColor(color) {
  if (!color) {
    return DEFAULT_AGENT_THEME_COLOR;
  }
  const themeColor = AGENT_COLOR_TO_THEME_COLOR[color];
  if (themeColor) {
    return themeColor;
  }
  return `ansi:${color}`;
}
export {
  toInkColor
};
