import { getAgentColorMap } from "../../bootstrap/state.js";
const AGENT_COLORS = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "pink",
  "cyan"
];
const AGENT_COLOR_TO_THEME_COLOR = {
  red: "red_FOR_SUBAGENTS_ONLY",
  blue: "blue_FOR_SUBAGENTS_ONLY",
  green: "green_FOR_SUBAGENTS_ONLY",
  yellow: "yellow_FOR_SUBAGENTS_ONLY",
  purple: "purple_FOR_SUBAGENTS_ONLY",
  orange: "orange_FOR_SUBAGENTS_ONLY",
  pink: "pink_FOR_SUBAGENTS_ONLY",
  cyan: "cyan_FOR_SUBAGENTS_ONLY"
};
function getAgentColor(agentType) {
  if (agentType === "general-purpose") {
    return void 0;
  }
  const agentColorMap = getAgentColorMap();
  const existingColor = agentColorMap.get(agentType);
  if (existingColor && AGENT_COLORS.includes(existingColor)) {
    return AGENT_COLOR_TO_THEME_COLOR[existingColor];
  }
  return void 0;
}
function setAgentColor(agentType, color) {
  const agentColorMap = getAgentColorMap();
  if (!color) {
    agentColorMap.delete(agentType);
    return;
  }
  if (AGENT_COLORS.includes(color)) {
    agentColorMap.set(agentType, color);
  }
}
export {
  AGENT_COLORS,
  AGENT_COLOR_TO_THEME_COLOR,
  getAgentColor,
  setAgentColor
};
