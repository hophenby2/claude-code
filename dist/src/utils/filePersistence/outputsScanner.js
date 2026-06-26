import * as fs from "fs/promises";
import * as path from "path";
import { logForDebugging } from "../debug.js";
function logDebug(message) {
  logForDebugging(`[file-persistence] ${message}`);
}
function getEnvironmentKind() {
  const kind = process.env.CLAUDE_CODE_ENVIRONMENT_KIND;
  if (kind === "byoc" || kind === "anthropic_cloud") {
    return kind;
  }
  return null;
}
function hasParentPath(entry) {
  return "parentPath" in entry && typeof entry.parentPath === "string";
}
function hasPath(entry) {
  return "path" in entry && typeof entry.path === "string";
}
function getEntryParentPath(entry, fallback) {
  if (hasParentPath(entry)) {
    return entry.parentPath;
  }
  if (hasPath(entry)) {
    return entry.path;
  }
  return fallback;
}
async function findModifiedFiles(turnStartTime, outputsDir) {
  let entries;
  try {
    entries = await fs.readdir(outputsDir, {
      withFileTypes: true,
      recursive: true
    });
  } catch {
    return [];
  }
  const filePaths = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isFile()) {
      const parentPath = getEntryParentPath(entry, outputsDir);
      filePaths.push(path.join(parentPath, entry.name));
    }
  }
  if (filePaths.length === 0) {
    logDebug("No files found in outputs directory");
    return [];
  }
  const statResults = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const stat = await fs.lstat(filePath);
        if (stat.isSymbolicLink()) {
          return null;
        }
        return { filePath, mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    })
  );
  const modifiedFiles = [];
  for (const result of statResults) {
    if (result && result.mtimeMs >= turnStartTime) {
      modifiedFiles.push(result.filePath);
    }
  }
  logDebug(
    `Found ${modifiedFiles.length} modified files since turn start (scanned ${filePaths.length} total)`
  );
  return modifiedFiles;
}
export {
  findModifiedFiles,
  getEnvironmentKind,
  logDebug
};
