import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import React from "react";
import { Ansi, Box, Text } from "../../ink.js";
import { useAppState } from "../../state/AppState.js";
import { getDisplayPath } from "../../utils/file.js";
import { formatFileSize } from "../../utils/format.js";
import { MessageResponse } from "../MessageResponse.js";
import { basename, sep } from "path";
import { UserTextMessage } from "./UserTextMessage.js";
import { DiagnosticsDisplay } from "../DiagnosticsDisplay.js";
import { getContentText } from "../../utils/messages.js";
import { UserImageMessage } from "./UserImageMessage.js";
import { toInkColor } from "../../utils/ink.js";
import { jsonParse } from "../../utils/slowOperations.js";
import { plural } from "../../utils/stringUtils.js";
import "../../utils/envUtils.js";
import { isAgentSwarmsEnabled } from "../../utils/agentSwarmsEnabled.js";
import { tryRenderPlanApprovalMessage, formatTeammateMessageContent } from "./PlanApprovalMessage.js";
import { BLACK_CIRCLE } from "../../constants/figures.js";
import { TeammateMessageContent } from "./UserTeammateMessage.js";
import { isShutdownApproved } from "../../utils/teammateMailbox.js";
import { CtrlOToExpand } from "../CtrlOToExpand.js";
import { FilePathLink } from "../FilePathLink.js";
const feature = (_name) => false;
import { useSelectedMessageBg } from "../messageActions.js";
function AttachmentMessage({
  attachment,
  addMargin,
  verbose,
  isTranscriptMode
}) {
  const bg = useSelectedMessageBg();
  const isDemoEnv = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useMemo(() => isEnvTruthy(process.env.IS_DEMO), [])
  ) : false;
  if (isAgentSwarmsEnabled() && attachment.type === "teammate_mailbox") {
    const visibleMessages = attachment.messages.filter((msg) => {
      if (isShutdownApproved(msg.text)) {
        return false;
      }
      try {
        const parsed = jsonParse(msg.text);
        return parsed?.type !== "idle_notification" && parsed?.type !== "teammate_terminated";
      } catch {
        return true;
      }
    });
    if (visibleMessages.length === 0) {
      return null;
    }
    return /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: visibleMessages.map((msg_0, idx) => {
      let parsedMsg = null;
      try {
        parsedMsg = jsonParse(msg_0.text);
      } catch {
      }
      if (parsedMsg?.type === "task_assignment") {
        return /* @__PURE__ */ jsxs(Box, { paddingLeft: 2, children: [
          /* @__PURE__ */ jsxs(Text, { children: [
            BLACK_CIRCLE,
            " "
          ] }),
          /* @__PURE__ */ jsx(Text, { children: "Task assigned: " }),
          /* @__PURE__ */ jsxs(Text, { bold: true, children: [
            "#",
            parsedMsg.taskId
          ] }),
          /* @__PURE__ */ jsxs(Text, { children: [
            " - ",
            parsedMsg.subject
          ] }),
          /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            " (from ",
            parsedMsg.assignedBy || msg_0.from,
            ")"
          ] })
        ] }, idx);
      }
      const planApprovalElement = tryRenderPlanApprovalMessage(msg_0.text, msg_0.from);
      if (planApprovalElement) {
        return /* @__PURE__ */ jsx(React.Fragment, { children: planApprovalElement }, idx);
      }
      const inkColor = toInkColor(msg_0.color);
      const formattedContent = formatTeammateMessageContent(msg_0.text) ?? msg_0.text;
      return /* @__PURE__ */ jsx(TeammateMessageContent, { displayName: msg_0.from, inkColor, content: formattedContent, summary: msg_0.summary, isTranscriptMode }, idx);
    }) });
  }
  if (false) {
    if (attachment.type === "skill_discovery") {
      if (attachment.skills.length === 0) return null;
      const names = attachment.skills.map((s) => s.shortId ? `${s.name} [${s.shortId}]` : s.name).join(", ");
      const firstId = attachment.skills[0]?.shortId;
      const hint = false ? ` \xB7 /skill-feedback ${firstId} 1=wrong 2=noisy 3=good [comment]` : "";
      return /* @__PURE__ */ jsxs(Line, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.skills.length }),
        " relevant",
        " ",
        plural(attachment.skills.length, "skill"),
        ": ",
        names,
        hint && /* @__PURE__ */ jsx(Text, { dimColor: true, children: hint })
      ] });
    }
  }
  switch (attachment.type) {
    case "directory":
      return /* @__PURE__ */ jsxs(Line, { children: [
        "Listed directory ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.displayPath + sep })
      ] });
    case "file":
    case "already_read_file":
      if (attachment.content.type === "notebook") {
        return /* @__PURE__ */ jsxs(Line, { children: [
          "Read ",
          /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.displayPath }),
          " (",
          attachment.content.file.cells.length,
          " cells)"
        ] });
      }
      if (attachment.content.type === "file_unchanged") {
        return /* @__PURE__ */ jsxs(Line, { children: [
          "Read ",
          /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.displayPath }),
          " (unchanged)"
        ] });
      }
      return /* @__PURE__ */ jsxs(Line, { children: [
        "Read ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.displayPath }),
        " (",
        attachment.content.type === "text" ? `${attachment.content.file.numLines}${attachment.truncated ? "+" : ""} lines` : formatFileSize(attachment.content.file.originalSize),
        ")"
      ] });
    case "compact_file_reference":
      return /* @__PURE__ */ jsxs(Line, { children: [
        "Referenced file ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.displayPath })
      ] });
    case "pdf_reference":
      return /* @__PURE__ */ jsxs(Line, { children: [
        "Referenced PDF ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.displayPath }),
        " (",
        attachment.pageCount,
        " pages)"
      ] });
    case "selected_lines_in_ide":
      return /* @__PURE__ */ jsxs(Line, { children: [
        "\u29C9 Selected",
        " ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.lineEnd - attachment.lineStart + 1 }),
        " ",
        "lines from ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.displayPath }),
        " in",
        " ",
        attachment.ideName
      ] });
    case "nested_memory":
      return /* @__PURE__ */ jsxs(Line, { children: [
        "Loaded ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.displayPath })
      ] });
    case "relevant_memories":
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: addMargin ? 1 : 0, backgroundColor: bg, children: [
        /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
          /* @__PURE__ */ jsx(Box, { minWidth: 2 }),
          /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            "Recalled ",
            /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.memories.length }),
            " ",
            attachment.memories.length === 1 ? "memory" : "memories",
            !isTranscriptMode && /* @__PURE__ */ jsxs(Fragment, { children: [
              " ",
              /* @__PURE__ */ jsx(CtrlOToExpand, {})
            ] })
          ] })
        ] }),
        (verbose || isTranscriptMode) && attachment.memories.map((m) => /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
          /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(FilePathLink, { filePath: m.path, children: basename(m.path) }) }) }),
          isTranscriptMode && /* @__PURE__ */ jsx(Box, { paddingLeft: 5, children: /* @__PURE__ */ jsx(Text, { children: /* @__PURE__ */ jsx(Ansi, { children: m.content }) }) })
        ] }, m.path))
      ] });
    case "dynamic_skill": {
      const skillCount = attachment.skillNames.length;
      return /* @__PURE__ */ jsxs(Line, { children: [
        "Loaded",
        " ",
        /* @__PURE__ */ jsxs(Text, { bold: true, children: [
          skillCount,
          " ",
          plural(skillCount, "skill")
        ] }),
        " ",
        "from ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.displayPath })
      ] });
    }
    case "skill_listing": {
      if (attachment.isInitial) {
        return null;
      }
      return /* @__PURE__ */ jsxs(Line, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.skillCount }),
        " ",
        plural(attachment.skillCount, "skill"),
        " available"
      ] });
    }
    case "agent_listing_delta": {
      if (attachment.isInitial || attachment.addedTypes.length === 0) {
        return null;
      }
      const count = attachment.addedTypes.length;
      return /* @__PURE__ */ jsxs(Line, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: count }),
        " agent ",
        plural(count, "type"),
        " available"
      ] });
    }
    case "queued_command": {
      const text = typeof attachment.prompt === "string" ? attachment.prompt : getContentText(attachment.prompt) || "";
      const hasImages = attachment.imagePasteIds && attachment.imagePasteIds.length > 0;
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx(UserTextMessage, { addMargin, param: {
          text,
          type: "text"
        }, verbose, isTranscriptMode }),
        hasImages && attachment.imagePasteIds?.map((id) => /* @__PURE__ */ jsx(UserImageMessage, { imageId: id }, id))
      ] });
    }
    case "plan_file_reference":
      return /* @__PURE__ */ jsxs(Line, { children: [
        "Plan file referenced (",
        getDisplayPath(attachment.planFilePath),
        ")"
      ] });
    case "invoked_skills": {
      if (attachment.skills.length === 0) {
        return null;
      }
      const skillNames = attachment.skills.map((s_0) => s_0.name).join(", ");
      return /* @__PURE__ */ jsxs(Line, { children: [
        "Skills restored (",
        skillNames,
        ")"
      ] });
    }
    case "diagnostics":
      return /* @__PURE__ */ jsx(DiagnosticsDisplay, { attachment, verbose });
    case "mcp_resource":
      return /* @__PURE__ */ jsxs(Line, { children: [
        "Read MCP resource ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.name }),
        " from",
        " ",
        attachment.server
      ] });
    case "command_permissions":
      return null;
    case "async_hook_response": {
      if (attachment.hookEvent === "SessionStart" && !verbose) {
        return null;
      }
      if (!verbose && !isTranscriptMode) {
        return null;
      }
      return /* @__PURE__ */ jsxs(Line, { children: [
        "Async hook ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.hookEvent }),
        " completed"
      ] });
    }
    case "hook_blocking_error": {
      if (attachment.hookEvent === "Stop" || attachment.hookEvent === "SubagentStop") {
        return null;
      }
      const stderr = attachment.blockingError.blockingError.trim();
      return /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Line, { color: "error", children: [
          attachment.hookName,
          " hook returned blocking error"
        ] }),
        stderr ? /* @__PURE__ */ jsx(Line, { color: "error", children: stderr }) : null
      ] });
    }
    case "hook_non_blocking_error": {
      if (attachment.hookEvent === "Stop" || attachment.hookEvent === "SubagentStop") {
        return null;
      }
      return /* @__PURE__ */ jsxs(Line, { color: "error", children: [
        attachment.hookName,
        " hook error"
      ] });
    }
    case "hook_error_during_execution":
      if (attachment.hookEvent === "Stop" || attachment.hookEvent === "SubagentStop") {
        return null;
      }
      return /* @__PURE__ */ jsxs(Line, { children: [
        attachment.hookName,
        " hook warning"
      ] });
    case "hook_success":
      return null;
    case "hook_stopped_continuation":
      if (attachment.hookEvent === "Stop" || attachment.hookEvent === "SubagentStop") {
        return null;
      }
      return /* @__PURE__ */ jsxs(Line, { color: "warning", children: [
        attachment.hookName,
        " hook stopped continuation: ",
        attachment.message
      ] });
    case "hook_system_message":
      return /* @__PURE__ */ jsxs(Line, { children: [
        attachment.hookName,
        " says: ",
        attachment.content
      ] });
    case "hook_permission_decision": {
      const action = attachment.decision === "allow" ? "Allowed" : "Denied";
      return /* @__PURE__ */ jsxs(Line, { children: [
        action,
        " by ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.hookEvent }),
        " hook"
      ] });
    }
    case "task_status":
      return /* @__PURE__ */ jsx(TaskStatusMessage, { attachment });
    case "teammate_shutdown_batch":
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", width: "100%", marginTop: 1, backgroundColor: bg, children: [
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          BLACK_CIRCLE,
          " "
        ] }),
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          attachment.count,
          " ",
          plural(attachment.count, "teammate"),
          " shut down gracefully"
        ] })
      ] });
    default:
      attachment.type;
      return null;
  }
}
function TaskStatusMessage(t0) {
  const $ = _c(4);
  const {
    attachment
  } = t0;
  if (false) {
    return null;
  }
  if (isAgentSwarmsEnabled() && attachment.taskType === "in_process_teammate") {
    let t12;
    if ($[0] !== attachment) {
      t12 = /* @__PURE__ */ jsx(TeammateTaskStatus, { attachment });
      $[0] = attachment;
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    return t12;
  }
  let t1;
  if ($[2] !== attachment) {
    t1 = /* @__PURE__ */ jsx(GenericTaskStatus, { attachment });
    $[2] = attachment;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  return t1;
}
function GenericTaskStatus(t0) {
  const $ = _c(9);
  const {
    attachment
  } = t0;
  const bg = useSelectedMessageBg();
  const statusText = attachment.status === "completed" ? "completed in background" : attachment.status === "killed" ? "stopped" : attachment.status === "running" ? "still running in background" : attachment.status;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      BLACK_CIRCLE,
      " "
    ] });
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== attachment.description) {
    t2 = /* @__PURE__ */ jsx(Text, { bold: true, children: attachment.description });
    $[1] = attachment.description;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== statusText || $[4] !== t2) {
    t3 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      'Task "',
      t2,
      '" ',
      statusText
    ] });
    $[3] = statusText;
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== bg || $[7] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", width: "100%", marginTop: 1, backgroundColor: bg, children: [
      t1,
      t3
    ] });
    $[6] = bg;
    $[7] = t3;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  return t4;
}
function TeammateTaskStatus(t0) {
  const $ = _c(16);
  const {
    attachment
  } = t0;
  const bg = useSelectedMessageBg();
  let t1;
  if ($[0] !== attachment.taskId) {
    t1 = (s) => s.tasks[attachment.taskId];
    $[0] = attachment.taskId;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const task = useAppState(t1);
  if (task?.type !== "in_process_teammate") {
    let t22;
    if ($[2] !== attachment) {
      t22 = /* @__PURE__ */ jsx(GenericTaskStatus, { attachment });
      $[2] = attachment;
      $[3] = t22;
    } else {
      t22 = $[3];
    }
    return t22;
  }
  let t2;
  if ($[4] !== task.identity.color) {
    t2 = toInkColor(task.identity.color);
    $[4] = task.identity.color;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  const agentColor = t2;
  const statusText = attachment.status === "completed" ? "shut down gracefully" : attachment.status;
  let t3;
  if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      BLACK_CIRCLE,
      " "
    ] });
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== agentColor || $[8] !== task.identity.agentName) {
    t4 = /* @__PURE__ */ jsxs(Text, { color: agentColor, bold: true, dimColor: false, children: [
      "@",
      task.identity.agentName
    ] });
    $[7] = agentColor;
    $[8] = task.identity.agentName;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  let t5;
  if ($[10] !== statusText || $[11] !== t4) {
    t5 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Teammate",
      " ",
      t4,
      " ",
      statusText
    ] });
    $[10] = statusText;
    $[11] = t4;
    $[12] = t5;
  } else {
    t5 = $[12];
  }
  let t6;
  if ($[13] !== bg || $[14] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", width: "100%", marginTop: 1, backgroundColor: bg, children: [
      t3,
      t5
    ] });
    $[13] = bg;
    $[14] = t5;
    $[15] = t6;
  } else {
    t6 = $[15];
  }
  return t6;
}
function Line(t0) {
  const $ = _c(7);
  const {
    dimColor: t1,
    children,
    color
  } = t0;
  const dimColor = t1 === void 0 ? true : t1;
  const bg = useSelectedMessageBg();
  let t2;
  if ($[0] !== children || $[1] !== color || $[2] !== dimColor) {
    t2 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color, dimColor, wrap: "wrap", children }) });
    $[0] = children;
    $[1] = color;
    $[2] = dimColor;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== bg || $[5] !== t2) {
    t3 = /* @__PURE__ */ jsx(Box, { backgroundColor: bg, children: t2 });
    $[4] = bg;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}
export {
  AttachmentMessage
};
