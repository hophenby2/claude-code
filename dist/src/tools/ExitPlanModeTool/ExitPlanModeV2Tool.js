const feature = (_name) => false;
import { writeFile } from "fs/promises";
import { z } from "zod/v4";
import {
  hasExitedPlanModeInSession,
  setHasExitedPlanMode,
  setNeedsPlanModeExitAttachment
} from "../../bootstrap/state.js";
import { logEvent } from "../../services/analytics/index.js";
import {
  buildTool,
  toolMatchesName
} from "../../Tool.js";
import { formatAgentId, generateRequestId } from "../../utils/agentId.js";
import { isAgentSwarmsEnabled } from "../../utils/agentSwarmsEnabled.js";
import "../../utils/debug.js";
import {
  findInProcessTeammateTaskId,
  setAwaitingPlanApproval
} from "../../utils/inProcessTeammateHelpers.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { logError } from "../../utils/log.js";
import {
  getPlan,
  getPlanFilePath,
  persistFileSnapshotIfRemote
} from "../../utils/plans.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import {
  getAgentName,
  getTeamName,
  isPlanModeRequired,
  isTeammate
} from "../../utils/teammate.js";
import { writeToMailbox } from "../../utils/teammateMailbox.js";
import { AGENT_TOOL_NAME } from "../AgentTool/constants.js";
import { TEAM_CREATE_TOOL_NAME } from "../TeamCreateTool/constants.js";
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from "./constants.js";
import { EXIT_PLAN_MODE_V2_TOOL_PROMPT } from "./prompt.js";
import {
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage
} from "./UI.js";
const autoModeStateModule = false ? null : null;
const permissionSetupModule = false ? null : null;
const allowedPromptSchema = lazySchema(
  () => z.object({
    tool: z.enum(["Bash"]).describe("The tool this prompt applies to"),
    prompt: z.string().describe(
      'Semantic description of the action, e.g. "run tests", "install dependencies"'
    )
  })
);
const inputSchema = lazySchema(
  () => z.strictObject({
    // Prompt-based permissions requested by the plan
    allowedPrompts: z.array(allowedPromptSchema()).optional().describe(
      "Prompt-based permissions needed to implement the plan. These describe categories of actions rather than specific commands."
    )
  }).passthrough()
);
const _sdkInputSchema = lazySchema(
  () => inputSchema().extend({
    plan: z.string().optional().describe("The plan content (injected by normalizeToolInput from disk)"),
    planFilePath: z.string().optional().describe("The plan file path (injected by normalizeToolInput)")
  })
);
const outputSchema = lazySchema(
  () => z.object({
    plan: z.string().nullable().describe("The plan that was presented to the user"),
    isAgent: z.boolean(),
    filePath: z.string().optional().describe("The file path where the plan was saved"),
    hasTaskTool: z.boolean().optional().describe("Whether the Agent tool is available in the current context"),
    planWasEdited: z.boolean().optional().describe(
      "True when the user edited the plan (CCR web UI or Ctrl+G); determines whether the plan is echoed back in tool_result"
    ),
    awaitingLeaderApproval: z.boolean().optional().describe(
      "When true, the teammate has sent a plan approval request to the team leader"
    ),
    requestId: z.string().optional().describe("Unique identifier for the plan approval request")
  })
);
const ExitPlanModeV2Tool = buildTool({
  name: EXIT_PLAN_MODE_V2_TOOL_NAME,
  searchHint: "present plan for approval and start coding (plan mode only)",
  maxResultSizeChars: 1e5,
  async description() {
    return "Prompts the user to exit plan mode and start coding";
  },
  async prompt() {
    return EXIT_PLAN_MODE_V2_TOOL_PROMPT;
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
    return false;
  },
  requiresUserInteraction() {
    if (isTeammate()) {
      return false;
    }
    return true;
  },
  async validateInput(_input, { getAppState, options }) {
    if (isTeammate()) {
      return { result: true };
    }
    const mode = getAppState().toolPermissionContext.mode;
    if (mode !== "plan") {
      logEvent("tengu_exit_plan_mode_called_outside_plan", {
        model: options.mainLoopModel,
        mode,
        hasExitedPlanModeInSession: hasExitedPlanModeInSession()
      });
      return {
        result: false,
        message: "You are not in plan mode. This tool is only for exiting plan mode after writing a plan. If your plan was already approved, continue with implementation.",
        errorCode: 1
      };
    }
    return { result: true };
  },
  async checkPermissions(input, context) {
    if (isTeammate()) {
      return {
        behavior: "allow",
        updatedInput: input
      };
    }
    return {
      behavior: "ask",
      message: "Exit plan mode?",
      updatedInput: input
    };
  },
  renderToolUseMessage,
  renderToolResultMessage,
  renderToolUseRejectedMessage,
  async call(input, context) {
    const isAgent = !!context.agentId;
    const filePath = getPlanFilePath(context.agentId);
    const inputPlan = "plan" in input && typeof input.plan === "string" ? input.plan : void 0;
    const plan = inputPlan ?? getPlan(context.agentId);
    if (inputPlan !== void 0 && filePath) {
      await writeFile(filePath, inputPlan, "utf-8").catch((e) => logError(e));
      void persistFileSnapshotIfRemote();
    }
    if (isTeammate() && isPlanModeRequired()) {
      if (!plan) {
        throw new Error(
          `No plan file found at ${filePath}. Please write your plan to this file before calling ExitPlanMode.`
        );
      }
      const agentName = getAgentName() || "unknown";
      const teamName = getTeamName();
      const requestId = generateRequestId(
        "plan_approval",
        formatAgentId(agentName, teamName || "default")
      );
      const approvalRequest = {
        type: "plan_approval_request",
        from: agentName,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        planFilePath: filePath,
        planContent: plan,
        requestId
      };
      await writeToMailbox(
        "team-lead",
        {
          from: agentName,
          text: jsonStringify(approvalRequest),
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        },
        teamName
      );
      const appState2 = context.getAppState();
      const agentTaskId = findInProcessTeammateTaskId(agentName, appState2);
      if (agentTaskId) {
        setAwaitingPlanApproval(agentTaskId, context.setAppState, true);
      }
      return {
        data: {
          plan,
          isAgent: true,
          filePath,
          awaitingLeaderApproval: true,
          requestId
        }
      };
    }
    const appState = context.getAppState();
    let gateFallbackNotification = null;
    if (false) {
      const prePlanRaw = appState.toolPermissionContext.prePlanMode ?? "default";
      if (prePlanRaw === "auto" && !(permissionSetupModule?.isAutoModeGateEnabled() ?? false)) {
        const reason = permissionSetupModule?.getAutoModeUnavailableReason() ?? "circuit-breaker";
        gateFallbackNotification = permissionSetupModule?.getAutoModeUnavailableNotification(reason) ?? "auto mode unavailable";
        logForDebugging(
          `[auto-mode gate @ ExitPlanModeV2Tool] prePlanMode=${prePlanRaw} but gate is off (reason=${reason}) \u2014 falling back to default on plan exit`,
          { level: "warn" }
        );
      }
    }
    if (gateFallbackNotification) {
      context.addNotification?.({
        key: "auto-mode-gate-plan-exit-fallback",
        text: `plan exit \u2192 default \xB7 ${gateFallbackNotification}`,
        priority: "immediate",
        color: "warning",
        timeoutMs: 1e4
      });
    }
    context.setAppState((prev) => {
      if (prev.toolPermissionContext.mode !== "plan") return prev;
      setHasExitedPlanMode(true);
      setNeedsPlanModeExitAttachment(true);
      let restoreMode = prev.toolPermissionContext.prePlanMode ?? "default";
      if (false) {
        if (restoreMode === "auto" && !(permissionSetupModule?.isAutoModeGateEnabled() ?? false)) {
          restoreMode = "default";
        }
        const finalRestoringAuto = restoreMode === "auto";
        const autoWasUsedDuringPlan = autoModeStateModule?.isAutoModeActive() ?? false;
        autoModeStateModule?.setAutoModeActive(finalRestoringAuto);
        if (autoWasUsedDuringPlan && !finalRestoringAuto) {
          setNeedsAutoModeExitAttachment(true);
        }
      }
      const restoringToAuto = restoreMode === "auto";
      let baseContext = prev.toolPermissionContext;
      if (restoringToAuto) {
        baseContext = permissionSetupModule?.stripDangerousPermissionsForAutoMode(
          baseContext
        ) ?? baseContext;
      } else if (prev.toolPermissionContext.strippedDangerousRules) {
        baseContext = permissionSetupModule?.restoreDangerousPermissions(baseContext) ?? baseContext;
      }
      return {
        ...prev,
        toolPermissionContext: {
          ...baseContext,
          mode: restoreMode,
          prePlanMode: void 0
        }
      };
    });
    const hasTaskTool = isAgentSwarmsEnabled() && context.options.tools.some((t) => toolMatchesName(t, AGENT_TOOL_NAME));
    return {
      data: {
        plan,
        isAgent,
        filePath,
        hasTaskTool: hasTaskTool || void 0,
        planWasEdited: inputPlan !== void 0 || void 0
      }
    };
  },
  mapToolResultToToolResultBlockParam({
    isAgent,
    plan,
    filePath,
    hasTaskTool,
    planWasEdited,
    awaitingLeaderApproval,
    requestId
  }, toolUseID) {
    if (awaitingLeaderApproval) {
      return {
        type: "tool_result",
        content: `Your plan has been submitted to the team lead for approval.

Plan file: ${filePath}

**What happens next:**
1. Wait for the team lead to review your plan
2. You will receive a message in your inbox with approval/rejection
3. If approved, you can proceed with implementation
4. If rejected, refine your plan based on the feedback

**Important:** Do NOT proceed until you receive approval. Check your inbox for response.

Request ID: ${requestId}`,
        tool_use_id: toolUseID
      };
    }
    if (isAgent) {
      return {
        type: "tool_result",
        content: 'User has approved the plan. There is nothing else needed from you now. Please respond with "ok"',
        tool_use_id: toolUseID
      };
    }
    if (!plan || plan.trim() === "") {
      return {
        type: "tool_result",
        content: "User has approved exiting plan mode. You can now proceed.",
        tool_use_id: toolUseID
      };
    }
    const teamHint = hasTaskTool ? `

If this plan can be broken down into multiple independent tasks, consider using the ${TEAM_CREATE_TOOL_NAME} tool to create a team and parallelize the work.` : "";
    const planLabel = planWasEdited ? "Approved Plan (edited by user)" : "Approved Plan";
    return {
      type: "tool_result",
      content: `User has approved your plan. You can now start coding. Start with updating your todo list if applicable

Your plan has been saved to: ${filePath}
You can refer back to it if needed during implementation.${teamHint}

## ${planLabel}:
${plan}`,
      tool_use_id: toolUseID
    };
  }
});
export {
  ExitPlanModeV2Tool,
  _sdkInputSchema,
  outputSchema
};
