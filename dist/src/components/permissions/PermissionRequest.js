import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import { EnterPlanModeTool } from "../../tools/EnterPlanModeTool/EnterPlanModeTool.js";
import { ExitPlanModeV2Tool } from "../../tools/ExitPlanModeTool/ExitPlanModeV2Tool.js";
import { useNotifyAfterTimeout } from "../../hooks/useNotifyAfterTimeout.js";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
import { AskUserQuestionTool } from "../../tools/AskUserQuestionTool/AskUserQuestionTool.js";
import { BashTool } from "../../tools/BashTool/BashTool.js";
import { FileEditTool } from "../../tools/FileEditTool/FileEditTool.js";
import { FileReadTool } from "../../tools/FileReadTool/FileReadTool.js";
import { FileWriteTool } from "../../tools/FileWriteTool/FileWriteTool.js";
import { GlobTool } from "../../tools/GlobTool/GlobTool.js";
import { GrepTool } from "../../tools/GrepTool/GrepTool.js";
import { NotebookEditTool } from "../../tools/NotebookEditTool/NotebookEditTool.js";
import { PowerShellTool } from "../../tools/PowerShellTool/PowerShellTool.js";
import { SkillTool } from "../../tools/SkillTool/SkillTool.js";
import { WebFetchTool } from "../../tools/WebFetchTool/WebFetchTool.js";
import { AskUserQuestionPermissionRequest } from "./AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.js";
import { BashPermissionRequest } from "./BashPermissionRequest/BashPermissionRequest.js";
import { EnterPlanModePermissionRequest } from "./EnterPlanModePermissionRequest/EnterPlanModePermissionRequest.js";
import { ExitPlanModePermissionRequest } from "./ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.js";
import { FallbackPermissionRequest } from "./FallbackPermissionRequest.js";
import { FileEditPermissionRequest } from "./FileEditPermissionRequest/FileEditPermissionRequest.js";
import { FilesystemPermissionRequest } from "./FilesystemPermissionRequest/FilesystemPermissionRequest.js";
import { FileWritePermissionRequest } from "./FileWritePermissionRequest/FileWritePermissionRequest.js";
import { NotebookEditPermissionRequest } from "./NotebookEditPermissionRequest/NotebookEditPermissionRequest.js";
import { PowerShellPermissionRequest } from "./PowerShellPermissionRequest/PowerShellPermissionRequest.js";
import { SkillPermissionRequest } from "./SkillPermissionRequest/SkillPermissionRequest.js";
import { WebFetchPermissionRequest } from "./WebFetchPermissionRequest/WebFetchPermissionRequest.js";
const ReviewArtifactTool = false ? null.ReviewArtifactTool : null;
const ReviewArtifactPermissionRequest = false ? null.ReviewArtifactPermissionRequest : null;
const WorkflowTool = false ? null.WorkflowTool : null;
const WorkflowPermissionRequest = false ? null.WorkflowPermissionRequest : null;
const MonitorTool = false ? null.MonitorTool : null;
const MonitorPermissionRequest = false ? null.MonitorPermissionRequest : null;
function permissionComponentForTool(tool) {
  switch (tool) {
    case FileEditTool:
      return FileEditPermissionRequest;
    case FileWriteTool:
      return FileWritePermissionRequest;
    case BashTool:
      return BashPermissionRequest;
    case PowerShellTool:
      return PowerShellPermissionRequest;
    case ReviewArtifactTool:
      return ReviewArtifactPermissionRequest ?? FallbackPermissionRequest;
    case WebFetchTool:
      return WebFetchPermissionRequest;
    case NotebookEditTool:
      return NotebookEditPermissionRequest;
    case ExitPlanModeV2Tool:
      return ExitPlanModePermissionRequest;
    case EnterPlanModeTool:
      return EnterPlanModePermissionRequest;
    case SkillTool:
      return SkillPermissionRequest;
    case AskUserQuestionTool:
      return AskUserQuestionPermissionRequest;
    case WorkflowTool:
      return WorkflowPermissionRequest ?? FallbackPermissionRequest;
    case MonitorTool:
      return MonitorPermissionRequest ?? FallbackPermissionRequest;
    case GlobTool:
    case GrepTool:
    case FileReadTool:
      return FilesystemPermissionRequest;
    default:
      return FallbackPermissionRequest;
  }
}
function getNotificationMessage(toolUseConfirm) {
  const toolName = toolUseConfirm.tool.userFacingName(toolUseConfirm.input);
  if (toolUseConfirm.tool === ExitPlanModeV2Tool) {
    return "Claude Code needs your approval for the plan";
  }
  if (toolUseConfirm.tool === EnterPlanModeTool) {
    return "Claude Code wants to enter plan mode";
  }
  if (false) {
    return "Claude needs your approval for a review artifact";
  }
  if (!toolName || toolName.trim() === "") {
    return "Claude Code needs your attention";
  }
  return `Claude needs your permission to use ${toolName}`;
}
function PermissionRequest(t0) {
  const $ = _c(18);
  const {
    toolUseConfirm,
    toolUseContext,
    onDone,
    onReject,
    verbose,
    workerBadge,
    setStickyFooter
  } = t0;
  let t1;
  if ($[0] !== onDone || $[1] !== onReject || $[2] !== toolUseConfirm) {
    t1 = () => {
      onDone();
      onReject();
      toolUseConfirm.onReject();
    };
    $[0] = onDone;
    $[1] = onReject;
    $[2] = toolUseConfirm;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  let t2;
  if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = {
      context: "Confirmation"
    };
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  useKeybinding("app:interrupt", t1, t2);
  let t3;
  if ($[5] !== toolUseConfirm) {
    t3 = getNotificationMessage(toolUseConfirm);
    $[5] = toolUseConfirm;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  const notificationMessage = t3;
  useNotifyAfterTimeout(notificationMessage, "permission_prompt");
  let t4;
  if ($[7] !== toolUseConfirm.tool) {
    t4 = permissionComponentForTool(toolUseConfirm.tool);
    $[7] = toolUseConfirm.tool;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  const PermissionComponent = t4;
  let t5;
  if ($[9] !== PermissionComponent || $[10] !== onDone || $[11] !== onReject || $[12] !== setStickyFooter || $[13] !== toolUseConfirm || $[14] !== toolUseContext || $[15] !== verbose || $[16] !== workerBadge) {
    t5 = /* @__PURE__ */ jsx(PermissionComponent, { toolUseContext, toolUseConfirm, onDone, onReject, verbose, workerBadge, setStickyFooter });
    $[9] = PermissionComponent;
    $[10] = onDone;
    $[11] = onReject;
    $[12] = setStickyFooter;
    $[13] = toolUseConfirm;
    $[14] = toolUseContext;
    $[15] = verbose;
    $[16] = workerBadge;
    $[17] = t5;
  } else {
    t5 = $[17];
  }
  return t5;
}
export {
  PermissionRequest
};
