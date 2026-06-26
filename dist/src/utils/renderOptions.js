import { openSync } from "fs";
import { ReadStream } from "tty";
import { isEnvTruthy } from "./envUtils.js";
import { logError } from "./log.js";
let cachedStdinOverride = null;
function getStdinOverride() {
  if (cachedStdinOverride !== null) {
    return cachedStdinOverride;
  }
  if (process.stdin.isTTY) {
    cachedStdinOverride = void 0;
    return void 0;
  }
  if (isEnvTruthy(process.env.CI)) {
    cachedStdinOverride = void 0;
    return void 0;
  }
  if (process.argv.includes("mcp")) {
    cachedStdinOverride = void 0;
    return void 0;
  }
  if (process.platform === "win32") {
    cachedStdinOverride = void 0;
    return void 0;
  }
  try {
    const ttyFd = openSync("/dev/tty", "r");
    const ttyStream = new ReadStream(ttyFd);
    ttyStream.isTTY = true;
    cachedStdinOverride = ttyStream;
    return cachedStdinOverride;
  } catch (err) {
    logError(err);
    cachedStdinOverride = void 0;
    return void 0;
  }
}
function getBaseRenderOptions(exitOnCtrlC = false) {
  const stdin = getStdinOverride();
  const options = { exitOnCtrlC };
  if (stdin) {
    options.stdin = stdin;
  }
  return options;
}
export {
  getBaseRenderOptions
};
