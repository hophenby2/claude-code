const feature = (_name) => false;
import { z } from "zod/v4";
import {
  handlePlanModeTransition
} from "../../bootstrap/state.js";
import { buildTool } from "../../Tool.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { applyPermissionUpdate } from "../../utils/permissions/PermissionUpdate.js";
import { prepareContextForPlanMode } from "../../utils/permissions/permissionSetup.js";
import { isPlanModeInterviewPhaseEnabled } from "../../utils/planModeV2.js";
import { ENTER_PLAN_MODE_TOOL_NAME } from "./constants.js";
import { getEnterPlanModeToolPrompt } from "./prompt.js";
import {
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage
} from "./UI.js";
const inputSchema = lazySchema(
  () => z.strictObject({
    // No parameters needed
  })
);
const outputSchema = lazySchema(
  () => z.object({
    message: z.string().describe("Confirmation that plan mode was entered")
  })
);
const EnterPlanModeTool = buildTool({
  name: ENTER_PLAN_MODE_TOOL_NAME,
  searchHint: "switch to plan mode to design an approach before coding",
  maxResultSizeChars: 1e5,
  async description() {
    return "Requests permission to enter plan mode for complex tasks requiring exploration and design";
  },
  async prompt() {
    return getEnterPlanModeToolPrompt();
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  userFacingName() {
    return "";
  },
  shouldDefer: true,
  isEnabled() {
    if (false) {
      return false;
    }
    return true;
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  renderToolUseMessage,
  renderToolResultMessage,
  renderToolUseRejectedMessage,
  async call(_input, context) {
    if (context.agentId) {
      throw new Error("EnterPlanMode tool cannot be used in agent contexts");
    }
    const appState = context.getAppState();
    handlePlanModeTransition(appState.toolPermissionContext.mode, "plan");
    context.setAppState((prev) => ({
      ...prev,
      toolPermissionContext: applyPermissionUpdate(
        prepareContextForPlanMode(prev.toolPermissionContext),
        { type: "setMode", mode: "plan", destination: "session" }
      )
    }));
    return {
      data: {
        message: "Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach."
      }
    };
  },
  mapToolResultToToolResultBlockParam({ message }, toolUseID) {
    const instructions = isPlanModeInterviewPhaseEnabled() ? `${message}

DO NOT write or edit any files except the plan file. Detailed workflow instructions will follow.` : `${message}

In plan mode, you should:
1. Thoroughly explore the codebase to understand existing patterns
2. Identify similar features and architectural approaches
3. Consider multiple approaches and their trade-offs
4. Use AskUserQuestion if you need to clarify the approach
5. Design a concrete implementation strategy
6. When ready, use ExitPlanMode to present your plan for approval

Remember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.`;
    return {
      type: "tool_result",
      content: instructions,
      tool_use_id: toolUseID
    };
  }
});
export {
  EnterPlanModeTool
};
