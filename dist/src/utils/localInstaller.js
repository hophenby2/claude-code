import { access, chmod, writeFile } from "fs/promises";
import { join } from "path";
import { saveGlobalConfig } from "./config.js";
import { getClaudeConfigHomeDir } from "./envUtils.js";
import { getErrnoCode } from "./errors.js";
import { execFileNoThrowWithCwd } from "./execFileNoThrow.js";
import { getFsImplementation } from "./fsOperations.js";
import { logError } from "./log.js";
import { jsonStringify } from "./slowOperations.js";
function getLocalInstallDir() {
  return join(getClaudeConfigHomeDir(), "local");
}
function getLocalClaudePath() {
  return join(getLocalInstallDir(), "claude");
}
function isRunningFromLocalInstallation() {
  const execPath = process.argv[1] || "";
  return execPath.includes("/.claude/local/node_modules/");
}
async function writeIfMissing(path, content, mode) {
  try {
    await writeFile(path, content, { encoding: "utf8", flag: "wx", mode });
    return true;
  } catch (e) {
    if (getErrnoCode(e) === "EEXIST") return false;
    throw e;
  }
}
async function ensureLocalPackageEnvironment() {
  try {
    const localInstallDir = getLocalInstallDir();
    await getFsImplementation().mkdir(localInstallDir);
    await writeIfMissing(
      join(localInstallDir, "package.json"),
      jsonStringify(
        { name: "claude-local", version: "0.0.1", private: true },
        null,
        2
      )
    );
    const wrapperPath = join(localInstallDir, "claude");
    const created = await writeIfMissing(
      wrapperPath,
      `#!/bin/sh
exec "${localInstallDir}/node_modules/.bin/claude" "$@"`,
      493
    );
    if (created) {
      await chmod(wrapperPath, 493);
    }
    return true;
  } catch (error) {
    logError(error);
    return false;
  }
}
async function installOrUpdateClaudePackage(channel, specificVersion) {
  try {
    if (!await ensureLocalPackageEnvironment()) {
      return "install_failed";
    }
    const versionSpec = specificVersion ? specificVersion : channel === "stable" ? "stable" : "latest";
    const result = await execFileNoThrowWithCwd(
      "npm",
      ["install", `${"claude-code-reconstructed"}@${versionSpec}`],
      { cwd: getLocalInstallDir(), maxBuffer: 1e6 }
    );
    if (result.code !== 0) {
      const error = new Error(
        `Failed to install Claude CLI package: ${result.stderr}`
      );
      logError(error);
      return result.code === 190 ? "in_progress" : "install_failed";
    }
    saveGlobalConfig((current) => ({
      ...current,
      installMethod: "local"
    }));
    return "success";
  } catch (error) {
    logError(error);
    return "install_failed";
  }
}
async function localInstallationExists() {
  try {
    await access(join(getLocalInstallDir(), "node_modules", ".bin", "claude"));
    return true;
  } catch {
    return false;
  }
}
function getShellType() {
  const shellPath = process.env.SHELL || "";
  if (shellPath.includes("zsh")) return "zsh";
  if (shellPath.includes("bash")) return "bash";
  if (shellPath.includes("fish")) return "fish";
  return "unknown";
}
export {
  ensureLocalPackageEnvironment,
  getLocalClaudePath,
  getShellType,
  installOrUpdateClaudePackage,
  isRunningFromLocalInstallation,
  localInstallationExists
};
