import { homedir } from "os";
import { getGlobalConfig, saveGlobalConfig } from "../../../utils/config.js";
import { logForDebugging } from "../../../utils/debug.js";
import {
  execFileNoThrow,
  execFileNoThrowWithCwd
} from "../../../utils/execFileNoThrow.js";
import { logError } from "../../../utils/log.js";
async function detectPythonPackageManager() {
  const uvResult = await execFileNoThrow("which", ["uv"]);
  if (uvResult.code === 0) {
    logForDebugging("[it2Setup] Found uv (will use uv tool install)");
    return "uvx";
  }
  const pipxResult = await execFileNoThrow("which", ["pipx"]);
  if (pipxResult.code === 0) {
    logForDebugging("[it2Setup] Found pipx package manager");
    return "pipx";
  }
  const pipResult = await execFileNoThrow("which", ["pip"]);
  if (pipResult.code === 0) {
    logForDebugging("[it2Setup] Found pip package manager");
    return "pip";
  }
  const pip3Result = await execFileNoThrow("which", ["pip3"]);
  if (pip3Result.code === 0) {
    logForDebugging("[it2Setup] Found pip3 package manager");
    return "pip";
  }
  logForDebugging("[it2Setup] No Python package manager found");
  return null;
}
async function isIt2CliAvailable() {
  const result = await execFileNoThrow("which", ["it2"]);
  return result.code === 0;
}
async function installIt2(packageManager) {
  logForDebugging(`[it2Setup] Installing it2 using ${packageManager}`);
  let result;
  switch (packageManager) {
    case "uvx":
      result = await execFileNoThrowWithCwd("uv", ["tool", "install", "it2"], {
        cwd: homedir()
      });
      break;
    case "pipx":
      result = await execFileNoThrowWithCwd("pipx", ["install", "it2"], {
        cwd: homedir()
      });
      break;
    case "pip":
      result = await execFileNoThrowWithCwd(
        "pip",
        ["install", "--user", "it2"],
        { cwd: homedir() }
      );
      if (result.code !== 0) {
        result = await execFileNoThrowWithCwd(
          "pip3",
          ["install", "--user", "it2"],
          { cwd: homedir() }
        );
      }
      break;
  }
  if (result.code !== 0) {
    const error = result.stderr || "Unknown installation error";
    logError(new Error(`[it2Setup] Failed to install it2: ${error}`));
    return {
      success: false,
      error,
      packageManager
    };
  }
  logForDebugging("[it2Setup] it2 installed successfully");
  return {
    success: true,
    packageManager
  };
}
async function verifyIt2Setup() {
  logForDebugging("[it2Setup] Verifying it2 setup...");
  const installed = await isIt2CliAvailable();
  if (!installed) {
    return {
      success: false,
      error: "it2 CLI is not installed or not in PATH"
    };
  }
  const result = await execFileNoThrow("it2", ["session", "list"]);
  if (result.code !== 0) {
    const stderr = result.stderr.toLowerCase();
    if (stderr.includes("api") || stderr.includes("python") || stderr.includes("connection refused") || stderr.includes("not enabled")) {
      logForDebugging("[it2Setup] Python API not enabled in iTerm2");
      return {
        success: false,
        error: "Python API not enabled in iTerm2 preferences",
        needsPythonApiEnabled: true
      };
    }
    return {
      success: false,
      error: result.stderr || "Failed to communicate with iTerm2"
    };
  }
  logForDebugging("[it2Setup] it2 setup verified successfully");
  return {
    success: true
  };
}
function getPythonApiInstructions() {
  return [
    "Almost done! Enable the Python API in iTerm2:",
    "",
    "  iTerm2 \u2192 Settings \u2192 General \u2192 Magic \u2192 Enable Python API",
    "",
    "After enabling, you may need to restart iTerm2."
  ];
}
function markIt2SetupComplete() {
  const config = getGlobalConfig();
  if (config.iterm2It2SetupComplete !== true) {
    saveGlobalConfig((current) => ({
      ...current,
      iterm2It2SetupComplete: true
    }));
    logForDebugging("[it2Setup] Marked it2 setup as complete");
  }
}
function setPreferTmuxOverIterm2(prefer) {
  const config = getGlobalConfig();
  if (config.preferTmuxOverIterm2 !== prefer) {
    saveGlobalConfig((current) => ({
      ...current,
      preferTmuxOverIterm2: prefer
    }));
    logForDebugging(`[it2Setup] Set preferTmuxOverIterm2 = ${prefer}`);
  }
}
function getPreferTmuxOverIterm2() {
  return getGlobalConfig().preferTmuxOverIterm2 === true;
}
export {
  detectPythonPackageManager,
  getPreferTmuxOverIterm2,
  getPythonApiInstructions,
  installIt2,
  isIt2CliAvailable,
  markIt2SetupComplete,
  setPreferTmuxOverIterm2,
  verifyIt2Setup
};
