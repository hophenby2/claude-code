import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../../ink.js";
import { isTaskAssignment } from "../../utils/teammateMailbox.js";
function TaskAssignmentDisplay(t0) {
  const $ = _c(11);
  const {
    assignment
  } = t0;
  let t1;
  if ($[0] !== assignment.assignedBy || $[1] !== assignment.taskId) {
    t1 = /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { color: "cyan_FOR_SUBAGENTS_ONLY", bold: true, children: [
      "Task #",
      assignment.taskId,
      " assigned by ",
      assignment.assignedBy
    ] }) });
    $[0] = assignment.assignedBy;
    $[1] = assignment.taskId;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== assignment.subject) {
    t2 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { bold: true, children: assignment.subject }) });
    $[3] = assignment.subject;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] !== assignment.description) {
    t3 = assignment.description && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: assignment.description }) });
    $[5] = assignment.description;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== t1 || $[8] !== t2 || $[9] !== t3) {
    t4 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginY: 1, children: /* @__PURE__ */ jsxs(Box, { borderStyle: "round", borderColor: "cyan_FOR_SUBAGENTS_ONLY", flexDirection: "column", paddingX: 1, paddingY: 1, children: [
      t1,
      t2,
      t3
    ] }) });
    $[7] = t1;
    $[8] = t2;
    $[9] = t3;
    $[10] = t4;
  } else {
    t4 = $[10];
  }
  return t4;
}
function tryRenderTaskAssignmentMessage(content) {
  const assignment = isTaskAssignment(content);
  if (assignment) {
    return /* @__PURE__ */ jsx(TaskAssignmentDisplay, { assignment });
  }
  return null;
}
function getTaskAssignmentSummary(content) {
  const assignment = isTaskAssignment(content);
  if (assignment) {
    return `[Task Assigned] #${assignment.taskId} - ${assignment.subject}`;
  }
  return null;
}
export {
  TaskAssignmentDisplay,
  getTaskAssignmentSummary,
  tryRenderTaskAssignmentMessage
};
