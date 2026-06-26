const feature = (_name) => false;
import { stat } from "fs/promises";
import memoize from "lodash-es/memoize.js";
import { env, JETBRAINS_IDES } from "./env.js";
import { isEnvTruthy } from "./envUtils.js";
import { execFileNoThrow } from "./execFileNoThrow.js";
import { getAncestorCommandsAsync } from "./genericProcessUtils.js";
const getIsDocker = memoize(async () => {
  if (process.platform !== "linux") return false;
  const { code } = await execFileNoThrow("test", ["-f", "/.dockerenv"]);
  return code === 0;
});
function getIsBubblewrapSandbox() {
  return process.platform === "linux" && isEnvTruthy(process.env.CLAUDE_CODE_BUBBLEWRAP);
}
let muslRuntimeCache = null;
if (process.platform === "linux") {
  const muslArch = process.arch === "x64" ? "x86_64" : "aarch64";
  void stat(`/lib/libc.musl-${muslArch}.so.1`).then(
    () => {
      muslRuntimeCache = true;
    },
    () => {
      muslRuntimeCache = false;
    }
  );
}
function isMuslEnvironment() {
  if (false) return true;
  if (false) return false;
  if (process.platform !== "linux") return false;
  return muslRuntimeCache ?? false;
}
let jetBrainsIDECache;
async function detectJetBrainsIDEFromParentProcessAsync() {
  if (jetBrainsIDECache !== void 0) {
    return jetBrainsIDECache;
  }
  if (process.platform === "darwin") {
    jetBrainsIDECache = null;
    return null;
  }
  try {
    const commands = await getAncestorCommandsAsync(process.pid, 10);
    for (const command of commands) {
      const lowerCommand = command.toLowerCase();
      for (const ide of JETBRAINS_IDES) {
        if (lowerCommand.includes(ide)) {
          jetBrainsIDECache = ide;
          return ide;
        }
      }
    }
  } catch {
  }
  jetBrainsIDECache = null;
  return null;
}
async function getTerminalWithJetBrainsDetectionAsync() {
  if (process.env.TERMINAL_EMULATOR === "JetBrains-JediTerm") {
    if (env.platform !== "darwin") {
      const specificIDE = await detectJetBrainsIDEFromParentProcessAsync();
      return specificIDE || "pycharm";
    }
  }
  return env.terminal;
}
function getTerminalWithJetBrainsDetection() {
  if (process.env.TERMINAL_EMULATOR === "JetBrains-JediTerm") {
    if (env.platform !== "darwin") {
      if (jetBrainsIDECache !== void 0) {
        return jetBrainsIDECache || "pycharm";
      }
      return "pycharm";
    }
  }
  return env.terminal;
}
async function initJetBrainsDetection() {
  if (process.env.TERMINAL_EMULATOR === "JetBrains-JediTerm") {
    await detectJetBrainsIDEFromParentProcessAsync();
  }
}
const envDynamic = {
  ...env,
  // Include all properties from env
  terminal: getTerminalWithJetBrainsDetection(),
  getIsDocker,
  getIsBubblewrapSandbox,
  isMuslEnvironment,
  getTerminalWithJetBrainsDetectionAsync,
  initJetBrainsDetection
};
export {
  envDynamic,
  getTerminalWithJetBrainsDetection,
  getTerminalWithJetBrainsDetectionAsync,
  initJetBrainsDetection
};
