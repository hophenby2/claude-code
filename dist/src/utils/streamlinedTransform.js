import { FILE_EDIT_TOOL_NAME } from "../tools/FileEditTool/constants.js";
import { FILE_READ_TOOL_NAME } from "../tools/FileReadTool/prompt.js";
import { FILE_WRITE_TOOL_NAME } from "../tools/FileWriteTool/prompt.js";
import { GLOB_TOOL_NAME } from "../tools/GlobTool/prompt.js";
import { GREP_TOOL_NAME } from "../tools/GrepTool/prompt.js";
import { LIST_MCP_RESOURCES_TOOL_NAME } from "../tools/ListMcpResourcesTool/prompt.js";
import { LSP_TOOL_NAME } from "../tools/LSPTool/prompt.js";
import { NOTEBOOK_EDIT_TOOL_NAME } from "../tools/NotebookEditTool/constants.js";
import { TASK_STOP_TOOL_NAME } from "../tools/TaskStopTool/prompt.js";
import { WEB_SEARCH_TOOL_NAME } from "../tools/WebSearchTool/prompt.js";
import { extractTextContent } from "./messages.js";
import { SHELL_TOOL_NAMES } from "./shell/shellToolUtils.js";
import { capitalize } from "./stringUtils.js";
const SEARCH_TOOLS = [
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  LSP_TOOL_NAME
];
const READ_TOOLS = [FILE_READ_TOOL_NAME, LIST_MCP_RESOURCES_TOOL_NAME];
const WRITE_TOOLS = [
  FILE_WRITE_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  NOTEBOOK_EDIT_TOOL_NAME
];
const COMMAND_TOOLS = [...SHELL_TOOL_NAMES, "Tmux", TASK_STOP_TOOL_NAME];
function categorizeToolName(toolName) {
  if (SEARCH_TOOLS.some((t) => toolName.startsWith(t))) return "searches";
  if (READ_TOOLS.some((t) => toolName.startsWith(t))) return "reads";
  if (WRITE_TOOLS.some((t) => toolName.startsWith(t))) return "writes";
  if (COMMAND_TOOLS.some((t) => toolName.startsWith(t))) return "commands";
  return "other";
}
function createEmptyToolCounts() {
  return {
    searches: 0,
    reads: 0,
    writes: 0,
    commands: 0,
    other: 0
  };
}
function getToolSummaryText(counts) {
  const parts = [];
  if (counts.searches > 0) {
    parts.push(
      `searched ${counts.searches} ${counts.searches === 1 ? "pattern" : "patterns"}`
    );
  }
  if (counts.reads > 0) {
    parts.push(`read ${counts.reads} ${counts.reads === 1 ? "file" : "files"}`);
  }
  if (counts.writes > 0) {
    parts.push(
      `wrote ${counts.writes} ${counts.writes === 1 ? "file" : "files"}`
    );
  }
  if (counts.commands > 0) {
    parts.push(
      `ran ${counts.commands} ${counts.commands === 1 ? "command" : "commands"}`
    );
  }
  if (counts.other > 0) {
    parts.push(`${counts.other} other ${counts.other === 1 ? "tool" : "tools"}`);
  }
  if (parts.length === 0) {
    return void 0;
  }
  return capitalize(parts.join(", "));
}
function accumulateToolUses(message, counts) {
  const content = message.message.content;
  if (!Array.isArray(content)) {
    return;
  }
  for (const block of content) {
    if (block.type === "tool_use" && "name" in block) {
      const category = categorizeToolName(block.name);
      counts[category]++;
    }
  }
}
function createStreamlinedTransformer() {
  let cumulativeCounts = createEmptyToolCounts();
  return function transformToStreamlined(message) {
    switch (message.type) {
      case "assistant": {
        const content = message.message.content;
        const text = Array.isArray(content) ? extractTextContent(content, "\n").trim() : "";
        accumulateToolUses(message, cumulativeCounts);
        if (text.length > 0) {
          cumulativeCounts = createEmptyToolCounts();
          return {
            type: "streamlined_text",
            text,
            session_id: message.session_id,
            uuid: message.uuid
          };
        }
        const toolSummary = getToolSummaryText(cumulativeCounts);
        if (!toolSummary) {
          return null;
        }
        return {
          type: "streamlined_tool_use_summary",
          tool_summary: toolSummary,
          session_id: message.session_id,
          uuid: message.uuid
        };
      }
      case "result":
        return message;
      case "system":
      case "user":
      case "stream_event":
      case "tool_progress":
      case "auth_status":
      case "rate_limit_event":
      case "control_response":
      case "control_request":
      case "control_cancel_request":
      case "keep_alive":
        return null;
      default:
        return null;
    }
  };
}
function shouldIncludeInStreamlined(message) {
  return message.type === "assistant" || message.type === "result";
}
export {
  createStreamlinedTransformer,
  shouldIncludeInStreamlined
};
