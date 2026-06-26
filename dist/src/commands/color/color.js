import { getSessionId } from "../../bootstrap/state.js";
import {
  AGENT_COLORS
} from "../../tools/AgentTool/agentColorManager.js";
import {
  getTranscriptPath,
  saveAgentColor
} from "../../utils/sessionStorage.js";
import { isTeammate } from "../../utils/teammate.js";
const RESET_ALIASES = ["default", "reset", "none", "gray", "grey"];
async function call(onDone, context, args) {
  if (isTeammate()) {
    onDone(
      "Cannot set color: This session is a swarm teammate. Teammate colors are assigned by the team leader.",
      { display: "system" }
    );
    return null;
  }
  if (!args || args.trim() === "") {
    const colorList = AGENT_COLORS.join(", ");
    onDone(`Please provide a color. Available colors: ${colorList}, default`, {
      display: "system"
    });
    return null;
  }
  const colorArg = args.trim().toLowerCase();
  if (RESET_ALIASES.includes(colorArg)) {
    const sessionId2 = getSessionId();
    const fullPath2 = getTranscriptPath();
    await saveAgentColor(sessionId2, "default", fullPath2);
    context.setAppState((prev) => ({
      ...prev,
      standaloneAgentContext: {
        ...prev.standaloneAgentContext,
        name: prev.standaloneAgentContext?.name ?? "",
        color: void 0
      }
    }));
    onDone("Session color reset to default", { display: "system" });
    return null;
  }
  if (!AGENT_COLORS.includes(colorArg)) {
    const colorList = AGENT_COLORS.join(", ");
    onDone(
      `Invalid color "${colorArg}". Available colors: ${colorList}, default`,
      { display: "system" }
    );
    return null;
  }
  const sessionId = getSessionId();
  const fullPath = getTranscriptPath();
  await saveAgentColor(sessionId, colorArg, fullPath);
  context.setAppState((prev) => ({
    ...prev,
    standaloneAgentContext: {
      ...prev.standaloneAgentContext,
      name: prev.standaloneAgentContext?.name ?? "",
      color: colorArg
    }
  }));
  onDone(`Session color set to: ${colorArg}`, { display: "system" });
  return null;
}
export {
  call
};
