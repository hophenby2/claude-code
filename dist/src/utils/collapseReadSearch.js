const feature = (_name) => false;
import { findToolByName } from "../Tool.js";
import { extractBashCommentLabel } from "../tools/BashTool/commentLabel.js";
import { BASH_TOOL_NAME } from "../tools/BashTool/toolName.js";
import { FILE_EDIT_TOOL_NAME } from "../tools/FileEditTool/constants.js";
import { FILE_WRITE_TOOL_NAME } from "../tools/FileWriteTool/prompt.js";
import { REPL_TOOL_NAME } from "../tools/REPLTool/constants.js";
import { getReplPrimitiveTools } from "../tools/REPLTool/primitiveTools.js";
import {
  detectGitOperation
} from "../tools/shared/gitOperationTracking.js";
import { TOOL_SEARCH_TOOL_NAME } from "../tools/ToolSearchTool/prompt.js";
import { getDisplayPath } from "./file.js";
import { isFullscreenEnvEnabled } from "./fullscreen.js";
import {
  isAutoManagedMemoryFile,
  isAutoManagedMemoryPattern,
  isMemoryDirectory,
  isShellCommandTargetingMemory
} from "./memoryFileDetection.js";
const teamMemOps = false ? null : null;
const SNIP_TOOL_NAME = false ? null.SNIP_TOOL_NAME : null;
function getFilePathFromToolInput(toolInput) {
  const input = toolInput;
  return input?.file_path ?? input?.path;
}
function isMemorySearch(toolInput) {
  const input = toolInput;
  if (!input) {
    return false;
  }
  if (input.path) {
    if (isAutoManagedMemoryFile(input.path) || isMemoryDirectory(input.path)) {
      return true;
    }
  }
  if (input.glob && isAutoManagedMemoryPattern(input.glob)) {
    return true;
  }
  if (input.command && isShellCommandTargetingMemory(input.command)) {
    return true;
  }
  return false;
}
function isMemoryWriteOrEdit(toolName, toolInput) {
  if (toolName !== FILE_WRITE_TOOL_NAME && toolName !== FILE_EDIT_TOOL_NAME) {
    return false;
  }
  const filePath = getFilePathFromToolInput(toolInput);
  return filePath !== void 0 && isAutoManagedMemoryFile(filePath);
}
const MAX_HINT_CHARS = 300;
function commandAsHint(command) {
  const cleaned = "$ " + command.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l !== "").join("\n");
  return cleaned.length > MAX_HINT_CHARS ? cleaned.slice(0, MAX_HINT_CHARS - 1) + "\u2026" : cleaned;
}
function getToolSearchOrReadInfo(toolName, toolInput, tools) {
  if (toolName === REPL_TOOL_NAME) {
    return {
      isCollapsible: true,
      isSearch: false,
      isRead: false,
      isList: false,
      isREPL: true,
      isMemoryWrite: false,
      isAbsorbedSilently: true
    };
  }
  if (isMemoryWriteOrEdit(toolName, toolInput)) {
    return {
      isCollapsible: true,
      isSearch: false,
      isRead: false,
      isList: false,
      isREPL: false,
      isMemoryWrite: true,
      isAbsorbedSilently: false
    };
  }
  if (isFullscreenEnvEnabled() && toolName === TOOL_SEARCH_TOOL_NAME) {
    return {
      isCollapsible: true,
      isSearch: false,
      isRead: false,
      isList: false,
      isREPL: false,
      isMemoryWrite: false,
      isAbsorbedSilently: true
    };
  }
  const tool = findToolByName(tools, toolName) ?? findToolByName(getReplPrimitiveTools(), toolName);
  if (!tool?.isSearchOrReadCommand) {
    return {
      isCollapsible: false,
      isSearch: false,
      isRead: false,
      isList: false,
      isREPL: false,
      isMemoryWrite: false,
      isAbsorbedSilently: false
    };
  }
  const result = tool.isSearchOrReadCommand(
    toolInput
  );
  const isList = result.isList ?? false;
  const isCollapsible = result.isSearch || result.isRead || isList;
  return {
    isCollapsible: isCollapsible || (isFullscreenEnvEnabled() ? toolName === BASH_TOOL_NAME : false),
    isSearch: result.isSearch,
    isRead: result.isRead,
    isList,
    isREPL: false,
    isMemoryWrite: false,
    isAbsorbedSilently: false,
    ...tool.isMcp && { mcpServerName: tool.mcpInfo?.serverName },
    isBash: isFullscreenEnvEnabled() ? !isCollapsible && toolName === BASH_TOOL_NAME : void 0
  };
}
function getSearchOrReadFromContent(content, tools) {
  if (content?.type === "tool_use" && content.name) {
    const info = getToolSearchOrReadInfo(content.name, content.input, tools);
    if (info.isCollapsible || info.isREPL) {
      return {
        isSearch: info.isSearch,
        isRead: info.isRead,
        isList: info.isList,
        isREPL: info.isREPL,
        isMemoryWrite: info.isMemoryWrite,
        isAbsorbedSilently: info.isAbsorbedSilently,
        mcpServerName: info.mcpServerName,
        isBash: info.isBash
      };
    }
  }
  return null;
}
function isToolSearchOrRead(toolName, toolInput, tools) {
  return getToolSearchOrReadInfo(toolName, toolInput, tools).isCollapsible;
}
function getCollapsibleToolInfo(msg, tools) {
  if (msg.type === "assistant") {
    const content = msg.message.content[0];
    const info = getSearchOrReadFromContent(content, tools);
    if (info && content?.type === "tool_use") {
      return { name: content.name, input: content.input, ...info };
    }
  }
  if (msg.type === "grouped_tool_use") {
    const firstContent = msg.messages[0]?.message.content[0];
    const info = getSearchOrReadFromContent(
      firstContent ? { type: "tool_use", name: msg.toolName, input: firstContent.input } : void 0,
      tools
    );
    if (info && firstContent?.type === "tool_use") {
      return { name: msg.toolName, input: firstContent.input, ...info };
    }
  }
  return null;
}
function isTextBreaker(msg) {
  if (msg.type === "assistant") {
    const content = msg.message.content[0];
    if (content?.type === "text" && content.text.trim().length > 0) {
      return true;
    }
  }
  return false;
}
function isNonCollapsibleToolUse(msg, tools) {
  if (msg.type === "assistant") {
    const content = msg.message.content[0];
    if (content?.type === "tool_use" && !isToolSearchOrRead(content.name, content.input, tools)) {
      return true;
    }
  }
  if (msg.type === "grouped_tool_use") {
    const firstContent = msg.messages[0]?.message.content[0];
    if (firstContent?.type === "tool_use" && !isToolSearchOrRead(msg.toolName, firstContent.input, tools)) {
      return true;
    }
  }
  return false;
}
function isPreToolHookSummary(msg) {
  return msg.type === "system" && msg.subtype === "stop_hook_summary" && msg.hookLabel === "PreToolUse";
}
function shouldSkipMessage(msg) {
  if (msg.type === "assistant") {
    const content = msg.message.content[0];
    if (content?.type === "thinking" || content?.type === "redacted_thinking") {
      return true;
    }
  }
  if (msg.type === "attachment") {
    return true;
  }
  if (msg.type === "system") {
    return true;
  }
  return false;
}
function isCollapsibleToolUse(msg, tools) {
  if (msg.type === "assistant") {
    const content = msg.message.content[0];
    return content?.type === "tool_use" && isToolSearchOrRead(content.name, content.input, tools);
  }
  if (msg.type === "grouped_tool_use") {
    const firstContent = msg.messages[0]?.message.content[0];
    return firstContent?.type === "tool_use" && isToolSearchOrRead(msg.toolName, firstContent.input, tools);
  }
  return false;
}
function isCollapsibleToolResult(msg, collapsibleToolUseIds) {
  if (msg.type === "user") {
    const toolResults = msg.message.content.filter(
      (c) => c.type === "tool_result"
    );
    return toolResults.length > 0 && toolResults.every((r) => collapsibleToolUseIds.has(r.tool_use_id));
  }
  return false;
}
function getToolUseIdsFromMessage(msg) {
  if (msg.type === "assistant") {
    const content = msg.message.content[0];
    if (content?.type === "tool_use") {
      return [content.id];
    }
  }
  if (msg.type === "grouped_tool_use") {
    return msg.messages.map((m) => {
      const content = m.message.content[0];
      return content.type === "tool_use" ? content.id : "";
    }).filter(Boolean);
  }
  return [];
}
function getToolUseIdsFromCollapsedGroup(message) {
  const ids = [];
  for (const msg of message.messages) {
    ids.push(...getToolUseIdsFromMessage(msg));
  }
  return ids;
}
function hasAnyToolInProgress(message, inProgressToolUseIDs) {
  return getToolUseIdsFromCollapsedGroup(message).some(
    (id) => inProgressToolUseIDs.has(id)
  );
}
function getDisplayMessageFromCollapsed(message) {
  const firstMsg = message.displayMessage;
  if (firstMsg.type === "grouped_tool_use") {
    return firstMsg.displayMessage;
  }
  return firstMsg;
}
function countToolUses(msg) {
  if (msg.type === "grouped_tool_use") {
    return msg.messages.length;
  }
  return 1;
}
function getFilePathsFromReadMessage(msg) {
  const paths = [];
  if (msg.type === "assistant") {
    const content = msg.message.content[0];
    if (content?.type === "tool_use") {
      const input = content.input;
      if (input?.file_path) {
        paths.push(input.file_path);
      }
    }
  } else if (msg.type === "grouped_tool_use") {
    for (const m of msg.messages) {
      const content = m.message.content[0];
      if (content?.type === "tool_use") {
        const input = content.input;
        if (input?.file_path) {
          paths.push(input.file_path);
        }
      }
    }
  }
  return paths;
}
function scanBashResultForGitOps(msg, group) {
  if (msg.type !== "user") return;
  const out = msg.toolUseResult;
  if (!out?.stdout && !out?.stderr) return;
  const combined = (out.stdout ?? "") + "\n" + (out.stderr ?? "");
  for (const c of msg.message.content) {
    if (c.type !== "tool_result") continue;
    const command = group.bashCommands?.get(c.tool_use_id);
    if (!command) continue;
    const { commit, push, branch, pr } = detectGitOperation(command, combined);
    if (commit) group.commits?.push(commit);
    if (push) group.pushes?.push(push);
    if (branch) group.branches?.push(branch);
    if (pr) group.prs?.push(pr);
    if (commit || push || branch || pr) {
      group.gitOpBashCount = (group.gitOpBashCount ?? 0) + 1;
    }
  }
}
function createEmptyGroup() {
  const group = {
    messages: [],
    searchCount: 0,
    readFilePaths: /* @__PURE__ */ new Set(),
    readOperationCount: 0,
    listCount: 0,
    toolUseIds: /* @__PURE__ */ new Set(),
    memorySearchCount: 0,
    memoryReadFilePaths: /* @__PURE__ */ new Set(),
    memoryWriteCount: 0,
    nonMemSearchArgs: [],
    latestDisplayHint: void 0,
    hookTotalMs: 0,
    hookCount: 0,
    hookInfos: []
  };
  if (false) {
    group.teamMemorySearchCount = 0;
    group.teamMemoryReadFilePaths = /* @__PURE__ */ new Set();
    group.teamMemoryWriteCount = 0;
  }
  group.mcpCallCount = 0;
  group.mcpServerNames = /* @__PURE__ */ new Set();
  if (isFullscreenEnvEnabled()) {
    group.bashCount = 0;
    group.bashCommands = /* @__PURE__ */ new Map();
    group.commits = [];
    group.pushes = [];
    group.branches = [];
    group.prs = [];
    group.gitOpBashCount = 0;
  }
  return group;
}
function createCollapsedGroup(group) {
  const firstMsg = group.messages[0];
  const totalReadCount = group.readFilePaths.size > 0 ? group.readFilePaths.size : group.readOperationCount;
  const toolMemoryReadCount = group.memoryReadFilePaths.size;
  const memoryReadCount = toolMemoryReadCount + (group.relevantMemories?.length ?? 0);
  const teamMemReadPaths = false ? group.teamMemoryReadFilePaths : void 0;
  const nonMemReadFilePaths = [...group.readFilePaths].filter(
    (p) => !group.memoryReadFilePaths.has(p) && !(teamMemReadPaths?.has(p) ?? false)
  );
  const teamMemSearchCount = false ? group.teamMemorySearchCount ?? 0 : 0;
  const teamMemReadCount = false ? group.teamMemoryReadFilePaths?.size ?? 0 : 0;
  const teamMemWriteCount = false ? group.teamMemoryWriteCount ?? 0 : 0;
  const result = {
    type: "collapsed_read_search",
    // Subtract memory + team memory counts so regular counts only reflect non-memory operations
    searchCount: Math.max(
      0,
      group.searchCount - group.memorySearchCount - teamMemSearchCount
    ),
    readCount: Math.max(
      0,
      totalReadCount - toolMemoryReadCount - teamMemReadCount
    ),
    listCount: group.listCount,
    // REPL operations are intentionally not collapsed (see isCollapsible: false at line 32),
    // so replCount in collapsed groups is always 0. The replCount field is kept for
    // sub-agent progress display in AgentTool/UI.tsx which has a separate code path.
    replCount: 0,
    memorySearchCount: group.memorySearchCount,
    memoryReadCount,
    memoryWriteCount: group.memoryWriteCount,
    readFilePaths: nonMemReadFilePaths,
    searchArgs: group.nonMemSearchArgs,
    latestDisplayHint: group.latestDisplayHint,
    messages: group.messages,
    displayMessage: firstMsg,
    uuid: `collapsed-${firstMsg.uuid}`,
    timestamp: firstMsg.timestamp
  };
  if (false) {
    result.teamMemorySearchCount = teamMemSearchCount;
    result.teamMemoryReadCount = teamMemReadCount;
    result.teamMemoryWriteCount = teamMemWriteCount;
  }
  if ((group.mcpCallCount ?? 0) > 0) {
    result.mcpCallCount = group.mcpCallCount;
    result.mcpServerNames = [...group.mcpServerNames ?? []];
  }
  if (isFullscreenEnvEnabled()) {
    if ((group.bashCount ?? 0) > 0) {
      result.bashCount = group.bashCount;
      result.gitOpBashCount = group.gitOpBashCount;
    }
    if ((group.commits?.length ?? 0) > 0) result.commits = group.commits;
    if ((group.pushes?.length ?? 0) > 0) result.pushes = group.pushes;
    if ((group.branches?.length ?? 0) > 0) result.branches = group.branches;
    if ((group.prs?.length ?? 0) > 0) result.prs = group.prs;
  }
  if (group.hookCount > 0) {
    result.hookTotalMs = group.hookTotalMs;
    result.hookCount = group.hookCount;
    result.hookInfos = group.hookInfos;
  }
  if (group.relevantMemories && group.relevantMemories.length > 0) {
    result.relevantMemories = group.relevantMemories;
  }
  return result;
}
function collapseReadSearchGroups(messages, tools) {
  const result = [];
  let currentGroup = createEmptyGroup();
  let deferredSkippable = [];
  function flushGroup() {
    if (currentGroup.messages.length === 0) {
      return;
    }
    result.push(createCollapsedGroup(currentGroup));
    for (const deferred of deferredSkippable) {
      result.push(deferred);
    }
    deferredSkippable = [];
    currentGroup = createEmptyGroup();
  }
  for (const msg of messages) {
    if (isCollapsibleToolUse(msg, tools)) {
      const toolInfo = getCollapsibleToolInfo(msg, tools);
      if (toolInfo.isMemoryWrite) {
        const count = countToolUses(msg);
        if (false) {
          currentGroup.teamMemoryWriteCount = (currentGroup.teamMemoryWriteCount ?? 0) + count;
        } else {
          currentGroup.memoryWriteCount += count;
        }
      } else if (toolInfo.isAbsorbedSilently) {
      } else if (toolInfo.mcpServerName) {
        const count = countToolUses(msg);
        currentGroup.mcpCallCount = (currentGroup.mcpCallCount ?? 0) + count;
        currentGroup.mcpServerNames?.add(toolInfo.mcpServerName);
        const input = toolInfo.input;
        if (input?.query) {
          currentGroup.latestDisplayHint = `"${input.query}"`;
        }
      } else if (isFullscreenEnvEnabled() && toolInfo.isBash) {
        const count = countToolUses(msg);
        currentGroup.bashCount = (currentGroup.bashCount ?? 0) + count;
        const input = toolInfo.input;
        if (input?.command) {
          currentGroup.latestDisplayHint = extractBashCommentLabel(input.command) ?? commandAsHint(input.command);
          for (const id of getToolUseIdsFromMessage(msg)) {
            currentGroup.bashCommands?.set(id, input.command);
          }
        }
      } else if (toolInfo.isList) {
        currentGroup.listCount += countToolUses(msg);
        const input = toolInfo.input;
        if (input?.command) {
          currentGroup.latestDisplayHint = commandAsHint(input.command);
        }
      } else if (toolInfo.isSearch) {
        const count = countToolUses(msg);
        currentGroup.searchCount += count;
        if (false) {
          currentGroup.teamMemorySearchCount = (currentGroup.teamMemorySearchCount ?? 0) + count;
        } else if (isMemorySearch(toolInfo.input)) {
          currentGroup.memorySearchCount += count;
        } else {
          const input = toolInfo.input;
          if (input?.pattern) {
            currentGroup.nonMemSearchArgs.push(input.pattern);
            currentGroup.latestDisplayHint = `"${input.pattern}"`;
          }
        }
      } else {
        const filePaths = getFilePathsFromReadMessage(msg);
        for (const filePath of filePaths) {
          currentGroup.readFilePaths.add(filePath);
          if (false) {
            currentGroup.teamMemoryReadFilePaths?.add(filePath);
          } else if (isAutoManagedMemoryFile(filePath)) {
            currentGroup.memoryReadFilePaths.add(filePath);
          } else {
            currentGroup.latestDisplayHint = getDisplayPath(filePath);
          }
        }
        if (filePaths.length === 0) {
          currentGroup.readOperationCount += countToolUses(msg);
          const input = toolInfo.input;
          if (input?.command) {
            currentGroup.latestDisplayHint = commandAsHint(input.command);
          }
        }
      }
      for (const id of getToolUseIdsFromMessage(msg)) {
        currentGroup.toolUseIds.add(id);
      }
      currentGroup.messages.push(msg);
    } else if (isCollapsibleToolResult(msg, currentGroup.toolUseIds)) {
      currentGroup.messages.push(msg);
      if (isFullscreenEnvEnabled() && currentGroup.bashCommands?.size) {
        scanBashResultForGitOps(msg, currentGroup);
      }
    } else if (currentGroup.messages.length > 0 && isPreToolHookSummary(msg)) {
      currentGroup.hookCount += msg.hookCount;
      currentGroup.hookTotalMs += msg.totalDurationMs ?? msg.hookInfos.reduce((sum, h) => sum + (h.durationMs ?? 0), 0);
      currentGroup.hookInfos.push(...msg.hookInfos);
    } else if (currentGroup.messages.length > 0 && msg.type === "attachment" && msg.attachment.type === "relevant_memories") {
      currentGroup.relevantMemories ??= [];
      currentGroup.relevantMemories.push(...msg.attachment.memories);
    } else if (shouldSkipMessage(msg)) {
      if (currentGroup.messages.length > 0 && !(msg.type === "attachment" && msg.attachment.type === "nested_memory")) {
        deferredSkippable.push(msg);
      } else {
        result.push(msg);
      }
    } else if (isTextBreaker(msg)) {
      flushGroup();
      result.push(msg);
    } else if (isNonCollapsibleToolUse(msg, tools)) {
      flushGroup();
      result.push(msg);
    } else {
      flushGroup();
      result.push(msg);
    }
  }
  flushGroup();
  return result;
}
function getSearchReadSummaryText(searchCount, readCount, isActive, replCount = 0, memoryCounts, listCount = 0) {
  const parts = [];
  if (memoryCounts) {
    const { memorySearchCount, memoryReadCount, memoryWriteCount } = memoryCounts;
    if (memoryReadCount > 0) {
      const verb = isActive ? parts.length === 0 ? "Recalling" : "recalling" : parts.length === 0 ? "Recalled" : "recalled";
      parts.push(
        `${verb} ${memoryReadCount} ${memoryReadCount === 1 ? "memory" : "memories"}`
      );
    }
    if (memorySearchCount > 0) {
      const verb = isActive ? parts.length === 0 ? "Searching" : "searching" : parts.length === 0 ? "Searched" : "searched";
      parts.push(`${verb} memories`);
    }
    if (memoryWriteCount > 0) {
      const verb = isActive ? parts.length === 0 ? "Writing" : "writing" : parts.length === 0 ? "Wrote" : "wrote";
      parts.push(
        `${verb} ${memoryWriteCount} ${memoryWriteCount === 1 ? "memory" : "memories"}`
      );
    }
    if (false) {
      teamMemOps.appendTeamMemorySummaryParts(memoryCounts, isActive, parts);
    }
  }
  if (searchCount > 0) {
    const searchVerb = isActive ? parts.length === 0 ? "Searching for" : "searching for" : parts.length === 0 ? "Searched for" : "searched for";
    parts.push(
      `${searchVerb} ${searchCount} ${searchCount === 1 ? "pattern" : "patterns"}`
    );
  }
  if (readCount > 0) {
    const readVerb = isActive ? parts.length === 0 ? "Reading" : "reading" : parts.length === 0 ? "Read" : "read";
    parts.push(`${readVerb} ${readCount} ${readCount === 1 ? "file" : "files"}`);
  }
  if (listCount > 0) {
    const listVerb = isActive ? parts.length === 0 ? "Listing" : "listing" : parts.length === 0 ? "Listed" : "listed";
    parts.push(
      `${listVerb} ${listCount} ${listCount === 1 ? "directory" : "directories"}`
    );
  }
  if (replCount > 0) {
    const replVerb = isActive ? "REPL'ing" : "REPL'd";
    parts.push(`${replVerb} ${replCount} ${replCount === 1 ? "time" : "times"}`);
  }
  const text = parts.join(", ");
  return isActive ? `${text}\u2026` : text;
}
function summarizeRecentActivities(activities) {
  if (activities.length === 0) {
    return void 0;
  }
  let searchCount = 0;
  let readCount = 0;
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity.isSearch) {
      searchCount++;
    } else if (activity.isRead) {
      readCount++;
    } else {
      break;
    }
  }
  const collapsibleCount = searchCount + readCount;
  if (collapsibleCount >= 2) {
    return getSearchReadSummaryText(searchCount, readCount, true);
  }
  for (let i = activities.length - 1; i >= 0; i--) {
    if (activities[i]?.activityDescription) {
      return activities[i].activityDescription;
    }
  }
  return void 0;
}
export {
  collapseReadSearchGroups,
  getDisplayMessageFromCollapsed,
  getSearchOrReadFromContent,
  getSearchReadSummaryText,
  getToolSearchOrReadInfo,
  getToolUseIdsFromCollapsedGroup,
  hasAnyToolInProgress,
  summarizeRecentActivities
};
