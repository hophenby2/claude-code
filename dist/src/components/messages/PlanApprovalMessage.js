import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Markdown } from "../../components/Markdown.js";
import { Box, Text } from "../../ink.js";
import { jsonParse } from "../../utils/slowOperations.js";
import { isIdleNotification, isPlanApprovalRequest, isPlanApprovalResponse } from "../../utils/teammateMailbox.js";
import { getShutdownMessageSummary } from "./ShutdownMessage.js";
import { getTaskAssignmentSummary } from "./TaskAssignmentMessage.js";
function PlanApprovalRequestDisplay(t0) {
  const $ = _c(10);
  const {
    request
  } = t0;
  let t1;
  if ($[0] !== request.from) {
    t1 = /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { color: "planMode", bold: true, children: [
      "Plan Approval Request from ",
      request.from
    ] }) });
    $[0] = request.from;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== request.planContent) {
    t2 = /* @__PURE__ */ jsx(Box, { borderStyle: "dashed", borderColor: "subtle", borderLeft: false, borderRight: false, flexDirection: "column", paddingX: 1, marginBottom: 1, children: /* @__PURE__ */ jsx(Markdown, { children: request.planContent }) });
    $[2] = request.planContent;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== request.planFilePath) {
    t3 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Plan file: ",
      request.planFilePath
    ] });
    $[4] = request.planFilePath;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== t1 || $[7] !== t2 || $[8] !== t3) {
    t4 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginY: 1, children: /* @__PURE__ */ jsxs(Box, { borderStyle: "round", borderColor: "planMode", flexDirection: "column", paddingX: 1, children: [
      t1,
      t2,
      t3
    ] }) });
    $[6] = t1;
    $[7] = t2;
    $[8] = t3;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  return t4;
}
function PlanApprovalResponseDisplay(t0) {
  const $ = _c(13);
  const {
    response,
    senderName
  } = t0;
  if (response.approved) {
    let t12;
    if ($[0] !== senderName) {
      t12 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { color: "success", bold: true, children: [
        "\u2713 Plan Approved by ",
        senderName
      ] }) });
      $[0] = senderName;
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    let t22;
    if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t22 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { children: "You can now proceed with implementation. Your plan mode restrictions have been lifted." }) });
      $[2] = t22;
    } else {
      t22 = $[2];
    }
    let t32;
    if ($[3] !== t12) {
      t32 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginY: 1, children: /* @__PURE__ */ jsxs(Box, { borderStyle: "round", borderColor: "success", flexDirection: "column", paddingX: 1, paddingY: 1, children: [
        t12,
        t22
      ] }) });
      $[3] = t12;
      $[4] = t32;
    } else {
      t32 = $[4];
    }
    return t32;
  }
  let t1;
  if ($[5] !== senderName) {
    t1 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { color: "error", bold: true, children: [
      "\u2717 Plan Rejected by ",
      senderName
    ] }) });
    $[5] = senderName;
    $[6] = t1;
  } else {
    t1 = $[6];
  }
  let t2;
  if ($[7] !== response.feedback) {
    t2 = response.feedback && /* @__PURE__ */ jsx(Box, { marginTop: 1, borderStyle: "dashed", borderColor: "subtle", borderLeft: false, borderRight: false, paddingX: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
      "Feedback: ",
      response.feedback
    ] }) });
    $[7] = response.feedback;
    $[8] = t2;
  } else {
    t2 = $[8];
  }
  let t3;
  if ($[9] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Please revise your plan based on the feedback and call ExitPlanMode again." }) });
    $[9] = t3;
  } else {
    t3 = $[9];
  }
  let t4;
  if ($[10] !== t1 || $[11] !== t2) {
    t4 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginY: 1, children: /* @__PURE__ */ jsxs(Box, { borderStyle: "round", borderColor: "error", flexDirection: "column", paddingX: 1, paddingY: 1, children: [
      t1,
      t2,
      t3
    ] }) });
    $[10] = t1;
    $[11] = t2;
    $[12] = t4;
  } else {
    t4 = $[12];
  }
  return t4;
}
function tryRenderPlanApprovalMessage(content, senderName) {
  const request = isPlanApprovalRequest(content);
  if (request) {
    return /* @__PURE__ */ jsx(PlanApprovalRequestDisplay, { request });
  }
  const response = isPlanApprovalResponse(content);
  if (response) {
    return /* @__PURE__ */ jsx(PlanApprovalResponseDisplay, { response, senderName });
  }
  return null;
}
function getPlanApprovalSummary(content) {
  const request = isPlanApprovalRequest(content);
  if (request) {
    return `[Plan Approval Request from ${request.from}]`;
  }
  const response = isPlanApprovalResponse(content);
  if (response) {
    if (response.approved) {
      return "[Plan Approved] You can now proceed with implementation";
    } else {
      return `[Plan Rejected] ${response.feedback || "Please revise your plan"}`;
    }
  }
  return null;
}
function getIdleNotificationSummary(msg) {
  const parts = ["Agent idle"];
  if (msg.completedTaskId) {
    const status = msg.completedStatus || "completed";
    parts.push(`Task ${msg.completedTaskId} ${status}`);
  }
  if (msg.summary) {
    parts.push(`Last DM: ${msg.summary}`);
  }
  return parts.join(" \xB7 ");
}
function formatTeammateMessageContent(content) {
  const planSummary = getPlanApprovalSummary(content);
  if (planSummary) {
    return planSummary;
  }
  const shutdownSummary = getShutdownMessageSummary(content);
  if (shutdownSummary) {
    return shutdownSummary;
  }
  const idleMsg = isIdleNotification(content);
  if (idleMsg) {
    return getIdleNotificationSummary(idleMsg);
  }
  const taskAssignmentSummary = getTaskAssignmentSummary(content);
  if (taskAssignmentSummary) {
    return taskAssignmentSummary;
  }
  try {
    const parsed = jsonParse(content);
    if (parsed?.type === "teammate_terminated" && parsed.message) {
      return parsed.message;
    }
  } catch {
  }
  return content;
}
export {
  PlanApprovalRequestDisplay,
  PlanApprovalResponseDisplay,
  formatTeammateMessageContent,
  tryRenderPlanApprovalMessage
};
