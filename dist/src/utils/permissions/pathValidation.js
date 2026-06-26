import memoize from "lodash-es/memoize.js";
import { homedir } from "os";
import { dirname, isAbsolute, resolve } from "path";
import { getPlatform } from "../../utils/platform.js";
import {
  getFsImplementation,
  getPathsForPermissionCheck,
  safeResolvePath
} from "../fsOperations.js";
import { containsPathTraversal } from "../path.js";
import { SandboxManager } from "../sandbox/sandbox-adapter.js";
import { containsVulnerableUncPath } from "../shell/readOnlyCommandValidation.js";
import {
  checkEditableInternalPath,
  checkPathSafetyForAutoEdit,
  checkReadableInternalPath,
  matchingRuleForInput,
  pathInAllowedWorkingPath,
  pathInWorkingPath
} from "./filesystem.js";
const MAX_DIRS_TO_LIST = 5;
const GLOB_PATTERN_REGEX = /[*?[\]{}]/;
function formatDirectoryList(directories) {
  const dirCount = directories.length;
  if (dirCount <= MAX_DIRS_TO_LIST) {
    return directories.map((dir) => `'${dir}'`).join(", ");
  }
  const firstDirs = directories.slice(0, MAX_DIRS_TO_LIST).map((dir) => `'${dir}'`).join(", ");
  return `${firstDirs}, and ${dirCount - MAX_DIRS_TO_LIST} more`;
}
function getGlobBaseDirectory(path) {
  const globMatch = path.match(GLOB_PATTERN_REGEX);
  if (!globMatch || globMatch.index === void 0) {
    return path;
  }
  const beforeGlob = path.substring(0, globMatch.index);
  const lastSepIndex = getPlatform() === "windows" ? Math.max(beforeGlob.lastIndexOf("/"), beforeGlob.lastIndexOf("\\")) : beforeGlob.lastIndexOf("/");
  if (lastSepIndex === -1) return ".";
  return beforeGlob.substring(0, lastSepIndex) || "/";
}
function expandTilde(path) {
  if (path === "~" || path.startsWith("~/") || process.platform === "win32" && path.startsWith("~\\")) {
    return homedir() + path.slice(1);
  }
  return path;
}
function isPathInSandboxWriteAllowlist(resolvedPath) {
  if (!SandboxManager.isSandboxingEnabled()) {
    return false;
  }
  const { allowOnly, denyWithinAllow } = SandboxManager.getFsWriteConfig();
  const pathsToCheck = getPathsForPermissionCheck(resolvedPath);
  const resolvedAllow = allowOnly.flatMap(getResolvedSandboxConfigPath);
  const resolvedDeny = denyWithinAllow.flatMap(getResolvedSandboxConfigPath);
  return pathsToCheck.every((p) => {
    for (const denyPath of resolvedDeny) {
      if (pathInWorkingPath(p, denyPath)) return false;
    }
    return resolvedAllow.some((allowPath) => pathInWorkingPath(p, allowPath));
  });
}
const getResolvedSandboxConfigPath = memoize(getPathsForPermissionCheck);
function isPathAllowed(resolvedPath, context, operationType, precomputedPathsToCheck) {
  const permissionType = operationType === "read" ? "read" : "edit";
  const denyRule = matchingRuleForInput(
    resolvedPath,
    context,
    permissionType,
    "deny"
  );
  if (denyRule !== null) {
    return {
      allowed: false,
      decisionReason: { type: "rule", rule: denyRule }
    };
  }
  if (operationType !== "read") {
    const internalEditResult = checkEditableInternalPath(resolvedPath, {});
    if (internalEditResult.behavior === "allow") {
      return {
        allowed: true,
        decisionReason: internalEditResult.decisionReason
      };
    }
  }
  if (operationType !== "read") {
    const safetyCheck = checkPathSafetyForAutoEdit(
      resolvedPath,
      precomputedPathsToCheck
    );
    if (!safetyCheck.safe) {
      return {
        allowed: false,
        decisionReason: {
          type: "safetyCheck",
          reason: safetyCheck.message,
          classifierApprovable: safetyCheck.classifierApprovable
        }
      };
    }
  }
  const isInWorkingDir = pathInAllowedWorkingPath(
    resolvedPath,
    context,
    precomputedPathsToCheck
  );
  if (isInWorkingDir) {
    if (operationType === "read" || context.mode === "acceptEdits") {
      return { allowed: true };
    }
  }
  if (operationType === "read") {
    const internalReadResult = checkReadableInternalPath(resolvedPath, {});
    if (internalReadResult.behavior === "allow") {
      return {
        allowed: true,
        decisionReason: internalReadResult.decisionReason
      };
    }
  }
  if (operationType !== "read" && !isInWorkingDir && isPathInSandboxWriteAllowlist(resolvedPath)) {
    return {
      allowed: true,
      decisionReason: {
        type: "other",
        reason: "Path is in sandbox write allowlist"
      }
    };
  }
  const allowRule = matchingRuleForInput(
    resolvedPath,
    context,
    permissionType,
    "allow"
  );
  if (allowRule !== null) {
    return {
      allowed: true,
      decisionReason: { type: "rule", rule: allowRule }
    };
  }
  return { allowed: false };
}
function validateGlobPattern(cleanPath, cwd, toolPermissionContext, operationType) {
  if (containsPathTraversal(cleanPath)) {
    const absolutePath = isAbsolute(cleanPath) ? cleanPath : resolve(cwd, cleanPath);
    const { resolvedPath: resolvedPath2, isCanonical: isCanonical2 } = safeResolvePath(
      getFsImplementation(),
      absolutePath
    );
    const result2 = isPathAllowed(
      resolvedPath2,
      toolPermissionContext,
      operationType,
      isCanonical2 ? [resolvedPath2] : void 0
    );
    return {
      allowed: result2.allowed,
      resolvedPath: resolvedPath2,
      decisionReason: result2.decisionReason
    };
  }
  const basePath = getGlobBaseDirectory(cleanPath);
  const absoluteBasePath = isAbsolute(basePath) ? basePath : resolve(cwd, basePath);
  const { resolvedPath, isCanonical } = safeResolvePath(
    getFsImplementation(),
    absoluteBasePath
  );
  const result = isPathAllowed(
    resolvedPath,
    toolPermissionContext,
    operationType,
    isCanonical ? [resolvedPath] : void 0
  );
  return {
    allowed: result.allowed,
    resolvedPath,
    decisionReason: result.decisionReason
  };
}
const WINDOWS_DRIVE_ROOT_REGEX = /^[A-Za-z]:\/?$/;
const WINDOWS_DRIVE_CHILD_REGEX = /^[A-Za-z]:\/[^/]+$/;
function isDangerousRemovalPath(resolvedPath) {
  const forwardSlashed = resolvedPath.replace(/[\\/]+/g, "/");
  if (forwardSlashed === "*" || forwardSlashed.endsWith("/*")) {
    return true;
  }
  const normalizedPath = forwardSlashed === "/" ? forwardSlashed : forwardSlashed.replace(/\/$/, "");
  if (normalizedPath === "/") {
    return true;
  }
  if (WINDOWS_DRIVE_ROOT_REGEX.test(normalizedPath)) {
    return true;
  }
  const normalizedHome = homedir().replace(/[\\/]+/g, "/");
  if (normalizedPath === normalizedHome) {
    return true;
  }
  const parentDir = dirname(normalizedPath);
  if (parentDir === "/") {
    return true;
  }
  if (WINDOWS_DRIVE_CHILD_REGEX.test(normalizedPath)) {
    return true;
  }
  return false;
}
function validatePath(path, cwd, toolPermissionContext, operationType) {
  const cleanPath = expandTilde(path.replace(/^['"]|['"]$/g, ""));
  if (containsVulnerableUncPath(cleanPath)) {
    return {
      allowed: false,
      resolvedPath: cleanPath,
      decisionReason: {
        type: "other",
        reason: "UNC network paths require manual approval"
      }
    };
  }
  if (cleanPath.startsWith("~")) {
    return {
      allowed: false,
      resolvedPath: cleanPath,
      decisionReason: {
        type: "other",
        reason: "Tilde expansion variants (~user, ~+, ~-) in paths require manual approval"
      }
    };
  }
  if (cleanPath.includes("$") || cleanPath.includes("%") || cleanPath.startsWith("=")) {
    return {
      allowed: false,
      resolvedPath: cleanPath,
      decisionReason: {
        type: "other",
        reason: "Shell expansion syntax in paths requires manual approval"
      }
    };
  }
  if (GLOB_PATTERN_REGEX.test(cleanPath)) {
    if (operationType === "write" || operationType === "create") {
      return {
        allowed: false,
        resolvedPath: cleanPath,
        decisionReason: {
          type: "other",
          reason: "Glob patterns are not allowed in write operations. Please specify an exact file path."
        }
      };
    }
    return validateGlobPattern(
      cleanPath,
      cwd,
      toolPermissionContext,
      operationType
    );
  }
  const absolutePath = isAbsolute(cleanPath) ? cleanPath : resolve(cwd, cleanPath);
  const { resolvedPath, isCanonical } = safeResolvePath(
    getFsImplementation(),
    absolutePath
  );
  const result = isPathAllowed(
    resolvedPath,
    toolPermissionContext,
    operationType,
    isCanonical ? [resolvedPath] : void 0
  );
  return {
    allowed: result.allowed,
    resolvedPath,
    decisionReason: result.decisionReason
  };
}
export {
  expandTilde,
  formatDirectoryList,
  getGlobBaseDirectory,
  isDangerousRemovalPath,
  isPathAllowed,
  isPathInSandboxWriteAllowlist,
  validateGlobPattern,
  validatePath
};
