import chalk from "chalk";
import { stat } from "fs/promises";
import { dirname, resolve } from "path";
import { getErrnoCode } from "../../utils/errors.js";
import { expandPath } from "../../utils/path.js";
import {
  allWorkingDirectories,
  pathInWorkingPath
} from "../../utils/permissions/filesystem.js";
async function validateDirectoryForWorkspace(directoryPath, permissionContext) {
  if (!directoryPath) {
    return {
      resultType: "emptyPath"
    };
  }
  const absolutePath = resolve(expandPath(directoryPath));
  try {
    const stats = await stat(absolutePath);
    if (!stats.isDirectory()) {
      return {
        resultType: "notADirectory",
        directoryPath,
        absolutePath
      };
    }
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EACCES" || code === "EPERM") {
      return {
        resultType: "pathNotFound",
        directoryPath,
        absolutePath
      };
    }
    throw e;
  }
  const currentWorkingDirs = allWorkingDirectories(permissionContext);
  for (const workingDir of currentWorkingDirs) {
    if (pathInWorkingPath(absolutePath, workingDir)) {
      return {
        resultType: "alreadyInWorkingDirectory",
        directoryPath,
        workingDir
      };
    }
  }
  return {
    resultType: "success",
    absolutePath
  };
}
function addDirHelpMessage(result) {
  switch (result.resultType) {
    case "emptyPath":
      return "Please provide a directory path.";
    case "pathNotFound":
      return `Path ${chalk.bold(result.absolutePath)} was not found.`;
    case "notADirectory": {
      const parentDir = dirname(result.absolutePath);
      return `${chalk.bold(result.directoryPath)} is not a directory. Did you mean to add the parent directory ${chalk.bold(parentDir)}?`;
    }
    case "alreadyInWorkingDirectory":
      return `${chalk.bold(result.directoryPath)} is already accessible within the existing working directory ${chalk.bold(result.workingDir)}.`;
    case "success":
      return `Added ${chalk.bold(result.absolutePath)} as a working directory.`;
  }
}
export {
  addDirHelpMessage,
  validateDirectoryForWorkspace
};
