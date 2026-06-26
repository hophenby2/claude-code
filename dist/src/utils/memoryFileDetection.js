const feature = (_name) => false;
import { normalize, posix, win32 } from "path";
import {
  getAutoMemPath,
  getMemoryBaseDir,
  isAutoMemoryEnabled,
  isAutoMemPath
} from "../memdir/paths.js";
import { isAgentMemoryPath } from "../tools/AgentTool/agentMemory.js";
import { getClaudeConfigHomeDir } from "./envUtils.js";
import {
  posixPathToWindowsPath,
  windowsPathToPosixPath
} from "./windowsPaths.js";
const teamMemPaths = false ? null : null;
const IS_WINDOWS = process.platform === "win32";
function toPosix(p) {
  return p.split(win32.sep).join(posix.sep);
}
function toComparable(p) {
  const posixForm = toPosix(p);
  return IS_WINDOWS ? posixForm.toLowerCase() : posixForm;
}
function detectSessionFileType(filePath) {
  const configDir = getClaudeConfigHomeDir();
  const normalized = toComparable(filePath);
  const configDirCmp = toComparable(configDir);
  if (!normalized.startsWith(configDirCmp)) {
    return null;
  }
  if (normalized.includes("/session-memory/") && normalized.endsWith(".md")) {
    return "session_memory";
  }
  if (normalized.includes("/projects/") && normalized.endsWith(".jsonl")) {
    return "session_transcript";
  }
  return null;
}
function detectSessionPatternType(pattern) {
  const normalized = pattern.split(win32.sep).join(posix.sep);
  if (normalized.includes("session-memory") && (normalized.includes(".md") || normalized.endsWith("*"))) {
    return "session_memory";
  }
  if (normalized.includes(".jsonl") || normalized.includes("projects") && normalized.includes("*.jsonl")) {
    return "session_transcript";
  }
  return null;
}
function isAutoMemFile(filePath) {
  if (isAutoMemoryEnabled()) {
    return isAutoMemPath(filePath);
  }
  return false;
}
function memoryScopeForPath(filePath) {
  if (false) {
    return "team";
  }
  if (isAutoMemFile(filePath)) {
    return "personal";
  }
  return null;
}
function isAgentMemFile(filePath) {
  if (isAutoMemoryEnabled()) {
    return isAgentMemoryPath(filePath);
  }
  return false;
}
function isAutoManagedMemoryFile(filePath) {
  if (isAutoMemFile(filePath)) {
    return true;
  }
  if (false) {
    return true;
  }
  if (detectSessionFileType(filePath) !== null) {
    return true;
  }
  if (isAgentMemFile(filePath)) {
    return true;
  }
  return false;
}
function isMemoryDirectory(dirPath) {
  const normalizedPath = normalize(dirPath);
  const normalizedCmp = toComparable(normalizedPath);
  if (isAutoMemoryEnabled() && (normalizedCmp.includes("/agent-memory/") || normalizedCmp.includes("/agent-memory-local/"))) {
    return true;
  }
  if (false) {
    return true;
  }
  if (isAutoMemoryEnabled()) {
    const autoMemPath = getAutoMemPath();
    const autoMemDirCmp = toComparable(autoMemPath.replace(/[/\\]+$/, ""));
    const autoMemPathCmp = toComparable(autoMemPath);
    if (normalizedCmp === autoMemDirCmp || normalizedCmp.startsWith(autoMemPathCmp)) {
      return true;
    }
  }
  const configDirCmp = toComparable(getClaudeConfigHomeDir());
  const memoryBaseCmp = toComparable(getMemoryBaseDir());
  const underConfig = normalizedCmp.startsWith(configDirCmp);
  const underMemoryBase = normalizedCmp.startsWith(memoryBaseCmp);
  if (!underConfig && !underMemoryBase) {
    return false;
  }
  if (normalizedCmp.includes("/session-memory/")) {
    return true;
  }
  if (underConfig && normalizedCmp.includes("/projects/")) {
    return true;
  }
  if (isAutoMemoryEnabled() && normalizedCmp.includes("/memory/")) {
    return true;
  }
  return false;
}
function isShellCommandTargetingMemory(command) {
  const configDir = getClaudeConfigHomeDir();
  const memoryBase = getMemoryBaseDir();
  const autoMemDir = isAutoMemoryEnabled() ? getAutoMemPath().replace(/[/\\]+$/, "") : "";
  const commandCmp = toComparable(command);
  const dirs = [configDir, memoryBase, autoMemDir].filter(Boolean);
  const matchesAnyDir = dirs.some((d) => {
    if (commandCmp.includes(toComparable(d))) return true;
    if (IS_WINDOWS) {
      return commandCmp.includes(windowsPathToPosixPath(d).toLowerCase());
    }
    return false;
  });
  if (!matchesAnyDir) {
    return false;
  }
  const matches = command.match(/(?:[A-Za-z]:[/\\]|\/)[^\s'"]+/g);
  if (!matches) {
    return false;
  }
  for (const match of matches) {
    const cleanPath = match.replace(/[,;|&>]+$/, "");
    const nativePath = IS_WINDOWS ? posixPathToWindowsPath(cleanPath) : cleanPath;
    if (isAutoManagedMemoryFile(nativePath) || isMemoryDirectory(nativePath)) {
      return true;
    }
  }
  return false;
}
function isAutoManagedMemoryPattern(pattern) {
  if (detectSessionPatternType(pattern) !== null) {
    return true;
  }
  if (isAutoMemoryEnabled() && (pattern.replace(/\\/g, "/").includes("agent-memory/") || pattern.replace(/\\/g, "/").includes("agent-memory-local/"))) {
    return true;
  }
  return false;
}
export {
  detectSessionFileType,
  detectSessionPatternType,
  isAutoManagedMemoryFile,
  isAutoManagedMemoryPattern,
  isAutoMemFile,
  isMemoryDirectory,
  isShellCommandTargetingMemory,
  memoryScopeForPath
};
