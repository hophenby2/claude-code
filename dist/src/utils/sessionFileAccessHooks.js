import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import { registerHookCallbacks } from "../bootstrap/state.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { FILE_EDIT_TOOL_NAME } from "../tools/FileEditTool/constants.js";
import { inputSchema as editInputSchema } from "../tools/FileEditTool/types.js";
import { FileReadTool } from "../tools/FileReadTool/FileReadTool.js";
import { FILE_READ_TOOL_NAME } from "../tools/FileReadTool/prompt.js";
import { FileWriteTool } from "../tools/FileWriteTool/FileWriteTool.js";
import { FILE_WRITE_TOOL_NAME } from "../tools/FileWriteTool/prompt.js";
import { GlobTool } from "../tools/GlobTool/GlobTool.js";
import { GLOB_TOOL_NAME } from "../tools/GlobTool/prompt.js";
import { GrepTool } from "../tools/GrepTool/GrepTool.js";
import { GREP_TOOL_NAME } from "../tools/GrepTool/prompt.js";
import {
  detectSessionFileType,
  detectSessionPatternType,
  isAutoMemFile
} from "./memoryFileDetection.js";
const teamMemPaths = false ? require2("../memdir/teamMemPaths.js") : null;
const teamMemWatcher = false ? require2("../services/teamMemorySync/watcher.js") : null;
const memoryShapeTelemetry = false ? require2("../memdir/memoryShapeTelemetry.js") : null;
import { getSubagentLogName } from "./agentContext.js";
function getFilePathFromInput(toolName, toolInput) {
  switch (toolName) {
    case FILE_READ_TOOL_NAME: {
      const parsed = FileReadTool.inputSchema.safeParse(toolInput);
      return parsed.success ? parsed.data.file_path : null;
    }
    case FILE_EDIT_TOOL_NAME: {
      const parsed = editInputSchema().safeParse(toolInput);
      return parsed.success ? parsed.data.file_path : null;
    }
    case FILE_WRITE_TOOL_NAME: {
      const parsed = FileWriteTool.inputSchema.safeParse(toolInput);
      return parsed.success ? parsed.data.file_path : null;
    }
    default:
      return null;
  }
}
function getSessionFileTypeFromInput(toolName, toolInput) {
  switch (toolName) {
    case FILE_READ_TOOL_NAME: {
      const parsed = FileReadTool.inputSchema.safeParse(toolInput);
      if (!parsed.success) return null;
      return detectSessionFileType(parsed.data.file_path);
    }
    case GREP_TOOL_NAME: {
      const parsed = GrepTool.inputSchema.safeParse(toolInput);
      if (!parsed.success) return null;
      if (parsed.data.path) {
        const pathType = detectSessionFileType(parsed.data.path);
        if (pathType) return pathType;
      }
      if (parsed.data.glob) {
        const globType = detectSessionPatternType(parsed.data.glob);
        if (globType) return globType;
      }
      return null;
    }
    case GLOB_TOOL_NAME: {
      const parsed = GlobTool.inputSchema.safeParse(toolInput);
      if (!parsed.success) return null;
      if (parsed.data.path) {
        const pathType = detectSessionFileType(parsed.data.path);
        if (pathType) return pathType;
      }
      const patternType = detectSessionPatternType(parsed.data.pattern);
      if (patternType) return patternType;
      return null;
    }
    default:
      return null;
  }
}
function isMemoryFileAccess(toolName, toolInput) {
  if (getSessionFileTypeFromInput(toolName, toolInput) === "session_memory") {
    return true;
  }
  const filePath = getFilePathFromInput(toolName, toolInput);
  if (filePath && (isAutoMemFile(filePath) || false)) {
    return true;
  }
  return false;
}
async function handleSessionFileAccess(input, _toolUseID, _signal) {
  if (input.hook_event_name !== "PostToolUse") return {};
  const fileType = getSessionFileTypeFromInput(
    input.tool_name,
    input.tool_input
  );
  const subagentName = getSubagentLogName();
  const subagentProps = subagentName ? { subagent_name: subagentName } : {};
  if (fileType === "session_memory") {
    logEvent("tengu_session_memory_accessed", { ...subagentProps });
  } else if (fileType === "session_transcript") {
    logEvent("tengu_transcript_accessed", { ...subagentProps });
  }
  const filePath = getFilePathFromInput(input.tool_name, input.tool_input);
  if (filePath && isAutoMemFile(filePath)) {
    logEvent("tengu_memdir_accessed", {
      tool: input.tool_name,
      ...subagentProps
    });
    switch (input.tool_name) {
      case FILE_READ_TOOL_NAME:
        logEvent("tengu_memdir_file_read", { ...subagentProps });
        break;
      case FILE_EDIT_TOOL_NAME:
        logEvent("tengu_memdir_file_edit", { ...subagentProps });
        break;
      case FILE_WRITE_TOOL_NAME:
        logEvent("tengu_memdir_file_write", { ...subagentProps });
        break;
    }
  }
  if (false) {
    logEvent("tengu_team_mem_accessed", {
      tool: input.tool_name,
      ...subagentProps
    });
    switch (input.tool_name) {
      case FILE_READ_TOOL_NAME:
        logEvent("tengu_team_mem_file_read", { ...subagentProps });
        break;
      case FILE_EDIT_TOOL_NAME:
        logEvent("tengu_team_mem_file_edit", { ...subagentProps });
        teamMemWatcher?.notifyTeamMemoryWrite();
        break;
      case FILE_WRITE_TOOL_NAME:
        logEvent("tengu_team_mem_file_write", { ...subagentProps });
        teamMemWatcher?.notifyTeamMemoryWrite();
        break;
    }
  }
  if (false) {
    const scope = memoryScopeForPath(filePath);
    if (scope !== null && (input.tool_name === FILE_EDIT_TOOL_NAME || input.tool_name === FILE_WRITE_TOOL_NAME)) {
      memoryShapeTelemetry.logMemoryWriteShape(
        input.tool_name,
        input.tool_input,
        filePath,
        scope
      );
    }
  }
  return {};
}
function registerSessionFileAccessHooks() {
  const hook = {
    type: "callback",
    callback: handleSessionFileAccess,
    timeout: 1,
    // Very short timeout - just logging
    internal: true
  };
  registerHookCallbacks({
    PostToolUse: [
      { matcher: FILE_READ_TOOL_NAME, hooks: [hook] },
      { matcher: GREP_TOOL_NAME, hooks: [hook] },
      { matcher: GLOB_TOOL_NAME, hooks: [hook] },
      { matcher: FILE_EDIT_TOOL_NAME, hooks: [hook] },
      { matcher: FILE_WRITE_TOOL_NAME, hooks: [hook] }
    ]
  });
}
export {
  isMemoryFileAccess,
  registerSessionFileAccessHooks
};
