import { formatTotalCost } from "../../cost-tracker.js";
import { currentLimits } from "../../services/claudeAiLimits.js";
import { isClaudeAISubscriber } from "../../utils/auth.js";
const call = async () => {
  if (isClaudeAISubscriber()) {
    let value;
    if (currentLimits.isUsingOverage) {
      value = "You are currently using your overages to power your Claude Code usage. We will automatically switch you back to your subscription rate limits when they reset";
    } else {
      value = "You are currently using your subscription to power your Claude Code usage";
    }
    if (process.env.USER_TYPE === "ant") {
      value += `

[ANT-ONLY] Showing cost anyway:
 ${formatTotalCost()}`;
    }
    return { type: "text", value };
  }
  return { type: "text", value: formatTotalCost() };
};
export {
  call
};
