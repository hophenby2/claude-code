import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import { z } from "zod/v4";
import "../../bootstrap/state.js";
import "../../bridge/replBridgeHandle.js";
import { buildTool } from "../../Tool.js";
import { findTeammateTaskByAgentId } from "../../tasks/InProcessTeammateTask/InProcessTeammateTask.js";
import {
  isLocalAgentTask,
  queuePendingMessage
} from "../../tasks/LocalAgentTask/LocalAgentTask.js";
import { isMainSessionTask } from "../../tasks/LocalMainSessionTask.js";
import { toAgentId } from "../../types/ids.js";
import { generateRequestId } from "../../utils/agentId.js";
import { isAgentSwarmsEnabled } from "../../utils/agentSwarmsEnabled.js";
import { logForDebugging } from "../../utils/debug.js";
import { errorMessage } from "../../utils/errors.js";
import "../../utils/format.js";
import { gracefulShutdown } from "../../utils/gracefulShutdown.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { parseAddress } from "../../utils/peerAddress.js";
import { semanticBoolean } from "../../utils/semanticBoolean.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { TEAM_LEAD_NAME } from "../../utils/swarm/constants.js";
import { readTeamFileAsync } from "../../utils/swarm/teamHelpers.js";
import {
  getAgentId,
  getAgentName,
  getTeammateColor,
  getTeamName,
  isTeamLead,
  isTeammate
} from "../../utils/teammate.js";
import {
  createShutdownApprovedMessage,
  createShutdownRejectedMessage,
  createShutdownRequestMessage,
  writeToMailbox
} from "../../utils/teammateMailbox.js";
import { resumeAgentBackground } from "../AgentTool/resumeAgent.js";
import { SEND_MESSAGE_TOOL_NAME } from "./constants.js";
import { DESCRIPTION, getPrompt } from "./prompt.js";
import { renderToolResultMessage, renderToolUseMessage } from "./UI.js";
const StructuredMessage = lazySchema(
  () => z.discriminatedUnion("type", [
    z.object({
      type: z.literal("shutdown_request"),
      reason: z.string().optional()
    }),
    z.object({
      type: z.literal("shutdown_response"),
      request_id: z.string(),
      approve: semanticBoolean(),
      reason: z.string().optional()
    }),
    z.object({
      type: z.literal("plan_approval_response"),
      request_id: z.string(),
      approve: semanticBoolean(),
      feedback: z.string().optional()
    })
  ])
);
const inputSchema = lazySchema(
  () => z.object({
    to: z.string().describe(
      false ? 'Recipient: teammate name, "*" for broadcast, "uds:<socket-path>" for a local peer, or "bridge:<session-id>" for a Remote Control peer (use ListPeers to discover)' : 'Recipient: teammate name, or "*" for broadcast to all teammates'
    ),
    summary: z.string().optional().describe(
      "A 5-10 word summary shown as a preview in the UI (required when message is a string)"
    ),
    message: z.union([
      z.string().describe("Plain text message content"),
      StructuredMessage()
    ])
  })
);
function findTeammateColor(appState, name) {
  const teammates = appState.teamContext?.teammates;
  if (!teammates) return void 0;
  for (const teammate of Object.values(teammates)) {
    if ("name" in teammate && teammate.name === name) {
      return teammate.color;
    }
  }
  return void 0;
}
async function handleMessage(recipientName, content, summary, context) {
  const appState = context.getAppState();
  const teamName = getTeamName(appState.teamContext);
  const senderName = getAgentName() || (isTeammate() ? "teammate" : TEAM_LEAD_NAME);
  const senderColor = getTeammateColor();
  await writeToMailbox(
    recipientName,
    {
      from: senderName,
      text: content,
      summary,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      color: senderColor
    },
    teamName
  );
  const recipientColor = findTeammateColor(appState, recipientName);
  return {
    data: {
      success: true,
      message: `Message sent to ${recipientName}'s inbox`,
      routing: {
        sender: senderName,
        senderColor,
        target: `@${recipientName}`,
        targetColor: recipientColor,
        summary,
        content
      }
    }
  };
}
async function handleBroadcast(content, summary, context) {
  const appState = context.getAppState();
  const teamName = getTeamName(appState.teamContext);
  if (!teamName) {
    throw new Error(
      "Not in a team context. Create a team with Teammate spawnTeam first, or set CLAUDE_CODE_TEAM_NAME."
    );
  }
  const teamFile = await readTeamFileAsync(teamName);
  if (!teamFile) {
    throw new Error(`Team "${teamName}" does not exist`);
  }
  const senderName = getAgentName() || (isTeammate() ? "teammate" : TEAM_LEAD_NAME);
  if (!senderName) {
    throw new Error(
      "Cannot broadcast: sender name is required. Set CLAUDE_CODE_AGENT_NAME."
    );
  }
  const senderColor = getTeammateColor();
  const recipients = [];
  for (const member of teamFile.members) {
    if (member.name.toLowerCase() === senderName.toLowerCase()) {
      continue;
    }
    recipients.push(member.name);
  }
  if (recipients.length === 0) {
    return {
      data: {
        success: true,
        message: "No teammates to broadcast to (you are the only team member)",
        recipients: []
      }
    };
  }
  for (const recipientName of recipients) {
    await writeToMailbox(
      recipientName,
      {
        from: senderName,
        text: content,
        summary,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        color: senderColor
      },
      teamName
    );
  }
  return {
    data: {
      success: true,
      message: `Message broadcast to ${recipients.length} teammate(s): ${recipients.join(", ")}`,
      recipients,
      routing: {
        sender: senderName,
        senderColor,
        target: "@team",
        summary,
        content
      }
    }
  };
}
async function handleShutdownRequest(targetName, reason, context) {
  const appState = context.getAppState();
  const teamName = getTeamName(appState.teamContext);
  const senderName = getAgentName() || TEAM_LEAD_NAME;
  const requestId = generateRequestId("shutdown", targetName);
  const shutdownMessage = createShutdownRequestMessage({
    requestId,
    from: senderName,
    reason
  });
  await writeToMailbox(
    targetName,
    {
      from: senderName,
      text: jsonStringify(shutdownMessage),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      color: getTeammateColor()
    },
    teamName
  );
  return {
    data: {
      success: true,
      message: `Shutdown request sent to ${targetName}. Request ID: ${requestId}`,
      request_id: requestId,
      target: targetName
    }
  };
}
async function handleShutdownApproval(requestId, context) {
  const teamName = getTeamName();
  const agentId = getAgentId();
  const agentName = getAgentName() || "teammate";
  logForDebugging(
    `[SendMessageTool] handleShutdownApproval: teamName=${teamName}, agentId=${agentId}, agentName=${agentName}`
  );
  let ownPaneId;
  let ownBackendType;
  if (teamName) {
    const teamFile = await readTeamFileAsync(teamName);
    if (teamFile && agentId) {
      const selfMember = teamFile.members.find((m) => m.agentId === agentId);
      if (selfMember) {
        ownPaneId = selfMember.tmuxPaneId;
        ownBackendType = selfMember.backendType;
      }
    }
  }
  const approvedMessage = createShutdownApprovedMessage({
    requestId,
    from: agentName,
    paneId: ownPaneId,
    backendType: ownBackendType
  });
  await writeToMailbox(
    TEAM_LEAD_NAME,
    {
      from: agentName,
      text: jsonStringify(approvedMessage),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      color: getTeammateColor()
    },
    teamName
  );
  if (ownBackendType === "in-process") {
    logForDebugging(
      `[SendMessageTool] In-process teammate ${agentName} approving shutdown - signaling abort`
    );
    if (agentId) {
      const appState = context.getAppState();
      const task = findTeammateTaskByAgentId(agentId, appState.tasks);
      if (task?.abortController) {
        task.abortController.abort();
        logForDebugging(
          `[SendMessageTool] Aborted controller for in-process teammate ${agentName}`
        );
      } else {
        logForDebugging(
          `[SendMessageTool] Warning: Could not find task/abortController for ${agentName}`
        );
      }
    }
  } else {
    if (agentId) {
      const appState = context.getAppState();
      const task = findTeammateTaskByAgentId(agentId, appState.tasks);
      if (task?.abortController) {
        logForDebugging(
          `[SendMessageTool] Fallback: Found in-process task for ${agentName} via AppState, aborting`
        );
        task.abortController.abort();
        return {
          data: {
            success: true,
            message: `Shutdown approved (fallback path). Agent ${agentName} is now exiting.`,
            request_id: requestId
          }
        };
      }
    }
    setImmediate(async () => {
      await gracefulShutdown(0, "other");
    });
  }
  return {
    data: {
      success: true,
      message: `Shutdown approved. Sent confirmation to team-lead. Agent ${agentName} is now exiting.`,
      request_id: requestId
    }
  };
}
async function handleShutdownRejection(requestId, reason) {
  const teamName = getTeamName();
  const agentName = getAgentName() || "teammate";
  const rejectedMessage = createShutdownRejectedMessage({
    requestId,
    from: agentName,
    reason
  });
  await writeToMailbox(
    TEAM_LEAD_NAME,
    {
      from: agentName,
      text: jsonStringify(rejectedMessage),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      color: getTeammateColor()
    },
    teamName
  );
  return {
    data: {
      success: true,
      message: `Shutdown rejected. Reason: "${reason}". Continuing to work.`,
      request_id: requestId
    }
  };
}
async function handlePlanApproval(recipientName, requestId, context) {
  const appState = context.getAppState();
  const teamName = appState.teamContext?.teamName;
  if (!isTeamLead(appState.teamContext)) {
    throw new Error(
      "Only the team lead can approve plans. Teammates cannot approve their own or other plans."
    );
  }
  const leaderMode = appState.toolPermissionContext.mode;
  const modeToInherit = leaderMode === "plan" ? "default" : leaderMode;
  const approvalResponse = {
    type: "plan_approval_response",
    requestId,
    approved: true,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    permissionMode: modeToInherit
  };
  await writeToMailbox(
    recipientName,
    {
      from: TEAM_LEAD_NAME,
      text: jsonStringify(approvalResponse),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    },
    teamName
  );
  return {
    data: {
      success: true,
      message: `Plan approved for ${recipientName}. They will receive the approval and can proceed with implementation.`,
      request_id: requestId
    }
  };
}
async function handlePlanRejection(recipientName, requestId, feedback, context) {
  const appState = context.getAppState();
  const teamName = appState.teamContext?.teamName;
  if (!isTeamLead(appState.teamContext)) {
    throw new Error(
      "Only the team lead can reject plans. Teammates cannot reject their own or other plans."
    );
  }
  const rejectionResponse = {
    type: "plan_approval_response",
    requestId,
    approved: false,
    feedback,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeToMailbox(
    recipientName,
    {
      from: TEAM_LEAD_NAME,
      text: jsonStringify(rejectionResponse),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    },
    teamName
  );
  return {
    data: {
      success: true,
      message: `Plan rejected for ${recipientName} with feedback: "${feedback}"`,
      request_id: requestId
    }
  };
}
const SendMessageTool = buildTool({
  name: SEND_MESSAGE_TOOL_NAME,
  searchHint: "send messages to agent teammates (swarm protocol)",
  maxResultSizeChars: 1e5,
  userFacingName() {
    return "SendMessage";
  },
  get inputSchema() {
    return inputSchema();
  },
  shouldDefer: true,
  isEnabled() {
    return isAgentSwarmsEnabled();
  },
  isReadOnly(input) {
    return typeof input.message === "string";
  },
  backfillObservableInput(input) {
    if ("type" in input) return;
    if (typeof input.to !== "string") return;
    if (input.to === "*") {
      input.type = "broadcast";
      if (typeof input.message === "string") input.content = input.message;
    } else if (typeof input.message === "string") {
      input.type = "message";
      input.recipient = input.to;
      input.content = input.message;
    } else if (typeof input.message === "object" && input.message !== null) {
      const msg = input.message;
      input.type = msg.type;
      input.recipient = input.to;
      if (msg.request_id !== void 0) input.request_id = msg.request_id;
      if (msg.approve !== void 0) input.approve = msg.approve;
      const content = msg.reason ?? msg.feedback;
      if (content !== void 0) input.content = content;
    }
  },
  toAutoClassifierInput(input) {
    if (typeof input.message === "string") {
      return `to ${input.to}: ${input.message}`;
    }
    switch (input.message.type) {
      case "shutdown_request":
        return `shutdown_request to ${input.to}`;
      case "shutdown_response":
        return `shutdown_response ${input.message.approve ? "approve" : "reject"} ${input.message.request_id}`;
      case "plan_approval_response":
        return `plan_approval ${input.message.approve ? "approve" : "reject"} to ${input.to}`;
    }
  },
  async checkPermissions(input, _context) {
    if (false) {
      return {
        behavior: "ask",
        message: `Send a message to Remote Control session ${input.to}? It arrives as a user prompt on the receiving Claude (possibly another machine) via Anthropic's servers.`,
        // safetyCheck (not mode) — permissions.ts guards this before both
        // bypassPermissions (step 1g) and auto-mode's allowlist/classifier.
        // Cross-machine prompt injection must stay bypass-immune.
        decisionReason: {
          type: "safetyCheck",
          reason: "Cross-machine bridge message requires explicit user consent",
          classifierApprovable: false
        }
      };
    }
    return { behavior: "allow", updatedInput: input };
  },
  async validateInput(input, _context) {
    if (input.to.trim().length === 0) {
      return {
        result: false,
        message: "to must not be empty",
        errorCode: 9
      };
    }
    const addr = parseAddress(input.to);
    if ((addr.scheme === "bridge" || addr.scheme === "uds") && addr.target.trim().length === 0) {
      return {
        result: false,
        message: "address target must not be empty",
        errorCode: 9
      };
    }
    if (input.to.includes("@")) {
      return {
        result: false,
        message: 'to must be a bare teammate name or "*" \u2014 there is only one team per session',
        errorCode: 9
      };
    }
    if (false) {
      if (typeof input.message !== "string") {
        return {
          result: false,
          message: "structured messages cannot be sent cross-session \u2014 only plain text",
          errorCode: 9
        };
      }
      if (!getReplBridgeHandle() || !isReplBridgeActive()) {
        return {
          result: false,
          message: "Remote Control is not connected \u2014 cannot send to a bridge: target. Reconnect with /remote-control first.",
          errorCode: 9
        };
      }
      return { result: true };
    }
    if (false) {
      return { result: true };
    }
    if (typeof input.message === "string") {
      if (!input.summary || input.summary.trim().length === 0) {
        return {
          result: false,
          message: "summary is required when message is a string",
          errorCode: 9
        };
      }
      return { result: true };
    }
    if (input.to === "*") {
      return {
        result: false,
        message: 'structured messages cannot be broadcast (to: "*")',
        errorCode: 9
      };
    }
    if (false) {
      return {
        result: false,
        message: "structured messages cannot be sent cross-session \u2014 only plain text",
        errorCode: 9
      };
    }
    if (input.message.type === "shutdown_response" && input.to !== TEAM_LEAD_NAME) {
      return {
        result: false,
        message: `shutdown_response must be sent to "${TEAM_LEAD_NAME}"`,
        errorCode: 9
      };
    }
    if (input.message.type === "shutdown_response" && !input.message.approve && (!input.message.reason || input.message.reason.trim().length === 0)) {
      return {
        result: false,
        message: "reason is required when rejecting a shutdown request",
        errorCode: 9
      };
    }
    return { result: true };
  },
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return getPrompt();
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: "tool_result",
      content: [
        {
          type: "text",
          text: jsonStringify(data)
        }
      ]
    };
  },
  async call(input, context, canUseTool, assistantMessage) {
    if (false) {
      const addr = parseAddress(input.to);
      if (addr.scheme === "bridge") {
        if (!getReplBridgeHandle() || !isReplBridgeActive()) {
          return {
            data: {
              success: false,
              message: `Remote Control disconnected before send \u2014 cannot deliver to ${input.to}`
            }
          };
        }
        const { postInterClaudeMessage } = require2("../../bridge/peerSessions.js");
        const result = await postInterClaudeMessage(
          addr.target,
          input.message
        );
        const preview = input.summary || truncate(input.message, 50);
        return {
          data: {
            success: result.ok,
            message: result.ok ? `\u201C${preview}\u201D \u2192 ${input.to}` : `Failed to send to ${input.to}: ${result.error ?? "unknown"}`
          }
        };
      }
      if (addr.scheme === "uds") {
        const { sendToUdsSocket } = require2("../../utils/udsClient.js");
        try {
          await sendToUdsSocket(addr.target, input.message);
          const preview = input.summary || truncate(input.message, 50);
          return {
            data: {
              success: true,
              message: `\u201C${preview}\u201D \u2192 ${input.to}`
            }
          };
        } catch (e) {
          return {
            data: {
              success: false,
              message: `Failed to send to ${input.to}: ${errorMessage(e)}`
            }
          };
        }
      }
    }
    if (typeof input.message === "string" && input.to !== "*") {
      const appState = context.getAppState();
      const registered = appState.agentNameRegistry.get(input.to);
      const agentId = registered ?? toAgentId(input.to);
      if (agentId) {
        const task = appState.tasks[agentId];
        if (isLocalAgentTask(task) && !isMainSessionTask(task)) {
          if (task.status === "running") {
            queuePendingMessage(
              agentId,
              input.message,
              context.setAppStateForTasks ?? context.setAppState
            );
            return {
              data: {
                success: true,
                message: `Message queued for delivery to ${input.to} at its next tool round.`
              }
            };
          }
          try {
            const result = await resumeAgentBackground({
              agentId,
              prompt: input.message,
              toolUseContext: context,
              canUseTool,
              invokingRequestId: assistantMessage?.requestId
            });
            return {
              data: {
                success: true,
                message: `Agent "${input.to}" was stopped (${task.status}); resumed it in the background with your message. You'll be notified when it finishes. Output: ${result.outputFile}`
              }
            };
          } catch (e) {
            return {
              data: {
                success: false,
                message: `Agent "${input.to}" is stopped (${task.status}) and could not be resumed: ${errorMessage(e)}`
              }
            };
          }
        } else {
          try {
            const result = await resumeAgentBackground({
              agentId,
              prompt: input.message,
              toolUseContext: context,
              canUseTool,
              invokingRequestId: assistantMessage?.requestId
            });
            return {
              data: {
                success: true,
                message: `Agent "${input.to}" had no active task; resumed from transcript in the background with your message. You'll be notified when it finishes. Output: ${result.outputFile}`
              }
            };
          } catch (e) {
            return {
              data: {
                success: false,
                message: `Agent "${input.to}" is registered but has no transcript to resume. It may have been cleaned up. (${errorMessage(e)})`
              }
            };
          }
        }
      }
    }
    if (typeof input.message === "string") {
      if (input.to === "*") {
        return handleBroadcast(input.message, input.summary, context);
      }
      return handleMessage(input.to, input.message, input.summary, context);
    }
    if (input.to === "*") {
      throw new Error("structured messages cannot be broadcast");
    }
    switch (input.message.type) {
      case "shutdown_request":
        return handleShutdownRequest(input.to, input.message.reason, context);
      case "shutdown_response":
        if (input.message.approve) {
          return handleShutdownApproval(input.message.request_id, context);
        }
        return handleShutdownRejection(
          input.message.request_id,
          input.message.reason
        );
      case "plan_approval_response":
        if (input.message.approve) {
          return handlePlanApproval(
            input.to,
            input.message.request_id,
            context
          );
        }
        return handlePlanRejection(
          input.to,
          input.message.request_id,
          input.message.feedback ?? "Plan needs revision",
          context
        );
    }
  },
  renderToolUseMessage,
  renderToolResultMessage
});
export {
  SendMessageTool
};
